import { describe, expect, it } from 'vitest';
import { coef } from './coefficients';
import { updateEngagement } from './engagement';
import { computeFinance } from './finance';
import { generateCompany } from './generate';
import { desiredOpenings } from './hiring';
import { countHeadcount } from './laws';
import { isOnLeave, processLeaves, standardLeaveMonths, startLeave } from './leave';
import { computePerformance, fte } from './performance';
import { runAttrition } from './attrition';
import { defaultPolicies } from './data';
import { chemicals, fixedRng, makeEmployee, staff, tokyo, trading } from './testHelpers';
import type { CompanyState, Employee } from './types';

function company(employees: Employee[], month = 24): CompanyState {
  const c = generateCompany({ seed: 1, industryId: 'trading', foundingPatternId: 'solo', autoPlay: null });
  c.employees = employees;
  c.month = month;
  return c;
}

const finance = (employees: Employee[]) =>
  computeFinance({ employees, policies: defaultPolicies, demand: 0, capacity: 0, overtimeCapacity: 0, grossMargin: 0.1, hiringCost: 0 });

describe('休職に入る', () => {
  it('種類と性別で標準の期間が決まり、期間の終わる月と復帰する確率を持つ', () => {
    const f = makeEmployee('sales', { gender: 'F' });
    const m = makeEmployee('sales', { gender: 'M' });
    startLeave(f, 'parental', 10);
    startLeave(m, 'parental', 10);
    expect(f.leave?.endsAt).toBe(10 + coef('leave.parental.female_months'));
    expect(m.leave?.endsAt).toBe(10 + coef('leave.parental.male_months'));
    expect(standardLeaveMonths('sick', 'F')).toBe(coef('leave.sick.months'));
    expect(f.leave?.returnRate).toBe(coef('leave.parental.return_rate'));
  });

  it('期間の倍率と、復帰する確率の上乗せを指定できる（0〜1に収める）', () => {
    const e = makeEmployee('sales');
    startLeave(e, 'sick', 0, { monthsMult: 2, returnRateBonus: 0.9 });
    expect(e.leave?.endsAt).toBe(2 * coef('leave.sick.months'));
    expect(e.leave?.returnRate).toBe(1);
  });

  it('すでに休職中なら何も変わらない', () => {
    const e = makeEmployee('sales');
    startLeave(e, 'care', 0);
    const before = { ...e.leave };
    startLeave(e, 'sick', 5);
    expect(e.leave).toEqual(before);
  });
});

describe('休職中の扱い', () => {
  it('稼働は0になり、売れる上限から外れる', () => {
    const team = staff('sales', 4);
    const before = computePerformance(team, trading, chemicals).capacity;
    startLeave(team[0] as Employee, 'sick', 0);
    expect(fte(team[0] as Employee)).toBe(0);
    expect(computePerformance(team, trading, chemicals).capacity).toBeLessThan(before);
  });

  it('給与・賞与は払わない。社会保険料は育休なら免除、私傷病・介護なら払い続ける', () => {
    const base = finance([makeEmployee('sales', { salaryMonthly: 400000, bonusMonthly: 50000 })]);
    const parental = makeEmployee('sales', { salaryMonthly: 400000, bonusMonthly: 50000 });
    startLeave(parental, 'parental', 0);
    const sick = makeEmployee('sales', { salaryMonthly: 400000, bonusMonthly: 50000 });
    startLeave(sick, 'sick', 0);
    const p = finance([parental]);
    const s = finance([sick]);
    expect(p.labor.salaries).toBe(0);
    expect(p.labor.bonus).toBe(0);
    expect(p.labor.legalWelfare).toBe(0);
    expect(s.labor.salaries).toBe(0);
    expect(s.labor.legalWelfare).toBeCloseTo(400000 * coef('labor.legal_welfare_rate'));
    expect(s.labor.total).toBeLessThan(base.labor.total);
  });

  it('在籍者として法令の人数には数える', () => {
    const team = staff('sales', 5);
    startLeave(team[0] as Employee, 'parental', 0);
    expect(countHeadcount(team, 'all')).toBe(5);
  });

  it('採用では「いない人」として扱い、代わりの人を採ろうとする', () => {
    const team = staff('sales', 5);
    const input = { employees: team, industry: trading, variant: chemicals, demand: 0, capacity: 0 };
    const demand = computePerformance(team, trading, chemicals).capacity;
    const before = desiredOpenings({ ...input, demand, capacity: demand });
    startLeave(team[0] as Employee, 'parental', 0);
    startLeave(team[1] as Employee, 'sick', 0);
    const capacity = computePerformance(team, trading, chemicals).capacity;
    const after = desiredOpenings({ ...input, demand, capacity });
    expect(after.sales ?? 0).toBeGreaterThan(before.sales ?? 0);
  });

  it('休職中の人は通常の退職の抽選にかからず、納得感も動かない', () => {
    const e = makeEmployee('sales', { engagement: 10 });
    startLeave(e, 'sick', 0);
    const r = runAttrition([e], { rng: fixedRng(0), industry: trading, location: tokyo, month: 1, policies: defaultPolicies });
    expect(r.stay).toHaveLength(1);
    const c = company([e]);
    updateEngagement(c.employees, {
      industry: trading,
      location: tokyo,
      policies: defaultPolicies,
      history: [],
      cash: 1e9,
      headcount: 1,
    });
    expect(e.engagement).toBe(10);
  });
});

describe('休職の終わり', () => {
  it('期間が終わる月に、抽選で復帰する（休職の状態が消える）', () => {
    const e = makeEmployee('sales');
    startLeave(e, 'parental', 0);
    const c = company([e], (e.leave?.endsAt ?? 0) - 1);
    expect(processLeaves(c, fixedRng(0)).departures).toHaveLength(0);
    expect(isOnLeave(e)).toBe(true); // まだ期間中
    c.month += 1;
    const r = processLeaves(c, fixedRng(0));
    expect(r.departures).toHaveLength(0);
    expect(r.returned).toEqual([{ employee: e, kind: 'parental' }]);
    expect(isOnLeave(e)).toBe(false);
  });

  it('復帰しなければ退職になり、理由が記録される（育休・介護は家庭の事情、私傷病は負荷）', () => {
    const a = makeEmployee('sales');
    const b = makeEmployee('sales');
    startLeave(a, 'parental', 0);
    startLeave(b, 'sick', 0);
    const c = company([a, b], 100);
    const out = processLeaves(c, fixedRng(0.999)).departures;
    expect(c.employees).toHaveLength(0);
    expect(out.map((d) => d.reason).sort()).toEqual(['family', 'workload']);
    expect(c.departures).toHaveLength(2);
  });

  it('復帰する確率が高いほど、復帰する人が多い', () => {
    const run = (bonus: number) => {
      const team = staff('sales', 200);
      for (const e of team) startLeave(e, 'sick', 0, { returnRateBonus: bonus });
      const c = company(team, 100);
      let seed = 0;
      // 0〜1の乱数を順に返す
      const rng = { ...fixedRng(0), next: () => ((seed = (seed * 9301 + 49297) % 233280) / 233280) };
      processLeaves(c, rng);
      return c.employees.length;
    };
    expect(run(0.3)).toBeGreaterThan(run(-0.3));
  });
});
