/**
 * 制度を変える（中級）と、等級が変わったときの層の組み直し（DESIGN.md §15.4）。ステップ21。
 *
 * - 等級の仕組みや段階の数が変わったら、旧い等級の人を新しい等級へ移す。対応表はプレイヤーが決める
 *   （省略すると、上下の位置が同じになるように比例で移す）
 * - 等級が下がると給与も下がる（1段につき intermediate.grade.pay_step）。下がる人の扱いは中級用：
 *   激変緩和の年数を決め、その年数をかけて段階的に下げる（0年ならすぐ下げる）。
 *   下がる割合に比例して「社内公平性」「雇用の安定」が下がる（年数+1で割る＝ゆっくり下げるほど軽い）
 * - 等級が上がる人の給与はすぐ上げる
 */
import { coef } from '../coefficients';
import { SCORE_MAX, SCORE_MIN, clamp } from '../employees';
import type { Employee } from '../types';
import { MONTHS_PER_YEAR } from '../types';
import { levelsOf, toBasePolicies, validateDetailed, type DetailedPolicies } from './detailedPolicy';
import { mergeInto } from './layers';
import type { IntermediateLayer, IntermediateState } from './types';

export type ChangeOptions = {
  /** 旧い等級（添字）→ 新しい等級。長さは旧い段階の数 */
  gradeMapping?: number[];
  /** 給与が下がる人の激変緩和の年数（0ならすぐ下げる） */
  transitionYears?: number;
};

export type ChangeResult = {
  regrouped: boolean;
  /** 給与が下がった（下がっていく）人数 */
  cutHeadcount: number;
  /** 下がる人の平均の下げ幅（割合） */
  averageCut: number;
};

/** 上下の位置が同じになるように比例で移す対応表 */
export function proportionalMapping(oldLevels: number, newLevels: number): number[] {
  return Array.from({ length: oldLevels }, (_, g) =>
    oldLevels <= 1 ? 0 : Math.round((g * (newLevels - 1)) / (oldLevels - 1)),
  );
}

/** 等級の組み直しが要るか（仕組みか段階の数が変わったとき） */
export function needsRegroup(before: DetailedPolicies, after: DetailedPolicies): boolean {
  return before.grade.system !== after.grade.system || levelsOf(before) !== levelsOf(after);
}

/** 中級の制度を変える（状態を書き換える） */
export function changeDetailedPolicies(state: IntermediateState, next: DetailedPolicies, options: ChangeOptions = {}): ChangeResult {
  validateDetailed(next);
  const before = state.detail;
  state.detail = structuredClone(next);
  state.policies = toBasePolicies(next, state.policies);
  if (!needsRegroup(before, next)) return { regrouped: false, cutHeadcount: 0, averageCut: 0 };

  const oldLevels = levelsOf(before);
  const newLevels = levelsOf(next);
  const mapping = options.gradeMapping ?? proportionalMapping(oldLevels, newLevels);
  if (mapping.length !== oldLevels || mapping.some((g) => !Number.isInteger(g) || g < 0 || g > newLevels - 1)) {
    throw new Error('等級の対応表が正しくありません');
  }
  const years = options.transitionYears ?? 0;
  const step = coef('intermediate.grade.pay_step');
  const penalty = coef('intermediate.regroup.cut_penalty');

  const moved: Employee[] = [];
  let cutHeadcount = 0;
  let cutSum = 0;
  for (const l of state.layers) {
    const r = l.rep;
    const newGrade = mapping[Math.min(r.grade, oldLevels - 1)] ?? 0;
    const factor = Math.pow(1 + step, newGrade - r.grade);
    const person: Employee = { ...r, grade: newGrade };
    if (factor < 1) {
      const cut = 1 - factor;
      const target = r.salaryMonthly * factor;
      if (years <= 0) person.salaryMonthly = target;
      else person.salaryTransition = { target, stepPerMonth: (r.salaryMonthly - target) / (years * MONTHS_PER_YEAR) };
      const drop = (penalty * cut) / (years + 1);
      person.engagement = clamp(r.engagement - drop, SCORE_MIN, SCORE_MAX);
      cutHeadcount += l.headcount;
      cutSum += cut * l.headcount;
    } else {
      person.salaryMonthly = r.salaryMonthly * factor;
    }
    for (let i = 0; i < l.headcount; i++) moved.push(person);
  }
  const layers: IntermediateLayer[] = [];
  mergeInto(layers, moved);
  state.layers = layers;
  return { regrouped: true, cutHeadcount, averageCut: cutHeadcount > 0 ? cutSum / cutHeadcount : 0 };
}

/** 段階的な引き下げを1年ぶん進める（layers を書き換える） */
export function applySalaryTransitions(layers: readonly IntermediateLayer[]): void {
  for (const l of layers) {
    const t = l.rep.salaryTransition;
    if (!t) continue;
    l.rep.salaryMonthly = Math.max(t.target, l.rep.salaryMonthly - t.stepPerMonth * MONTHS_PER_YEAR);
    if (l.rep.salaryMonthly <= t.target + 1e-6) l.rep.salaryTransition = null;
  }
}
