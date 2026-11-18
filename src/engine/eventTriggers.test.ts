import { describe, expect, it } from 'vitest';
import { coef } from './coefficients';
import { getIndustry } from './data';
import { eventDefs } from './eventData';
import { employeeField, matchesEmployee } from './eventConditions';
import {
  availableInIndustry,
  companyMetrics,
  cooledDown,
  eligibleRandomEvents,
  meetsConditions,
  runEvents,
  selectTarget,
  type CompanyMetrics,
} from './eventTriggers';
import { groupMembers, modifierValue, resolveEvent, resolveMilestone, styleChoiceIndex } from './events';
import { generateCompany } from './generate';
import { createRng } from './rng';
import { internalFairnessScores } from './engagement';
import { fixedRng, makeEmployee, staff, trading } from './testHelpers';
import { runToEnd, tick } from './tick';
import type {
  Comparison,
  CompanyState,
  Employee,
  EmployeeCondition,
  EventDef,
  JudgmentStyle,
} from './types';
import { COMPANY_METRICS, EMPLOYEE_FIELDS, JUDGMENT_AXES } from './types';

const nonLaw = eventDefs.filter((e) => e.category !== 'law');

/** 判断を画面で選ぶ（自動にしない）会社 */
function company(employees: Employee[], month = 48): CompanyState {
  const c = generateCompany({ seed: 1, industryId: 'trading', foundingPatternId: 'solo', autoPlay: null });
  c.employees = employees;
  c.month = month;
  return c;
}

// ---------------------------------------------------------------------------
// 条件を満たす値・満たさない値をつくる（データから自動で）
// ---------------------------------------------------------------------------

type Value = number | string | boolean;
function satisfying(op: Comparison, v: Value): Value {
  if (typeof v !== 'number') return op === '!=' ? `${String(v)}_x` : v;
  const d = Math.abs(v) >= 1 ? 1 : 0.01;
  return { '<': v - d, '<=': v, '>': v + d, '>=': v, '==': v, '!=': v + d }[op];
}
function violating(op: Comparison, v: Value): Value {
  if (typeof v === 'boolean') return op === '!=' ? v : !v;
  if (typeof v === 'string') return op === '!=' ? v : `${v}_x`;
  const d = Math.abs(v) >= 1 ? 1 : 0.01;
  return { '<': v, '<=': v + d, '>': v, '>=': v - d, '==': v + d, '!=': v }[op];
}

function setField(e: Employee, field: EmployeeCondition['field'], value: Value): void {
  switch (field) {
    case 'roleKind':
      e.role = trading.roles.find((r) => r.kind === value)?.id ?? 'unknown_role';
      return;
    case 'onLeave':
      e.leave = value ? { kind: 'sick', startMonth: 0, endsAt: 999, returnRate: 1 } : null;
      return;
    case 'values.growth':
    case 'values.stability':
    case 'values.money':
    case 'values.balance':
      e.values = { ...e.values, [field.split('.')[1] as string]: value as number };
      return;
    default:
      (e as Record<string, unknown>)[field] = value;
  }
}

/** 条件をすべて満たす社員（同じ項目に条件が2つあれば、両方を満たす値を選ぶ） */
function employeeMatching(where: readonly EmployeeCondition[]): Employee {
  const e = makeEmployee('sales', { tenureMonths: 60, ability: 70, engagement: 30, age: 35 });
  const fields = [...new Set(where.map((c) => c.field))];
  for (const field of fields) {
    const conds = where.filter((c) => c.field === field);
    const candidate = conds.map((c) => satisfying(c.op, c.value)).find((v) => {
      setField(e, field, v);
      return conds.every((c) => matchesEmployee(e, [c], trading));
    });
    if (candidate === undefined) throw new Error(`条件を同時に満たせません: ${field}`);
    setField(e, field, candidate);
  }
  return e;
}

/** 条件をすべて満たす会社の指標 */
function metricsMatching(event: EventDef, state: CompanyState): CompanyMetrics {
  const m = companyMetrics(state);
  const t = event.trigger;
  if (t.type === 'law') return m;
  m.headcount = Math.max(m.headcount, t.minHeadcount ?? 0);
  for (const c of t.conditions ?? []) {
    if ('metric' in c) m[c.metric] = satisfying(c.op, c.value) as number;
    else state.policies = { ...state.policies, [c.policy]: c.in[0] };
  }
  return m;
}

