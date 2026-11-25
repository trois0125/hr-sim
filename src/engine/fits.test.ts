import { describe, expect, it } from 'vitest';
import { coefEntry } from './coefficients';
import { getIndustry } from './data';
import { fitDefs, getFit } from './fitData';
import {
  BONUS_POLICIES,
  EVALUATION_SYSTEMS,
  GRADE_SYSTEMS,
  HIRING_POLICIES,
  INDUSTRY_IDS,
  OVERTIME_POLICIES,
  PAY_POLICIES,
  TRAINING_INVESTMENTS,
  WORK_HOUR_SYSTEMS,
  WORK_STYLES,
  type PolicySet,
} from './types';

const OPTIONS: Record<keyof PolicySet, readonly string[]> = {
  grade: GRADE_SYSTEMS,
  evaluation: EVALUATION_SYSTEMS,
  pay: PAY_POLICIES,
  bonus: BONUS_POLICIES,
  hiring: HIRING_POLICIES,
  workHours: WORK_HOUR_SYSTEMS,
  training: TRAINING_INVESTMENTS,
  workStyle: WORK_STYLES,
  overtime: OVERTIME_POLICIES,
};

describe('相性のデータ', () => {
  it('21個あり、番号は1〜21、id は重ならない', () => {
    expect(fitDefs.map((f) => f.no).sort((a, b) => a - b)).toEqual(Array.from({ length: 21 }, (_, i) => i + 1));
    expect(new Set(fitDefs.map((f) => f.id)).size).toBe(21);
    expect(getFit('skill_grade_engineer').no).toBe(6);
  });

  it('どの相性にも根拠があり、効き目の数値には basis と source がある', () => {
    for (const f of fitDefs) {
      expect(f.source.length, f.id).toBeGreaterThan(10);
      const e = f.effects;
      const sourced = [
        ...Object.values(e.factors ?? {}),
        e.evaluationNoiseMult,
        e.rampMult,
        e.abilityGainMult,
        e.attritionMult,
        e.costPerEmployee,
        e.premiumOvertimeMult,
        e.hiringDifficultyMult,
        e.gradeCostMult,
      ].filter((x) => x !== undefined);
      for (const s of sourced) {
        expect(['statistic', 'research', 'assumption'], f.id).toContain(s!.basis);
        expect(s!.source.length, f.id).toBeGreaterThan(5);
      }
    }
  });

  it('説明だけの相性（11・12・21）は効き目を持たない。ほかは効き目を持つ', () => {
    for (const f of fitDefs) {
      const has = Object.keys(f.effects).length > 0;
      expect(has, f.id).toBe(!f.explainOnly);
    }
    expect(fitDefs.filter((f) => f.explainOnly).map((f) => f.no).sort((a, b) => a - b)).toEqual([11, 12, 21]);
  });

  it('良い相性は 4・7・17', () => {
    expect(fitDefs.filter((f) => f.tone === 'good').map((f) => f.no).sort((a, b) => a - b)).toEqual([4, 7, 17]);
  });

  it('制度の選択肢の名前は、どれも実在する', () => {
    for (const f of fitDefs) {
      for (const group of f.when.policiesAny ?? []) {
        for (const [cat, opts] of Object.entries(group)) {
          for (const o of opts as string[]) expect(OPTIONS[cat as keyof PolicySet], `${f.id} ${cat}`).toContain(o);
        }
      }
      if (f.scale) for (const o of Object.keys(f.scale.byOption)) expect(OPTIONS[f.scale.category], f.id).toContain(o);
    }
  });

  it('目安の係数は係数台帳にある', () => {
    for (const f of fitDefs) {
      for (const id of [f.when.cyclicalityAtLeast, f.when.headcountBelow]) if (id) expect(() => coefEntry(id), f.id).not.toThrow();
    }
  });
});

