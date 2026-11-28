/**
 * 場面の前提と制度が合っているか（DESIGN.md §15.6）。ステップ21。
 *
 * - 前提：中級（自由）では会社の状態から毎年自動で出す（成長期・高齢化・ポスト詰まり・不況・大きな会社）。
 *   追体験（ステップ23）では場面のデータに書く
 * - 合わない組み合わせはルールで決める。ルールごとに「ずれ」（0〜1）と、効く要因を持つ
 * - すぐ効く影響：ずれ×点数を、その要因から引く（初級の制度の効果より大きい）
 * - 連鎖：ずれの合計が基準以上の年は1段進み、下回る年は1段戻る（最大4段）
 *     1 不満の表面化（全要因が下がる）→ 2 優秀層の離職 → 3 残った人の負荷の増加 → 4 業績の低下
 * 合う・合わないの点数は画面に出さない（社員の声・離職・業績から推理する）
 */
import { coef } from '../coefficients';
import { clamp } from '../employees';
import type { EngagementFactor } from '../types';
import { fieldMax, levelsOf, type DetailedPolicies } from './detailedPolicy';
import { totalHeadcount } from './layers';
import type { IntermediateLayer, YearRecord } from './types';

export type Premise = {
  growth: boolean;
  aging: boolean;
  postGlut: boolean;
  recession: boolean;
  large: boolean;
};

export const MISMATCH_IDS = [
  'seniority_in_growth',
  'seniority_in_aging',
  'few_levels_large',
  'variable_without_accuracy',
  'variable_narrow_top',
  'company_risk_in_recession',
  'merit_without_growth_talk',
  'post_glut_seniority',
] as const;
export type MismatchId = (typeof MISMATCH_IDS)[number];

export type Mismatch = { id: MismatchId; severity: number; factor: EngagementFactor };

export const CHAIN_MAX_STAGE = 4;

/** 会社の状態から前提を出す */
export function computePremise(input: {
  layers: readonly IntermediateLayer[];
  history: readonly YearRecord[];
  detail: DetailedPolicies;
  /** その年の平均の景気（わからなければ0） */
  economy: number;
}): Premise {
  const n = totalHeadcount(input.layers);
  const last = input.history[input.history.length - 1];
  const prev = input.history[input.history.length - 2];
  const growth = !!last && !!prev && prev.headcount > 0 && last.headcount / prev.headcount - 1 >= coef('intermediate.premise.growth_rate');
  const old = input.layers.filter((l) => l.rep.age >= coef('intermediate.premise.aging_age')).reduce((s, l) => s + l.headcount, 0);
  const levels = levelsOf(input.detail);
  const top = levels >= 3 ? input.layers.filter((l) => l.rep.grade >= levels - 2).reduce((s, l) => s + l.headcount, 0) : 0;
  return {
    growth,
    aging: n > 0 && old / n >= coef('intermediate.premise.aging_share'),
    postGlut: n > 0 && top / n >= coef('intermediate.premise.post_glut_share'),
    recession: input.economy <= coef('intermediate.premise.recession_economy'),
    large: n >= coef('intermediate.premise.large_headcount'),
  };
}

/** x が基準を超えたぶんのずれ（基準ちょうどで0.5、最大値で1。基準未満は0） */
function over(x: number, threshold: number, max: number): number {
  if (x < threshold) return 0;
  return max > threshold ? 0.5 + 0.5 * clamp((x - threshold) / (max - threshold), 0, 1) : 1;
}

/** 年次で上がれる範囲が、等級の段階に占める割合 */
export function seniorityShare(d: DetailedPolicies): number {
  const levels = levelsOf(d);
  return levels <= 1 ? 1 : d.grade.seniorityCap / (levels - 1);
}

