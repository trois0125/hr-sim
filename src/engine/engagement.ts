/**
 * 納得感（エンゲージメント）の更新（§2.1 の5、§4.3）。
 *
 * 6つの要因をそれぞれ 0〜100 の点数（50が中立）にし、価値観で重み付けした平均を「目標値」にする。
 * 現在値は、目標値との差の一定割合（§4.3 では20%）だけ毎月近づく。
 */
import { coef, coefGroup, coefPath } from './coefficients';
import { SCORE_MAX, SCORE_MIN, clamp, marketSalaryFor } from './employees';
import {
  growthBonus,
  marketCompensation,
  monthlyCompensation,
  policyEffect,
  stabilityBonus,
  workloadBonus,
} from './policies';
import type {
  Employee,
  EngagementFactor,
  FactorScores,
  IndustryData,
  LocationData,
  MonthlyRecord,
  PolicySet,
  Values,
} from './types';
import { ENGAGEMENT_FACTORS, MONTHS_PER_YEAR } from './types';

/** 中立の点数 */
export const NEUTRAL = (SCORE_MIN + SCORE_MAX) / 2;
const score = (x: number) => clamp(x, SCORE_MIN, SCORE_MAX);

/** 区分ごとの直線補間。points は x の小さい順 */
export function piecewise(x: number, points: readonly (readonly [number, number])[]): number {
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) throw new Error('piecewise: 点がありません');
  if (x <= first[0]) return first[1];
  if (x >= last[0]) return last[1];
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1] as readonly [number, number];
    const [x1, y1] = points[i] as readonly [number, number];
    if (x <= x1) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  return last[1];
}

// ---------------------------------------------------------------------------
// 6つの要因
// ---------------------------------------------------------------------------

const K = coefGroup({
  externalSlope: 'engagement.external_pay.slope',
  fairSlope: 'engagement.internal_fairness.slope',
  fairGain: 'engagement.internal_fairness.gain_ratio',
  fairMinPeers: 'engagement.internal_fairness.min_peers',
  evalUnder: 'engagement.evaluation.slope_under',
  evalOver: 'engagement.evaluation.slope_over',
  wl0: 'engagement.workload.at0',
  wl20: 'engagement.workload.at20',
  wl45: 'engagement.workload.at45',
  wl80: 'engagement.workload.at80',
  cap20: 'policy.overtime.cap.limit20',
  cap45: 'policy.overtime.cap.limit45',
  capSpecial: 'policy.overtime.cap.special',
  weightBase: 'engagement.weight.base',
  adjustRate: 'engagement.adjust_rate',
});

/** 働く負荷の点数の折れ線（残業時間 → 点数）。係数から1回だけつくる */
let workloadPoints: [number, number][] | undefined;

/** 報酬の社外比較：自分の報酬（給与＋賞与の月割り＋固定残業代）÷ 同じ職種・年齢の相場の報酬 */
export function externalPayScore(compensation: number, marketComp: number): number {
  return score(NEUTRAL + K().externalSlope * (compensation / marketComp - 1));
}

/** 順位を 0（最下位）〜1（最上位）に直す。同じ値は同じ順位（平均順位） */
export function percentiles(xs: readonly number[]): number[] {
  const n = xs.length;
  if (n <= 1) return xs.map(() => NEUTRAL / SCORE_MAX);
  const order = xs.map((x, i) => [x, i] as const).sort((a, b) => a[0] - b[0]);
  const out = new Array<number>(n);
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && order[j + 1]?.[0] === order[i]?.[0]) j++;
    const rank = (i + j) / 2 / (n - 1);
    for (let k = i; k <= j; k++) out[order[k]?.[1] ?? 0] = rank;
    i = j + 1;
  }
  return out;
}

/**
 * 報酬の社内公平性：同じ職種のフルタイムの中で、実力の順位と給与の順位がどれだけずれているか。
 * 実力に比べて給与の順位が低いと下がる。もらいすぎの嬉しさは、もらえなさの不満より小さい。
 */
