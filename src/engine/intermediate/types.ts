/**
 * 中級モードの型（DESIGN.md §15）。ステップ20。
 *
 * 中級は1年を1ティックとし、社員を一人ひとりではなく「層」で持つ（§15.4）。
 * 層は「職種（職掌）×雇用形態×所属×等級×年代（5歳刻み）」。層の中の人は同じとみなし、
 * 代表者（rep）1人の属性に人数を掛けて計算する。初級のエンジンの関数は代表者に対して使い回す。
 */
import type { RngStreamsState } from '../rng';
import type { CompanyProfile, CompanyStatus, Employee, HiringState, MarketState, PolicySet } from '../types';

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
  policies: PolicySet;
  cash: number;
  negativeCashMonths: number;
  market: MarketState;
  hiring: HiringState;
  layers: IntermediateLayer[];
  nextEmployeeId: number;
  history: YearRecord[];
  rng: RngStreamsState;
};
