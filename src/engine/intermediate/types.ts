/**
 * 中級モードの型（DESIGN.md §15）。ステップ20。
 *
 * 中級は1年を1ティックとし、社員を一人ひとりではなく「層」で持つ（§15.4）。
 * 層は「職種（職掌）×雇用形態×所属×等級×年代（5歳刻み）」。層の中の人は同じとみなし、
 * 代表者（rep）1人の属性に人数を掛けて計算する。初級のエンジンの関数は代表者に対して使い回す。
 */
import type { RngStreamsState } from '../rng';
import type { CompanyProfile, CompanyState, CompanyStatus, Departure, Employee, HiringState, MarketState, MonthlyRecord, PolicySet } from '../types';
import type { DetailedPolicies } from './detailedPolicy';
import type { Mismatch, Premise } from './fit';
import type { Scene, SceneKind } from './scenes';

/** 始める時に選ぶ難易度（§15.2） */
export const DIFFICULTIES = ['beginner', 'intermediate'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

/** 層：同じ区分の人たちをまとめたもの */
export type IntermediateLayer = {
  key: string;
  headcount: number;
  /** 層の代表者。数値の属性は層の平均、年齢は年代の真ん中 */
  rep: Employee;
};

/** 1年の記録 */
export type YearRecord = {
  /** 創業から何年目か（0始まり） */
  year: number;
  /** 年末の社員数 */
  headcount: number;
  layerCount: number;
  revenue: number;
  laborCost: number;
  laborCostRatio: number;
  operatingProfit: number;
  hires: number;
  promotions: number;
  /** 自己都合の退職（定年・出向の帰任を除く） */
  leavers: number;
  retirees: number;
  secondmentReturns: number;
  /** 年の離職率（自己都合の退職 ÷ 年はじめの社員数） */
  turnoverRate: number;
  /** 年末の納得感（人数で重み付けした平均） */
  engagement: number;
  /** 年の平均の残業時間（月あたり） */
  overtimeHours: number;
  cash: number;
  /** その年の前提と、合わなかった組み合わせ（画面には出さない。社員の声・振り返りに使う） */
  premise: Premise;
  mismatches: Mismatch[];
  /** その年の連鎖の段（0〜4） */
  chainStage: number;
};

/** 中級の会社の状態。セーブデータの本体になる */
export type IntermediateState = {
  difficulty: 'intermediate';
  seed: number;
  /** 創業から何年たったか（0始まり。次に計算する年） */
  year: number;
  maxYears: number;
  status: CompanyStatus;
  profile: CompanyProfile;
  /** 初級の制度に読み替えたもの（初級の効果を使うため。報酬の核4つは detail から決まる） */
  policies: PolicySet;
  /** 中級の細かい制度（報酬の核4つ。§15.5） */
  detail: DetailedPolicies;
  /** 合わない制度による連鎖の段（0〜4。§15.6） */
  chainStage: number;
  cash: number;
  negativeCashMonths: number;
  market: MarketState;
  hiring: HiringState;
  layers: IntermediateLayer[];
  nextEmployeeId: number;
  history: YearRecord[];
  /** 去った人の記録（初級と同じ形。年末にまとめて決まるので、その年の最後の月の日付で残す） */
  departures: Departure[];
  /** 月の記録（初級と同じ形。初級の画面（事業タブ・組織タブ・終了画面）で使う。§15 ステップ22） */
  monthly: MonthlyRecord[];
  /** 生成したときの会社（社員は空）。中級で扱わない部分（組織・法令など）を画面に出すときに使う */
  base: CompanyState;
  /** 判断を待っている場面（なければ null） */
  pendingScene: Scene | null;
  /** 場面で選んだ方針の記録（振り返りに使う） */
  sceneLog: { year: number; kind: SceneKind; stanceId: string; regrouped: boolean }[];
  /** 場面を自動で（今の制度のまま）進めるか。画面で遊ぶときは false */
  autoScenes: boolean;
  /** 追体験のデータのID（中級（自由）なら null。§15.7） */
  caseId: string | null;
  /** 自動で進めるとき、場面で史実の方針を選ぶか（史実の影の計算） */
  historical: boolean;
  rng: RngStreamsState;
};
