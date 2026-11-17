/**
 * 退職の判定（§2.1 の6、§4.4）と、出向者の帰任。
 *
 * 月の退職確率 ＝ 業種の基本離職率 ÷ 12 ×｛ 制度と関係ない割合
 *                 ＋（1 − 制度と関係ない割合）× 納得感の倍率 × 相場との差の倍率 ｝
 *
 * - 制度と関係ない退職（家庭の事情・人間関係）は、何をしても一定の割合で起きる
 * - それ以外は納得感と給与の相場との差で増減し、理由は納得感をいちばん引き下げている要因になる
 * - 出向者は退職せず、出向期間が終わると親会社に戻る（納得感が低いと早く戻ることがある）
 */
import { coef } from './coefficients';
import { biggestDrag, piecewise } from './engagement';
import { marketSalaryFor } from './employees';
import { marketCompensation, monthlyCompensation, policyEffect } from './policies';
import type { Rng } from './rng';
import type {
  AttritionReason,
  Departure,
  Employee,
  EngagementFactor,
  IndustryData,
  LocationData,
  PolicySet,
} from './types';
import { MONTHS_PER_YEAR } from './types';

/** 納得感の倍率（§4.4：50で1.0、20で3.0、80で0.5。間は直線） */
export function engagementMultiplier(engagement: number): number {
  return piecewise(engagement, [
    [20, coef('attrition.engagement_multiplier.at20')],
    [50, coef('attrition.engagement_multiplier.at50')],
    [80, coef('attrition.engagement_multiplier.at80')],
  ]);
}

/** 相場との差の倍率（給与 ÷ 相場） */
export function marketGapMultiplier(ratio: number): number {
  return piecewise(ratio, [
    [0.8, coef('attrition.market_gap_multiplier.at0.8')],
    [1.0, coef('attrition.market_gap_multiplier.at1.0')],
    [1.2, coef('attrition.market_gap_multiplier.at1.2')],
  ]);
}

/** 要因と退職理由の対応 */
const REASON_OF: Record<EngagementFactor, AttritionReason> = {
  externalPay: 'pay',
  internalFairness: 'pay',
  evaluation: 'evaluation',
  workload: 'workload',
  growthOpportunity: 'growth',
  stability: 'outlook',
};

export type AttritionContext = {
  rng: Rng;
  industry: IndustryData;
  location: LocationData;
  month: number;
  policies: PolicySet;
};

/** 月の退職確率の内訳 */
export function resignationProbability(
  e: Employee,
  ctx: Omit<AttritionContext, 'rng' | 'month'>,
): { unrelated: number; related: number } {
  const monthlyBase = ctx.industry.baseAttritionRate.value / MONTHS_PER_YEAR;
  const unrelatedShare = coef('attrition.unrelated_share');
  const market = marketSalaryFor(ctx.industry, ctx.location, e.role, e.age, e.employmentType);
  const compRatio = monthlyCompensation(e, ctx.policies) / marketCompensation(market, e.employmentType);
  // 新卒などの入社3年以内の辞めやすさと、パートの辞めやすさ
  const early =
    e.hireChannel !== 'founding' && e.tenureMonths < coef('policy.hiring.early_attrition_months')
      ? policyEffect('hiring', e.hireChannel, 'early_attrition_mult')
      : 1;
  const part = e.employmentType === 'part' ? coef('labor.parttime_attrition_mult') : 1;
  return {
    unrelated: monthlyBase * unrelatedShare * part,
    related:
      monthlyBase *
      (1 - unrelatedShare) *
      engagementMultiplier(e.engagement) *
      marketGapMultiplier(compRatio) *
      early *
      part,
  };
}

function toDeparture(e: Employee, month: number, kind: Departure['kind'], reason: AttritionReason | null): Departure {
  return {
    employeeId: e.id,
    name: e.name,
    role: e.role,
    month,
    kind,
    reason,
    age: e.age,
    tenureMonths: e.tenureMonths,
    salaryMonthly: e.salaryMonthly,
    engagement: e.engagement,
    isKeyPerson: e.isKeyPerson,
    factorScores: e.factorScores,
  };
}

/**
 * 退職と帰任を判定し、去った人の記録を返す（残る社員だけを stay に入れる）。
 * 乱数は社員1人につき決まった回数だけ引く（判定の結果で乱数列がずれないように）。
 */
export function runAttrition(
  employees: readonly Employee[],
  ctx: AttritionContext,
): { stay: Employee[]; departures: Departure[] } {
  const stay: Employee[] = [];
  const departures: Departure[] = [];
  for (const e of employees) {
    const roll = ctx.rng.next();
    const reasonRoll = ctx.rng.next();

    if (e.affiliation === 'secondee') {
      const due = e.secondmentEndsAt !== null && ctx.month >= e.secondmentEndsAt;
      const early =
        e.engagement < coef('secondment.early_return_engagement') && roll < coef('secondment.early_return_rate');
      if (due || early) departures.push(toDeparture(e, ctx.month, 'return', null));
      else stay.push(e);
      continue;
    }

    const p = resignationProbability(e, ctx);
    if (roll < p.unrelated) {
      const reason: AttritionReason =
        reasonRoll < coef('attrition.unrelated.family_share') ? 'family' : 'relationships';
      departures.push(toDeparture(e, ctx.month, 'resignation', reason));
    } else if (roll < p.unrelated + p.related) {
      const reason = e.factorScores ? REASON_OF[biggestDrag(e.factorScores, e.values)] : 'growth';
      departures.push(toDeparture(e, ctx.month, 'resignation', reason));
    } else {
      stay.push(e);
    }
  }
  return { stay, departures };
}
