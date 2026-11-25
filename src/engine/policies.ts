/**
 * 人事制度（§5 初級＝選択式）の効果を引く窓口。
 *
 * 効果の数値はすべて係数台帳に `policy.<カテゴリ>.<選択肢>.<効果>` の形で置いてある。
 * エンジンの各所は、制度の選択肢を直接見ずに、ここの関数を通して効果を受け取る。
 */
import { coef, coefPath } from './coefficients';
import { SCORE_MAX, clamp } from './employees';
import type { Employee, HiringPolicy, IndustryData, PolicySet } from './types';
import { MONTHS_PER_YEAR } from './types';

const effectCache = new Map<string, Map<string, Map<string, number>>>();

/** 制度の効果を1つ取り出す（一度読んだ値は覚えておく） */
export function policyEffect<K extends keyof PolicySet>(category: K, option: PolicySet[K], field: string): number {
  let byOption = effectCache.get(category);
  if (!byOption) effectCache.set(category, (byOption = new Map()));
  let byField = byOption.get(option);
  if (!byField) byOption.set(option, (byField = new Map()));
  let value = byField.get(field);
  if (value === undefined) {
    value = coefPath('policy', category, option, field);
    byField.set(field, value);
  }
  return value;
}

/** 業種で選べない制度を選んでいないか確かめる（選べなければエラー） */
export function validatePolicies(policies: PolicySet, industry: IndustryData): void {
  if (!industry.remoteAllowed.includes(policies.workStyle)) {
    throw new Error(`この業種では働き方「${policies.workStyle}」を選べません（${industry.name}）`);
  }
}

// ---------------------------------------------------------------------------
// 評価（等級制度・評価制度）
// ---------------------------------------------------------------------------

/** 評価のずれの大きさ（標準偏差、点）。社長が決める評価は、人数が増えるほどずれる */
export function evaluationNoise(policies: PolicySet, headcount: number, industry: IndustryData, fitMult = 1): number {
  let noise = policyEffect('evaluation', policies.evaluation, 'noise');
  if (policies.evaluation === 'ceo') {
    noise += coef('policy.evaluation.ceo.noise_per_head') * Math.max(0, headcount - industry.managementSpan.value);
  }
  // 上限で抑えてから等級制度の効果を掛ける（上限が先でないと、大きな会社で等級制度の効果が消える）。
  // 相性の倍率（§14.8。1以上）も上限の前に掛ける
  const accuracy = policyEffect('grade', policies.grade, 'accuracy_bonus');
  return Math.min(coef('policy.evaluation.max_noise'), noise * Math.max(1, fitMult)) * (1 - accuracy);
}

/** 等級・評価の制度を運用するコスト（円／人／月） */
export function hrSystemCostPerEmployee(policies: PolicySet): number {
  return (
    policyEffect('grade', policies.grade, 'cost_per_employee') +
    policyEffect('evaluation', policies.evaluation, 'cost_per_employee')
  );
}

// ---------------------------------------------------------------------------
// 報酬（給与の決め方・賞与・労働時間）
// ---------------------------------------------------------------------------


/** 固定残業代（円／月）。固定残業代の制度でなければ0 */
export function fixedOvertimeAllowance(e: Pick<Employee, 'salaryMonthly' | 'employmentType'>, policies: PolicySet): number {
  if (policies.workHours !== 'fixed_overtime' || e.employmentType === 'part') return 0;
  const hourly = e.salaryMonthly / coef('labor.scheduled_hours_monthly');
  return hourly * coef('labor.overtime_premium') * coef('policy.workHours.fixed_overtime.included_hours');
}

/** 月あたりの報酬（給与＋賞与の月割り＋固定残業代）。社外比較・社内公平性・退職の判定に使う */
export function monthlyCompensation(
  e: Pick<Employee, 'salaryMonthly' | 'bonusMonthly' | 'employmentType'>,
  policies: PolicySet,
): number {
  return e.salaryMonthly + e.bonusMonthly + fixedOvertimeAllowance(e, policies);
}

/** 相場の報酬（相場の月給＋業種の相場の賞与の月割り）。パートは賞与なし */
export function marketCompensation(
  marketSalary: number,
  employmentType: Employee['employmentType'],
  industry: Pick<IndustryData, 'marketBonusMonths'>,
): number {
  if (employmentType === 'part') return marketSalary;
  return marketSalary * (1 + industry.marketBonusMonths.value / MONTHS_PER_YEAR);
}

export type BonusContext = {
  policies: PolicySet;
  /** 業種の相場の賞与の月数（年間） */
  marketBonusMonths: number;
  /** 評価の順位（0＝最下位、1＝最上位） */
  percentile: number;
  /** 前年の営業利益の合計（業績連動賞与の原資） */
  lastYearProfit: number;
  /** 賞与の対象者の月給の合計 */
  totalSalaries: number;
};

/** 賞与の月割り（円）。パートは対象外 */
export function bonusMonthlyFor(e: Pick<Employee, 'salaryMonthly' | 'employmentType'>, ctx: BonusContext): number {
  if (e.employmentType === 'part') return 0;
  const { policies } = ctx;
  let months = 0;
  switch (policies.bonus) {
    case 'none':
      months = 0;
      break;
    case 'fixed_months':
      months = ctx.marketBonusMonths * coef('policy.bonus.fixed_months.months_ratio');
      break;
    case 'company_linked': {
      if (ctx.totalSalaries <= 0) break;
      const pool = Math.max(0, ctx.lastYearProfit) * coef('policy.bonus.company_linked.profit_share');
      months = Math.min(ctx.marketBonusMonths * coef('policy.bonus.company_linked.max_ratio'), pool / ctx.totalSalaries);
      break;
    }
    case 'individual_linked':
      months =
        ctx.marketBonusMonths *
        coef('policy.bonus.individual_linked.months_ratio') *
        (1 + coef('policy.bonus.individual_linked.spread') * (ctx.percentile - 0.5));
      break;
  }
  return (e.salaryMonthly * months) / MONTHS_PER_YEAR;
}