/** 合わない組み合わせを探す */
export function findMismatches(premise: Premise, d: DetailedPolicies): Mismatch[] {
  const out: Mismatch[] = [];
  const add = (id: MismatchId, severity: number, factor: EngagementFactor) => {
    if (severity > 0) out.push({ id, severity, factor });
  };
  const seniority = over(seniorityShare(d), coef('intermediate.fit.seniority_share_high'), 1);
  const variable = over(d.bonus.variableShare, coef('intermediate.fit.variable_share_high'), fieldMax('bonus.variableShare'));

  if (premise.growth) add('seniority_in_growth', seniority, 'growthOpportunity');
  if (premise.aging) add('seniority_in_aging', seniority, 'internalFairness');
  if (premise.large && d.grade.system !== 'none') {
    const minLevels = coef('intermediate.fit.min_levels_large');
    const lack = d.grade.levels < minLevels ? over(minLevels - d.grade.levels, 1, minLevels - 1) : 0;
    // 職責による基本給の振れ幅があれば、段階が少なくても「次」が見えやすい（三菱商事 2000年の職責区分）
    add('few_levels_large', lack * (1 - (d.grade.dutySpread / fieldMax('grade.dutySpread')) * coef('intermediate.fit.duty_mitigation')), 'growthOpportunity');
  }
  if (d.evaluation.system === 'ceo') add('variable_without_accuracy', variable, 'evaluation');
  if (d.bonus.variableShare >= coef('intermediate.fit.variable_share_high') && d.evaluation.topShare < coef('intermediate.fit.top_share_low')) {
    add('variable_narrow_top', variable, 'internalFairness');
  }
  if (premise.recession) {
    add('company_risk_in_recession', over(d.bonus.variableShare * d.bonus.companyWeight, coef('intermediate.fit.company_risk_high'), fieldMax('bonus.variableShare')), 'stability');
  }
  if (!d.evaluation.separateGrowthTalk) {
    add('merit_without_growth_talk', over(d.pay.meritSpread, coef('intermediate.fit.merit_spread_high'), fieldMax('pay.meritSpread')) * coef('intermediate.fit.merit_weight'), 'growthOpportunity');
  }
  if (premise.postGlut) add('post_glut_seniority', seniority, 'internalFairness');
  return out;
}

export function totalMismatch(ms: readonly Mismatch[]): number {
  return ms.reduce((s, m) => s + m.severity, 0);
}

/** 連鎖を1年ぶん進める（ずれが基準以上なら1段進み、下回れば1段戻る） */
export function nextChainStage(stage: number, total: number): number {
  return total >= coef('intermediate.chain.threshold') ? Math.min(CHAIN_MAX_STAGE, stage + 1) : Math.max(0, stage - 1);
}

/** その年の、ずれと連鎖の効き目 */
export type FitEffects = {
  /** 全員の要因への上乗せ（マイナス） */
  orgBonus: Partial<Record<EngagementFactor, number>>;
  /** 優秀層の退職確率に掛ける倍率 */
  highAbilityAttritionMult: number;
  /** 売れる上限に掛ける倍率 */
  capacityMult: number;
};

export function fitEffects(ms: readonly Mismatch[], stage: number): FitEffects {
  const orgBonus: Partial<Record<EngagementFactor, number>> = {};
  const sub = (f: EngagementFactor, x: number) => (orgBonus[f] = (orgBonus[f] ?? 0) - x);
  for (const m of ms) sub(m.factor, coef('intermediate.mismatch.factor_penalty') * m.severity);
  if (stage >= 1) {
    for (const f of ['externalPay', 'internalFairness', 'evaluation', 'workload', 'growthOpportunity', 'stability'] as const) {
      sub(f, coef('intermediate.chain.stage1_penalty'));
    }
  }
  if (stage >= 3) sub('workload', coef('intermediate.chain.stage3_workload_penalty'));
  return {
    orgBonus,
    highAbilityAttritionMult: stage >= 2 ? coef('intermediate.chain.stage2_attrition_mult') : 1,
    capacityMult: stage >= 4 ? coef('intermediate.chain.stage4_capacity_mult') : 1,
  };
}
