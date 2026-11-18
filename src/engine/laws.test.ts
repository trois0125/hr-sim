import { describe, expect, it } from 'vitest';
import { formatGameDate, gameDate, monthIndexOf } from './calendar';
import { coef } from './coefficients';
import { resolveEvent, resolveMilestone } from './events';
import { generateCompany } from './generate';
import { getLaw, laws } from './lawData';
import { checkObligations, checkViolations, countHeadcount, isEffective, legalMonthlyCost } from './laws';
import type { Rng } from './rng';
import { makeEmployee, staff } from './testHelpers';
import { runToEnd, tick } from './tick';
import type { CompanyState, Departure, LegalResponse } from './types';

/** どの抽選も「起きる」側に倒す乱数（臨検・発覚・請求・健康被害を確実に起こす） */
const always: Rng = {
  next: () => 0,
  range: (min) => min,
  int: (min) => min,
  chance: () => true,
  pick: (xs) => xs[0] as never,
  weightedPick: (xs) => xs[0] as never,
  normal: (m = 0) => m,
  gamma: (s) => s,
  shuffle: (xs) => [...xs],
  getState: () => ({ seed: 0, state: 0 }),
};
/** どの抽選も「起きない」側に倒す乱数 */
const never: Rng = { ...always, next: () => 0.999999, chance: () => false };

/** 指定の人数・月の会社（判断は画面で選ぶ＝自動にしない） */
function company(headcount: number, month = 12, autoPlay: LegalResponse | null = null): CompanyState {
  const c = generateCompany({ seed: 1, industryId: 'trading', foundingPatternId: 'solo', autoPlay: autoPlay ? { legal: autoPlay } : null });
  c.employees = staff('sales', headcount);
  c.month = month;
  return c;
}
const ruleIdsOf = (c: CompanyState) => c.pendingDecisions.flatMap((d) => d.ruleIds);
const resigned = (name = '退職者'): Departure =>
  ({ employeeId: 'x', name, role: 'sales', month: 0, kind: 'resignation', reason: 'pay' }) as Departure;

describe('ゲーム内の日付', () => {
  it('創業は2026年4月で、経過月から年月がわかる', () => {
    expect(gameDate(0)).toEqual({ year: 2026, month: 4 });
    expect(gameDate(9)).toEqual({ year: 2027, month: 1 });
    expect(formatGameDate(3)).toBe('2026年7月');
    expect(monthIndexOf('2026-07-01')).toBe(3);
    expect(monthIndexOf('2028-04-01')).toBe(24);
  });
});

describe('法令データ', () => {
  it('すべてのルールに施行日と出典がある', () => {
    for (const r of laws) {
      expect(r.effectiveFrom).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(r.source.length).toBeGreaterThan(5);
      expect(r.lesson.length).toBeGreaterThan(5);
    }
  });

  it('障害者の法定雇用率は2026年7月に2.5%から2.7%に切り替わる', () => {
    const r25 = getLaw('disability_employment_25');
    const r27 = getLaw('disability_employment_27');
    expect(isEffective(r25, 2)).toBe(true);
    expect(isEffective(r25, 3)).toBe(false);
    expect(isEffective(r27, 2)).toBe(false);
    expect(isEffective(r27, 3)).toBe(true);
  });

  it('50人未満のストレスチェックは2028年4月から', () => {
    const r = getLaw('stress_check_small');
    expect(isEffective(r, 23)).toBe(false);
    expect(isEffective(r, 24)).toBe(true);
  });
});

describe('人数の数え方', () => {
  it('労基法・安衛法の人数はパートも出向者も含む', () => {
    const team = [makeEmployee('sales'), makeEmployee('admin', { employmentType: 'part' }), makeEmployee('sales', { affiliation: 'secondee' })];
    expect(countHeadcount(team, 'all')).toBe(3);
  });

  it('障害者雇用率の算定基礎は、出向者と週20時間未満のパートを除く', () => {
    const team = [makeEmployee('sales'), makeEmployee('admin', { employmentType: 'part' }), makeEmployee('sales', { affiliation: 'secondee' })];
    expect(countHeadcount(team, 'disability')).toBe(1 + coef('law.disability.part_weight'));
  });
});

