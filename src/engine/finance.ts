/**
 * 売上・コスト・利益（§2.1 の4、§6.3）。
 *
 *   売上     = min(市場の需要上限, 売れる上限 ＋ 残業で増やせるぶん)
 *   人件費   = 給与 ＋ 賞与の月割り ＋ 法定福利費 ＋ 残業代 ＋ 採用費 ＋ 育成費
 *   営業利益 = 売上 × 粗利率 − 人件費 − その他の固定費
 */
import { coef } from './coefficients';
import { defaultPolicies } from './data';
import { hrSystemCostPerEmployee, paidOvertimeHours, policyEffect, premiumOvertimeHours } from './policies';
import type { Employee, LaborCost, PolicySet } from './types';

/** 割合（%）で持っている値を比に直すときの分母 */
const PERCENT = 100;

/**
 * 残業代（円）。月給を所定労働時間で割った時給に割増率を掛ける。月60時間を超えたぶんは5割増し。
 * 変形労働時間制では割増の付く時間が減り、固定残業代では含めた時間ぶんは残業がなくても払う。
 */
export function overtimePay(
  e: Pick<Employee, 'salaryMonthly' | 'overtimeHours' | 'employmentType'>,
  policies: PolicySet = defaultPolicies,
): number {
  // 固定残業代はフルタイムだけ
  const hours =
    e.employmentType === 'part'
      ? premiumOvertimeHours(e.overtimeHours, policies)
      : paidOvertimeHours(e.overtimeHours, policies);
  const hourly = e.salaryMonthly / coef('labor.scheduled_hours_monthly');
  const threshold = coef('labor.overtime_premium_threshold');
  const normal = Math.min(hours, threshold);
  const over = Math.max(0, hours - threshold);
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
  /** 法令の義務に対応したあと毎月かかる費用（その他の固定費に入れる） */
  legalCost?: number;
};

export type FinanceResult = {
  revenue: number;
  grossProfit: number;
  labor: LaborCost;
  otherFixedCost: number;
  /** その他の固定費のうち、等級・評価の制度の運用コスト */
  hrSystemCost: number;
  legalCost: number;
  operatingProfit: number;
};

export function computeFinance(input: FinanceInput): FinanceResult {
  const { employees, policies } = input;
  const revenue = Math.min(input.demand, input.capacity + input.overtimeCapacity);
  const grossProfit = revenue * input.grossMargin;

  // 休職中の人には給与・賞与・残業代を払わない
  let salaries = 0;
  let overtime = 0;
  let bonus = 0;
  /** 休職中でも社会保険料（会社負担）を払い続ける人の給与（介護休業・私傷病休職。育児休業は免除） */
  let insuredOnLeave = 0;
  for (const e of employees) {
    if (e.leave) {
      if (e.leave.kind !== 'parental') insuredOnLeave += e.salaryMonthly;
      continue;
    }
    salaries += e.salaryMonthly;
    overtime += overtimePay(e, policies);
    // 賞与は年1回の評価で決めた額を、毎月に割り振って計上する
    bonus += e.bonusMonthly;
  }
  const legalWelfare = (salaries + overtime + bonus + insuredOnLeave) * coef('labor.legal_welfare_rate');
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

  const hrSystemCost = hrSystemCostPerEmployee(policies) * employees.length;
  const officeCost =
    coef('cost.office_per_employee') * policyEffect('workStyle', policies.workStyle, 'office_cost_mult') * employees.length;
  const legalCost = input.legalCost ?? 0;
  const otherFixedCost = coef('cost.company_base') + officeCost + hrSystemCost + legalCost;
  return {
    revenue,
    grossProfit,
    labor,
    otherFixedCost,
    hrSystemCost,
    legalCost,
    operatingProfit: grossProfit - labor.total - otherFixedCost,
  };
}