describe('職種と業種の性質の印（§14.8 の表）', () => {
  const traits = (industry: (typeof INDUSTRY_IDS)[number], role: string) =>
    getIndustry(industry).roles.find((r) => r.id === role)?.traits ?? [];

  it('職種の印', () => {
    expect(traits('saas', 'engineer')).toEqual(['marketPriced']);
    expect(traits('restaurant', 'store_staff').sort()).toEqual(['shift', 'synchronous', 'team']);
    expect(traits('restaurant', 'store_manager').sort()).toEqual(['shift', 'storeManager', 'synchronous', 'team']);
    expect(traits('manufacturing', 'production').sort()).toEqual(['skilled', 'synchronous', 'team']);
    expect(traits('manufacturing', 'supervisor').sort()).toEqual(['synchronous', 'team']);
    for (const [i, r] of [['trading', 'admin'], ['restaurant', 'hq'], ['saas', 'corporate'], ['manufacturing', 'office']] as const) {
      expect(traits(i, r)).toEqual(['hardToQuantify']);
    }
    expect(traits('trading', 'sales')).toEqual([]);
    expect(traits('saas', 'biz')).toEqual([]);
  });

  it('業種の印 peaks は飲食と製造だけ', () => {
    for (const id of INDUSTRY_IDS) {
      expect(getIndustry(id).traits?.includes('peaks') ?? false, id).toBe(id === 'restaurant' || id === 'manufacturing');
    }
  });
});

// ---------------------------------------------------------------------------
// 効いている相性と当てはまる社員（Task 2）
// ---------------------------------------------------------------------------

import { coef } from './coefficients';
import { defaultPolicies, getLocation } from './data';
import { createEmployee } from './employees';
import { generateCompany } from './generate';
import { createRng } from './rng';
import { activeFits, companyFitEffects, employeeFitEffects, fitApplies, fitCompanyOf, fitScale, fitsFor, type FitCompany } from './fits';
import type { Employee, IndustryId } from './types';

const tokyo = getLocation('tokyo');
function person(industryId: IndustryId, role: string, opts: Partial<Employee> = {}): Employee {
  const e = createEmployee({
    rng: createRng(7),
    id: `${role}-${Math.round((opts.tenureMonths ?? 0) * 7)}-${opts.employmentType ?? 'full'}-${opts.hireChannel ?? 'f'}-${opts.affiliation ?? 'p'}`,
    industry: getIndustry(industryId),
    location: tokyo,
    role,
    employmentType: opts.employmentType ?? 'full',
    affiliation: opts.affiliation ?? 'proper',
  });
  return { ...e, ...opts };
}
function company(industryId: IndustryId, over: Partial<FitCompany> = {}, policies: Partial<PolicySet> = {}): FitCompany {
  return {
    policies: { ...defaultPolicies, ...policies },
    industry: getIndustry(industryId),
    locationType: 'urban',
    foundingPatternId: 'solo',
    orgForm: 'direct',
    headcount: 50,
    recentLoss: false,
    hasSecondees: false,
    ...over,
  };
}
const ids = (c: FitCompany) => activeFits(c).map((f) => f.id);

