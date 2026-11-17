import { describe, expect, it } from 'vitest';
import { coef } from './coefficients';
import { defaultPolicies } from './data';
import {
  NEUTRAL,
  biggestDrag,
  computeFactorScores,
  evaluationScore,
  externalPayScore,
  factorWeights,
  growthOpportunityScore,
  internalFairnessScores,
  percentiles,
  piecewise,
  stabilityScore,
  targetEngagement,
  updateEngagement,
  workloadScore,
  type EngagementContext,
} from './engagement';
import { makeEmployee, staff, tokyo, trading } from './testHelpers';
import type { FactorScores, MonthlyRecord, Values } from './types';

const neutralScores: FactorScores = {
  externalPay: NEUTRAL,
  internalFairness: NEUTRAL,
  evaluation: NEUTRAL,
  workload: NEUTRAL,
  growthOpportunity: NEUTRAL,
  stability: NEUTRAL,
};
const moneyType: Values = { money: 0.85, growth: 0.05, stability: 0.05, balance: 0.05 };
const stabilityType: Values = { money: 0.05, growth: 0.05, stability: 0.85, balance: 0.05 };
const balanceType: Values = { money: 0.05, growth: 0.05, stability: 0.05, balance: 0.85 };

const record = (over: Partial<MonthlyRecord>): MonthlyRecord =>
  ({ month: 0, headcount: 10, operatingProfit: 1_000_000, ...over }) as MonthlyRecord;
const ctx = (over: Partial<EngagementContext> = {}): EngagementContext => ({
  industry: trading,
  location: tokyo,
  policies: defaultPolicies,
  history: [record({})],
  cash: 100_000_000,
  headcount: 10,
  ...over,
});

describe('補助の計算', () => {
  it('piecewise は区分ごとの直線で、両端の外は端の値', () => {
    const pts = [
      [0, 10],
      [10, 30],
      [20, 0],
    ] as const;
    expect(piecewise(-5, pts)).toBe(10);
    expect(piecewise(5, pts)).toBe(20);
    expect(piecewise(15, pts)).toBe(15);
    expect(piecewise(99, pts)).toBe(0);
  });

  it('percentiles は最下位0・最上位1で、同じ値は同じ順位', () => {
    expect(percentiles([10, 30, 20])).toEqual([0, 1, 0.5]);
    expect(percentiles([5, 5, 9])).toEqual([0.25, 0.25, 1]);
  });
});

describe('6つの要因', () => {
  it('報酬の社外比較：相場どおりで中立、高いほど上がる', () => {
    expect(externalPayScore(400000, 400000)).toBeCloseTo(NEUTRAL);
    expect(externalPayScore(480000, 400000)).toBeGreaterThan(NEUTRAL);
    expect(externalPayScore(320000, 400000)).toBeLessThan(NEUTRAL);
    expect(externalPayScore(10_000_000, 400000)).toBe(100);
  });

  it('報酬の社内公平性：実力が高いのに給与が低い人は下がり、実力どおりの人は中立', () => {
    const fair = [
      makeEmployee('sales', { ability: 30, salaryMonthly: 300000 }),
      makeEmployee('sales', { ability: 50, salaryMonthly: 400000 }),
      makeEmployee('sales', { ability: 70, salaryMonthly: 500000 }),
    ];
    for (const s of internalFairnessScores(fair).values()) expect(s).toBeCloseTo(NEUTRAL);

    const unfair = [
      makeEmployee('sales', { ability: 30, salaryMonthly: 500000 }),
      makeEmployee('sales', { ability: 50, salaryMonthly: 400000 }),
      makeEmployee('sales', { ability: 70, salaryMonthly: 300000 }),
    ];
    const s = internalFairnessScores(unfair);
    const ace = s.get(unfair[2]?.id ?? '') ?? 0;
    const overpaid = s.get(unfair[0]?.id ?? '') ?? 0;
    expect(ace).toBeLessThan(NEUTRAL);
    expect(overpaid).toBeGreaterThan(NEUTRAL);
    expect(NEUTRAL - ace).toBeGreaterThan(overpaid - NEUTRAL); // 不満のほうが強い
  });

  it('報酬の社内公平性：比べる相手が少ないときは中立', () => {
    const two = [makeEmployee('sales', { ability: 90, salaryMonthly: 200000 }), makeEmployee('sales')];
    for (const s of internalFairnessScores(two).values()) expect(s).toBe(NEUTRAL);
  });

  it('評価の正確さ：実力どおりで中立、低く見られると大きく下がる', () => {
    expect(evaluationScore(60, 60)).toBe(NEUTRAL);
    expect(NEUTRAL - evaluationScore(50, 60)).toBeGreaterThan(evaluationScore(70, 60) - NEUTRAL);
  });

  it('働く負荷：残業が増えるほど下がる', () => {
    const hours = [0, 10, 20, 30, 45, 60, 80, 100];
    for (let i = 1; i < hours.length; i++) {
      expect(workloadScore(hours[i] ?? 0)).toBeLessThanOrEqual(workloadScore(hours[i - 1] ?? 0));
    }
    expect(workloadScore(0)).toBeGreaterThan(NEUTRAL);
    expect(workloadScore(45)).toBeLessThan(NEUTRAL);
  });

  it('成長の機会：育成投資を増やすほど上がり、会社が伸びていると上がる', () => {
    expect(growthOpportunityScore('0.5', 0)).toBeGreaterThan(growthOpportunityScore('0', 0));
    expect(growthOpportunityScore('1', 0)).toBeGreaterThan(growthOpportunityScore('0.5', 0));
    expect(growthOpportunityScore('0', 0.5)).toBeGreaterThan(growthOpportunityScore('0', 0));
    expect(growthOpportunityScore('0', 10) - growthOpportunityScore('0', 0)).toBe(
      coef('engagement.growth.company_growth_max'),
    );
  });

  it('雇用の安定：黒字なら高く、赤字で資金が尽きかけるほど下がる', () => {
    const profitable = stabilityScore(1, 0, 0);
    const lossRich = stabilityScore(-3, 1_000_000, 24_000_000);
    const lossPoor = stabilityScore(-3, 1_000_000, 1_000_000);
    expect(profitable).toBeGreaterThan(lossRich);
    expect(lossRich).toBeGreaterThan(lossPoor);
  });
});