/** 給与の決め方と賞与の制度による「雇用の安定」の上乗せ（給与の見通しが立つか） */
export function stabilityBonus(policies: PolicySet): number {
  return (
    policyEffect('pay', policies.pay, 'stability_bonus') + policyEffect('bonus', policies.bonus, 'stability_bonus')
  );
}

/** 割増の付く残業時間（変形労働時間制では繁閑を吸収できるぶん減る） */
export function premiumOvertimeHours(hours: number, policies: PolicySet, fitMult = 1): number {
  if (policies.workHours === 'variable') {
    return hours * (1 - coef('policy.workHours.variable.premium_reduction')) * fitMult;
  }
  return hours * fitMult;
}

/** 実際に払う残業代のもとになる時間。固定残業代では、含めた時間ぶんは残業がなくても払う */
export function paidOvertimeHours(hours: number, policies: PolicySet, fitMult = 1): number {
  const premium = premiumOvertimeHours(hours, policies, fitMult);
  if (policies.workHours === 'fixed_overtime') {
    return Math.max(premium, coef('policy.workHours.fixed_overtime.included_hours'));
  }
  return premium;
}

// ---------------------------------------------------------------------------
// 働き方・採用・育成
// ---------------------------------------------------------------------------

/**
 * 成果連動の稼働効果の強さ（0〜最大）。報酬と評価の結びつき × 評価の正確さ。
 * 評価がずれているほど「頑張っても報われない」ので効果が薄れる。社員の価値観（money）は呼ぶ側で掛ける
 */
export function incentiveStrength(policies: PolicySet, headcount: number, industry: IndustryData): number {
  const link =
    (policies.pay === 'performance' ? coef('policy.incentive.link.pay.performance') : 0) +
    (policies.bonus === 'individual_linked' ? coef('policy.incentive.link.bonus.individual_linked') : 0) +
    (policies.bonus === 'company_linked' ? coef('policy.incentive.link.bonus.company_linked') : 0);
  if (link <= 0) return 0;
  const accuracy = 1 - evaluationNoise(policies, headcount, industry) / coef('policy.evaluation.max_noise');
  return coef('policy.incentive.max_effect') * Math.min(1, link) * Math.max(0, accuracy);
}

/** 入社1年未満の人の割合による生産性の低下（働き方による。出社なら0） */
export function cohesionFactor(policies: PolicySet, newcomerShare: number): number {
  return 1 - policyEffect('workStyle', policies.workStyle, 'cohesion_penalty') * newcomerShare;
}

/** 「働く負荷」の上乗せ（フレックス・在宅） */
export function workloadBonus(policies: PolicySet): number {
  const flex = policies.workHours === 'flex' ? coef('policy.workHours.flex.workload_bonus') : 0;
  return flex + policyEffect('workStyle', policies.workStyle, 'workload_bonus');
}

/** 「成長の機会」の上乗せ（等級による昇格の道筋） */
export function growthBonus(policies: PolicySet): number {
  return policyEffect('grade', policies.grade, 'growth_bonus');
}

/** 一人前になるまでの立ち上がり（入社経路と働き方で変わる） */
export function rampParams(
  e: Pick<Employee, 'hireChannel'>,
  policies: PolicySet,
  /** 相性による立ち上がりの倍率（§14.8） */
  fitMult = 1,
): { months: number; start: number } {
  const months =
    e.hireChannel === 'founding'
      ? coef('performance.ramp_months')
      : policyEffect('hiring', e.hireChannel, 'ramp_months');
  const start =
    e.hireChannel === 'founding' ? coef('performance.ramp_start') : policyEffect('hiring', e.hireChannel, 'ramp_start');
  return { months: months * policyEffect('workStyle', policies.workStyle, 'ramp_mult') * fitMult, start };
}

/**
 * 1人の採用がどの経路になるか。採用方針がパート中心でも、パートで採れない職種は中途で採る。
 * 新卒中心でも、パートは新卒としては採らない。
 */
export function hireChannelFor(policies: PolicySet, employmentType: Employee['employmentType']): HiringPolicy {
  if (employmentType === 'part') return 'part_time';
  return policies.hiring === 'new_grad' ? 'new_grad' : 'mid_career';
}

/** 求人の埋まりやすさの倍率（採用の経路×働き方） */
export function fillRateMultiplier(channel: HiringPolicy, policies: PolicySet): number {
  return (
    policyEffect('hiring', channel, 'fill_rate_mult') * policyEffect('workStyle', policies.workStyle, 'fill_rate_mult')
  );
}

/** 1年あたりの実力の伸び（点）。若いほど伸び、100に近いほど伸びにくい */
export function annualAbilityGain(e: Pick<Employee, 'age' | 'ability'>, policies: PolicySet, fitMult = 1): number {
  const base = policyEffect('training', policies.training, 'ability_gain');
  const youth = e.age < coef('performance.ability_growth.youth_age') ? coef('performance.ability_growth.youth_mult') : 1;
  return base * youth * fitMult * clamp(1 - e.ability / SCORE_MAX, 0, 1);
}
