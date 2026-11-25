/**
 * 社員ごとの稼働と成果（§2.1 の3）。
 *
 * - 売上を生む職種（商社なら営業）が売上の「売れる上限」をつくる
 * - 事務が足りないと、売上を生む社員の稼働が下がる
 * - 管理が足りないと、全体の効率が下がる（社長が見られる人数まではかからない）
 * - 需要が上限を超えたぶんは、売上を生むフルタイム社員の残業で埋める
 */
import { employeeFitEffects, hasFitEffect, type ActiveFits } from './fits';
import { coef, coefGroup, coefPath } from './coefficients';
import { SCORE_MAX, ageSalaryFactor, clamp } from './employees';
import { defaultPolicies } from './data';
import { cohesionFactor, incentiveStrength, policyEffect, rampParams } from './policies';
import type { Employee, IndustryData, IndustryVariant, OvertimePolicy, PolicySet, RoleKind } from './types';

/** 能力の基準点（0〜100 の中央） */
const SCORE_MID = SCORE_MAX / 2;
/** §6.3 で補正値を定めている納得感の点（20 と 80） */
const ENGAGEMENT_LOW = 20;
const ENGAGEMENT_HIGH = 80;

const K = coefGroup({
  partHours: 'labor.parttime_hours_monthly',
  scheduledHours: 'labor.scheduled_hours_monthly',
  partProductivity: 'labor.parttime_productivity',
  rampMonths: 'performance.ramp_months',
  rampStart: 'performance.ramp_start',
  abilitySpread: 'performance.ability_spread',
  engLo: 'performance.engagement_multiplier.at20',
  engMid: 'performance.engagement_multiplier.at50',
  engHi: 'performance.engagement_multiplier.at80',
  expElasticity: 'performance.experience_elasticity',
  expRefAge: 'performance.experience_reference_age',
});

/**
 * 経験（年齢）による生産性（基準の年齢で1.0）。賃金カーブの「強さ」乗。
 * 強さは業種の experienceElasticity（製造業は熟練が強く効く）、なければ係数台帳の共通の値
 */
export function experienceFactor(age: number, industry?: Pick<IndustryData, 'salaryCurve' | 'experienceElasticity'>): number {
  const k = K();
  const elasticity = industry?.experienceElasticity?.value ?? k.expElasticity;
  return Math.pow(ageSalaryFactor(age, industry) / ageSalaryFactor(k.expRefAge, industry), elasticity);
}

/** 稼働の量（フルタイム＝1.0。休職中は0） */
export function fte(e: Employee): number {
  if (e.leave) return 0;
  if (e.employmentType === 'part') return K().partHours / K().scheduledHours;
  return 1;
}

/** 時間あたりの生産性（パートは任される仕事の範囲が狭い。業種の値があればそれ） */
export function hourlyProductivity(e: Employee, industry?: Pick<IndustryData, 'partTimeProductivity'>): number {
  if (e.employmentType !== 'part') return 1;
  return industry?.partTimeProductivity?.value ?? K().partProductivity;
}

/** 入社からの立ち上がり（一人前で1.0）。months・start を省くと創業メンバーの値 */
export function rampFactor(tenureMonths: number, months = K().rampMonths, start = K().rampStart): number {
  const progress = clamp(tenureMonths / months, 0, 1);
  return start + (1 - start) * progress;
}

/** 実力による補正（実力50で1.0） */
export function abilityFactor(ability: number): number {
  return 1 + (K().abilitySpread * (ability - SCORE_MID)) / SCORE_MID;
}

/** 納得感による補正（§6.3：50で1.0、80で1.1、20で0.8。間は直線で補う） */
export function engagementFactor(engagement: number): number {
  const { engLo: lo, engMid: mid, engHi: hi } = K();
  const [x0, x1, x2] = [ENGAGEMENT_LOW, SCORE_MID, ENGAGEMENT_HIGH];
  if (engagement <= x0) return lo;
  if (engagement >= x2) return hi;
  if (engagement <= x1) return lo + ((mid - lo) * (engagement - x0)) / (x1 - x0);
  return mid + ((hi - mid) * (engagement - x1)) / (x2 - x1);
}

/**
 * 社員1人の実効的な稼働（稼働量×立ち上がり×実力×納得感×働き方×成果連動の効果）。
 * incentive は incentiveStrength の値（会社全体で共通）。money を重視する人ほど強く効く
 */
export function effectiveWork(
  e: Employee,
  policies: PolicySet = defaultPolicies,
  incentive = 0,
  industry?: Pick<IndustryData, 'salaryCurve' | 'experienceElasticity' | 'partTimeProductivity'>,
  /** 相性による立ち上がりの倍率（§14.8） */
  fitRampMult = 1,
): number {
  const ramp = rampParams(e, policies, fitRampMult);
  const motivation = 1 + incentive * (SCORE_MID / SCORE_MAX + e.values.money);
  return (
    motivation *
    experienceFactor(e.age, industry) *
    fte(e) *
    hourlyProductivity(e, industry) *
    rampFactor(e.tenureMonths, ramp.months, ramp.start) *
    abilityFactor(e.ability) *
    engagementFactor(e.engagement) *
    policyEffect('workStyle', policies.workStyle, 'productivity')
  );
}

