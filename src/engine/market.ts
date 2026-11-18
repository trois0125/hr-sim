/**
 * 市場と景気（§2.1 の1）。
 *
 * 需要 ＝ 底堅い需要 ＋（S字カーブで伸びる需要 − 底堅い需要）×（1 ＋ 景気感応度 × 景気）
 * 底堅い需要は、子会社の親会社向け売上やカーブアウトの既存顧客で、景気に左右されない。
 */
import { coef } from './coefficients';
import type { Rng } from './rng';
import type { CompanyProfile, IndustryData, MarketState } from './types';

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

/** S字カーブの進み具合（0か月で0、十分先で1） */
export function growthProgress(month: number, growthMonths: number): number {
  const mid = growthMonths / 2;
  const width = growthMonths / coef('market.logistic_width_ratio');
  const start = sigmoid(-mid / width);
  return (sigmoid((month - mid) / width) - start) / (1 - start);
}

/** 景気が平常のときの需要（円／月） */
export function potentialDemand(market: MarketState, industry: IndustryData, month: number): number {
  const progress = growthProgress(month, industry.growthCurve.growthMonths.value);
  return (
    market.initialDemandMonthly + (market.matureDemandMonthly - market.initialDemandMonthly) * progress
  );
}

/** その月の需要上限（円／月） */
export function demandAt(
  market: MarketState,
  profile: Pick<CompanyProfile, 'cyclicality'>,
  industry: IndustryData,
  month: number,
): number {
  const potential = potentialDemand(market, industry, month);
  const stable = Math.min(market.stableDemandMonthly, potential);
  // 取りこぼしで失った取り分は、景気に左右される部分（新しい顧客・案件）から減る
  const cyclical =
    (potential - stable) * market.shareFactor * Math.max(0, 1 + profile.cyclicality * market.economy);
  return stable + cyclical;
}

/**
 * 景気を1か月進める（平常に戻ろうとしながら、毎月少しずつ揺れる）。
 * まれに景気後退が始まり、景気が大きく落ち込む。乱数は毎月決まった回数（2回）だけ引く。
 */
export function stepEconomy(economy: number, rng: Rng): { economy: number; recession: boolean } {
  const shock = rng.normal(0, coef('market.economy.shock_sd'));
  const recession = rng.next() < coef('market.recession.monthly_probability');
  const next =
    coef('market.economy.persistence') * economy + shock + (recession ? coef('market.recession.shock') : 0);
  return { economy: Math.max(coef('market.economy.floor'), next), recession };
}

/**
 * 需要を取りこぼすと、市場での取り分が下がる（顧客が競合に移る）。取り分は少しずつ戻る。
 * lostShare は、その月の需要のうち売上にできなかった割合（0〜1）
 */
export function updateShareFactor(shareFactor: number, lostShare: number): number {
  const lost = coef('market.lost_demand.sensitivity') * Math.max(0, Math.min(1, lostShare));
  const recovered = shareFactor + coef('market.lost_demand.recovery') * (1 - shareFactor);
  return Math.max(0, recovered - lost);
}

/** 創業時の市場の状態をつくる */
export function createMarket(
  initialCapacity: number,
  profile: Pick<CompanyProfile, 'roleMix' | 'marketPotential' | 'stableDemandShare'>,
  industry: IndustryData,
  nominalOutputByRole: (roleId: string) => number,
): MarketState {
  const initialDemandMonthly = initialCapacity * coef('market.initial_demand_ratio');
  // 成熟時の需要：上限の社員数 × 売上を生む職種の構成比 × 1人あたりの売上 × 市場の成長性
  let perHead = 0;
  for (const role of industry.roles) {
    if (role.kind === 'revenue') perHead += (profile.roleMix[role.id] ?? 0) * nominalOutputByRole(role.id);
  }
  const mature = industry.growthCurve.capHeadcount.value * perHead * profile.marketPotential;
  return {
    economy: 0,
    initialDemandMonthly,
    matureDemandMonthly: Math.max(mature, initialDemandMonthly),
    stableDemandMonthly: initialDemandMonthly * profile.stableDemandShare,
    shareFactor: 1,
    recessionMonths: [],
    // 積み上がる売上の業種（SaaS）は、創業時の需要の一部だけを売上として持って始める
    ...(industry.recurringRevenue ? { recurringRevenue: initialDemandMonthly * industry.recurringRevenue.initialShare.value } : {}),
  };
}
