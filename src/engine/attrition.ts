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
import { coef, coefGroup } from './coefficients';
import { piecewise, sampleDrag } from './engagement';
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

const K = coefGroup({
  eng20: 'attrition.engagement_multiplier.at20',
  eng50: 'attrition.engagement_multiplier.at50',
  eng80: 'attrition.engagement_multiplier.at80',
  gap08: 'attrition.market_gap_multiplier.at0.8',
  gap10: 'attrition.market_gap_multiplier.at1.0',
  gap12: 'attrition.market_gap_multiplier.at1.2',
  unrelatedShare: 'attrition.unrelated_share',
  earlyMonths: 'policy.hiring.early_attrition_months',
  newcomerMonths: 'policy.workStyle.newcomer_months',
  partMult: 'labor.parttime_attrition_mult',
});

/** 折れ線の点（係数の ID に書いてある点：納得感20・50・80、給与÷相場0.8・1.0・1.2） */
let engagementPoints: [number, number][] | undefined;
let gapPoints: [number, number][] | undefined;

/** 納得感の倍率（§4.4：50で1.0、20で3.0、80で0.5。間は直線） */
export function engagementMultiplier(engagement: number): number {
  if (!engagementPoints) {
    const k = K();
    engagementPoints = [
      [20, k.eng20],
      [50, k.eng50],
      [80, k.eng80],
    ];
  }
  return piecewise(engagement, engagementPoints);
}

/** 相場との差の倍率（給与 ÷ 相場） */
export function marketGapMultiplier(ratio: number): number {
  if (!gapPoints) {
    const k = K();
    gapPoints = [
      [0.8, k.gap08],
      [1.0, k.gap10],
      [1.2, k.gap12],
    ];
  }
  return piecewise(ratio, gapPoints);
}

/** 要因と退職理由の対応 */
export const REASON_OF: Record<EngagementFactor, AttritionReason> = {
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
  const { unrelatedShare, earlyMonths, partMult } = K();
  const market = marketSalaryFor(ctx.industry, ctx.location, e.role, e.age, e.employmentType);
  const compRatio = monthlyCompensation(e, ctx.policies) / marketCompensation(market, e.employmentType, ctx.industry);
  // 新卒などの入社3年以内の辞めやすさと、パートの辞めやすさ
  const early =
    e.hireChannel !== 'founding' && e.tenureMonths < earlyMonths
      ? policyEffect('hiring', e.hireChannel, 'early_attrition_mult')
      : 1;
  // パートの辞めやすさ（業種の値があればそれ）
  const part = e.employmentType === 'part' ? (ctx.industry.partTimeAttritionMult?.value ?? partMult) : 1;
  // 制度と関係ない退職のうち「人間関係」は、在宅が多い職場の新人ほど増える
  const family = coef('attrition.unrelated.family_share');
  const unrelatedMult = family + (1 - family) * newcomerRelationshipMult(e, ctx.policies);
  return {
    unrelated: monthlyBase * unrelatedShare * part * unrelatedMult,
    related:
      monthlyBase *
      (1 - unrelatedShare) *
      engagementMultiplier(e.engagement) *
      marketGapMultiplier(compRatio) *
      early *
      part,
  };
}

/** 新人の「人間関係」による退職の倍率（働き方による。新人でなければ1） */
function newcomerRelationshipMult(e: Employee, policies: PolicySet): number {
  if (e.tenureMonths >= K().newcomerMonths) return 1;
  return policyEffect('workStyle', policies.workStyle, 'newcomer_relationship_mult');
}

export function toDeparture(e: Employee, month: number, kind: Departure['kind'], reason: AttritionReason | null): Departure {
  return {
    employeeId: e.id,
    name: e.name,
    role: e.role,
    employmentType: e.employmentType,
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

    // 休職中の人は、期間が終わるときに復帰か退職かが決まる（leave.ts）
    if (e.leave) {
      stay.push(e);
      continue;
    }

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
      // 家庭の事情か人間関係か。人間関係による退職は、在宅が多い職場の新人ほど起きやすい
      // （その倍率は resignationProbability の unrelated に入っているので、理由の割合も合わせて決める）
      const family = coef('attrition.unrelated.family_share');
      const rel = (1 - family) * newcomerRelationshipMult(e, ctx.policies);
      const reason: AttritionReason = reasonRoll < family / (family + rel) ? 'family' : 'relationships';
      departures.push(toDeparture(e, ctx.month, 'resignation', reason));
    } else if (roll < p.unrelated + p.related) {
      // 理由は、足を引っ張っている度合いに比例した確率で選ぶ（いちばん大きい要因が選ばれやすい）
      const reason = e.factorScores ? REASON_OF[sampleDrag(e.factorScores, e.values, reasonRoll)] : 'growth';
      departures.push(toDeparture(e, ctx.month, 'resignation', reason));
    } else {
      stay.push(e);
    }
  }
  return { stay, departures };
}

/**
 * 定年（ステップ12）。決算月に年齢を上げたあとに呼ぶ。定年の年齢に達したプロパー社員は退職する
 * （出向者は親会社に戻るので除く）。離職率には数えない。去った人の記録を返す
 */
export function retireEmployees(employees: readonly Employee[], month: number): { stay: Employee[]; retired: Departure[] } {
  const age = coef('retirement.age');
  const stay: Employee[] = [];
  const retired: Departure[] = [];
  for (const e of employees) {
    if (e.affiliation === 'proper' && e.age >= age) retired.push(toDeparture(e, month, 'retirement', null));
    else stay.push(e);
  }
  return { stay, retired };
}