describe('効いている相性（会社の条件）', () => {
  it('制度の組のどれかに合えば効く（給与が成果連動か、賞与が個人成果連動）', () => {
    expect(ids(company('restaurant', {}, { pay: 'performance' }))).toContain('individual_pay_team');
    expect(ids(company('restaurant', {}, { bonus: 'individual_linked' }))).toContain('individual_pay_team');
    expect(ids(company('restaurant', {}, { pay: 'market', bonus: 'fixed_months' }))).not.toContain('individual_pay_team');
  });

  it('1つの組の中は全部に合うときだけ（在宅かつ社長評価）', () => {
    expect(ids(company('saas', {}, { workStyle: 'remote', evaluation: 'ceo' }))).toContain('remote_ceo_eval');
    expect(ids(company('saas', {}, { workStyle: 'remote', evaluation: 'mbo' }))).not.toContain('remote_ceo_eval');
    expect(ids(company('saas', {}, { workStyle: 'office', evaluation: 'ceo' }))).not.toContain('remote_ceo_eval');
  });

  it('業種の印と景気の波', () => {
    expect(ids(company('restaurant', {}, { workHours: 'variable' }))).toContain('variable_peaks');
    expect(ids(company('trading', {}, { workHours: 'variable' }))).not.toContain('variable_peaks');
    expect(ids(company('manufacturing', {}, { pay: 'seniority' }))).toContain('seniority_cyclical');
    expect(ids(company('saas', {}, { pay: 'seniority' }))).not.toContain('seniority_cyclical');
  });

  it('社員数は「未満」で判定する（ちょうど目安の人数は小さい会社ではない）', () => {
    const small = coef('fit.small_company_headcount');
    expect(ids(company('trading', { headcount: small - 1 }, { grade: 'role' }))).toContain('grade_small_company');
    expect(ids(company('trading', { headcount: small }, { grade: 'role' }))).not.toContain('grade_small_company');
  });

  it('社長の見られる人数を超えたら', () => {
    const span = getIndustry('trading').managementSpan.value;
    expect(ids(company('trading', { headcount: span + 1 }, { evaluation: 'ceo' }))).toContain('ceo_eval_large');
    expect(ids(company('trading', { headcount: span }, { evaluation: 'ceo' }))).not.toContain('ceo_eval_large');
  });

  it('地方・創業パターン・組織の形・直近の赤字・出向者', () => {
    expect(ids(company('trading', { locationType: 'rural' }, { workStyle: 'hybrid' }))).toContain('remote_rural');
    expect(ids(company('trading', { locationType: 'urban' }, { workStyle: 'hybrid' }))).not.toContain('remote_rural');
    expect(ids(company('trading', { foundingPatternId: 'carveout' }, { pay: 'seniority' }))).toContain('carveout_seniority');
    expect(ids(company('trading', { orgForm: 'matrix' }, { evaluation: 'mbo' }))).toContain('matrix_eval');
    expect(ids(company('trading', { orgForm: 'matrix' }, { evaluation: 'multi_rater' }))).not.toContain('matrix_eval');
    expect(ids(company('trading', { recentLoss: true }, { bonus: 'company_linked' }))).toContain('company_bonus_loss');
    expect(ids(company('trading', { recentLoss: false }, { bonus: 'company_linked' }))).not.toContain('company_bonus_loss');
    expect(ids(company('trading', { hasSecondees: true }))).toContain('secondee_proper_fairness');
    expect(ids(company('trading', { hasSecondees: false }))).not.toContain('secondee_proper_fairness');
  });

  it('効き目の強さ：ハイブリッドは在宅の半分、書いていない選択肢は1', () => {
    const f = getFit('remote_ceo_eval');
    expect(fitScale(f, { ...defaultPolicies, workStyle: 'hybrid' })).toBe(0.5);
    expect(fitScale(f, { ...defaultPolicies, workStyle: 'remote' })).toBe(1);
    expect(fitScale(getFit('individual_pay_team'), defaultPolicies)).toBe(1);
  });
});

describe('当てはまる社員', () => {
  it('職種の印で決まる（SaaS のエンジニアだけ）', () => {
    const c = company('saas', {}, { grade: 'skill' });
    const f = getFit('skill_grade_engineer');
    expect(fitApplies(f, person('saas', 'engineer'), c, [])).toBe(true);
    expect(fitApplies(f, person('saas', 'biz'), c, [])).toBe(false);
  });

  it('印に合わなくてもパートなら当てはまる（360度評価）', () => {
    const c = company('restaurant', {}, { evaluation: 'multi_rater' });
    const f = getFit('multi_rater_shift');
    expect(fitApplies(f, person('restaurant', 'hq', { employmentType: 'part' }), c, [])).toBe(true);
    expect(fitApplies(f, person('restaurant', 'hq'), c, [])).toBe(false);
    expect(fitApplies(f, person('restaurant', 'store_staff'), c, [])).toBe(true);
  });

  it('入社経路と勤続（新卒で入って24か月未満）', () => {
    const c = company('saas', {}, { workStyle: 'remote' });
    const f = getFit('remote_new_grad');
    expect(fitApplies(f, person('saas', 'engineer', { hireChannel: 'new_grad', tenureMonths: 23 }), c, [])).toBe(true);
    expect(fitApplies(f, person('saas', 'engineer', { hireChannel: 'new_grad', tenureMonths: 24 }), c, [])).toBe(false);
    expect(fitApplies(f, person('saas', 'engineer', { hireChannel: 'mid_career', tenureMonths: 3 }), c, [])).toBe(false);
  });

  it('同じ職種に出向者がいるプロパー社員', () => {
    const c = company('trading', { hasSecondees: true });
    const f = getFit('secondee_proper_fairness');
    const sec = person('trading', 'sales', { affiliation: 'secondee' });
    const all = [sec, person('trading', 'sales'), person('trading', 'admin')];
    expect(fitApplies(f, all[1]!, c, all)).toBe(true);
    expect(fitApplies(f, all[2]!, c, all)).toBe(false);
    expect(fitApplies(f, sec, c, all)).toBe(false);
  });
});