describe('イベントのデータ', () => {
  it('法令以外のイベントが20個以上ある', () => {
    expect(nonLaw.length).toBeGreaterThanOrEqual(20);
  });

  it('IDが重複せず、選択肢が2つ以上あり、学びの一言と判断の傾向の印が付いている', () => {
    expect(new Set(eventDefs.map((e) => e.id)).size).toBe(eventDefs.length);
    for (const e of eventDefs) {
      expect(e.choices.length, e.id).toBeGreaterThanOrEqual(2);
      if (e.category === 'law') continue;
      for (const c of e.choices) {
        expect(c.lesson?.length ?? 0, `${e.id}: ${c.label}`).toBeGreaterThan(5);
        const marks = Object.entries(c.axes ?? {});
        expect(marks.length, `${e.id}: ${c.label}`).toBeGreaterThan(0);
        for (const [axis, v] of marks) {
          expect(JUDGMENT_AXES as readonly string[]).toContain(axis);
          expect([1, -1]).toContain(v);
        }
      }
    }
  });

  it('同じイベントの選択肢どうしは、判断の傾向の印が違う', () => {
    for (const e of nonLaw) {
      const keys = e.choices.map((c) => JSON.stringify(JUDGMENT_AXES.map((a) => c.axes?.[a] ?? 0)));
      expect(new Set(keys).size, e.id).toBe(keys.length);
    }
  });

  it('条件に使う指標・社員の項目は定義されたものだけ', () => {
    const fields = (where: readonly EmployeeCondition[] = []) => where.map((c) => c.field);
    for (const e of nonLaw) {
      const t = e.trigger;
      if (t.type === 'law') continue;
      for (const c of t.conditions ?? []) if ('metric' in c) expect(COMPANY_METRICS).toContain(c.metric);
      for (const f of fields(t.target?.where)) expect(EMPLOYEE_FIELDS).toContain(f);
      for (const ch of e.choices) {
        for (const g of [...(ch.effects.groups ?? []), ...(e.onTrigger?.groups ?? [])]) {
          for (const f of fields(g.where)) expect(EMPLOYEE_FIELDS).toContain(f);
        }
      }
    }
  });

  it('続きのイベントの予約先は、続きのイベント（または抽選のイベント）として存在する', () => {
    for (const e of eventDefs) {
      for (const c of e.choices) {
        const f = c.effects.followUp;
        if (!f) continue;
        const next = eventDefs.find((x) => x.id === f.eventId);
        expect(next, `${e.id} → ${f.eventId}`).toBeDefined();
        expect(['followUp', 'random']).toContain(next?.trigger.type);
        expect(f.probability).toBeGreaterThan(0);
        expect(f.probability).toBeLessThanOrEqual(1);
      }
    }
    // 続きのイベントは、どこかから予約される
    for (const e of eventDefs.filter((x) => x.trigger.type === 'followUp')) {
      const referenced = eventDefs.some((x) => x.choices.some((c) => c.effects.followUp?.eventId === e.id));
      expect(referenced, e.id).toBe(true);
    }
  });

  it('本文の {name} は、対象者のいるイベントだけで使う', () => {
    for (const e of nonLaw) {
      const t = e.trigger;
      if (t.type === 'law' || !e.body.includes('{name}')) continue;
      expect(t.target, e.id).toBeDefined();
    }
  });

  it('業種のイベントは、その業種の specialEvents にあるときだけ起きる', () => {
    const div = eventDefs.find((e) => e.id === 'trading_new_division') as EventDef;
    expect(availableInIndustry(div, trading)).toBe(true);
    expect(availableInIndustry(div, { ...trading, specialEvents: [] })).toBe(false);
    for (const e of eventDefs.filter((x) => x.category === 'industry')) {
      expect(getIndustry('trading').specialEvents).toContain(e.id);
    }
  });
});

