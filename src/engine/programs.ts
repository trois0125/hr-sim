/**
 * 個別制度（§14.1。ステップ14）。
 *
 * 選択式の制度（§5）とは別に、会社が整えた制度の一覧を持つ。
 * - 整えると毎月の維持費がかかり（その他の固定費の programCost）、条件に合う社員の納得感の要因が少し上がる
 * - 対応する出来事（イベントの mitigatedBy）は、判断待ちにならずに軽く済む（eventTriggers.ts）
 * - 施策（initiative）やイベントの選択肢（effects.installProgram）で整え、画面から止められる。止めると納得感が少し下がる
 */
import programsJson from '../data/programs.json';
import { getIndustry } from './data';
import { matchesEmployee } from './eventConditions';
import type { CompanyState, Employee, EngagementFactor, IndustryData, ProgramDef, ProgramId, ProgramState } from './types';

export const programDefs = programsJson as ProgramDef[];

export function getProgram(id: ProgramId): ProgramDef {
  const p = programDefs.find((x) => x.id === id);
  if (!p) throw new Error(`個別制度がありません: ${id}`);
  return p;
}

export function hasProgram(state: Pick<CompanyState, 'programs'>, id: ProgramId): boolean {
  return state.programs.some((p) => p.id === id);
}

/** 個別制度を整える（すでにあれば何もしない）。整えたら true */
export function installProgram(state: CompanyState, id: ProgramId): boolean {
  getProgram(id); // ない制度なら止める
  if (hasProgram(state, id)) return false;
  state.programs.push({ id, since: state.month });
  state.programLog.push({ month: state.month, id, action: 'install' });
  return true;
}

/** 個別制度を止める（一定期間、納得感の目標値が下がる）。止めたら true */
export function stopProgram(state: CompanyState, id: ProgramId): boolean {
  if (!hasProgram(state, id)) return false;
  const def = getProgram(id);
  state.programs = state.programs.filter((p) => p.id !== id);
  state.programLog.push({ month: state.month, id, action: 'stop' });
  state.modifiers.push({ type: 'morale', mult: -def.stopMorale.value, untilMonth: state.month + def.stopMoraleMonths.value });
  return true;
}

/** 毎月の維持費の合計（円） */
export function programMonthlyCost(state: Pick<CompanyState, 'programs'>, headcount: number): number {
  return state.programs.reduce((s, p) => s + getProgram(p.id).costPerEmployeeMonthly.value * headcount, 0);
}

/** 社員1人への、整えている個別制度の要因の上乗せ（点） */
export function programBonusFor(
  e: Employee,
  programs: readonly ProgramState[],
  industry: IndustryData,
): Partial<Record<EngagementFactor, number>> {
  const out: Partial<Record<EngagementFactor, number>> = {};
  for (const p of programs) {
    for (const b of getProgram(p.id).bonuses) {
      if (b.where && !matchesEmployee(e, b.where, industry)) continue;
      out[b.factor] = (out[b.factor] ?? 0) + b.points.value;
    }
  }
  return out;
}

/** 会社の業種を引いてから programBonusFor を呼ぶ */
export function programBonusInCompany(state: CompanyState, e: Employee) {
  return programBonusFor(e, state.programs, getIndustry(state.profile.industryId));
}
