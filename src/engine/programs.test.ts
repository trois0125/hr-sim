import { describe, expect, it } from 'vitest';
import { getIndustry, getLocation } from './data';
import { computeFactorScores } from './engagement';
import { eventDefs } from './eventData';
import { eligibleRandomEvents, fireEvent, runEvents, cooledDown } from './eventTriggers';
import { getEvent, modifierValue, resolveEvent, resolveMilestone, resolveReview } from './events';
import { generateCompany } from './generate';
import { choiceAvailable, initiativeAvailability, initiativesFor, startInitiative } from './initiatives';
import { getProgram, hasProgram, installProgram, programDefs, programMonthlyCost, stopProgram } from './programs';
import { createRng } from './rng';
import { makeEmployee, staff } from './testHelpers';
import { runToEnd, tick } from './tick';
import type { CompanyState, Employee } from './types';
import { ENGAGEMENT_FACTORS } from './types';

/** 判断を画面で選ぶ（自動にしない）会社 */
function company(employees: Employee[], month = 48): CompanyState {
  const c = generateCompany({ seed: 1, industryId: 'trading', foundingPatternId: 'solo', autoPlay: null });
  c.employees = employees;
  c.month = month;
  return c;
}

const initiatives = eventDefs.filter((e) => e.trigger.type === 'initiative');

describe('個別制度と施策のデータ（§14.1）', () => {
  it('個別制度には維持費・常時の効果・止めたときの影響が、根拠つきで書いてある', () => {
    expect(programDefs.map((p) => p.id).sort()).toEqual(['consultation_desk', 'one_on_one', 'specialist_track', 'work_life_support']);
    for (const p of programDefs) {
      expect(p.costPerEmployeeMonthly.value).toBeGreaterThan(0);
      expect(p.costPerEmployeeMonthly.source.length).toBeGreaterThan(0);
      expect(p.bonuses.length).toBeGreaterThan(0);
      for (const b of p.bonuses) {
        expect(ENGAGEMENT_FACTORS).toContain(b.factor);
        expect(b.points.value).toBeGreaterThan(0);
      }
      expect(p.stopMorale.value).toBeGreaterThan(0);
    }
  });

  it('イベントが整える・軽くする個別制度は、すべて存在する。どの個別制度にも、軽く済む出来事がある', () => {
    const lightened = new Set<string>();
    for (const e of eventDefs) {
      if (e.mitigatedBy) {
        expect(() => getProgram(e.mitigatedBy!.program)).not.toThrow();
        lightened.add(e.mitigatedBy.program);
      }
      for (const c of e.choices) if (c.effects.installProgram) expect(() => getProgram(c.effects.installProgram!)).not.toThrow();
    }
    for (const p of programDefs) expect(lightened.has(p.id), p.id).toBe(true);
  });

  it('施策は4つ。どれも「やめる」がちょうど1つあり、次に打てるまでの月数が書いてある', () => {
    expect(initiatives.map((e) => e.id).sort()).toEqual([
      'initiative_programs',
      'initiative_recruiting',
      'initiative_survey',
      'initiative_training',
    ]);
    for (const e of initiatives) {
      expect(e.choices.filter((c) => c.cancel)).toHaveLength(1);
      expect(e.cooldownMonths, e.id).toBeTypeOf('number');
      expect(e.menuSummary?.length ?? 0).toBeGreaterThan(10);
    }
  });
});