export function internalFairnessScores(employees: readonly Employee[], policies?: PolicySet): Map<string, number> {
  const out = new Map<string, number>();
  const byRole = new Map<string, Employee[]>();
  for (const e of employees) {
    if (e.employmentType === 'part') continue;
    const group = byRole.get(e.role);
    if (group) group.push(e);
    else byRole.set(e.role, [e]);
  }
  const { fairSlope: slope, fairGain: gain, fairMinPeers: minPeers } = K();
  for (const group of byRole.values()) {
    if (group.length < minPeers) {
      for (const e of group) out.set(e.id, NEUTRAL);
      continue;
    }
    const ability = percentiles(group.map((e) => e.ability));
    const salary = percentiles(group.map((e) => (policies ? monthlyCompensation(e, policies) : e.salaryMonthly)));
    group.forEach((e, i) => {
      const gap = (ability[i] ?? 0) - (salary[i] ?? 0); // プラス＝実力のわりに給与が低い
      out.set(e.id, score(gap > 0 ? NEUTRAL - slope * gap : NEUTRAL - slope * gain * gap));
    });
  }
  for (const e of employees) if (!out.has(e.id)) out.set(e.id, NEUTRAL); // パートは比べない
  return out;
}

/** 評価の正確さ：評価で見える成果と本当の実力のずれ。低く見られるほうが強く効く */
export function evaluationScore(perceived: number, ability: number): number {
  const diff = perceived - ability;
  const slope = diff < 0 ? K().evalUnder : K().evalOver;
  return score(NEUTRAL + slope * diff);
}

/** 働く負荷：月の残業時間 */
export function workloadScore(overtimeHours: number): number {
  if (!workloadPoints) {
    const k = K();
    workloadPoints = [
      [0, k.wl0],
      [k.cap20, k.wl20],
      [k.cap45, k.wl45],
      [k.capSpecial, k.wl80],
    ];
  }
  return piecewise(overtimeHours, workloadPoints);
}

/** 成長の機会：育成投資 ＋ 会社が伸びていること（昇格の見込み） */
export function growthOpportunityScore(training: PolicySet['training'], headcountGrowth: number): number {
  const base = coefPath('engagement', 'growth', `training_${training}`);
  const bonus = Math.min(
    coef('engagement.growth.company_growth_max'),
    Math.max(0, coef('engagement.growth.company_growth_slope') * headcountGrowth),
  );
  return score(base + bonus);
}

/** 雇用の安定：黒字なら高い。赤字なら、手元資金が何か月もつかで決まる */
export function stabilityScore(recentProfit: number, monthlyLoss: number, cash: number): number {
  if (recentProfit >= 0) return coef('engagement.stability.profitable');
  const runway = monthlyLoss > 0 ? Math.max(0, cash) / monthlyLoss : Infinity;
  return piecewise(runway, [
    [0, coef('engagement.stability.loss_runway0')],
    [MONTHS_PER_YEAR, coef('engagement.stability.loss_runway12')],
  ]);
}

// ---------------------------------------------------------------------------
// 価値観による重み
// ---------------------------------------------------------------------------

/** 各要因に効く価値観（§4.3 の表） */
const FACTOR_VALUES: Record<EngagementFactor, (keyof Values)[]> = {
  externalPay: ['money'],
  internalFairness: ['money', 'growth'],
  evaluation: ['growth'],
  workload: ['balance'],
  growthOpportunity: ['growth'],
  stability: ['stability'],
};

export function factorWeights(values: Values): FactorScores {
  const base = K().weightBase;
  const out = {} as FactorScores;
  for (const f of ENGAGEMENT_FACTORS) {
    out[f] = base + FACTOR_VALUES[f].reduce((s, v) => s + coefPath('engagement', 'weight', f, v) * values[v], 0);
  }
  return out;
}

/** 変化への抵抗の強さ（価値観。安定を重視する人ほど強い。平均的な人で0.75倍） */
export function resistanceSensitivity(values: Values): number {
  return NEUTRAL / SCORE_MAX + values.stability;
}

/** 重み付きの平均（目標値） */
export function targetEngagement(scores: FactorScores, values: Values): number {
  const w = factorWeights(values);
  let sum = 0;
  let total = 0;
  for (const f of ENGAGEMENT_FACTORS) {
    sum += w[f] * scores[f];
    total += w[f];
  }
  return sum / total;
}

/**
 * 退職理由の抽選：足を引っ張っている度合い（重み×(100−点数)）に比例した確率で要因を選ぶ。
 * roll は 0〜1 の乱数。
 */
