/**
 * 昇給（§2.1 の7）。
 *
 * ステップ4では「仮の昇給」：年に1回、年齢による賃金カーブに沿って全員一律に上げる
 * （相場との比はそのまま保たれる）。ステップ5で「給与の決め方」の制度ごとの昇給に置き換える。
 */
import { coef } from './coefficients';
import { ageSalaryFactor } from './employees';
import type { Employee } from './types';

/** 1歳年をとったときの仮の昇給（社員を書き換える）。年齢を上げる前に呼ぶ */
export function applyProvisionalRaise(employees: Employee[]): void {
  const unit = coef('generation.salary.rounding_unit');
  for (const e of employees) {
    if (e.employmentType === 'part') continue; // パートの時給は最低賃金に連動する
    const ratio = ageSalaryFactor(e.age + 1) / ageSalaryFactor(e.age);
    e.salaryMonthly = Math.round((e.salaryMonthly * ratio) / unit) * unit;
  }
}