export type PerformanceResult = {
  /** 残業なしで売れる上限（円／月） */
  capacity: number;
  /** 事務の不足による補正（1.0＝不足なし） */
  adminFactor: number;
  /** 管理の不足による補正（1.0＝不足なし） */
  managementFactor: number;
  /** 売上を生むフルタイム社員の稼働の合計（残業の配分に使う） */
  overtimeEligibleOutput: number;
  /** 店舗のある業種（飲食）：店舗の数と、店長のいない店舗の数（ほかの業種では0） */
  stores: number;
  storesWithoutManager: number;
  /** 管理の職種の人数（休職中を除く、フルタイム換算） */
  managementFte: number;
};

/** 店舗の数（店舗のある業種だけ。それ以外は0）。社員数 ÷ 1店舗の人数 の切り上げ（最低1） */
export function storeCount(industry: Pick<IndustryData, 'store'>, headcount: number): number {
  if (!industry.store) return 0;
  return Math.max(1, Math.ceil(headcount / industry.store.staffPerStore.value));
}

function roleKindMap(industry: IndustryData): Map<string, RoleKind> {
  return new Map(industry.roles.map((r) => [r.id, r.kind]));
}

/** 売上を生む社員1人（標準的な実力・納得感・一人前）の月の売上 */
export function nominalOutputPerRevenueStaff(industry: IndustryData, variant: IndustryVariant, roleId: string): number {
  const role = industry.roles.find((r) => r.id === roleId);
  if (!role) throw new Error(`職種がありません: ${industry.id}/${roleId}`);
  return role.productivityMonthly.value * variant.productivityMultiplier.value;
}

/** 社長自身がつくる売上（役員なので社員には数えないが、営業はする） */
export function founderOutput(industry: IndustryData, variant: IndustryVariant): number {
  const revenueRole = industry.roles.find((r) => r.kind === 'revenue');
  if (!revenueRole) return 0;
  return coef('performance.founder_revenue_fte') * nominalOutputPerRevenueStaff(industry, variant, revenueRole.id);
}

/** 店舗のある業種で、社長が店長を兼ねられる店舗の数 */
const FOUNDER_STORES = 1;

/** 事務と管理が何人分必要か。店舗のある業種では、管理＝店舗ごとの店長（社長が1店舗を見る） */
export function supportRequirement(
  industry: IndustryData,
  revenueStaffFte: number,
  headcount: number,
  /** 組織の形による、管理職1人が見る人数の倍率（§14.4） */
  spanMult = 1,
): { admin: number; management: number } {
  const span = industry.managementSpan.value * spanMult;
  return {
    admin: Math.max(
      0,
      revenueStaffFte * industry.adminPerRevenueStaff.value - coef('performance.founder_admin_allowance'),
    ),
    management: industry.store
      ? Math.max(0, storeCount(industry, headcount) - FOUNDER_STORES)
      : Math.max(0, (headcount - span) / span),
  };
}

/** 支えが届いていない人の割合に応じて効率を下げる（1.0＝全員に届いている） */
function coverageFactor(covered: number, total: number, penalty: number): number {
  if (total <= 0) return 1;
  const uncoveredShare = clamp((total - covered) / total, 0, 1);
  return 1 - penalty * uncoveredShare;
}

