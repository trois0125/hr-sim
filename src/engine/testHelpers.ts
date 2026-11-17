/** テスト用：属性を指定して社員をつくる */
import { getIndustry, getLocation } from './data';
import { createEmployee, marketSalaryFor } from './employees';
import { createRng } from './rng';
import type { Employee, IndustryVariant } from './types';
import { MONTHS_PER_YEAR } from './types';

export const trading = getIndustry('trading');
export const tokyo = getLocation('tokyo');
export const chemicals = trading.variants.find((v) => v.id === 'chemicals') as IndustryVariant;

let counter = 0;
/** 標準的な社員（40歳・実力50・納得感50・一人前・フルタイム）。overrides で一部を変える */
export function makeEmployee(role: string, overrides: Partial<Employee> = {}): Employee {
  counter++;
  const base = createEmployee({
    rng: createRng(counter),
    id: `t${counter}`,
    industry: trading,
    location: tokyo,
    role,
    employmentType: 'full',
    affiliation: 'proper',
  });
  // 40歳は「経験による生産性」の基準の年齢（補正が1.0）
  return { ...base, age: 40, ability: 50, engagement: 50, tenureMonths: 24, salaryMonthly: 400000, ...overrides };
}

/** 相場どおりの報酬（給与も賞与も相場の水準）にした社員 */
export function marketPaid(e: Employee, location = tokyo): Employee {
  const salary = marketSalaryFor(trading, location, e.role, e.age, e.employmentType);
  const bonus = e.employmentType === 'part' ? 0 : (salary * trading.marketBonusMonths.value) / MONTHS_PER_YEAR;
  return { ...e, salaryMonthly: salary, bonusMonthly: bonus };
}

export const staff = (role: string, n: number, overrides: Partial<Employee> = {}) =>
  Array.from({ length: n }, () => makeEmployee(role, overrides));