describe('価値観による受け止め方の違い', () => {
  it('同じ「給与が相場より高い」でも、money型のほうが納得感が大きく上がる', () => {
    const highPay = { ...neutralScores, externalPay: 80 };
    const lift = (v: Values) => targetEngagement(highPay, v) - targetEngagement(neutralScores, v);
    expect(lift(moneyType)).toBeGreaterThan(lift(stabilityType) * 2);
  });

  it('同じ「残業が多い」でも、balance型のほうが納得感が大きく下がる', () => {
    const overwork = { ...neutralScores, workload: 10 };
    const drop = (v: Values) => targetEngagement(neutralScores, v) - targetEngagement(overwork, v);
    expect(drop(balanceType)).toBeGreaterThan(drop(moneyType) * 2);
  });

  it('同じ「赤字続き」でも、stability型のほうが納得感が大きく下がる', () => {
    const shaky = { ...neutralScores, stability: 15 };
    const drop = (v: Values) => targetEngagement(neutralScores, v) - targetEngagement(shaky, v);
    expect(drop(stabilityType)).toBeGreaterThan(drop(moneyType) * 2);
  });

  it('すべての要因が中立なら、目標値も中立', () => {
    expect(targetEngagement(neutralScores, moneyType)).toBeCloseTo(NEUTRAL);
  });

  it('重みはどの要因にも0より大きい（関係の薄い要因も少しは効く）', () => {
    for (const w of Object.values(factorWeights(moneyType))) expect(w).toBeGreaterThan(0);
  });

  it('いちばん足を引っ張っている要因がわかる', () => {
    expect(biggestDrag({ ...neutralScores, workload: 5 }, balanceType)).toBe('workload');
    expect(biggestDrag({ ...neutralScores, externalPay: 5 }, moneyType)).toBe('externalPay');
  });
});

describe('納得感の更新', () => {
  it('目標値との差の20%だけ近づき、要因の内訳が社員ごとに残る', () => {
    const e = makeEmployee('sales', { engagement: 80, overtimeHours: 80 });
    const scores = computeFactorScores([e], ctx()).get(e.id) as FactorScores;
    const target = targetEngagement(scores, e.values);
    updateEngagement([e], ctx());
    expect(e.engagement).toBeCloseTo(80 + coef('engagement.adjust_rate') * (target - 80));
    expect(e.factorScores).toEqual(scores);
  });

  it('同じ人でも、残業が多い月が続くと納得感が下がっていく', () => {
    const calm = staff('sales', 3, { engagement: 60 });
    const busy = calm.map((e) => ({ ...e, overtimeHours: 70 }));
    for (let i = 0; i < 12; i++) {
      updateEngagement(calm, ctx());
      updateEngagement(busy, ctx());
    }
    calm.forEach((e, i) => expect(e.engagement).toBeGreaterThan(busy[i]?.engagement ?? 100));
  });

  it('赤字で資金が少ないと、全員の「雇用の安定」が下がる', () => {
    const loss = ctx({ history: [record({ operatingProfit: -5_000_000 })], cash: 2_000_000 });
    const e = makeEmployee('admin');
    const good = computeFactorScores([e], ctx()).get(e.id)?.stability ?? 0;
    const bad = computeFactorScores([e], loss).get(e.id)?.stability ?? 0;
    expect(bad).toBeLessThan(good);
  });

  it('納得感は0〜100に収まる', () => {
    const e = makeEmployee('sales', { engagement: 1, overtimeHours: 200, salaryMonthly: 1 });
    for (let i = 0; i < 50; i++) updateEngagement([e], ctx());
    expect(e.engagement).toBeGreaterThanOrEqual(0);
    expect(e.engagement).toBeLessThanOrEqual(100);
  });
});