describe('節目（義務の発生）', () => {
  it.each([
    [9, 10, 'work_rules'],
    [9, 10, 'safety_promoter'],
    [37, 38, 'disability_employment_27'],
    [49, 50, 'health_management_50'],
    [100, 101, 'women_action_plan_101'],
    [100, 101, 'women_disclosure_101'],
    [300, 301, 'paternity_leave_disclosure_301'],
  ])('%i人では出ず、%i人で「%s」の節目が出る', (below, at, ruleId) => {
    const a = company(below);
    checkObligations(a);
    expect(ruleIdsOf(a)).not.toContain(ruleId);
    const b = company(at);
    checkObligations(b);
    expect(ruleIdsOf(b)).toContain(ruleId);
  });

  it('同じ月に生じた義務は1つの節目にまとまり、一度出た義務は二度出ない', () => {
    const c = company(60);
    checkObligations(c);
    expect(c.pendingDecisions).toHaveLength(1);
    expect(c.pendingDecisions[0]?.kind).toBe('milestone');
    const n = c.legal.compliance.length;
    checkObligations(c);
    expect(c.legal.compliance).toHaveLength(n);
    expect(c.pendingDecisions).toHaveLength(1);
  });

  it('1人目を雇うと、労働条件の明示と保険の加入、36協定の節目が出る（残業させる前の事前警告）', () => {
    const c = company(1, 0);
    checkObligations(c);
    expect(ruleIdsOf(c)).toEqual(expect.arrayContaining(['labor_conditions_insurance', 'agreement_36']));
  });

  it('残業させない方針なら、36協定の節目は出ない', () => {
    const c = company(1, 0);
    c.policies.overtime = 'none';
    checkObligations(c);
    expect(ruleIdsOf(c)).not.toContain('agreement_36');
  });

  it('画面で遊ぶとき（自動にしない）は、節目で時間が止まり、選ぶと先に進む', () => {
    const c = generateCompany({ seed: 2, industryId: 'trading', foundingPatternId: 'solo', autoPlay: null });
    const t1 = tick(c);
    expect(t1.month).toBe(0);
    expect(t1.history).toHaveLength(0);
    expect(t1.pendingDecisions[0]?.ruleIds).toContain('agreement_36');
    for (const d of [...t1.pendingDecisions]) resolveMilestone(t1, d.id, 'immediate');
    const t2 = tick(t1);
    expect(t2.month).toBe(1);
  });
});

describe('節目での対応', () => {
  const respond = (response: LegalResponse) => {
    const c = company(60);
    const cash = c.cash;
    checkObligations(c);
    const d = c.pendingDecisions[0];
    if (!d) throw new Error('節目がありません');
    resolveMilestone(c, d.id, response, never);
    return { c, spent: cash - c.cash };
  };

  it('すぐ対応：費用がかかり、対応済みになる（不備が出なければ）', () => {
    const { c, spent } = respond('immediate');
    expect(spent).toBeGreaterThan(0);
    expect(c.legal.compliance.every((x) => x.status === 'compliant')).toBe(true);
    expect(legalMonthlyCost(c)).toBeGreaterThan(0);
  });

  it('社労士に依頼：すぐ対応より高いが、必ず対応済みになる', () => {
    const imm = respond('immediate');
    const out = respond('outsource');
    expect(out.spent).toBeGreaterThan(imm.spent);
    const c = company(60);
    checkObligations(c);
    resolveMilestone(c, c.pendingDecisions[0]?.id ?? '', 'outsource', always);
    expect(c.legal.compliance.every((x) => x.status === 'compliant')).toBe(true);
  });

  it('すぐ対応しても、まれに不備が残る（気づかないまま違反の状態）', () => {
    const c = company(60);
    checkObligations(c);
    resolveMilestone(c, c.pendingDecisions[0]?.id ?? '', 'immediate', always);
    expect(c.legal.compliance.every((x) => x.status === 'noncompliant' && x.response === 'immediate')).toBe(true);
  });

  it('後回し：費用はかからず、違反の状態になる', () => {
    const { c, spent } = respond('postpone');
    expect(spent).toBe(0);
    expect(c.legal.compliance.every((x) => x.status === 'noncompliant')).toBe(true);
    expect(legalMonthlyCost(c)).toBe(0);
  });
});

