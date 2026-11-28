/**
 * 中級の場面（DESIGN.md §15.3、§15.6）。ステップ22。
 *
 * 中級（自由）で場面が出るのは：
 * - 創業時（最初の制度を設計する）
 * - 前提が変わった年（成長期に入った、高齢化した、不況になった、大きな会社になった、ポストが詰まった）
 * - 連鎖が進んだ年（原因は書かず、社員の声だけを出す。プレイヤーが推理する）
 * 場面が出ている間は年が進まない。方針（stances.json）を選ぶと設計画面に初期値が入り、そこから細かく直して決める。
 * 自動で進めるとき（simulate.ts）は「今の制度のまま」で進む。
 */
import stanceData from '../../data/intermediate/stances.json';
import type { PolicySet } from '../types';
import { levelsOf, validateDetailed, type DetailedPolicies } from './detailedPolicy';
import type { Premise } from './fit';
import { totalHeadcount } from './layers';
import { changeDetailedPolicies, type ChangeOptions } from './regroup';
import type { IntermediateState } from './types';

export type SceneKind = 'founding' | 'premise' | 'chain' | 'case';

export type Scene = {
  kind: SceneKind;
  /** 追体験の場面のID（kind が case のとき） */
  caseSceneId?: string;
  /** 場面が出た年（この年の初めに判断する） */
  year: number;
  /** 新しく当てはまるようになった前提 */
  premiseOn: PremiseKey[];
  /** 当てはまらなくなった前提 */
  premiseOff: PremiseKey[];
  chainStage: number;
  /** 本文への差し込み（数字は画面で整える） */
  vars: { headcount: number; growthRate: number; agingShare: number; economy: number };
};

export type Stance = {
  id: string;
  label: string;
  description: string;
  patch: { [K in keyof DetailedPolicies]?: Partial<DetailedPolicies[K]> };
};

export const STANCES = stanceData.stances as Stance[];

/** 方針を当てはめた細かい制度（年次で上がれる上限は等級の段階に収める） */
export function applyStance(detail: DetailedPolicies, stanceId: string): DetailedPolicies {
  const s = STANCES.find((x) => x.id === stanceId);
  if (!s) throw new Error(`方針がありません: ${stanceId}`);
  const next = structuredClone(detail);
  for (const cat of Object.keys(s.patch) as (keyof DetailedPolicies)[]) Object.assign(next[cat], s.patch[cat]);
  next.grade.seniorityCap = Math.min(next.grade.seniorityCap, Math.max(0, levelsOf(next) - 1));
  validateDetailed(next);
  return next;
}

const PREMISE_KEYS = ['growth', 'aging', 'postGlut', 'recession', 'large'] as const;
/** 会社の状態から出す前提（中級（自由）の場面に使うもの） */
export type PremiseKey = (typeof PREMISE_KEYS)[number];

/** 年末に、次の年の初めに出す場面があるかを調べる */
export function detectScene(input: {
  state: IntermediateState;
  previous: Premise | null;
  next: Premise;
  previousStage: number;
  agingShare: number;
}): Scene | null {
  const { state, previous, next } = input;
  const premiseOn = PREMISE_KEYS.filter((k) => next[k] && !previous?.[k]);
  const premiseOff = PREMISE_KEYS.filter((k) => !next[k] && !!previous?.[k]);
  const last = state.history[state.history.length - 1];
  const prev = state.history[state.history.length - 2];
  const vars = {
    headcount: totalHeadcount(state.layers),
    growthRate: last && prev && prev.headcount > 0 ? last.headcount / prev.headcount - 1 : 0,
    agingShare: input.agingShare,
    economy: state.market.economy,
  };
  if (premiseOn.length > 0) return { kind: 'premise', year: state.year, premiseOn, premiseOff, chainStage: state.chainStage, vars };
  if (state.chainStage > input.previousStage) return { kind: 'chain', year: state.year, premiseOn: [], premiseOff, chainStage: state.chainStage, vars };
  return null;
}

/** 創業時の場面 */
export function foundingScene(state: IntermediateState): Scene {
  return {
    kind: 'founding',
    year: 0,
    premiseOn: [],
    premiseOff: [],
    chainStage: 0,
    vars: { headcount: totalHeadcount(state.layers), growthRate: 0, agingShare: 0, economy: state.market.economy },
  };
}

/** 場面で判断する（制度を決めて場面を閉じる。状態を書き換える） */
export function resolveScene(
  state: IntermediateState,
  choice: { stanceId: string; detail: DetailedPolicies; options?: ChangeOptions; base?: Partial<PolicySet> },
): void {
  const scene = state.pendingScene;
  if (!scene) throw new Error('場面がありません');
  // 報酬の核4つ以外（採用・労働時間・育成・働き方・残業）は初級の選択肢のまま変える
  if (choice.base) state.policies = { ...state.policies, ...choice.base };
  const result = changeDetailedPolicies(state, choice.detail, choice.options);
  state.sceneLog.push({ year: scene.year, kind: scene.kind, stanceId: choice.stanceId, regrouped: result.regrouped });
  state.pendingScene = null;
}

/** 場面で待っているか */
export function isWaitingForScene(state: IntermediateState): boolean {
  return state.pendingScene !== null && !state.autoScenes;
}