/** 会社全体の「売れる上限」を計算する */
export function computePerformance(
  employees: readonly Employee[],
  industry: IndustryData,
  variant: IndustryVariant,
  policies: PolicySet = defaultPolicies,
  /** 組織の形の効き目（§14.4）：管理職1人が見る人数の倍率と、調整の手間・改編の混乱で残る割合 */
  org: { spanMult: number; capacityMult: number } = { spanMult: 1, capacityMult: 1 },
  /** その月に効いている制度と会社の相性（§14.8）。省略すると効かない */
  fits?: ActiveFits,
): PerformanceResult {
  const incentive = incentiveStrength(policies, employees.length, industry);
  const newcomerMonths = coef('policy.workStyle.newcomer_months');
  const newcomers = employees.filter((e) => e.tenureMonths < newcomerMonths).length;
  const cohesion = cohesionFactor(policies, employees.length > 0 ? newcomers / employees.length : 0);
  const kinds = roleKindMap(industry);
  const useRamp = hasFitEffect(fits, 'rampMult');
  let revenueOutput = 0;
  let overtimeEligible = 0;
  let revenueStaffFte = 0;
  let adminWork = 0;
  let managementWork = 0;
  let managementFte = 0;

  for (const e of employees) {
    const kind = kinds.get(e.role);
    const rampMult = useRamp ? employeeFitEffects(e, fits, employees).rampMult : 1;
    const work = effectiveWork(e, policies, incentive, industry, rampMult) * cohesion;
    if (kind === 'revenue') {
      const out = work * nominalOutputPerRevenueStaff(industry, variant, e.role);
      revenueOutput += out;
      revenueStaffFte += fte(e);
      if (e.employmentType !== 'part') overtimeEligible += out;
    } else if (kind === 'admin') {
      adminWork += work;
    } else if (kind === 'management') {
      managementWork += work;
      managementFte += fte(e);
    }
  }

  // 事務：社長と事務が支えられる「売上を生む社員」の人数
  const adminCovered =
    (adminWork + coef('performance.founder_admin_allowance')) / industry.adminPerRevenueStaff.value;
  const adminFactor = coverageFactor(adminCovered, revenueStaffFte, coef('performance.admin_gap_penalty'));
  // 管理：社長と管理職が見られる社員の人数。店舗のある業種では、店長のいる店舗の割合
  const stores = storeCount(industry, employees.length);
  const storesWithoutManager = Math.max(0, stores - FOUNDER_STORES - managementFte);
  const managementFactor = industry.store
    ? coverageFactor(FOUNDER_STORES + managementWork, stores, coef('performance.management_gap_penalty'))
    : coverageFactor(
        industry.managementSpan.value * org.spanMult * (1 + managementWork),
        employees.length,
        coef('performance.management_gap_penalty'),
      );
  const support = adminFactor * managementFactor * org.capacityMult;

  return {
    capacity: (revenueOutput + founderOutput(industry, variant)) * support,
    adminFactor,
    managementFactor,
    overtimeEligibleOutput: overtimeEligible * support,
    stores,
    storesWithoutManager,
    managementFte,
  };
}

/**
 * その月に会社が使う残業の上限（§14.5。ステップ18）。
 * ふだんは方針の上限の半分まで。繁忙（需要が急に増えた月・人手が急に減った月）だけ方針の上限まで使う。
 * 特別条項（月45時間超）は、その年度で45時間を超えた月がすでに上限の月数に達していれば、45時間までにする
 */
export function overtimeCeiling(input: {
  cap: number;
  busy: boolean;
  /** その年度で、もう月45時間を超えた月の数 */
  over45MonthsThisYear: number;
}): number {
  const limit = coef('law.overtime.limit_hours');
  let ceiling = input.busy ? input.cap : input.cap * coef('overtime.normal_share');
  if (ceiling > limit && input.over45MonthsThisYear >= coef('law.overtime.special_max_months')) ceiling = limit;
  return ceiling;
}

/**
 * 繁忙の月か：今月の需要が直近の平均より一定以上多い（需要が増えた）、
 * または今月の売れる上限（残業なし）が直近の平均より一定以上少ない（退職や休職で人手が減った）
 */
export function isBusyMonth(
  recent: readonly { demand: number; capacity: number }[],
  demand: number,
  capacity: number,
): boolean {
  if (recent.length === 0) return false;
  const avgDemand = recent.reduce((s, r) => s + r.demand, 0) / recent.length;
  const avgCapacity = recent.reduce((s, r) => s + r.capacity, 0) / recent.length;
  return (
    demand > avgDemand * (1 + coef('overtime.surge_threshold')) ||
    capacity < avgCapacity * (1 - coef('overtime.capacity_drop_threshold'))
  );
}

/** 残業の方針ごとの月の上限（時間） */
export function overtimeCap(policy: OvertimePolicy): number {
  return coefPath('policy', 'overtime', 'cap', policy);
}

/**
 * 店長の負荷（店舗のある業種）：店長のいない店舗を、いまの店長が分担して見る残業時間（方針の上限まで）。
 * 店長1人あたり「店舗1つぶん＝所定労働時間」の仕事が増えるとみなす
 */
export function managerOvertimeHours(perf: Pick<PerformanceResult, 'storesWithoutManager' | 'managementFte'>, capHours: number): number {
  if (perf.storesWithoutManager <= 0 || perf.managementFte <= 0) return 0;
  return Math.min(capHours, (perf.storesWithoutManager / perf.managementFte) * coef('labor.scheduled_hours_monthly'));
}

/** 需要が上限を超えたぶんを埋めるのに必要な残業時間（方針の上限まで）と、それで増える売上の上限 */
export function computeOvertime(
  demand: number,
  perf: PerformanceResult,
  capHours: number,
): { hours: number; extraCapacity: number } {
  const shortage = demand - perf.capacity;
  if (shortage <= 0 || perf.overtimeEligibleOutput <= 0) return { hours: 0, extraCapacity: 0 };
  const scheduled = coef('labor.scheduled_hours_monthly');
  const hours = Math.min(
    capHours,
    (shortage / perf.overtimeEligibleOutput) * scheduled,
  );
  return { hours, extraCapacity: perf.overtimeEligibleOutput * (hours / scheduled) };
}