describe('個別制度（§14.1）', () => {
  it('イベントの「制度を整える」選択肢で整うと、一覧と記録に加わる', () => {
    const target = makeEmployee('sales', { age: 50 });
    const c = company([target, ...staff('sales', 5)]);
    c.pendingDecisions.push({ id: 'd1', month: c.month, kind: 'event', ruleIds: [], eventId: 'caregiving', vars: {}, targetId: target.id });
    resolveEvent(c, 'd1', 1);
    expect(hasProgram(c, 'work_life_support')).toBe(true);
    expect(c.programLog).toEqual([{ month: c.month, id: 'work_life_support', action: 'install' }]);
  });

  it('整えてあると、同じ出来事は判断待ちにならずに軽く済み、記録に残る。同じ出来事はしばらく起きない', () => {
    const target = makeEmployee('sales', { age: 50, engagement: 40 });
    const without = company([target, ...staff('sales', 5)]);
    fireEvent(without, getEvent('caregiving'), without.employees[0]!, createRng(1));
    expect(without.pendingDecisions).toHaveLength(1);

    const withProgram = company([structuredClone(target), ...staff('sales', 5)]);
    installProgram(withProgram, 'work_life_support');
    fireEvent(withProgram, getEvent('caregiving'), withProgram.employees[0]!, createRng(1));
    expect(withProgram.pendingDecisions).toHaveLength(0);
    expect(withProgram.mitigations).toHaveLength(1);
    expect(withProgram.mitigations[0]).toMatchObject({ eventId: 'caregiving', programId: 'work_life_support', targetId: target.id });
    expect(withProgram.employees[0]!.engagement).toBeGreaterThan(40);
    expect(cooledDown(getEvent('caregiving'), withProgram)).toBe(false);
  });

  it('維持費は社員1人あたり×人数で、毎月の記録に載り、営業利益を下げる', () => {
    const base = generateCompany({ seed: 3, industryId: 'trading', foundingPatternId: 'cofounders', autoPlay: { legal: 'immediate' } });
    const a = runToEnd(base, 24);
    const b = structuredClone(a);
    installProgram(b, 'one_on_one');
    const ra = tick(a).history.at(-1)!;
    const rb = tick(b).history.at(-1)!;
    // 維持費はその月の採用のあとの人数で計算する（記録の人数は月末なので、退職のぶんだけずれることがある）
    const perHead = getProgram('one_on_one').costPerEmployeeMonthly.value;
    expect((rb.programCost ?? 0) % perHead).toBe(0);
    expect(rb.programCost! / perHead).toBeGreaterThanOrEqual(rb.headcount);
    expect(ra.programCost).toBe(0);
    expect(rb.operatingProfit).toBeLessThan(ra.operatingProfit);
    expect(programMonthlyCost(b, 10)).toBe(getProgram('one_on_one').costPerEmployeeMonthly.value * 10);
  });

  it('常時の効果：専門職コースは、実力のある営業の「成長の機会」だけを上げる', () => {
    const strong = makeEmployee('sales', { ability: 70 });
    const weak = makeEmployee('sales', { ability: 40 });
    const ctx = {
      industry: getIndustry('trading'),
      location: getLocation('tokyo'),
      policies: company([]).policies,
      history: [],
      cash: 1e8,
      headcount: 2,
    };
    const before = computeFactorScores([strong, weak], ctx);
    const after = computeFactorScores([strong, weak], { ...ctx, programs: [{ id: 'specialist_track', since: 0 }] });
    const bonus = getProgram('specialist_track').bonuses[0]!.points.value;
    expect(after.get(strong.id)!.growthOpportunity - before.get(strong.id)!.growthOpportunity).toBeCloseTo(bonus);
    expect(after.get(weak.id)!.growthOpportunity).toBe(before.get(weak.id)!.growthOpportunity);
    expect(after.get(strong.id)!.externalPay).toBe(before.get(strong.id)!.externalPay);
  });

  it('止めると一覧から消え、しばらく納得感の目標値が下がる', () => {
    const c = company(staff('sales', 5));
    installProgram(c, 'consultation_desk');
    expect(stopProgram(c, 'consultation_desk')).toBe(true);
    expect(hasProgram(c, 'consultation_desk')).toBe(false);
    expect(modifierValue(c, 'morale')).toBe(-getProgram('consultation_desk').stopMorale.value);
    expect(c.programLog.map((l) => l.action)).toEqual(['install', 'stop']);
    expect(stopProgram(c, 'consultation_desk')).toBe(false);
  });
});

