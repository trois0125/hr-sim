/**
 * 制度と会社の相性（DESIGN.md §14.8。ステップ21）。
 * その月の会社の状態から「効いている相性」を求め、当てはまる社員と会社への効き目を返す。乱数は使わない。
 * 効き目の数値は src/data/fits.json、目安は係数台帳 fit.*。
 */
import { coef } from './coefficients';
import { getIndustry, getLocation } from './data';
import { fitDefs } from './fitData';
import type {
  CompanyState,
  Employee,
  EngagementFactor,
  FitDef,
  FoundingPatternId,
  IndustryData,
  LocationType,
  OrgForm,
  PolicySet,
} from './types';
import { MONTHS_PER_YEAR } from './types';

/** 相性を決める会社の状態 */
export type FitCompany = {
  policies: PolicySet;
  industry: IndustryData;
  locationType: LocationType;
  foundingPatternId: FoundingPatternId;
  orgForm: OrgForm;
  headcount: number;
  /** 直近12か月に赤字の月がある */
  recentLoss: boolean;
  /** 出向者がいる */
  hasSecondees: boolean;
};

export type ActiveFits = {
  company: FitCompany;
  fits: FitDef[];
  /**
   * 1か月のあいだの計算の使い回し（fitsFor が作る）。社員の条件（職種・雇用形態・入社経路・勤続・所属）は
   * 月の途中で変わらないので、社員ごとの効き目は1か月に1回求めればよい
   */
  memo?: { effects: Map<string, EmployeeFitEffects>; pool?: Employee[] };
};

/** 効いている相性に、その種類の効き目を持つものがあるか（なければ差し込み口で計算を省く） */
export function hasFitEffect(f: ActiveFits | undefined, key: keyof FitDef['effects']): f is ActiveFits {
  return !!f && f.fits.some((x) => !x.explainOnly && x.effects[key] !== undefined);
}

export function fitCompanyOf(state: CompanyState): FitCompany {
  const recent = state.history.slice(-MONTHS_PER_YEAR);
  return {
    policies: state.policies,
    industry: getIndustry(state.profile.industryId),
    locationType: getLocation(state.profile.locationId).type,
    foundingPatternId: state.profile.foundingPatternId,
    orgForm: state.organization.form,
    headcount: state.employees.length,
    recentLoss: recent.some((r) => r.operatingProfit < 0),
    hasSecondees: state.employees.some((e) => e.affiliation === 'secondee'),
  };
}

function policiesMatch(fit: FitDef, policies: PolicySet): boolean {
  const groups = fit.when.policiesAny;
  if (!groups || groups.length === 0) return true;
  return groups.some((g) =>
    Object.entries(g).every(([cat, opts]) => (opts as string[]).includes(policies[cat as keyof PolicySet] as string)),
  );
}

/** 会社の条件（when）に合う相性。説明だけの相性も入る */
export function activeFits(c: FitCompany): FitDef[] {
  return fitDefs.filter((f) => {
    const w = f.when;
    if (!policiesMatch(f, c.policies)) return false;
    if (w.industryTraits && !w.industryTraits.every((t) => c.industry.traits?.includes(t))) return false;
    if (w.cyclicalityAtLeast && c.industry.cyclicality.value < coef(w.cyclicalityAtLeast)) return false;
    if (w.headcountBelow && !(c.headcount < coef(w.headcountBelow))) return false;
    if (w.headcountAboveSpan && !(c.headcount > c.industry.managementSpan.value)) return false;
    if (w.locationType && c.locationType !== w.locationType) return false;
    if (w.foundingPatterns && !w.foundingPatterns.includes(c.foundingPatternId)) return false;
    if (w.orgForms && !w.orgForms.includes(c.orgForm)) return false;
    if (w.recentLoss !== undefined && c.recentLoss !== w.recentLoss) return false;
    if (w.hasSecondees !== undefined && c.hasSecondees !== w.hasSecondees) return false;
    return true;
  });
}

/** 制度の選択肢ごとの効き目の強さ（書いていなければ1） */
export function fitScale(fit: FitDef, policies: PolicySet): number {
  if (!fit.scale) return 1;
  return fit.scale.byOption[policies[fit.scale.category] as string] ?? 1;
}

