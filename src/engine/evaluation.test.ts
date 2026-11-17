import { describe, expect, it } from 'vitest';
import { defaultPolicies } from './data';
import { applyRaises, assignBonuses, assignGrades, evaluate, evaluationPercentiles, growAbility, stepSalaryTransitions } from './evaluation';
import { marketSalaryFor } from './employees';
import { createRng } from './rng';
import { makeEmployee, staff, tokyo, trading } from './testHelpers';
import type { Employee, PolicySet } from './types';

const P = (over: Partial<PolicySet>): PolicySet => ({ ...defaultPolicies, ...over });
const meanAbsError = (team: Employee[]) =>
  team.reduce((s, e) => s + Math.abs(e.perceivedPerformance - e.ability), 0) / team.length;

describe('評価', () => {
  it('正確な評価制度ほど、評価で見える成果と本当の実力のずれが小さい', () => {
    const err = (policies: PolicySet) => {
      const team = staff('sales', 400, { ability: 50 });
      evaluate(team, { rng: createRng(1), policies, industry: trading });
      return meanAbsError(team);
    };
    expect(err(P({ evaluation: 'multi_rater', grade: 'job' }))).toBeLessThan(err(P({ evaluation: 'ceo', grade: 'none' })));
  });

  it('評価の順位は、職種の中で0（最下位）〜1（最上位）', () => {
    const team = [
      makeEmployee('sales', { perceivedPerformance: 30 }),
      makeEmployee('sales', { perceivedPerformance: 70 }),
      makeEmployee('admin', { perceivedPerformance: 10 }),
    ];
    const p = evaluationPercentiles(team);
    expect(p.get(team[0]?.id ?? '')).toBe(0);
    expect(p.get(team[1]?.id ?? '')).toBe(1);
  });

  it('等級：制度がなければ0、あれば1以上。職務等級は評価の高い人ほど上', () => {
    const team = [makeEmployee('sales', { perceivedPerformance: 20 }), makeEmployee('sales', { perceivedPerformance: 90 })];
    const pct = evaluationPercentiles(team);
    assignGrades(team, P({ grade: 'none' }), pct);
    expect(team.map((e) => e.grade)).toEqual([0, 0]);
    assignGrades(team, P({ grade: 'job' }), pct);
    expect(team[1]?.grade).toBeGreaterThan(team[0]?.grade ?? 0);
  });
});

describe('昇給（給与の決め方）', () => {
  const raise = (pay: PolicySet['pay'], perceived: number, salary = 400000) => {
    const team = [
      makeEmployee('sales', { perceivedPerformance: 20, salaryMonthly: salary, age: 35 }),
      makeEmployee('sales', { perceivedPerformance: 50, salaryMonthly: salary, age: 35 }),
      makeEmployee('sales', { perceivedPerformance: 80, salaryMonthly: salary, age: 35 }),
      makeEmployee('sales', { perceivedPerformance: perceived, salaryMonthly: salary, age: 35 }),
    ];
    applyRaises(team, { policies: P({ pay }), industry: trading, location: tokyo }, evaluationPercentiles(team));
    return team.map((e) => e.salaryMonthly);
  };

  it('年功：評価に関係なく全員同じように上がる', () => {
    const s = raise('seniority', 50);
    expect(new Set(s).size).toBe(1);
    expect(s[0]).toBeGreaterThan(400000);
  });

  it('成果連動：評価の高い人ほど上がり、低い人は下がることもある', () => {
    const [low, mid, high] = raise('performance', 50);
    expect(high).toBeGreaterThan(mid ?? 0);
    expect(mid).toBeGreaterThan(low ?? 0);
    expect(low).toBeLessThanOrEqual(400000);
  });

  it('成果連動でも、職能等級（年功化しやすい）だと差が小さい', () => {
    const spread = (grade: PolicySet['grade']) => {
      const team = [makeEmployee('sales', { perceivedPerformance: 10 }), makeEmployee('sales', { perceivedPerformance: 90 })];
      for (const e of team) e.salaryMonthly = 400000;
      applyRaises(team, { policies: P({ pay: 'performance', grade }), industry: trading, location: tokyo }, evaluationPercentiles(team));
      return (team[1]?.salaryMonthly ?? 0) - (team[0]?.salaryMonthly ?? 0);
    };
    expect(spread('skill')).toBeLessThan(spread('job'));
  });

  it('相場連動：相場より高い人は下がり、低い人は上がる（相場に近づく）', () => {
    const market = marketSalaryFor(trading, tokyo, 'sales', 36, 'full');
    const [hi] = raise('market', 50, market * 1.3);
    const [lo] = raise('market', 50, market * 0.7);
    expect(hi).toBeLessThan(market * 1.3);
    expect(lo).toBeGreaterThan(market * 0.7);
  });

  it('激変緩和で下げている途中の人は昇給しない', () => {
    const e = makeEmployee('sales', { salaryTransition: { target: 300000, stepPerMonth: 10000 } });
    const before = e.salaryMonthly;
    applyRaises([e], { policies: P({ pay: 'seniority' }), industry: trading, location: tokyo }, new Map());
    expect(e.salaryMonthly).toBe(before);
  });
});

describe('賞与の決定・実力の伸び・激変緩和', () => {
  it('業績連動の賞与は、前年の利益が大きいほど多い', () => {
    const team = staff('sales', 5);
    const total = (profit: number) => {
      assignBonuses(team, { policies: P({ bonus: 'company_linked' }), lastYearProfit: profit }, evaluationPercentiles(team));
      return team.reduce((s, e) => s + e.bonusMonthly, 0);
    };
    expect(total(30_000_000)).toBeGreaterThan(total(5_000_000));
    expect(total(-1)).toBe(0);
  });

  it('育成投資を増やすと、1年後の実力が高い', () => {
    const grow = (training: PolicySet['training']) => {
      const team = staff('sales', 1, { ability: 50, age: 25 });
      for (let m = 0; m < 12; m++) growAbility(team, P({ training }));
      return team[0]?.ability ?? 0;
    };
    expect(grow('1')).toBeGreaterThan(grow('0.5'));
    expect(grow('0.5')).toBeGreaterThan(grow('0'));
  });

  it('激変緩和：毎月少しずつ下がり、目標に届いたら終わる', () => {
    const e = makeEmployee('sales', { salaryMonthly: 400000, salaryTransition: { target: 370000, stepPerMonth: 10000 } });
    stepSalaryTransitions([e]);
    expect(e.salaryMonthly).toBe(390000);
    stepSalaryTransitions([e]);
    stepSalaryTransitions([e]);
    expect(e.salaryMonthly).toBe(370000);
    expect(e.salaryTransition).toBeNull();
  });
});
