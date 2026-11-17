/**
 * 売上・コスト・利益（§2.1 の4、§6.3）。
 *
 *   売上     = min(市場の需要上限, 売れる上限 ＋ 残業で増やせるぶん)
 *   人件費   = 給与 ＋ 賞与の月割り ＋ 法定福利費 ＋ 残業代 ＋ 採用費 ＋ 育成費
 *   営業利益 = 売上 × 粗利率 − 人件費 − その他の固定費
 */
import { coef } from './coefficients';
import type { Employee, LaborCost, PolicySet } from './types';

/** 割合（%）で持っている値を比に直すときの分母 */
const PERCENT = 100;

/** 残業代（円）。月給を所定労働時間で割った時給に割増率を掛ける。月60時間を超えたぶんは5割増し */
export function overtimePay(e: Pick<Employee, 'salaryMonthly' | 'overtimeHours'>): number {
  const hourly = e.salaryMonthly / coef('labor.scheduled_hours_monthly');
  const threshold = coef('labor.overtime_premium_threshold');
  const normal = Math.min(e.overtimeHours, threshold);
  const over = Math.max(0, e.overtimeHours - threshold);
  return hourly * (normal * coef('labor.overtime_premium') + over * coef('labor.overtime_premium_over60'));
}

export type FinanceInput = {
  employees: readonly Employee[];
  policies: PolicySet;
  demand: number;
  /** 残業なしで売れる上限 */
  capacity: number;
  /** 残業で増やせる売上 */
  overtimeCapacity: number;
  grossMargin: number;
  hiringCost: number;
};

export type FinanceResult = {
  revenue: number;
  grossProfit: number;
  labor: LaborCost;
  otherFixedCost: number;
  operatingProfit: number;
};

export function computeFinance(input: FinanceInput): FinanceResult {
  const { employees, policies } = input;
  const revenue = Math.min(input.demand, input.capacity + input.overtimeCapacity);
  const grossProfit = revenue * input.grossMargin;

  const salaries = employees.reduce((s, e) => s + e.salaryMonthly, 0);
  const overtime = employees.reduce((s, e) => s + overtimePay(e), 0);
  // 賞与はステップ5（賞与の制度）で計算する。それまでは0
  const bonus = 0;
  const legalWelfare = (salaries + overtime + bonus) * coef('labor.legal_welfare_rate');
  // 育成費は制度の選択肢そのもの（売上比 0%／0.5%／1%）
  const training = (revenue * Number(policies.training)) / PERCENT;
  const labor: LaborCost = {
    salaries,
    bonus,
    legalWelfare,
    overtime,
    hiring: input.hiringCost,
    training,
    total: salaries + bonus + legalWelfare + overtime + input.hiringCost + training,
  };

  const otherFixedCost = coef('cost.company_base') + coef('cost.office_per_employee') * employees.length;
  return {
    revenue,
    grossProfit,
    labor,
    otherFixedCost,
    operatingProfit: grossProfit - labor.total - otherFixedCost,
  };
}