/** その社員に相性が当てはまるか（会社の条件は activeFits で見たあと） */
export function fitApplies(fit: FitDef, e: Employee, c: FitCompany, employees: readonly Employee[]): boolean {
  const w = fit.who;
  if (!w) return true;
  if (w.roleTraits) {
    const traits = c.industry.roles.find((r) => r.id === e.role)?.traits ?? [];
    const byTrait = w.roleTraits.some((t) => traits.includes(t));
    if (!byTrait && !(w.orPartTime && e.employmentType === 'part')) return false;
  }
  if (w.employmentTypes && !w.employmentTypes.includes(e.employmentType)) return false;
  if (w.hireChannels && !w.hireChannels.includes(e.hireChannel)) return false;
  if (w.maxTenureMonths !== undefined && !(e.tenureMonths < w.maxTenureMonths)) return false;
  if (w.affiliation && e.affiliation !== w.affiliation) return false;
  if (w.sameRoleHasSecondee && !secondeeRolesOf(employees).has(e.role)) return false;
  return true;
}

/** 出向者のいる職種 */
function secondeeRolesOf(employees: readonly Employee[]): Set<string> {
  return new Set(employees.filter((x) => x.affiliation === 'secondee').map((x) => x.role));
}

export function fitsFor(state: CompanyState): ActiveFits {
  const company = fitCompanyOf(state);
  return { company, fits: activeFits(company), memo: { effects: new Map() } };
}

/** 倍率を強さで弱める（強さ0なら1） */
const scaled = (mult: number, s: number) => 1 + (mult - 1) * s;

export type EmployeeFitEffects = {
  /** 納得感の要因に足す点数 */
  factors: Partial<Record<EngagementFactor, number>>;
  evaluationNoiseMult: number;
  rampMult: number;
  abilityGainMult: number;
  attritionMult: number;
};

/** その社員への効き目（f がなければ中立） */
export function employeeFitEffects(e: Employee, f: ActiveFits | undefined, employees: readonly Employee[]): EmployeeFitEffects {
  const out: EmployeeFitEffects = { factors: {}, evaluationNoiseMult: 1, rampMult: 1, abilityGainMult: 1, attritionMult: 1 };
  if (!f || f.fits.length === 0) return out;
  const cached = f.memo?.effects.get(e.id);
  if (cached) return cached;
  // 出向者のいる職種は1か月に1回だけ数える（社員ごとに数えると人数の2乗の計算になる）
  const pool = f.memo
    ? (f.memo.pool ??= [...secondeeRolesOf(employees)].map((role) => ({ role, affiliation: 'secondee' }) as Employee))
    : employees;
  for (const fit of f.fits) {
    if (fit.explainOnly || !fitApplies(fit, e, f.company, pool)) continue;
    const s = fitScale(fit, f.company.policies);
    const x = fit.effects;
    for (const [k, v] of Object.entries(x.factors ?? {})) {
      const key = k as EngagementFactor;
      out.factors[key] = (out.factors[key] ?? 0) + (v?.value ?? 0) * s;
    }
    if (x.evaluationNoiseMult) out.evaluationNoiseMult *= scaled(x.evaluationNoiseMult.value, s);
    if (x.rampMult) out.rampMult *= scaled(x.rampMult.value, s);
    if (x.abilityGainMult) out.abilityGainMult *= scaled(x.abilityGainMult.value, s);
    if (x.attritionMult) out.attritionMult *= scaled(x.attritionMult.value, s);
  }
  f.memo?.effects.set(e.id, out);
  return out;
}

export type CompanyFitEffects = {
  /** 当てはまる社員の人数に応じた費用（円/月） */
  costPerMonth: number;
  premiumOvertimeMult: number;
  hiringDifficultyMult: number;
  gradeCostMult: number;
  cancelGrowthBonus: boolean;
};

/** 会社全体への効き目（f がなければ中立） */
export function companyFitEffects(f: ActiveFits | undefined, employees: readonly Employee[]): CompanyFitEffects {
  const out: CompanyFitEffects = { costPerMonth: 0, premiumOvertimeMult: 1, hiringDifficultyMult: 1, gradeCostMult: 1, cancelGrowthBonus: false };
  if (!f) return out;
  for (const fit of f.fits) {
    if (fit.explainOnly) continue;
    const s = fitScale(fit, f.company.policies);
    const x = fit.effects;
    if (x.costPerEmployee) {
      const n = employees.filter((e) => fitApplies(fit, e, f.company, employees)).length;
      out.costPerMonth += x.costPerEmployee.value * s * n;
    }
    if (x.premiumOvertimeMult) out.premiumOvertimeMult *= scaled(x.premiumOvertimeMult.value, s);
    if (x.hiringDifficultyMult) out.hiringDifficultyMult *= scaled(x.hiringDifficultyMult.value, s);
    if (x.gradeCostMult) out.gradeCostMult *= scaled(x.gradeCostMult.value, s);
    if (x.cancelGrowthBonus) out.cancelGrowthBonus = true;
  }
  return out;
}