describe('施策（§14.1）', () => {
  it('いつでも打てて、判断待ちになる（自動の方針があっても、その場では選ばない）', () => {
    const c = company(staff('sales', 8));
    c.autoPlay = { legal: 'immediate' };
    const d = startInitiative(c, 'initiative_training');
    expect(c.pendingDecisions).toEqual([d]);
    expect(c.autoPlay).toEqual({ legal: 'immediate' });
  });

  it('判断待ちがある間・人数が足りない間・決めた期間がたつまでは打てない。「やめる」なら期間はあかない', () => {
    const small = company(staff('sales', 3));
    expect(initiativeAvailability(small, getEvent('initiative_survey'))).toMatchObject({ available: false, reason: 'headcount' });

    const c = company(staff('sales', 8));
    const survey = getEvent('initiative_survey');
    const d = startInitiative(c, survey.id);
    expect(initiativeAvailability(c, getEvent('initiative_training'))).toMatchObject({ available: false, reason: 'waiting' });
    resolveEvent(c, d.id, survey.choices.findIndex((x) => x.cancel));
    expect(initiativeAvailability(c, survey)).toEqual({ available: true });

    const d2 = startInitiative(c, survey.id);
    resolveEvent(c, d2.id, 0);
    c.scheduledEvents = [];
    expect(initiativeAvailability(c, survey)).toMatchObject({ available: false, reason: 'cooldown', months: 12 });
    c.month += 12;
    expect(initiativeAvailability(c, survey)).toEqual({ available: true });
  });

  it('サーベイ：行うと翌月に結果が出て、全社でいちばん弱い要因が本文に入る', () => {
    const base = generateCompany({ seed: 5, industryId: 'trading', foundingPatternId: 'cofounders', autoPlay: { legal: 'immediate' } });
    const c = runToEnd(base, 24);
    c.autoPlay = null;
    const cash = c.cash;
    const d = startInitiative(c, 'initiative_survey');
    resolveEvent(c, d.id, 0);
    expect(c.cash).toBeLessThan(cash);
    // 月のはじめに法令の節目などで止まったら答えて進める
    let next = c;
    for (let i = 0; i < 5 && !next.pendingDecisions.some((x) => x.eventId === 'survey_result'); i++) {
      for (const p of [...next.pendingDecisions]) {
        if (p.kind === 'milestone') resolveMilestone(next, p.id, 'immediate');
        else if (p.kind === 'review') resolveReview(next, p.id);
        else resolveEvent(next, p.id, 0);
      }
      next = tick(next);
    }
    expect(next.month).toBeLessThanOrEqual(c.month + 1); // 翌月まで
    const result = next.pendingDecisions.find((x) => x.eventId === 'survey_result');
    expect(result).toBeDefined();
    expect(ENGAGEMENT_FACTORS).toContain(result!.vars.weakFactor);
    expect(Number(result!.vars.weakScore)).toBeLessThanOrEqual(Number(result!.vars.strongScore));
  });

  it('研修の費用は、参加した人数×1人あたりの費用', () => {
    const c = company([...staff('sales', 6, { tenureMonths: 12 }), ...staff('sales', 4, { tenureMonths: 60 })]);
    const cash = c.cash;
    const d = startInitiative(c, 'initiative_training');
    resolveEvent(c, d.id, 1); // 若手の研修（入社3年目まで）
    expect(cash - c.cash).toBe(6 * 100000);
  });

  it('個別制度を整える施策：整えてある制度の選択肢は選べない', () => {
    const c = company(staff('sales', 5));
    installProgram(c, 'one_on_one');
    const ev = getEvent('initiative_programs');
    const i = ev.choices.findIndex((x) => x.effects.installProgram === 'one_on_one');
    expect(choiceAvailable(c, ev, i)).toBe(false);
    expect(choiceAvailable(c, ev, 0)).toBe(true);
    const d = startInitiative(c, ev.id);
    expect(() => resolveEvent(c, d.id, i)).toThrow();
    expect(c.pendingDecisions).toHaveLength(1); // 選び直せる
  });

  it('毎月の抽選では起きず、自動で進めるときは施策を打たない', () => {
    const c = company(staff('sales', 30));
    expect(eligibleRandomEvents(c).some((e) => e.trigger.type === 'initiative')).toBe(false);
    for (let i = 0; i < 24; i++) runEvents(c, createRng(i));
    expect(c.pendingDecisions.some((d) => initiatives.some((e) => e.id === d.eventId))).toBe(false);
    expect(initiativesFor(c)).toHaveLength(4);
  });
});