export function sampleDrag(scores: FactorScores, values: Values, roll: number): EngagementFactor {
  const w = factorWeights(values);
  let total = 0;
  for (const f of ENGAGEMENT_FACTORS) total += w[f] * (SCORE_MAX - scores[f]);
  let r = roll * total;
  for (const f of ENGAGEMENT_FACTORS) {
    r -= w[f] * (SCORE_MAX - scores[f]);
    if (r < 0) return f;
  }
  return ENGAGEMENT_FACTORS[ENGAGEMENT_FACTORS.length - 1] as EngagementFactor;
}

/** どの要因が納得感をいちばん引き下げているか（重み×中立からの不足が最大のもの） */
export function biggestDrag(scores: FactorScores, values: Values): EngagementFactor {
  const w = factorWeights(values);
  let best: EngagementFactor = 'growthOpportunity';
  let bestValue = -Infinity;
  for (const f of ENGAGEMENT_FACTORS) {
    const drag = w[f] * (SCORE_MAX - scores[f]);
    if (drag > bestValue) {
      bestValue = drag;
      best = f;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// 会社全体の更新
// ---------------------------------------------------------------------------

export type EngagementContext = {
  industry: IndustryData;
  location: LocationData;
  policies: PolicySet;
  /** 今月までの記録（今月の分を含む） */
  history: readonly MonthlyRecord[];
  cash: number;
  /** 今月の社員数（採用後） */
  headcount: number;
  /** 制度変更による一時的な抵抗（点）。policyChange.ts の currentResistance */
  resistance?: number;
  /** 違反の状態にある義務の数（会社のルールが守られていない不安として「雇用の安定」を下げる） */
  violations?: number;
};

/** 会社の状況から決まる要因（全員共通） */
export function companyFactors(ctx: EngagementContext): { growthOpportunity: number; stability: number } {
  const { history } = ctx;
  const yearAgo = history[history.length - 1 - MONTHS_PER_YEAR] ?? history[0];
  const growth = yearAgo && yearAgo.headcount > 0 ? ctx.headcount / yearAgo.headcount - 1 : 0;
  const window = history.slice(-coef('engagement.stability.profit_window_months'));
  const profit = window.reduce((s, r) => s + r.operatingProfit, 0);
  const monthlyLoss = window.length > 0 ? -profit / window.length : 0;
  return {
    growthOpportunity: score(growthOpportunityScore(ctx.policies.training, growth) + growthBonus(ctx.policies)),
    stability: score(
      stabilityScore(profit, monthlyLoss, ctx.cash) +
        stabilityBonus(ctx.policies) -
        Math.min(
          coef('law.violation.stability_penalty_max'),
          coef('law.violation.stability_penalty') * (ctx.violations ?? 0),
        ),
    ),
  };
}

/** 社員一人ひとりの要因の点数を計算する */
export function computeFactorScores(employees: readonly Employee[], ctx: EngagementContext): Map<string, FactorScores> {
  const company = companyFactors(ctx);
  const fairness = internalFairnessScores(employees, ctx.policies);
  const fairnessBonus = policyEffect('evaluation', ctx.policies.evaluation, 'fairness_bonus');
  const workBonus = workloadBonus(ctx.policies);
  const out = new Map<string, FactorScores>();
  for (const e of employees) {
    const market = marketSalaryFor(ctx.industry, ctx.location, e.role, e.age, e.employmentType);
    out.set(e.id, {
      externalPay: externalPayScore(
        monthlyCompensation(e, ctx.policies),
        marketCompensation(market, e.employmentType, ctx.industry),
      ),
      internalFairness: fairness.get(e.id) ?? NEUTRAL,
      evaluation: score(evaluationScore(e.perceivedPerformance, e.ability) + fairnessBonus),
      workload: score(workloadScore(e.overtimeHours) + workBonus),
      growthOpportunity: company.growthOpportunity,
      stability: company.stability,
    });
  }
  return out;
}

/** 納得感を1か月ぶん更新する（社員を書き換える） */
export function updateEngagement(employees: Employee[], ctx: EngagementContext): void {
  const scores = computeFactorScores(employees, ctx);
  const rate = K().adjustRate;
  const resistance = ctx.resistance ?? 0;
  for (const e of employees) {
    const s = scores.get(e.id);
    if (!s) continue;
    e.factorScores = s;
    const target = targetEngagement(s, e.values) - resistance * resistanceSensitivity(e.values);
    e.engagement = score(e.engagement + rate * (target - e.engagement));
  }
}
