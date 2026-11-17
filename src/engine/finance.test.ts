import { describe, expect, it } from 'vitest';
import { computeFinance, overtimePay, type FinanceInput } from './finance';
import { defaultPolicies } from './data';
import { staff } from './testHelpers';

const team = [...staff('sales', 4), ...staff('admin', 2)];
const input = (over: Partial<FinanceInput> = {}): FinanceInput => ({
  employees: team,
  policies: defaultPolicies,
  demand: 100_000_000,
  capacity: 60_000_000,
  overtimeCapacity: 0,
  grossMargin: 0.15,
  hiringCost: 0,
  ...over,
});

describe('売上と利益', () => {
  it('売上は、需要と売れる上限の小さいほう', () => {
    expect(computeFinance(input()).revenue).toBe(60_000_000);
    expect(computeFinance(input({ demand: 40_000_000 })).revenue).toBe(40_000_000);
    expect(computeFinance(input({ overtimeCapacity: 10_000_000 })).revenue).toBe(70_000_000);
  });

  it('営業利益 = 売上×粗利率 − 人件費 − その他の固定費', () => {
    const f = computeFinance(input());
    expect(f.grossProfit).toBeCloseTo(f.revenue * 0.15);
    expect(f.operatingProfit).toBeCloseTo(f.grossProfit - f.labor.total - f.otherFixedCost);
  });

  it('粗利率が高いほど利益が増える', () => {
    expect(computeFinance(input({ grossMargin: 0.2 })).operatingProfit).toBeGreaterThan(
      computeFinance(input({ grossMargin: 0.1 })).operatingProfit,
    );
  });
});

describe('人件費', () => {
  it('合計は内訳の合計に一致する', () => {
    const { labor } = computeFinance(input({ hiringCost: 1_200_000 }));
    expect(labor.total).toBeCloseTo(
      labor.salaries + labor.bonus + labor.legalWelfare + labor.overtime + labor.hiring + labor.training,
    );
    expect(labor.salaries).toBe(400000 * 6);
    expect(labor.hiring).toBe(1_200_000);
  });

  it('社員が増えると、人件費もその他の固定費も増える', () => {
    const more = computeFinance(input({ employees: [...team, ...staff('sales', 2)] }));
    const base = computeFinance(input());
    expect(more.labor.total).toBeGreaterThan(base.labor.total);
    expect(more.otherFixedCost).toBeGreaterThan(base.otherFixedCost);
  });

  it('残業すると残業代と法定福利費が増える', () => {
    const overtimeTeam = team.map((e) => ({ ...e, overtimeHours: 30 }));
    const withOt = computeFinance(input({ employees: overtimeTeam }));
    const base = computeFinance(input());
    expect(base.labor.overtime).toBe(0);
    expect(withOt.labor.overtime).toBeGreaterThan(0);
    expect(withOt.labor.legalWelfare).toBeGreaterThan(base.labor.legalWelfare);
  });

  it('残業代は割増になる（同じ時間の通常の賃金より高い）', () => {
    const e = { salaryMonthly: 320000, overtimeHours: 10 };
    expect(overtimePay(e)).toBeGreaterThan((320000 / 160) * 10);
  });

  it('育成投資を増やすと育成費が増える', () => {
    const none = computeFinance(input()).labor.training;
    const half = computeFinance(input({ policies: { ...defaultPolicies, training: '0.5' } })).labor.training;
    const one = computeFinance(input({ policies: { ...defaultPolicies, training: '1' } })).labor.training;
    expect(none).toBe(0);
    expect(half).toBeGreaterThan(0);
    expect(one).toBeCloseTo(half * 2);
  });
});
