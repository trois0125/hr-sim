/**
 * 評価・等級・昇給・賞与（§2.1 の7）。年に1回（決算月）行う。
 *
 * - 評価：本当の実力に、評価制度と等級制度で決まる「ずれ」が乗ったものが、評価で見える成果になる
 * - 等級：制度があれば評価と勤続から決める（昇格の見込み＝成長の機会に効く）
 * - 昇給：給与の決め方で変わる（年功・成果連動・相場連動）
 * - 賞与：賞与の制度で変わる（なし・一律・業績連動・個人成果連動）。決めた額を翌年の毎月に割り振る
 */
import { coef } from './coefficients';
import { percentiles } from './engagement';
import { SCORE_MAX, SCORE_MIN, ageSalaryFactor, clamp, marketSalaryFor, minimumMonthlyWage } from './employees';
import { annualAbilityGain, bonusMonthlyFor, evaluationNoise, policyEffect } from './policies';
import type { Rng } from './rng';
import type { Employee, IndustryData, LocationData, PolicySet } from './types';
import { MONTHS_PER_YEAR } from './types';

/** 評価の中央（順位の真ん中） */
const MIDDLE = 0.5;

export type EvaluationContext = {
  rng: Rng;
  policies: PolicySet;
  industry: IndustryData;
  location: LocationData;
  /** 前年の営業利益の合計 */
  lastYearProfit: number;
};

/** 評価で見える成果をつける（社員を書き換える）。乱数は社員1人につき1回 */
export function evaluate(employees: Employee[], ctx: Pick<EvaluationContext, 'rng' | 'policies' | 'industry'>): void {
  const noise = evaluationNoise(ctx.policies, employees.length, ctx.industry);
  for (const e of employees) {
    e.perceivedPerformance = clamp(e.ability + ctx.rng.normal(0, noise), SCORE_MIN, SCORE_MAX);
  }
}

/** 評価の順位（0〜1）を社員IDごとに返す。同じ職種のフルタイムの中で比べる */
export function evaluationPercentiles(employees: readonly Employee[]): Map<string, number> {
  const out = new Map<string, number>();
  const byRole = new Map<string, Employee[]>();
  for (const e of employees) {
    if (e.employmentType === 'part') {
      out.set(e.id, MIDDLE);
      continue;
    }
    byRole.set(e.role, [...(byRole.get(e.role) ?? []), e]);
  }
  for (const group of byRole.values()) {
    const p = percentiles(group.map((e) => e.perceivedPerformance));
    group.forEach((e, i) => out.set(e.id, p[i] ?? MIDDLE));
  }
  return out;
}

/** 等級をつける（社員を書き換える）。制度がなければ0 */
export function assignGrades(employees: Employee[], policies: PolicySet, pct: Map<string, number>): void {
  const max = coef('policy.grade.max_grade');
  for (const e of employees) {
    if (policies.grade === 'none' || e.employmentType === 'part') {
      e.grade = 0;
      continue;
    }
    const p = pct.get(e.id) ?? MIDDLE;
    const years = e.tenureMonths / MONTHS_PER_YEAR;
    let grade: number;
    if (policies.grade === 'skill') {
      // 職能等級：勤続で上がりやすい（年功化しやすい）
      grade = 1 + Math.floor(years / coef('policy.grade.years_per_grade')) + (p > MIDDLE ? 1 : 0);
    } else {
      // 職務・役割等級：評価の順位で決まる（役割等級は主要人物を一段上に）
      grade = 1 + Math.floor(p * (max - 1)) + (policies.grade === 'role' && e.isKeyPerson ? 1 : 0);
    }
    e.grade = clamp(grade, 1, max);
  }
}

