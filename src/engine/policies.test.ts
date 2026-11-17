import { describe, expect, it } from 'vitest';
import { coef } from './coefficients';
import { defaultPolicies } from './data';
import { computeFinance } from './finance';
import { computePerformance } from './performance';
import {
  annualAbilityGain,
  bonusMonthlyFor,
  evaluationNoise,
  fillRateMultiplier,
  fixedOvertimeAllowance,
  hireChannelFor,
  hrSystemCostPerEmployee,
  monthlyCompensation,
  paidOvertimeHours,
  rampParams,
  stabilityBonus,
  validatePolicies,
  workloadBonus,
} from './policies';
import { chemicals, makeEmployee, staff, trading } from './testHelpers';
import type { PolicySet } from './types';

const P = (over: Partial<PolicySet>): PolicySet => ({ ...defaultPolicies, ...over });

describe('等級制度・評価制度', () => {
  it('評価のずれは 社長 > MBO > 行動評価 > 360度 の順に小さくなる', () => {
    const noise = (evaluation: PolicySet['evaluation']) => evaluationNoise(P({ evaluation }), 5, trading);
    expect(noise('ceo')).toBeGreaterThan(noise('mbo'));
    expect(noise('mbo')).toBeGreaterThan(noise('competency'));
    expect(noise('competency')).toBeGreaterThan(noise('multi_rater'));
  });

  it('社長が決める評価は、人数が増えるほどずれる（他の制度は人数で変わらない）', () => {
    expect(evaluationNoise(P({ evaluation: 'ceo' }), 100, trading)).toBeGreaterThan(
      evaluationNoise(P({ evaluation: 'ceo' }), 5, trading),
    );
    expect(evaluationNoise(P({ evaluation: 'mbo' }), 100, trading)).toBe(
      evaluationNoise(P({ evaluation: 'mbo' }), 5, trading),
    );
  });

  it('等級制度があると評価のずれが小さくなる', () => {
    expect(evaluationNoise(P({ grade: 'job' }), 20, trading)).toBeLessThan(
      evaluationNoise(P({ grade: 'none' }), 20, trading),
    );
  });

  it('正確な評価制度ほど運用コストがかかる', () => {
    expect(hrSystemCostPerEmployee(P({ evaluation: 'multi_rater' }))).toBeGreaterThan(
      hrSystemCostPerEmployee(P({ evaluation: 'ceo' })),
    );
    expect(hrSystemCostPerEmployee(P({ grade: 'job' }))).toBeGreaterThan(hrSystemCostPerEmployee(P({ grade: 'none' })));
  });
});

describe('賞与', () => {
  const e = makeEmployee('sales', { salaryMonthly: 400000 });
  const ctx = (bonus: PolicySet['bonus'], percentile = 0.5, lastYearProfit = 0) => ({
    policies: P({ bonus }),
    percentile,
    lastYearProfit,
    totalSalaries: 4_000_000,
  });

  it('なし＝0、一律＝決まった月数', () => {
    expect(bonusMonthlyFor(e, ctx('none'))).toBe(0);
    expect(bonusMonthlyFor(e, ctx('fixed_months'))).toBeCloseTo((400000 * 2) / 12);
  });

  it('個人成果連動：評価の高い人ほど多く、平均は一律と同じ', () => {
    const top = bonusMonthlyFor(e, ctx('individual_linked', 1));
    const mid = bonusMonthlyFor(e, ctx('individual_linked', 0.5));
    const bottom = bonusMonthlyFor(e, ctx('individual_linked', 0));
    expect(top).toBeGreaterThan(mid);
    expect(mid).toBeGreaterThan(bottom);
    expect((top + bottom) / 2).toBeCloseTo(bonusMonthlyFor(e, ctx('fixed_months')));
  });

  it('業績連動：前年が赤字なら0、利益が大きいほど多い（上限あり）', () => {
    expect(bonusMonthlyFor(e, ctx('company_linked', 0.5, -1e8))).toBe(0);
    const small = bonusMonthlyFor(e, ctx('company_linked', 0.5, 10_000_000));
    const big = bonusMonthlyFor(e, ctx('company_linked', 0.5, 50_000_000));
    const huge = bonusMonthlyFor(e, ctx('company_linked', 0.5, 1e12));
    expect(big).toBeGreaterThan(small);
    expect(huge).toBeCloseTo((400000 * coef('policy.bonus.company_linked.max_months')) / 12);
  });

  it('パートは賞与の対象外', () => {
    expect(bonusMonthlyFor(makeEmployee('sales', { employmentType: 'part' }), ctx('fixed_months'))).toBe(0);
  });

  it('給与の見通しが立つ制度ほど「雇用の安定」が上がる', () => {
    expect(stabilityBonus(P({ pay: 'seniority' }))).toBeGreaterThan(stabilityBonus(P({ pay: 'performance' })));
    expect(stabilityBonus(P({ bonus: 'fixed_months' }))).toBeGreaterThan(
      stabilityBonus(P({ bonus: 'individual_linked' })),
    );
  });
});