describe('どのイベントも条件どおりに起きる（データから自動で確かめる）', () => {
  for (const event of nonLaw) {
    const t = event.trigger;
    if (t.type === 'law') continue;

    it(`${event.id}：会社の条件を満たすと起きうる。どれか1つでも外れると起きない`, () => {
      const c = company(staff('sales', 3));
      const m = metricsMatching(event, c);
      expect(meetsConditions(event, c, m)).toBe(true);
      if (t.minHeadcount !== undefined && t.minHeadcount > 0) {
        expect(meetsConditions(event, c, { ...m, headcount: t.minHeadcount - 1 })).toBe(false);
      }
      for (const cond of t.conditions ?? []) {
        if ('metric' in cond) {
          expect(meetsConditions(event, c, { ...m, [cond.metric]: violating(cond.op, cond.value) }), cond.metric).toBe(false);
        } else {
          const other = (c.policies[cond.policy] === 'office' ? 'remote' : 'office') as never;
          const saved = c.policies;
          c.policies = { ...saved, [cond.policy]: cond.in.includes(other) ? '__none__' : other };
          expect(meetsConditions(event, c, m), cond.policy).toBe(false);
          c.policies = saved;
        }
      }
    });

    if (t.target) {
      const where = t.target.where;
      it(`${event.id}：対象者の条件に合う人がいれば選ばれ、条件が1つでも外れると選ばれない`, () => {
        const e = employeeMatching(where);
        expect(selectTarget([e], { ...t.target, where }, trading, fixedRng(0))).toBe(e);
        for (const cond of where) {
          const x = employeeMatching(where);
          setField(x, cond.field, violating(cond.op, cond.value));
          expect(selectTarget([x], { ...t.target, where }, trading, fixedRng(0)), `${cond.field} ${cond.op} ${String(cond.value)}`).toBeNull();
        }
      });
    }
  }
});

describe('会社の指標', () => {
  it('休職者・パート・紛争の種・景気後退からの月数を数える', () => {
    const a = makeEmployee('sales', { employmentType: 'part' });
    const b = makeEmployee('sales');
    b.leave = { kind: 'sick', startMonth: 0, endsAt: 10, returnRate: 1 };
    const c = company([a, b], 30);
    c.disputeSeeds.push({ month: 20, affectedIds: [], reasonableness: 0.4, averageCutPct: 5 });
    c.market.recessionMonths.push(28);
    const m = companyMetrics(c);
    expect(m.partCount).toBe(1);
    expect(m.onLeave).toBe(1);
    expect(m.disputeRisk).toBeCloseTo(0.6);
    expect(m.recessionAge).toBe(2);
    // 決着した紛争の種と、時効（3年）を過ぎたものは数えない
    c.disputeSeeds[0] = { ...(c.disputeSeeds[0] as CompanyState['disputeSeeds'][number]), resolved: true };
    expect(companyMetrics(c).disputeRisk).toBe(0);
  });

  it('社員の項目：職種の種類・休職中・価値観を取り出せる', () => {
    const e = makeEmployee('admin');
    expect(employeeField(e, 'roleKind', trading)).toBe('admin');
    expect(employeeField(e, 'onLeave', trading)).toBe(0);
    expect(employeeField(e, 'values.balance', trading)).toBe(e.values.balance);
  });

  it('対象者は並べ方の指定どおりに選ばれる（エース＝実力がいちばん高い人）', () => {
    const team = [50, 80, 65].map((ability) => makeEmployee('sales', { ability }));
    const ace = selectTarget(team, { where: [], sortBy: 'ability', order: 'desc' }, trading, fixedRng(0));
    expect(ace?.ability).toBe(80);
    const low = selectTarget(team, { where: [], sortBy: 'ability', order: 'asc' }, trading, fixedRng(0));
    expect(low?.ability).toBe(50);
  });
});