/** 昇給後の月給（給与の決め方ごと）。age は昇給の時点の年齢（誕生日を迎える前） */
export function raisedSalary(
  e: Employee,
  policies: PolicySet,
  percentile: number,
  market: number,
): number {
  const ageCurve = ageSalaryFactor(e.age + 1) / ageSalaryFactor(e.age);
  switch (policies.pay) {
    case 'seniority':
      return e.salaryMonthly * ageCurve * (1 + coef('policy.pay.seniority.extra_raise'));
    case 'performance': {
      const flex = policyEffect('grade', policies.grade, 'raise_flex');
      // 年齢カーブ（相場の伸び）を基準に、評価の順位で上下させる。評価の低い人は降給もある
      const rate = Math.max(
        coef('policy.pay.performance.min_raise'),
        ageCurve * (1 + coef('policy.pay.performance.base_raise')) -
          1 +
          coef('policy.pay.performance.spread') * flex * (percentile - MIDDLE),
      );
      return e.salaryMonthly * (1 + rate);
    }
    case 'market':
      return e.salaryMonthly + coef('policy.pay.market.convergence') * (market - e.salaryMonthly);
  }
}

/** 年1回の昇給（社員を書き換える）。年齢を上げる前に呼ぶ */
export function applyRaises(
  employees: Employee[],
  ctx: Pick<EvaluationContext, 'policies' | 'industry' | 'location'>,
  pct: Map<string, number>,
): void {
  const unit = coef('generation.salary.rounding_unit');
  for (const e of employees) {
    if (e.salaryTransition) continue; // 激変緩和で下げている途中は昇給しない
    const market = marketSalaryFor(ctx.industry, ctx.location, e.role, e.age + 1, e.employmentType);
    if (e.employmentType === 'part') {
      e.salaryMonthly = Math.max(e.salaryMonthly, market); // パートは最低賃金に連動
      continue;
    }
    if (e.affiliation === 'secondee') {
      // 出向者の給与は親会社の制度で決まる（年齢カーブに沿って上がる）
      e.salaryMonthly *= ageSalaryFactor(e.age + 1) / ageSalaryFactor(e.age);
    } else {
      e.salaryMonthly = raisedSalary(e, ctx.policies, pct.get(e.id) ?? MIDDLE, market);
    }
    e.salaryMonthly = Math.max(Math.round(e.salaryMonthly / unit) * unit, minimumMonthlyWage(ctx.location));
  }
}

/** 翌年の賞与（月割り）を決める（社員を書き換える） */
export function assignBonuses(
  employees: Employee[],
  ctx: Pick<EvaluationContext, 'policies' | 'lastYearProfit' | 'industry'>,
  pct: Map<string, number>,
): void {
  const totalSalaries = employees
    .filter((e) => e.employmentType !== 'part')
    .reduce((s, e) => s + e.salaryMonthly, 0);
  for (const e of employees) {
    e.bonusMonthly = bonusMonthlyFor(e, {
      policies: ctx.policies,
      marketBonusMonths: ctx.industry.marketBonusMonths.value,
      percentile: pct.get(e.id) ?? MIDDLE,
      lastYearProfit: ctx.lastYearProfit,
      totalSalaries,
    });
  }
}

/** 年1回の評価から賞与まで（社員を書き換える） */
export function runAnnualReview(employees: Employee[], ctx: EvaluationContext): void {
  evaluate(employees, ctx);
  const pct = evaluationPercentiles(employees);
  assignGrades(employees, ctx.policies, pct);
  applyRaises(employees, ctx, pct);
  assignBonuses(employees, ctx, pct);
}

/** 毎月の実力の伸び（社員を書き換える） */
export function growAbility(employees: Employee[], policies: PolicySet): void {
  for (const e of employees) {
    e.ability = clamp(e.ability + annualAbilityGain(e, policies) / MONTHS_PER_YEAR, SCORE_MIN, SCORE_MAX);
  }
}

/** 激変緩和で給与を1か月ぶん下げる（社員を書き換える） */
export function stepSalaryTransitions(employees: Employee[]): void {
  for (const e of employees) {
    const t = e.salaryTransition;
    if (!t) continue;
    e.salaryMonthly = Math.max(t.target, e.salaryMonthly - t.stepPerMonth);
    if (e.salaryMonthly <= t.target) e.salaryTransition = null;
  }
}