describe('労働時間', () => {
  it('固定残業代：残業が少なくても、含めた時間ぶんは払う', () => {
    const fixed = P({ workHours: 'fixed_overtime' });
    expect(paidOvertimeHours(0, fixed)).toBe(coef('policy.workHours.fixed_overtime.included_hours'));
    expect(paidOvertimeHours(40, fixed)).toBe(40);
    expect(paidOvertimeHours(0, P({ workHours: 'standard' }))).toBe(0);
  });

  it('固定残業代は報酬に上乗せされて見える（社外比較が上がる）', () => {
    const e = makeEmployee('sales');
    expect(fixedOvertimeAllowance(e, P({ workHours: 'fixed_overtime' }))).toBeGreaterThan(0);
    expect(monthlyCompensation(e, P({ workHours: 'fixed_overtime' }))).toBeGreaterThan(
      monthlyCompensation(e, P({ workHours: 'standard' })),
    );
  });

  it('変形労働時間制は割増の付く残業が減り、残業代が下がる', () => {
    const team = staff('sales', 3, { overtimeHours: 30 });
    const input = {
      employees: team,
      demand: 1e8,
      capacity: 1e8,
      overtimeCapacity: 0,
      grossMargin: 0.1,
      hiringCost: 0,
    };
    const variable = computeFinance({ ...input, policies: P({ workHours: 'variable' }) }).labor.overtime;
    const standard = computeFinance({ ...input, policies: P({ workHours: 'standard' }) }).labor.overtime;
    expect(variable).toBeLessThan(standard);
  });

  it('フレックスは「働く負荷」の受け止め方がよくなる', () => {
    expect(workloadBonus(P({ workHours: 'flex' }))).toBeGreaterThan(workloadBonus(P({ workHours: 'standard' })));
  });
});

describe('採用方針', () => {
  it('新卒は立ち上がりが遅く、パートは早い', () => {
    const p = P({});
    const months = (ch: 'new_grad' | 'mid_career' | 'part_time') => rampParams({ hireChannel: ch }, p).months;
    expect(months('new_grad')).toBeGreaterThan(months('mid_career'));
    expect(months('mid_career')).toBeGreaterThan(months('part_time'));
  });

  it('パートの求人は埋まりやすく、新卒の求人は埋まりにくい', () => {
    expect(fillRateMultiplier('part_time', P({}))).toBeGreaterThan(fillRateMultiplier('mid_career', P({})));
    expect(fillRateMultiplier('new_grad', P({}))).toBeLessThan(fillRateMultiplier('mid_career', P({})));
  });

  it('パート中心でも、正社員で採る人は中途の経路になる（採用費・立ち上がりは中途の値）', () => {
    expect(hireChannelFor(P({ hiring: 'part_time' }), 'full')).toBe('mid_career');
    expect(hireChannelFor(P({ hiring: 'part_time' }), 'part')).toBe('part_time');
    expect(hireChannelFor(P({ hiring: 'new_grad' }), 'full')).toBe('new_grad');
    expect(hireChannelFor(P({ hiring: 'new_grad' }), 'part')).toBe('part_time');
  });
});

describe('育成投資', () => {
  it('育成投資を増やすほど実力が伸び、若い人ほど伸び、実力が高いほど伸びにくい', () => {
    const young = { age: 25, ability: 50 };
    expect(annualAbilityGain(young, P({ training: '1' }))).toBeGreaterThan(annualAbilityGain(young, P({ training: '0' })));
    expect(annualAbilityGain(young, P({}))).toBeGreaterThan(annualAbilityGain({ age: 45, ability: 50 }, P({})));
    expect(annualAbilityGain({ age: 25, ability: 90 }, P({}))).toBeLessThan(annualAbilityGain(young, P({})));
  });
});

describe('働き方', () => {
  it('商社ではフルリモートを選べない', () => {
    expect(() => validatePolicies(P({ workStyle: 'remote' }), trading)).toThrow();
    expect(() => validatePolicies(P({ workStyle: 'hybrid' }), trading)).not.toThrow();
  });

  it('ハイブリッドは採用しやすく、負荷の受け止め方がよく、オフィス代が下がるが、少し生産性が落ちる', () => {
    const office = P({ workStyle: 'office' });
    const hybrid = P({ workStyle: 'hybrid' });
    expect(fillRateMultiplier('mid_career', hybrid)).toBeGreaterThan(fillRateMultiplier('mid_career', office));
    expect(workloadBonus(hybrid)).toBeGreaterThan(workloadBonus(office));
    const team = staff('sales', 4);
    expect(computePerformance(team, trading, chemicals, hybrid).capacity).toBeLessThan(
      computePerformance(team, trading, chemicals, office).capacity,
    );
    const fin = (p: PolicySet) =>
      computeFinance({ employees: team, policies: p, demand: 0, capacity: 0, overtimeCapacity: 0, grossMargin: 0, hiringCost: 0 })
        .otherFixedCost;
    expect(fin(hybrid)).toBeLessThan(fin(office));
  });
});
