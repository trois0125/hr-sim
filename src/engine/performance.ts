/**
 * 社員ごとの稼働と成果（§2.1 の3）。
 *
 * - 売上を生む職種（商社なら営業）が売上の「売れる上限」をつくる
 * - 事務が足りないと、売上を生む社員の稼働が下がる
 * - 管理が足りないと、全体の効率が下がる（社長が見られる人数まではかからない）
 * - 需要が上限を超えたぶんは、売上を生むフルタイム社員の残業で埋める
 */
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

/** 経験（年齢）による生産性（基準の年齢で1.0）。賃金カーブより緩やかに伸びる */
export function experienceFactor(age: number): number {
  const k = K();
  return Math.pow(ageSalaryFactor(age) / ageSalaryFactor(k.expRefAge), k.expElasticity);
}

/** 稼働の量（フルタイム＝1.0） */
export function fte(e: Employee): number {
  if (e.employmentType === 'part') return K().partHours / K().scheduledHours;
  return 1;
}

/** 時間あたりの生産性（パートは任される仕事の範囲が狭い） */
export function hourlyProductivity(e: Employee): number {
  return e.employmentType === 'part' ? K().partProductivity : 1;
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
export function effectiveWork(e: Employee, policies: PolicySet = defaultPolicies, incentive = 0): number {
  const ramp = rampParams(e, policies);
  const motivation = 1 + incentive * (SCORE_MID / SCORE_MAX + e.values.money);
  return (
    motivation *
    experienceFactor(e.age) *
    fte(e) *
    hourlyProductivity(e) *
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
};

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

/** 事務と管理が何人分必要か */
export function supportRequirement(
  industry: IndustryData,
  revenueStaffFte: number,
  headcount: number,
): { admin: number; management: number } {
  const span = industry.managementSpan.value;
  return {
    admin: Math.max(
      0,
      revenueStaffFte * industry.adminPerRevenueStaff.value - coef('performance.founder_admin_allowance'),
    ),
    management: Math.max(0, (headcount - span) / span),
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
): PerformanceResult {
  const incentive = incentiveStrength(policies, employees.length, industry);
  const newcomerMonths = coef('policy.workStyle.newcomer_months');
  const newcomers = employees.filter((e) => e.tenureMonths < newcomerMonths).length;
  const cohesion = cohesionFactor(policies, employees.length > 0 ? newcomers / employees.length : 0);
  const kinds = roleKindMap(industry);
  let revenueOutput = 0;
  let overtimeEligible = 0;
  let revenueStaffFte = 0;
  let adminWork = 0;
  let managementWork = 0;

  for (const e of employees) {
    const kind = kinds.get(e.role);
    const work = effectiveWork(e, policies, incentive) * cohesion;
    if (kind === 'revenue') {
      const out = work * nominalOutputPerRevenueStaff(industry, variant, e.role);
      revenueOutput += out;
      revenueStaffFte += fte(e);
      if (e.employmentType !== 'part') overtimeEligible += out;
    } else if (kind === 'admin') {
      adminWork += work;
    } else if (kind === 'management') {
      managementWork += work;
    }
  }

  // 事務：社長と事務が支えられる「売上を生む社員」の人数
  const adminCovered =
    (adminWork + coef('performance.founder_admin_allowance')) / industry.adminPerRevenueStaff.value;
  const adminFactor = coverageFactor(adminCovered, revenueStaffFte, coef('performance.admin_gap_penalty'));
  // 管理：社長と管理職が見られる社員の人数
  const managed = industry.managementSpan.value * (1 + managementWork);
  const managementFactor = coverageFactor(
    managed,
    employees.length,
    coef('performance.management_gap_penalty'),
  );
  const support = adminFactor * managementFactor;

  return {
    capacity: (revenueOutput + founderOutput(industry, variant)) * support,
    adminFactor,
    managementFactor,
    overtimeEligibleOutput: overtimeEligible * support,
  };
}

/** 残業の方針ごとの月の上限（時間） */
export function overtimeCap(policy: OvertimePolicy): number {
  return coefPath('policy', 'overtime', 'cap', policy);
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