describe('毎月の抽選', () => {
  it('抽選に外れた月は起きず、当たった月は条件を満たすイベントから1つ起きる', () => {
    const c = company(staff('sales', 20, { engagement: 30, ability: 70, tenureMonths: 60 }));
    expect(runEvents(c, fixedRng(0.999))).toEqual([]);
    const fired = runEvents(c, fixedRng(0));
    expect(fired.length).toBeGreaterThanOrEqual(1);
    expect(c.pendingDecisions.some((d) => d.eventId === fired[fired.length - 1])).toBe(true);
  });

  it('同じイベントは、空ける月数がたつまで起きない（判断待ちの間も起きない）', () => {
    const c = company(staff('sales', 20));
    const ev = eventDefs.find((e) => e.id === 'competitor_poaching') as EventDef;
    expect(cooledDown(ev, c)).toBe(true);
    c.decisions.push({ month: c.month, eventId: ev.id, choiceIndex: 0, targetId: null, axes: {}, auto: false });
    expect(cooledDown(ev, c)).toBe(false);
    c.month += coef('event.cooldown_months');
    expect(cooledDown(ev, c)).toBe(true);
    c.pendingDecisions.push({ id: 'x', month: c.month, kind: 'event', ruleIds: [], eventId: ev.id, vars: {} });
    expect(cooledDown(ev, c)).toBe(false);
  });

  it('条件に合う対象者がいないイベントは候補に入らない', () => {
    // 全員が男性なら、女性の育休のイベントは起きない
    const c = company(staff('sales', 20, { gender: 'M', age: 30 }));
    const ids = eligibleRandomEvents(c).map((e) => e.id);
    expect(ids).toContain('parental_leave_male');
    expect(ids).not.toContain('parental_leave_female');
  });

  it('多くの会社で回すと、法令以外のイベントは平均で半年に1回くらい起きる', () => {
    let events = 0;
    let months = 0;
    for (let s = 1; s <= 20; s++) {
      const end = runToEnd(generateCompany({ seed: s * 101, industryId: 'trading' }), 120);
      months += end.month;
      events += end.decisions.filter((d) => eventDefs.find((e) => e.id === d.eventId)?.category !== 'law').length;
    }
    const perYear = events / (months / 12);
    expect(perYear).toBeGreaterThan(1.4);
    expect(perYear).toBeLessThan(3);
  });
});

describe('条件で起きるイベントと、連鎖するイベント', () => {
  it('景気後退が始まった月に「景気後退」が起き、ほかの月には起きない', () => {
    const c = company(staff('sales', 10));
    c.market.recessionMonths.push(c.month - 3);
    expect(runEvents(c, fixedRng(0.999))).not.toContain('recession_response');
    c.market.recessionMonths.push(c.month);
    // 条件のイベントの確率は1なので、乱数が大きくても起きる
    expect(runEvents(c, { ...fixedRng(0.999), next: () => 0.5 })).toContain('recession_response');
  });

  it('引き留めの判断が、給与交渉の続きのイベントを予約する。期日に確率で起きる', () => {
    const ace = makeEmployee('sales', { ability: 90, engagement: 30, tenureMonths: 60 });
    const c = company([ace, ...staff('sales', 9, { engagement: 40 })]);
    c.pendingDecisions.push({ id: 'd1', month: c.month, kind: 'event', ruleIds: [], eventId: 'ace_resignation', vars: {}, targetId: ace.id });
    resolveEvent(c, 'd1', 0);
    const s = c.scheduledEvents[0];
    expect(s?.eventId).toBe('pay_negotiation_wave');
    expect(s?.dueMonth).toBe(c.month + 6);

    // 期日の前は起きない
    expect(runEvents(c, fixedRng(0.999))).not.toContain('pay_negotiation_wave');
    expect(c.scheduledEvents).toHaveLength(1);
    // 期日に確率に当たれば起きる（予約は消える）
    c.month = s?.dueMonth ?? 0;
    expect(runEvents(c, { ...fixedRng(0), next: () => 0.1 })).toContain('pay_negotiation_wave');
    expect(c.scheduledEvents).toHaveLength(0);
  });

  it('確率に外れた予約は起きずに消える', () => {
    const c = company(staff('sales', 10));
    c.scheduledEvents.push({ eventId: 'alumni_referral', dueMonth: c.month, probability: 0.3, targetId: null });
    expect(runEvents(c, fixedRng(0.999))).toEqual([]);
    expect(c.scheduledEvents).toHaveLength(0);
  });

  it('同じ人を対象にする続きのイベントは、その人が辞めていたら起きない', () => {
    const c = company(staff('sales', 10));
    c.scheduledEvents.push({ eventId: 'mental_relapse', dueMonth: c.month, probability: 1, targetId: 'gone' });
    expect(runEvents(c, { ...fixedRng(0.999), next: () => 0.5 })).not.toContain('mental_relapse');
    const e = c.employees[0] as Employee;
    c.scheduledEvents.push({ eventId: 'mental_relapse', dueMonth: c.month, probability: 1, targetId: e.id });
    expect(runEvents(c, { ...fixedRng(0.999), next: () => 0.5 })).toContain('mental_relapse');
    expect(c.pendingDecisions.at(-1)?.targetId).toBe(e.id);
  });

  it('不利益変更の「紛争の種」があると、訴えのイベントが起きうる。決着させると消える', () => {
    const c = company(staff('sales', 10));
    expect(eligibleRandomEvents(c).map((e) => e.id)).not.toContain('dispute_claim');
    c.disputeSeeds.push({ month: c.month - 1, affectedIds: [], reasonableness: 0.3, averageCutPct: 8 });
    expect(eligibleRandomEvents(c).map((e) => e.id)).toContain('dispute_claim');
    c.pendingDecisions.push({ id: 'd1', month: c.month, kind: 'event', ruleIds: [], eventId: 'dispute_claim', vars: {} });
    resolveEvent(c, 'd1', 0);
    expect(companyMetrics(c).disputeRisk).toBe(0);
  });
});

