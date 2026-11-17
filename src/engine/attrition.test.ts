import { describe, expect, it } from 'vitest';
import { engagementMultiplier, marketGapMultiplier, resignationProbability, runAttrition } from './attrition';
import { coef } from './coefficients';
import { defaultPolicies } from './data';
import { marketSalaryFor } from './employees';
import { createRng } from './rng';
import { makeEmployee, staff, tokyo, trading } from './testHelpers';
import type { Employee, FactorScores } from './types';
import { MONTHS_PER_YEAR } from './types';

const base = { industry: trading, location: tokyo, policies: defaultPolicies };

/** n人を1か月判定するのを runs 回くり返し、退職者を集める */
function simulate(make: () => Employee, runs = 400, people = 50) {
  const all = [];
  for (let seed = 1; seed <= runs; seed++) {
    const team = Array.from({ length: people }, make);
    all.push(...runAttrition(team, { ...base, rng: createRng(seed), month: 10 }).departures);
  }
  return { departures: all, rate: all.length / (runs * people) };
}

describe('倍率', () => {
  it('納得感の倍率：50で1.0、20で3.0、80で0.5。低いほど辞めやすい', () => {
    expect(engagementMultiplier(50)).toBeCloseTo(1);
    expect(engagementMultiplier(20)).toBeCloseTo(3);
    expect(engagementMultiplier(80)).toBeCloseTo(0.5);
    expect(engagementMultiplier(35)).toBeCloseTo(2);
    expect(engagementMultiplier(10)).toBeCloseTo(3);
  });

  it('相場との差の倍率：相場より低いほど辞めやすい', () => {
    expect(marketGapMultiplier(1)).toBeCloseTo(1);
    expect(marketGapMultiplier(0.8)).toBeGreaterThan(marketGapMultiplier(1));
    expect(marketGapMultiplier(1.2)).toBeLessThan(marketGapMultiplier(1));
  });

  it('納得感50・相場どおりなら、月の退職確率は基本離職率÷12', () => {
    const e = makeEmployee('sales', { age: 30, engagement: 50 });
    const market = marketSalaryFor(trading, tokyo, 'sales', 30, 'full');
    // 相場どおり＝給与も賞与も相場の水準
    const bonusMonthly = (market * trading.marketBonusMonths.value) / MONTHS_PER_YEAR;
    const p = resignationProbability({ ...e, salaryMonthly: market, bonusMonthly }, base);
    expect(p.unrelated + p.related).toBeCloseTo(trading.baseAttritionRate.value / MONTHS_PER_YEAR);
    expect(p.unrelated / (p.unrelated + p.related)).toBeCloseTo(coef('attrition.unrelated_share'));
  });
});

describe('退職の判定', () => {
  it('同じシードなら同じ人が辞める', () => {
    const team = staff('sales', 30, { engagement: 30 });
    const a = runAttrition(team, { ...base, rng: createRng(1), month: 0 });
    const b = runAttrition(team, { ...base, rng: createRng(1), month: 0 });
    expect(a).toEqual(b);
  });

  it('納得感が低いほど辞める人が多い', () => {
    const low = simulate(() => makeEmployee('sales', { engagement: 20 })).rate;
    const mid = simulate(() => makeEmployee('sales', { engagement: 50 })).rate;
    const high = simulate(() => makeEmployee('sales', { engagement: 80 })).rate;
    expect(low).toBeGreaterThan(mid * 2);
    expect(high).toBeLessThan(mid);
  });

  it('納得感が非常に高くても、制度と関係ない退職（家庭の事情・人間関係）は起きる', () => {
    const { departures } = simulate(() => makeEmployee('sales', { engagement: 100, salaryMonthly: 10_000_000 }));
    expect(departures.length).toBeGreaterThan(0);
    const reasons = new Set(departures.map((d) => d.reason));
    expect(reasons.has('family')).toBe(true);
    expect(reasons.has('relationships')).toBe(true);
  });

  it('退職理由は、納得感をいちばん引き下げている要因が最も多くなる', () => {
    const scores: FactorScores = {
      externalPay: 50,
      internalFairness: 50,
      evaluation: 50,
      workload: 0,
      growthOpportunity: 50,
      stability: 50,
    };
    const balance = { money: 0.05, growth: 0.05, stability: 0.05, balance: 0.85 };
    const { departures } = simulate(() =>
      makeEmployee('sales', { engagement: 20, factorScores: scores, values: balance }),
    );
    const related = departures.filter((d) => d.reason !== 'family' && d.reason !== 'relationships');
    expect(related.length).toBeGreaterThan(0);
    const counts = new Map<string, number>();
    for (const d of related) counts.set(d.reason ?? '', (counts.get(d.reason ?? '') ?? 0) + 1);
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    expect(top).toBe('workload');
    expect((counts.get('workload') ?? 0) / related.length).toBeGreaterThan(0.4);
  });

  it('辞めた人の記録には、辞めた月・勤続・納得感・要因の内訳が残る', () => {
    const { departures } = simulate(() => makeEmployee('sales', { engagement: 20, tenureMonths: 30 }), 50);
    const d = departures[0];
    expect(d?.kind).toBe('resignation');
    expect(d?.month).toBe(10);
    expect(d?.tenureMonths).toBe(30);
    expect(d?.engagement).toBe(20);
  });
});

describe('出向者', () => {
  const secondee = (over: Partial<Employee> = {}) =>
    makeEmployee('sales', { affiliation: 'secondee', secondmentEndsAt: 48, engagement: 60, ...over });

  it('出向期間中は、納得感が中くらいなら辞めも戻りもしない', () => {
    expect(simulate(() => secondee()).rate).toBe(0);
  });

  it('出向期間が終わると親会社に戻る（退職には数えない）', () => {
    const r = runAttrition([secondee({ secondmentEndsAt: 10 })], { ...base, rng: createRng(1), month: 10 });
    expect(r.stay).toHaveLength(0);
    expect(r.departures[0]?.kind).toBe('return');
    expect(r.departures[0]?.reason).toBeNull();
  });

  it('納得感が低い出向者は、期間の途中でも戻ることがある', () => {
    const low = simulate(() => secondee({ engagement: 10 })).departures;
    expect(low.length).toBeGreaterThan(0);
    expect(low.every((d) => d.kind === 'return')).toBe(true);
  });
});