describe('効き目のまとめ', () => {
  it('相性がなければ中立', () => {
    const e = person('saas', 'engineer');
    expect(employeeFitEffects(e, undefined, [e])).toEqual({ factors: {}, evaluationNoiseMult: 1, rampMult: 1, abilityGainMult: 1, attritionMult: 1 });
    expect(companyFitEffects(undefined, [e])).toEqual({ costPerMonth: 0, premiumOvertimeMult: 1, hiringDifficultyMult: 1, gradeCostMult: 1, cancelGrowthBonus: false });
  });

  it('同じ要因に効く相性は足し合わせ、倍率は掛け合わせる。強さで弱める', () => {
    const c = company('trading', { hasSecondees: true, orgForm: 'matrix' }, { pay: 'performance', evaluation: 'ceo', workStyle: 'hybrid' });
    const sec = person('trading', 'sales', { affiliation: 'secondee' });
    const e = person('trading', 'sales');
    const all = [sec, e];
    const fx = employeeFitEffects(e, { company: c, fits: activeFits(c) }, all);
    expect(fx.factors.internalFairness).toBeCloseTo(-5); // 19 だけ（営業は team ではないので 1 は付かない）
    expect(fx.factors.evaluation).toBeCloseTo(-8 * 0.5); // 2（ハイブリッドで半分）
    expect(fx.evaluationNoiseMult).toBeCloseTo((1 + 0.3 * 0.5) * 1.25); // 2 と 20
  });

  it('会社の効き目：当てはまる人数に応じた費用と、会社全体の倍率', () => {
    const c = company('restaurant', {}, { workHours: 'flex' });
    const staff = [person('restaurant', 'store_staff'), person('restaurant', 'store_manager'), person('restaurant', 'hq')];
    const fx = companyFitEffects({ company: c, fits: activeFits(c) }, staff);
    expect(fx.costPerMonth).toBe(2 * getFit('flex_synchronous').effects.costPerEmployee!.value);
    const v = company('restaurant', {}, { workHours: 'variable' });
    expect(companyFitEffects({ company: v, fits: activeFits(v) }, staff).premiumOvertimeMult).toBeCloseTo(0.8);
  });

  it('会社の状態から求められる', () => {
    const s = generateCompany({ seed: 3, industryId: 'saas', foundingPatternId: 'subsidiary' });
    const fc = fitCompanyOf(s);
    expect(fc.headcount).toBe(s.employees.length);
    expect(fc.hasSecondees).toBe(s.employees.some((e) => e.affiliation === 'secondee'));
    expect(fitsFor(s).company).toEqual(fc);
  });
});

describe('採用のしにくさ（17：在宅・ハイブリッド × 地方）', () => {
  it('地方で在宅にすると採用のしにくさが下がり、ハイブリッドはその半分。都市では変わらない', () => {
    const e = [person('trading', 'sales')];
    const mult = (over: Partial<FitCompany>, workStyle: PolicySet['workStyle']) => {
      const c = company('trading', over, { workStyle });
      return companyFitEffects({ company: c, fits: activeFits(c) }, e).hiringDifficultyMult;
    };
    expect(mult({ locationType: 'rural' }, 'remote')).toBeCloseTo(0.85);
    expect(mult({ locationType: 'rural' }, 'hybrid')).toBeCloseTo(0.925);
    expect(mult({ locationType: 'urban' }, 'remote')).toBe(1);
  });
});