describe('選択肢の効果', () => {
  function decide(c: CompanyState, eventId: string, choice: number, targetId: string | null = null) {
    c.pendingDecisions.push({ id: `d${eventId}`, month: c.month, kind: 'event', ruleIds: [], eventId, vars: {}, targetId });
    resolveEvent(c, `d${eventId}`, choice);
  }

  it('エースを給与で引き留めると、本人の給与が上がり、同僚の社内公平性が下がる', () => {
    const ace = makeEmployee('sales', { ability: 90, salaryMonthly: 400000 });
    const peers = [60, 70, 80].map((ability) => makeEmployee('sales', { ability, salaryMonthly: 420000 }));
    const c = company([ace, ...peers]);
    const before = internalFairnessScores(c.employees);
    decide(c, 'ace_resignation', 0, ace.id);
    expect(ace.salaryMonthly).toBeCloseTo(480000, -4);
    const after = internalFairnessScores(c.employees);
    const peer = peers[2] as Employee;
    expect(after.get(peer.id) ?? 0).toBeLessThan(before.get(peer.id) ?? 0);
    expect(c.decisions.at(-1)).toMatchObject({ eventId: 'ace_resignation', choiceIndex: 0, targetId: ace.id });
  });

  it('送り出すと本人が退職し、理由が記録される', () => {
    const ace = makeEmployee('sales');
    const c = company([ace, ...staff('sales', 3)]);
    decide(c, 'ace_resignation', 2, ace.id);
    expect(c.employees.some((e) => e.id === ace.id)).toBe(false);
    expect(c.departures.at(-1)).toMatchObject({ employeeId: ace.id, reason: 'pay' });
  });

  it('希望退職は実力の高い人から辞め（逆選択）、退職金がかかり、しばらく士気が下がる', () => {
    const team = Array.from({ length: 20 }, (_, i) => makeEmployee('sales', { ability: 40 + i }));
    const c = company(team);
    const cash = c.cash;
    decide(c, 'recession_response', 2);
    expect(c.employees).toHaveLength(18);
    expect(Math.max(...c.employees.map((e) => e.ability))).toBe(57);
    expect(c.cash).toBeLessThan(cash);
    expect(modifierValue(c, 'morale')).toBeLessThan(0);
  });

  it('雇用を守る選択は、賞与を下げるが人は減らない', () => {
    const c = company(staff('sales', 10, { bonusMonthly: 100000 }));
    decide(c, 'recession_response', 0);
    expect(c.employees).toHaveLength(10);
    expect(c.employees[0]?.bonusMonthly).toBeCloseTo(50000);
  });

  it('採用を強める選択は、一定期間だけ採用の強さを上げる', () => {
    const c = company(staff('sales', 10));
    decide(c, 'talent_shortage', 1);
    expect(modifierValue(c, 'hiringIntensity')).toBeGreaterThan(1);
    c.month += 12;
    expect(modifierValue(c, 'hiringIntensity')).toBe(1);
  });

  it('需要の急拡大は、起きた時点で需要を押し上げる（選ぶ前の効果）', () => {
    const c = company(staff('sales', 10));
    const mature = c.market.matureDemandMonthly;
    c.history.push({ ...({} as CompanyState['history'][number]), month: c.month - 1, revenue: 1, demand: 1, overtimeHours: 0, operatingProfit: 0, headcount: 10 });
    const ev = eventDefs.find((e) => e.id === 'demand_surge') as EventDef;
    expect(meetsConditions(ev, c, companyMetrics(c))).toBe(true);
    c.autoPlay = { legal: 'immediate' };
    const rng = createRng(3);
    // 条件のイベントでないので、起こすときは抽選を通す代わりに予約で起こす
    c.scheduledEvents.push({ eventId: 'demand_surge', dueMonth: c.month, probability: 1, targetId: null });
    runEvents(c, rng);
    expect(modifierValue(c, 'demand')).toBeGreaterThan(1);
    expect(c.market.matureDemandMonthly).toBeGreaterThan(mature);
  });

  it('需要の一時的な倍率は、その月の需要に掛かる', () => {
    const base = generateCompany({ seed: 5, industryId: 'trading' });
    const boosted = structuredClone(base);
    boosted.modifiers.push({ type: 'demand', mult: 1.5, untilMonth: 12 });
    expect(tick(boosted).history[0]?.demand).toBeCloseTo((tick(base).history[0]?.demand ?? 0) * 1.5);
  });

  it('大口取引先の倒産は、直近の売上に比例した貸し倒れを出す', () => {
    const c = company(staff('sales', 10));
    c.history.push({ ...({} as CompanyState['history'][number]), month: c.month, revenue: 100_000_000, extraordinaryCost: 0 });
    const cash = c.cash;
    c.scheduledEvents.push({ eventId: 'client_bankruptcy', dueMonth: c.month, probability: 1, targetId: null });
    runEvents(c, fixedRng(0.5));
    expect(cash - c.cash).toBeCloseTo(100_000_000 * 0.04);
  });

  it('育休を後押しすると対象者が休職に入る。期間を短くさせると復帰しにくくなる', () => {
    const a = makeEmployee('sales', { gender: 'F', age: 30 });
    const b = makeEmployee('sales', { gender: 'F', age: 30 });
    const c = company([a, b]);
    decide(c, 'parental_leave_female', 0, a.id);
    c.pendingDecisions.push({ id: 'x', month: c.month, kind: 'event', ruleIds: [], eventId: 'parental_leave_female', vars: {}, targetId: b.id });
    resolveEvent(c, 'x', 2);
    expect(a.leave?.kind).toBe('parental');
    expect(b.leave?.endsAt ?? 0).toBeLessThan(a.leave?.endsAt ?? 0);
    expect(b.leave?.returnRate ?? 1).toBeLessThan(a.leave?.returnRate ?? 0);
  });

  it('集団への効果は、条件・並べ方・人数の上限どおりに選ぶ', () => {
    const team = Array.from({ length: 10 }, (_, i) => makeEmployee('sales', { ability: 50 + i }));
    const c = company([...team, makeEmployee('admin', { ability: 99 })]);
    const g = { where: [{ field: 'roleKind' as const, op: '==' as const, value: 'revenue' }], sortBy: 'ability' as const, order: 'desc' as const, limit: 3 };
    expect(groupMembers(c, g, null).map((e) => e.ability)).toEqual([59, 58, 57]);
    expect(groupMembers(c, { ...g, excludeTarget: true }, team[9]?.id ?? null).map((e) => e.ability)).toEqual([58, 57, 56]);
  });
});