describe('違反の発覚とイベント', () => {
  function postponed(headcount: number) {
    const c = company(headcount);
    checkObligations(c);
    resolveMilestone(c, c.pendingDecisions[0]?.id ?? '', 'postpone', never);
    return c;
  }

  it('臨検で違反が見つかると、是正勧告のイベントになり、是正すると対応済みになる', () => {
    const c = postponed(20);
    checkViolations(c, { rng: always, overtimeHours: 10, resigned: [] });
    const ev = c.pendingDecisions.find((d) => d.eventId === 'labor_inspection');
    expect(ev).toBeDefined();
    expect(ev?.ruleIds).toEqual(expect.arrayContaining(['work_rules', 'agreement_36']));
    const cash = c.cash;
    resolveEvent(c, ev?.id ?? '', 0);
    expect(c.cash).toBeLessThan(cash);
    for (const id of ev?.ruleIds ?? []) expect(c.legal.compliance.find((x) => x.ruleId === id)?.status).toBe('compliant');
  });

  it('臨検がなければ発覚しないが、違反の月数は数えられる', () => {
    const c = postponed(20);
    checkViolations(c, { rng: never, overtimeHours: 10, resigned: [] });
    expect(c.pendingDecisions).toHaveLength(0);
    expect(c.legal.compliance.find((x) => x.ruleId === 'work_rules')?.violationMonths).toBe(1);
  });

  it('36協定がなくても、残業させなかった月は違反にならない', () => {
    const c = postponed(5);
    checkViolations(c, { rng: never, overtimeHours: 0, resigned: [] });
    expect(c.legal.compliance.find((x) => x.ruleId === 'agreement_36')?.violationMonths).toBe(0);
  });

  it('退職者の申告がきっかけでも臨検になる', () => {
    const c = postponed(20);
    const rng: Rng = { ...never, next: (() => { let i = 0; return () => (i++ === 1 ? 0 : 0.999999); })() };
    checkViolations(c, { rng, overtimeHours: 10, resigned: [resigned()] });
    const ev = c.pendingDecisions.find((d) => d.eventId === 'labor_inspection');
    expect(String(ev?.vars.how)).toContain('申告');
  });

  it('公表義務の違反は、行政の指摘と評判のイベントになり、公表しないと採用の評判が下がる', () => {
    const c = postponed(120);
    checkViolations(c, { rng: always, overtimeHours: 0, resigned: [] });
    const ev = c.pendingDecisions.find((d) => d.eventId === 'disclosure_recommendation');
    expect(ev?.ruleIds).toEqual(expect.arrayContaining(['women_action_plan_101']));
    resolveEvent(c, ev?.id ?? '', 1);
    expect(c.modifiers.some((m) => m.type === 'hiringAttraction' && m.mult < 1)).toBe(true);
  });

  it('ロクイチ報告（6月）で障害者雇用の不足がわかり、100人超なら納付金を納める', () => {
    const c = postponed(120);
    c.month = coef('law.disability.report_month') + 12;
    const cash = c.cash;
    checkViolations(c, { rng: never, overtimeHours: 0, resigned: [] });
    const ev = c.pendingDecisions.find((d) => d.eventId === 'disability_guidance');
    expect(ev).toBeDefined();
    expect(Number(ev?.vars.shortfall)).toBe(Math.floor(120 * 0.027));
    expect(cash - c.cash).toBe(Math.floor(120 * 0.027) * coef('law.disability.levy_per_person_month') * 12);
  });
});

describe('特別条項と長時間労働', () => {
  it('月45時間超が年6か月を超えると上限違反になり、臨検で是正されると残業の上限が月45時間に戻る', () => {
    const c = company(20, 12, 'immediate');
    c.policies.overtime = 'special';
    checkObligations(c, never);
    for (let m = 12; m < 19; m++) {
      c.month = m;
      checkViolations(c, { rng: never, overtimeHours: 60, resigned: [] });
    }
    expect(c.legal.overtimeCapExceeded).toBe(true);
    c.autoPlay = null;
    checkViolations(c, { rng: always, overtimeHours: 50, resigned: [] });
    const ev = c.pendingDecisions.find((d) => d.eventId === 'labor_inspection');
    expect(String(ev?.vars.violations)).toContain('年6か月');
    resolveEvent(c, ev?.id ?? '', 0);
    expect(c.policies.overtime).toBe('limit45');
  });

  it('月45時間を超える残業で健康被害が起き、その人は働けなくなる', () => {
    const c = company(5);
    for (const e of c.employees) e.overtimeHours = 80;
    checkViolations(c, { rng: always, overtimeHours: 80, resigned: [] });
    expect(c.employees).toHaveLength(4);
    expect(c.departures.at(-1)?.reason).toBe('workload');
    expect(c.pendingDecisions.some((d) => d.eventId === 'overwork_health')).toBe(true);
  });

  it('月45時間以内なら健康被害は起きない', () => {
    const c = company(5);
    for (const e of c.employees) e.overtimeHours = 45;
    checkViolations(c, { rng: always, overtimeHours: 45, resigned: [] });
    expect(c.employees).toHaveLength(5);
  });
});

