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
  const cyclical = (potential - stable) * Math.max(0, 1 + profile.cyclicality * market.economy);
  return stable + cyclical;
}

/** 景気を1か月進める（平常に戻ろうとしながら、毎月少しずつ揺れる） */
export function stepEconomy(economy: number, rng: Rng): number {
  const next =
    coef('market.economy.persistence') * economy + rng.normal(0, coef('market.economy.shock_sd'));
  return Math.max(coef('market.economy.floor'), next);
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
  };
}