describe('判断の傾向（自動で選ぶとき）', () => {
  const ace = eventDefs.find((e) => e.id === 'ace_resignation') as EventDef;
  const style = (s: Partial<JudgmentStyle>): JudgmentStyle => ({ reward: 0, horizon: 0, rules: 0, people: 0, ...s });

  it('傾向に合う印の選択肢を選ぶ（人を守る傾向なら「送り出す」は選ばない）', () => {
    const rng = createRng(7);
    const picks = Array.from({ length: 200 }, () => styleChoiceIndex(ace, style({ people: 1 }), rng));
    expect(picks).not.toContain(2);
    const replace = Array.from({ length: 200 }, () => styleChoiceIndex(ace, style({ people: -1, rules: 1 }), rng));
    expect(replace.filter((i) => i === 2).length).toBeGreaterThan(150);
  });

  it('傾向がなければ、選択肢をまんべんなく選ぶ', () => {
    const rng = createRng(11);
    const counts = [0, 0, 0];
    for (let i = 0; i < 600; i++) counts[styleChoiceIndex(ace, undefined, rng)]! += 1;
    for (const n of counts) expect(n).toBeGreaterThan(120);
  });

  it('会社の傾向で、選ぶ選択肢の向きが変わる（記録にも残る）', () => {
    const axesSum = (s: JudgmentStyle) => {
      let sum = 0;
      for (let seed = 1; seed <= 6; seed++) {
        const c = generateCompany({ seed, industryId: 'trading', autoPlay: { legal: 'immediate', style: s } });
        const end = runToEnd(c, 120);
        for (const d of end.decisions) sum += d.axes.people ?? 0;
        expect(end.decisions.every((d) => d.auto)).toBe(true);
      }
      return sum;
    };
    expect(axesSum(style({ people: 1 }))).toBeGreaterThan(0);
    expect(axesSum(style({ people: -1 }))).toBeLessThan(0);
  });

  it('人を入れ替える傾向の会社は、人を守る傾向の会社より、イベントで辞める人が多い', () => {
    const eventResignations = (s: JudgmentStyle) => {
      let n = 0;
      for (let seed = 1; seed <= 12; seed++) {
        const end = runToEnd(generateCompany({ seed: seed * 13, industryId: 'trading', autoPlay: { legal: 'immediate', style: s } }), 180);
        const decided = new Set(end.decisions.map((d) => d.month));
        n += end.departures.filter((d) => d.kind === 'resignation' && decided.has(d.month)).length;
      }
      return n;
    };
    expect(eventResignations(style({ people: -1 }))).toBeGreaterThan(eventResignations(style({ people: 1 })));
  });
});

