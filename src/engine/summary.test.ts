import { describe, expect, it } from 'vitest';
import { generateCompany } from './generate';
import { periodMetrics, summarizeRun } from './summary';
import { runToEnd } from './tick';
import type { MonthlyRecord } from './types';

const rec = (over: Partial<MonthlyRecord>): MonthlyRecord =>
  ({
    month: 0,
    headcount: 10,
    resignations: 0,
    revenue: 100,
    operatingProfit: 5,
    labor: { total: 8 },
    avgEngagement: 50,
    overtimeHours: 10,
    demand: 120,
    ...over,
  }) as MonthlyRecord;

describe('periodMetrics', () => {
  it('12か月で平均10人、退職1人なら年率10%', () => {
    const rs = Array.from({ length: 12 }, (_, i) => rec({ month: i, resignations: i === 3 ? 1 : 0 }));
    const m = periodMetrics(rs);
    expect(m?.attritionRate).toBeCloseTo(0.1);
    expect(m?.laborCostRatio).toBeCloseTo(0.08);
    expect(m?.operatingMargin).toBeCloseTo(0.05);
    expect(m?.demandCoverage).toBeCloseTo(100 / 120);
  });

  it('記録がなければ null', () => {
    expect(periodMetrics([])).toBeNull();
  });
});

describe('summarizeRun', () => {
  it('1社の結果をまとめられ、退職理由の割合の合計は1', () => {
    // 132か月（11年）倒産せずに続く会社（シードは残業の決め方を変えたステップ18で選び直した）
    const end = runToEnd(generateCompany({ seed: 1, industryId: 'trading', foundingPatternId: 'carveout' }), 132);
    const s = summarizeRun(end);
    expect(s.months).toBe(132);
    expect(s.early?.months).toBe(60);
    expect(s.late?.months).toBe(12);
    const total = Object.values(s.reasons).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1);
  });
});
