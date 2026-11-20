/**
 * 社員の生成（§4.2）。
 */
import { coef, coefGroup } from './coefficients';
import { names } from './data';
import type { Rng } from './rng';
import type {
  Affiliation,
  Employee,
  EmploymentType,
  Gender,
  HireChannel,
  IndustryData,
  LocationData,
  RoleId,
  Values,
} from './types';

/** 能力・納得感の尺度（§4.2 の定義：0〜100） */
export const SCORE_MIN = 0;
export const SCORE_MAX = 100;

export const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** 価値観4つの配分をディリクレ分布で抽選する（合計1.0） */
export function sampleValues(rng: Rng): Values {
  const alpha = coef('generation.values.alpha');
  const g = {
    growth: rng.gamma(alpha),
    stability: rng.gamma(alpha),
    money: rng.gamma(alpha),
    balance: rng.gamma(alpha),
  };
  const total = g.growth + g.stability + g.money + g.balance;
  return {
    growth: g.growth / total,
    stability: g.stability / total,
    money: g.money / total,
    balance: g.balance / total,
  };
}

export function sampleGender(rng: Rng): Gender {
  const f = coef('generation.gender.female_share');
  const x = coef('generation.gender.x_share');
  return rng.weightedPick<Gender>(['M', 'F', 'X'], [1 - f - x, f, x]);
}

export function sampleName(rng: Rng, gender: Gender): string {
  return `${rng.pick(names.surnames)} ${rng.pick(names.givenNames[gender])}`;
}

/** 年齢を抽選する。平均は業種の ageMean（なければ係数台帳）＋創業パターンの上乗せ */
export function sampleAge(rng: Rng, ageShift: number, industry?: Pick<IndustryData, 'ageMean'>): number {
  const mean = industry?.ageMean?.value ?? coef('generation.age.mean');
  const age = Math.round(rng.normal(mean + ageShift, coef('generation.age.sd')));
  return clamp(age, coef('generation.age.min'), coef('generation.age.max'));
}

/** 最低賃金を月給に直した額（フルタイム） */
export function minimumMonthlyWage(location: LocationData): number {
  return location.minimumWageHourly.value * SALARY().scheduledHours;
}

const SALARY = coefGroup({
  scheduledHours: 'labor.scheduled_hours_monthly',
  ageMin: 'generation.age.min',
  ageMax: 'generation.age.max',
  ageSlope: 'generation.salary.age_slope',
  agePeak: 'generation.salary.age_peak',
  post60Age: 'generation.salary.post60_age',
  post60Ratio: 'generation.salary.post60_ratio',
  partPremium: 'labor.parttime_wage_premium',
  partHours: 'labor.parttime_hours_monthly',
});

export type SalaryInput = {
  rng: Rng;
  industry: IndustryData;
  location: LocationData;
  role: RoleId;
  age: number;
  employmentType: EmploymentType;
  affiliation: Affiliation;
};

/**
 * 年齢による賃金カーブ（年齢の下限で1.0）。業種に salaryCurve があればその形（傾き・頭打ちの年齢・60歳以降の比）、
 * なければ係数台帳の共通の形（賃金構造基本統計調査の卸売業に合わせたもの）
 */
export function ageSalaryFactor(age: number, industry?: Pick<IndustryData, 'salaryCurve'>): number {
  const k = SALARY();
  const c = industry?.salaryCurve;
  const slope = c ? c.ageSlope.value : k.ageSlope;
  const peak = c ? c.agePeak.value : k.agePeak;
  const post60 = c ? c.post60Ratio.value : k.post60Ratio;
  // 頭打ちの年齢より上は伸びず、60歳以降（定年後の継続雇用）は下がる
  const a = clamp(age, k.ageMin, peak);
  const curve = 1 + slope * (a - k.ageMin);
  return age >= k.post60Age ? curve * post60 : curve;
}