describe('画面で選ぶとき', () => {
  it('イベントが起きると判断待ちで止まり、選ぶと先に進める', () => {
    let c = generateCompany({ seed: 21, industryId: 'trading', autoPlay: null });
    let stopped: CompanyState | null = null;
    for (let i = 0; i < 120 && !stopped; i++) {
      // 法令の節目はすぐ対応で片づけ、イベントで止まるのを待つ
      c = tick(c);
      const d = c.pendingDecisions[0];
      if (d?.kind === 'milestone') {
        resolveMilestone(c, d.id, 'immediate');
      } else if (d?.kind === 'event' && eventDefs.find((e) => e.id === d.eventId)?.category === 'law') {
        resolveEvent(c, d.id, 0);
      } else if (d?.kind === 'event' && eventDefs.find((e) => e.id === d.eventId)?.category !== 'law') {
        stopped = c;
      }
    }
    expect(stopped).not.toBeNull();
    const s = stopped as CompanyState;
    const month = s.month;
    expect(tick(s).month).toBe(month); // 判断待ちの間は進まない
    const d = s.pendingDecisions[0] as CompanyState['pendingDecisions'][number];
    resolveEvent(s, d.id, 0);
    expect(s.decisions.at(-1)?.auto).toBe(false);
  });
});

it('判断の傾向の軸は4つ', () => {
  expect(JUDGMENT_AXES).toHaveLength(4);
  // 係数台帳に、自動で選ぶときのばらつきがある
  expect(coef('event.auto.choice_noise')).toBeGreaterThan(0);
  expect(getIndustry('trading').specialEvents.length).toBeGreaterThan(0);
  expect(employeeMatching([{ field: 'age', op: '>=', value: 25 }, { field: 'age', op: '<=', value: 40 }]).age).toBe(25);
});
