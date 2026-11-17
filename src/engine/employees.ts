/**
 * 社員の生成（§4.2）。
 */
import { coef } from './coefficients';
import { names } from './data';
import type { Rng } from './rng';
import type {
  Affiliation,
  Employee,
  EmploymentType,
  Gender,
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

export function sampleAge(rng: Rng, ageShift: number): number {
  const age = Math.round(rng.normal(coef('generation.age.mean') + ageShift, coef('generation.age.sd')));
  return clamp(age, coef('generation.age.min'), coef('generation.age.max'));
}

/** 最低賃金を月給に直した額（フルタイム） */
export function minimumMonthlyWage(location: LocationData): number {
  return location.minimumWageHourly.value * coef('labor.scheduled_hours_monthly');
}

export type SalaryInput = {
  rng: Rng;
  industry: IndustryData;
  location: LocationData;
  role: RoleId;
  age: number;
  employmentType: EmploymentType;
  affiliation: Affiliation;
};

/** 入社時の月給。相場×地域差×年齢×ばらつき。最低賃金を下回らない */
export function sampleSalary(input: SalaryInput): number {
  const { rng, industry, location, role, age, employmentType, affiliation } = input;
  const unit = coef('generation.salary.rounding_unit');

  if (employmentType === 'part') {
    const hourly = location.minimumWageHourly.value * coef('labor.parttime_wage_premium');
    return Math.ceil((hourly * coef('labor.parttime_hours_monthly')) / unit) * unit;
  }

  const roleData = industry.roles.find((r) => r.id === role);
  if (!roleData) throw new Error(`職種がありません: ${industry.id}/${role}`);
  const ageFactor = 1 + coef('generation.salary.age_slope') * (age - coef('generation.age.min'));
  const noise = Math.max(
    coef('generation.salary.noise_floor'),
    rng.normal(1, coef('generation.salary.noise_sd')),
  );
  const premium = affiliation === 'secondee' ? coef('generation.secondee.salary_premium') : 1;
  const raw = roleData.marketSalaryMonthly.value * location.wageIndex.value * ageFactor * noise * premium;
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
  ageShift?: number;
  tenureMonths?: number;
  engagementBonus?: number;
  isKeyPerson?: boolean;
};

export function createEmployee(input: CreateEmployeeInput): Employee {
  const { rng } = input;
  const gender = sampleGender(rng);
  const name = sampleName(rng, gender);
  const age = sampleAge(rng, input.ageShift ?? 0);
  const ability = clamp(
    rng.normal(coef('generation.ability.mean'), coef('generation.ability.sd')),
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
    grade: 0,
    salaryMonthly,
    ability,
    // 評価制度はステップ5で入る。それまでは実力がそのまま見えるものとする
    perceivedPerformance: ability,
    engagement,
    values,
    tenureMonths: input.tenureMonths ?? 0,
    overtimeHours: 0,
    isKeyPerson: input.isKeyPerson ?? false,
  };
}
