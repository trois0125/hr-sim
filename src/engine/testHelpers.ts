/** テスト用：属性を指定して社員をつくる */
import { getIndustry, getLocation } from './data';
import { createEmployee } from './employees';
import { createRng } from './rng';
import type { Employee, IndustryVariant } from './types';

export const trading = getIndustry('trading');
export const tokyo = getLocation('tokyo');
export const chemicals = trading.variants.find((v) => v.id === 'chemicals') as IndustryVariant;

let counter = 0;
/** 標準的な社員（実力50・納得感50・一人前・フルタイム）。overrides で一部を変える */
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
  return { ...base, ability: 50, engagement: 50, tenureMonths: 24, salaryMonthly: 400000, ...overrides };
}

export const staff = (role: string, n: number, overrides: Partial<Employee> = {}) =>
  Array.from({ length: n }, () => makeEmployee(role, overrides));