describe('固定残業代の運用ミスと未払い残業代', () => {
  function misoperated() {
    const c = company(10);
    c.policies.workHours = 'fixed_overtime';
    c.legal.fixedOvertimeRolled = true;
    c.legal.fixedOvertimeMisoperation = true;
    for (const e of c.employees) e.overtimeHours = 40;
    return c;
  }

  it('含めた時間を超えた分を払わないと、未払いがたまり、そのぶん手元に残る', () => {
    const c = misoperated();
    const cash = c.cash;
    checkViolations(c, { rng: never, overtimeHours: 40, resigned: [] });
    const owed = c.legal.unpaidOvertime.reduce((s, u) => s + u.amount, 0);
    expect(owed).toBeGreaterThan(0);
    expect(c.cash - cash).toBeCloseTo(owed);
  });

  it('含めた時間を超えなければ未払いは生じない', () => {
    const c = misoperated();
    for (const e of c.employees) e.overtimeHours = 10;
    checkViolations(c, { rng: never, overtimeHours: 10, resigned: [] });
    expect(c.legal.unpaidOvertime).toHaveLength(0);
  });

  it('3年より前の未払いは時効で消える', () => {
    const c = misoperated();
    c.legal.unpaidOvertime = [{ month: 0, amount: 1000, employeeIds: [] }];
    c.month = coef('law.unpaid_overtime.statute_months') + 1;
    checkViolations(c, { rng: never, overtimeHours: 0, resigned: [] });
    expect(c.legal.unpaidOvertime.some((u) => u.month === 0)).toBe(false);
  });

  it('退職者から請求され、争うと全員分を精算するより高くつく', () => {
    const setup = () => {
      const c = misoperated();
      checkViolations(c, { rng: always, overtimeHours: 40, resigned: [resigned('佐藤 翔太')] });
      return c;
    };
    const pay = setup();
    const fight = setup();
    const ev = pay.pendingDecisions.find((d) => d.eventId === 'unpaid_overtime_claim');
    expect(ev?.vars.name).toBe('佐藤 翔太');
    const before = pay.cash;
    resolveEvent(pay, ev?.id ?? '', 0);
    const evF = fight.pendingDecisions.find((d) => d.eventId === 'unpaid_overtime_claim');
    resolveEvent(fight, evF?.id ?? '', 1);
    expect(before - pay.cash).toBeLessThan(before - fight.cash);
    expect(pay.legal.unpaidOvertime).toHaveLength(0);
    expect(pay.legal.fixedOvertimeMisoperation).toBe(false);
  });
});

describe('法令対応の方針と会社全体', () => {
  it('同じシードなら、法令の判断も含めて最後まで同じ結果になる', () => {
    const run = () => runToEnd(generateCompany({ seed: 9, industryId: 'trading', autoPlay: { legal: 'postpone' } }), 120);
    expect(run()).toEqual(run());
  });

  it('後回しにし続けた会社は、違反の月が積み上がり、発覚のイベントが起きる（多くの会社で）', { timeout: 30000 }, () => {
    let violationMonths = 0;
    let detected = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const end = runToEnd(generateCompany({ seed, industryId: 'trading', foundingPatternId: 'carveout', autoPlay: { legal: 'postpone' } }), 120);
      violationMonths += end.history.reduce((s, r) => s + (r.violations > 0 ? 1 : 0), 0);
      detected += end.legal.log.filter((l) => l.kind === 'violation_detected').length;
    }
    expect(violationMonths).toBeGreaterThan(0);
    expect(detected).toBeGreaterThan(0);
  });

  it('後回しの会社は、すぐ対応の会社より違反の月が多く、納得感が低い（同じ会社どうしの平均）', { timeout: 30000 }, () => {
    const avg = (legal: LegalResponse) => {
      let eng = 0;
      let vm = 0;
      let n = 0;
      for (let seed = 1; seed <= 12; seed++) {
        const end = runToEnd(generateCompany({ seed, industryId: 'trading', foundingPatternId: 'cofounders', autoPlay: { legal } }), 96);
        for (const r of end.history) {
          eng += r.avgEngagement;
          if (r.violations > 0) vm++;
          n++;
        }
      }
      return { eng: eng / n, vm };
    };
    const imm = avg('immediate');
    const post = avg('postpone');
    expect(post.vm).toBeGreaterThan(imm.vm);
    expect(post.eng).toBeLessThan(imm.eng);
  });
});
