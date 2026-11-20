/**
 * イベントの条件の判定（社員の項目と比較）。eventTriggers.ts と events.ts の両方から使う。
 */
import type { Comparison, Employee, EmployeeCondition, EmployeeField, IndustryData } from './types';

export function compare(a: number | string | boolean, op: Comparison, b: number | string | boolean): boolean {
  if (op === '==') return a === b;
  if (op === '!=') return a !== b;
  if (typeof a !== 'number' || typeof b !== 'number') return false;
  switch (op) {
    case '<':
      return a < b;
    case '<=':
      return a <= b;
    case '>':
      return a > b;
    case '>=':
      return a >= b;
  }
}

/** 社員の項目の値 */
export function employeeField(e: Employee, field: EmployeeField, industry: IndustryData): number | string | boolean {
  switch (field) {
    case 'roleKind':
      return industry.roles.find((r) => r.id === e.role)?.kind ?? '';
    case 'onLeave':
      return e.leave ? 1 : 0;
    case 'values.growth':
      return e.values.growth;
    case 'values.stability':
      return e.values.stability;
    case 'values.money':
      return e.values.money;
    case 'values.balance':
      return e.values.balance;
    default:
      return e[field];
  }
}

export function matchesEmployee(e: Employee, where: readonly EmployeeCondition[], industry: IndustryData): boolean {
  return where.every((c) => compare(employeeField(e, c.field, industry), c.op, c.value));
}