/** 相場の月給（職種×地域差×年齢）。パートは最低賃金の少し上の時給×時間。最低賃金を下回らない */
export function marketSalaryFor(
  industry: IndustryData,
  location: LocationData,
  role: RoleId,
  age: number,
  employmentType: EmploymentType,
): number {
  if (employmentType === 'part') {
    const k = SALARY();
    return location.minimumWageHourly.value * k.partPremium * k.partHours;
  }
  const roleData = industry.roles.find((r) => r.id === role);
  if (!roleData) throw new Error(`職種がありません: ${industry.id}/${role}`);
  return Math.max(
    roleData.marketSalaryMonthly.value * location.wageIndex.value * ageSalaryFactor(age, industry),
    minimumMonthlyWage(location),
  );
}

/** 入社時の月給。相場×ばらつき（出向者は親会社の水準）。最低賃金を下回らない */
export function sampleSalary(input: SalaryInput): number {
  const { rng, industry, location, role, age, employmentType, affiliation } = input;
  const unit = coef('generation.salary.rounding_unit');
  const market = marketSalaryFor(industry, location, role, age, employmentType);
  if (employmentType === 'part') return Math.ceil(market / unit) * unit;

  const noise = Math.max(
    coef('generation.salary.noise_floor'),
    rng.normal(1, coef('generation.salary.noise_sd')),
  );
  const premium = affiliation === 'secondee' ? coef('generation.secondee.salary_premium') : 1;
  const raw = market * noise * premium;
  const floor = minimumMonthlyWage(location);
  return Math.ceil(Math.max(raw, floor) / unit) * unit;
}

export type CreateEmployeeInput = {
  rng: Rng;
  id: string;
  industry: IndustryData;
  location: LocationData;
  role: RoleId;
  employmentType: EmploymentType;
  affiliation: Affiliation;
  /** 入社の経路（省略すると創業時からいる人） */
  hireChannel?: HireChannel;
  ageShift?: number;
  /** 年齢を指定の平均と標準偏差で抽選する（新卒など）。省略すると全体の年齢分布 */
  age?: { mean: number; sd: number };
  /** 入社時の実力の上乗せ（新卒はマイナス） */
  abilityOffset?: number;
  tenureMonths?: number;
  engagementBonus?: number;
  isKeyPerson?: boolean;
};

export function createEmployee(input: CreateEmployeeInput): Employee {
  const { rng } = input;
  const gender = sampleGender(rng);
  const name = sampleName(rng, gender);
  const age = input.age
    ? clamp(Math.round(rng.normal(input.age.mean, input.age.sd)), coef('generation.age.min'), coef('generation.age.max'))
    : sampleAge(rng, input.ageShift ?? 0, input.industry);
  const ability = clamp(
    rng.normal(coef('generation.ability.mean') + (input.abilityOffset ?? 0), coef('generation.ability.sd')),
    SCORE_MIN,
    SCORE_MAX,
  );
  const engagement = clamp(
    rng.normal(coef('generation.engagement.mean'), coef('generation.engagement.sd')) +
      (input.engagementBonus ?? 0),
    SCORE_MIN,
    SCORE_MAX,
  );
  const values = sampleValues(rng);
  const salaryMonthly = sampleSalary({
    rng,
    industry: input.industry,
    location: input.location,
    role: input.role,
    age,
    employmentType: input.employmentType,
    affiliation: input.affiliation,
  });

  return {
    id: input.id,
    name,
    age,
    gender,
    role: input.role,
    employmentType: input.employmentType,
    affiliation: input.affiliation,
    hireChannel: input.hireChannel ?? 'founding',
    grade: 0,
    salaryMonthly,
    bonusMonthly: 0,
    salaryTransition: null,
    ability,
    // 最初の評価（決算月）までは、実力がそのまま見えるものとする
    perceivedPerformance: ability,
    engagement,
    values,
    tenureMonths: input.tenureMonths ?? 0,
    overtimeHours: 0,
    isKeyPerson: input.isKeyPerson ?? false,
    factorScores: null,
    secondmentEndsAt: null,
    leave: null,
  };
}
