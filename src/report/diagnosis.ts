/**
 * 人事スタイル診断（§9 の5）。ステップ11。
 *
 * 4軸（成果⇄安定、統制⇄自律、育成⇄獲得、先手⇄後手）それぞれで、
 * 「制度」と「イベントでの判断」を半々で合わせる（ユーザーと決定）。片方しかなければその片方だけ。
 * - 制度：毎月の制度（記録に残っている）を、データの点数（src/data/diagnosis.json）に直して平均する。
 *   選んでいた期間が長い制度ほど重く効く。先手⇄後手は、法令の義務への対応（すぐ・社労士・後回し）の平均
 * - イベント：選んだ選択肢の診断の印（+1／−1）の平均
 * 各軸が0以上ならプラス側（成果・統制・育成・先手）とする。
 */
import diagnosisJson from '../data/diagnosis.json';
import type { CompanyState, DiagnosisAxis, PolicySet } from '../engine/types';
import { DIAGNOSIS_AXES } from '../engine/types';

type TypeData = { name: string; summary: string; strength: string; pitfall: string };
type DiagnosisData = {
  axes: Record<DiagnosisAxis, { plus: string; minus: string; from: string }>;
  policyScores: Partial<Record<DiagnosisAxis, Partial<Record<keyof PolicySet, Record<string, number>>>>>;
  legalScores: Record<string, number>;
  types: Record<string, TypeData>;
  policyLessons: Record<keyof PolicySet, string>;
};
export const diagnosisData = diagnosisJson as unknown as DiagnosisData;

/** タイプのキーに使う、各軸のプラス側／マイナス側の文字 */
const LETTERS: Record<DiagnosisAxis, [string, string]> = {
  outcome: ['O', 'S'],
  control: ['C', 'A'],
  develop: ['D', 'G'],
  proactive: ['P', 'R'],
};
/** 制度とイベントの重み（ユーザーと決定：半々） */
const POLICY_WEIGHT = 0.5;

export type AxisResult = {
  /** −1〜+1。0以上ならプラス側 */
  score: number;
  /** 制度からの点数（材料がなければ null） */
  policy: number | null;
  /** イベントでの判断からの点数（材料がなければ null） */
  events: number | null;
};

export type Diagnosis = {
  axes: Record<DiagnosisAxis, AxisResult>;
  key: string;
  type: TypeData;
};

const mean = (xs: number[]) => (xs.length > 0 ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** ある月の制度の、その軸の点数（その軸に関係する制度の点数の平均） */
export function policyAxisScore(policies: PolicySet, axis: DiagnosisAxis): number | null {
  const table = diagnosisData.policyScores[axis];
  if (!table) return null;
  const xs: number[] = [];
  for (const [cat, scores] of Object.entries(table) as [keyof PolicySet, Record<string, number>][]) {
    const v = scores[policies[cat]];
    if (v !== undefined) xs.push(v);
  }
  return mean(xs);
}

/** 制度からの点数：毎月の制度の点数の平均（選んでいた期間の長さで重み付け）。先手⇄後手は法令の対応 */
export function policyPart(state: CompanyState, axis: DiagnosisAxis): number | null {
  if (axis === 'proactive') {
    return mean(
      state.legal.compliance.flatMap((c) => (c.response ? [diagnosisData.legalScores[c.response] ?? 0] : [])),
    );
  }
  const months = state.history.map((r) => r.policies ?? state.policies);
  const list = months.length > 0 ? months : [state.policies];
  return mean(list.flatMap((p) => {
    const v = policyAxisScore(p, axis);
    return v === null ? [] : [v];
  }));
}

/** イベントでの判断からの点数：選んだ選択肢の印の平均 */
export function eventPart(state: CompanyState, axis: DiagnosisAxis): number | null {
  return mean(state.decisions.flatMap((d) => (d.diagnosis?.[axis] !== undefined ? [d.diagnosis[axis] as number] : [])));
}

export function computeDiagnosis(state: CompanyState): Diagnosis {
  const axes = {} as Record<DiagnosisAxis, AxisResult>;
  let key = '';
  for (const axis of DIAGNOSIS_AXES) {
    const policy = policyPart(state, axis);
    const events = eventPart(state, axis);
    const score =
      policy !== null && events !== null
        ? POLICY_WEIGHT * policy + (1 - POLICY_WEIGHT) * events
        : (policy ?? events ?? 0);
    axes[axis] = { score, policy, events };
    key += LETTERS[axis][score >= 0 ? 0 : 1];
  }
  const type = diagnosisData.types[key];
  if (!type) throw new Error(`人事スタイルのタイプがありません: ${key}`);
  return { axes, key, type };
}
