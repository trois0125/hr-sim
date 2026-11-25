/**
 * 相性の効き目がエンジンの差し込み口に届くか（ステップ21 Task 3）。
 * 同じ会社で制度（または会社の条件）だけ変え、当てはまる社員の結果が決めた方向に動くことを確かめる。
 */
import { describe, expect, it } from 'vitest';
import { coef } from './coefficients';
import { defaultPolicies, getIndustry, getLocation } from './data';
import { createEmployee } from './employees';
import { computeFactorScores, type EngagementContext } from './engagement';
import { evaluate, growAbility } from './evaluation';
import { computeFinance } from './finance';
import { activeFits, type ActiveFits, type FitCompany } from './fits';
import { resignationProbability } from './attrition';
import { computePerformance } from './performance';
import { createRng } from './rng';
import type { Employee, IndustryId, PolicySet } from './types';

const tokyo = getLocation('tokyo');
let seq = 0;
function person(industryId: IndustryId, role: string, opts: Partial<Employee> = {}): Employee {
  const e = createEmployee({
    rng: createRng(11),
    id: `p${seq++}`,
    industry: getIndustry(industryId),
    location: tokyo,
    role,
    employmentType: opts.employmentType ?? 'full',
    affiliation: opts.affiliation ?? 'proper',
  });
  return { ...e, ability: 50, perceivedPerformance: 50, engagement: 60, tenureMonths: 60, overtimeHours: 20, ...opts };
}
function fitsOf(industryId: IndustryId, policies: Partial<PolicySet>, over: Partial<FitCompany> = {}): ActiveFits {
  const company: FitCompany = {
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
  return { company, fits: activeFits(company) };
}
function factors(industryId: IndustryId, employees: Employee[], policies: Partial<PolicySet>, over: Partial<FitCompany> = {}, withFits = true) {
  const f = fitsOf(industryId, policies, over);
  const ctx: EngagementContext = {
    industry: getIndustry(industryId),
    location: tokyo,
    policies: f.company.policies,
    history: [],
    cash: 1e8,
    headcount: employees.length,
    fits: withFits ? f : undefined,
  };
  return computeFactorScores(employees, ctx);
}
/** 相性ありとなしの差（同じ制度） */
function factorDiff(industryId: IndustryId, e: Employee, all: Employee[], policies: Partial<PolicySet>, over: Partial<FitCompany> = {}) {
  const a = factors(industryId, all, policies, over, true).get(e.id)!;
  const b = factors(industryId, all, policies, over, false).get(e.id)!;
  return Object.fromEntries(Object.keys(a).map((k) => [k, a[k as keyof typeof a] - b[k as keyof typeof b]])) as Record<keyof typeof a, number>;
}
/** 評価のずれの大きさ：同じ乱数で評価し、実力との差の平均を見る */
function evalSpread(industryId: IndustryId, es: Employee[], policies: Partial<PolicySet>, over: Partial<FitCompany> = {}, withFits = true) {
  const f = fitsOf(industryId, policies, over);
  const copy = es.map((e) => ({ ...e }));
  evaluate(copy, { rng: createRng(5), policies: f.company.policies, industry: getIndustry(industryId), fits: withFits ? f : undefined });
  return copy.map((e) => Math.abs(e.perceivedPerformance - e.ability));
}
const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
const many = (n: number, make: () => Employee) => Array.from({ length: n }, make);

describe('相性の効き目：納得感の要因', () => {
  it('1：給与を成果連動にすると、飲食の店舗スタッフの社内の公平さが下がり、本部は変わらない', () => {
    const staff = person('restaurant', 'store_staff');
    const hq = person('restaurant', 'hq');
    expect(factorDiff('restaurant', staff, [staff, hq], { pay: 'performance' }).internalFairness).toBeLessThan(0);
    expect(factorDiff('restaurant', hq, [staff, hq], { pay: 'performance' }).internalFairness).toBe(0);
    expect(factorDiff('restaurant', staff, [staff, hq], { pay: 'market' }).internalFairness).toBe(0);
  });

  it('2：評価が社長のまま在宅にすると評価の正確さが下がる（在宅＞ハイブリッド）。MBO なら付かない', () => {
    const e = person('saas', 'biz');
    const remote = factorDiff('saas', e, [e], { workStyle: 'remote', evaluation: 'ceo' }).evaluation;
    const hybrid = factorDiff('saas', e, [e], { workStyle: 'hybrid', evaluation: 'ceo' }).evaluation;
    expect(remote).toBeLessThan(hybrid);
    expect(hybrid).toBeLessThan(0);
    expect(factorDiff('saas', e, [e], { workStyle: 'remote', evaluation: 'mbo' }).evaluation).toBe(0);
  });

  it('3：フレックスにしても、製造の製造職は働く負荷の上乗せが打ち消され、事務・品質管理は打ち消されない', () => {
    const prod = person('manufacturing', 'production');
    const office = person('manufacturing', 'office');
    expect(factorDiff('manufacturing', prod, [prod, office], { workHours: 'flex' }).workload).toBeLessThan(0);
    expect(factorDiff('manufacturing', office, [prod, office], { workHours: 'flex' }).workload).toBe(0);
  });

  it('6・7：SaaS のエンジニアは職能資格で社外と比べた給与と成長の機会が下がり、相場連動で社外と比べた給与が上がる。営業・CS は変わらない', () => {
    const eng = person('saas', 'engineer');
    const biz = person('saas', 'biz');
    const skill = factorDiff('saas', eng, [eng, biz], { grade: 'skill' });
    expect(skill.externalPay).toBeLessThan(0);
    expect(skill.growthOpportunity).toBeLessThan(0);
    expect(factorDiff('saas', biz, [eng, biz], { grade: 'skill' }).externalPay).toBe(0);
    expect(factorDiff('saas', eng, [eng, biz], { pay: 'market' }).externalPay).toBeGreaterThan(0);
  });

  it('8：在宅で、新卒2年未満の成長の機会が下がる。中途は変わらない', () => {
    const ng = person('saas', 'engineer', { hireChannel: 'new_grad', tenureMonths: 6 });
    const mid = person('saas', 'engineer', { hireChannel: 'mid_career', tenureMonths: 6 });
    expect(factorDiff('saas', ng, [ng, mid], { workStyle: 'remote' }).growthOpportunity).toBeLessThan(0);
    expect(factorDiff('saas', mid, [ng, mid], { workStyle: 'remote' }).growthOpportunity).toBe(0);
  });

  it('9：29人で役割等級だと等級による成長の機会の上乗せが消える。30人では消えない', () => {
    const e = person('trading', 'sales');
    const small = coef('fit.small_company_headcount');
    expect(factorDiff('trading', e, [e], { grade: 'role' }, { headcount: small - 1 }).growthOpportunity).toBeLessThan(0);
    expect(factorDiff('trading', e, [e], { grade: 'role' }, { headcount: small }).growthOpportunity).toBe(0);
  });

  it('14：特別条項で飲食の店長の働く負荷が下がる。月45時間はその半分。店舗スタッフは変わらない', () => {
    const mgr = person('restaurant', 'store_manager');
    const staff = person('restaurant', 'store_staff');
    const sp = factorDiff('restaurant', mgr, [mgr, staff], { overtime: 'special' }).workload;
    const l45 = factorDiff('restaurant', mgr, [mgr, staff], { overtime: 'limit45' }).workload;
    expect(sp).toBeLessThan(0);
    expect(l45).toBeCloseTo(sp / 2);
    expect(factorDiff('restaurant', staff, [mgr, staff], { overtime: 'special' }).workload).toBe(0);
  });

  it('18：業績連動賞与で直近に赤字があると雇用の安定が下がる', () => {
    const e = person('trading', 'sales');
    expect(factorDiff('trading', e, [e], { bonus: 'company_linked' }, { recentLoss: true }).stability).toBeLessThan(0);
    expect(factorDiff('trading', e, [e], { bonus: 'company_linked' }, { recentLoss: false }).stability).toBe(0);
  });

  it('19：出向者のいる職種のプロパーの社内の公平さが下がる', () => {
    const sec = person('saas', 'engineer', { affiliation: 'secondee' });
    const eng = person('saas', 'engineer');
    const biz = person('saas', 'biz');
    const all = [sec, eng, biz];
    expect(factorDiff('saas', eng, all, {}, { hasSecondees: true }).internalFairness).toBeLessThan(0);
    expect(factorDiff('saas', biz, all, {}, { hasSecondees: true }).internalFairness).toBe(0);
  });

  it('要因の点数は0〜100に収まる', () => {
    const e = person('restaurant', 'store_manager');
    const s = factors('restaurant', [e], { pay: 'performance', overtime: 'special', workHours: 'flex', bonus: 'company_linked' }, { recentLoss: true }).get(e.id)!;
    for (const v of Object.values(s)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });
});

describe('相性の効き目：評価のずれ', () => {
  const N = 200;
  it('2：社長評価のまま在宅にすると評価のずれが大きくなる（社長が見られる人数のうちの小さい会社）', () => {
    // 大きい会社では社長評価のずれがもともと上限に達しているので、小さい会社で何度も評価して比べる
    const es = many(8, () => person('saas', 'biz'));
    const spread = (withFits: boolean) =>
      mean(Array.from({ length: 50 }, (_, seed) => {
        const f = fitsOf('saas', { workStyle: 'remote', evaluation: 'ceo' }, { headcount: es.length });
        const copy = es.map((e) => ({ ...e }));
        evaluate(copy, { rng: createRng(seed), policies: f.company.policies, industry: getIndustry('saas'), fits: withFits ? f : undefined });
        return mean(copy.map((e) => Math.abs(e.perceivedPerformance - e.ability)));
      }));
    expect(spread(true)).toBeGreaterThan(spread(false));
  });

  it('5：MBO で、成果を数字にしにくい事務だけずれが大きくなる', () => {
    const admins = many(N, () => person('trading', 'admin'));
    const sales = many(N, () => person('trading', 'sales'));
    expect(mean(evalSpread('trading', admins, { evaluation: 'mbo' }))).toBeGreaterThan(mean(evalSpread('trading', admins, { evaluation: 'mbo' }, {}, false)));
    expect(mean(evalSpread('trading', sales, { evaluation: 'mbo' }))).toBeCloseTo(mean(evalSpread('trading', sales, { evaluation: 'mbo' }, {}, false)));
  });

  it('10：360度評価で、飲食のパートと店舗スタッフのずれが大きくなる', () => {
    const parts = many(N, () => person('restaurant', 'hq', { employmentType: 'part' }));
    expect(mean(evalSpread('restaurant', parts, { evaluation: 'multi_rater' }))).toBeGreaterThan(
      mean(evalSpread('restaurant', parts, { evaluation: 'multi_rater' }, {}, false)),
    );
  });

  it('20：マトリクスで社長評価のずれが大きく、360度評価では付かない', () => {
    const es = many(N, () => person('trading', 'sales'));
    expect(mean(evalSpread('trading', es, { evaluation: 'mbo' }, { orgForm: 'matrix' }))).toBeGreaterThan(
      mean(evalSpread('trading', es, { evaluation: 'mbo' }, { orgForm: 'matrix' }, false)),
    );
    expect(mean(evalSpread('trading', es, { evaluation: 'multi_rater' }, { orgForm: 'matrix' }))).toBeCloseTo(
      mean(evalSpread('trading', es, { evaluation: 'multi_rater' }, { orgForm: 'matrix' }, false)),
    );
  });

  it('ずれの倍率が重なっても上限を超えない', () => {
    const es = many(N, () => person('trading', 'admin'));
    const f = fitsOf('trading', { evaluation: 'mbo' }, { orgForm: 'matrix' });
    for (const fit of f.fits) {
      if (fit.effects.evaluationNoiseMult) fit.effects = { ...fit.effects, evaluationNoiseMult: { ...fit.effects.evaluationNoiseMult, value: 100 } };
    }
    const copy = es.map((e) => ({ ...e }));
    evaluate(copy, { rng: createRng(5), policies: f.company.policies, industry: getIndustry('trading'), fits: f });
    const sd = Math.sqrt(mean(copy.map((e) => (e.perceivedPerformance - e.ability) ** 2)));
    expect(sd).toBeLessThan(coef('policy.evaluation.max_noise') * 1.3);
  });
});

describe('相性の効き目：立ち上がり・実力の伸び・辞めやすさ', () => {
  const industry = (id: IndustryId) => getIndustry(id);
  const variant = (id: IndustryId) => industry(id).variants[0]!;
  const capacityOf = (id: IndustryId, es: Employee[], policies: Partial<PolicySet>, withFits: boolean) =>
    computePerformance(es, industry(id), variant(id), { ...defaultPolicies, ...policies }, undefined, withFits ? fitsOf(id, policies) : undefined).capacity;

  it('8：在宅で、新卒の立ち上がりが遅く、売れる上限が下がる', () => {
    const es = [person('saas', 'engineer', { hireChannel: 'new_grad', tenureMonths: 3 })];
    expect(capacityOf('saas', es, { workStyle: 'remote' }, true)).toBeLessThan(capacityOf('saas', es, { workStyle: 'remote' }, false));
  });

  it('16：中途中心で、製造の中途24か月未満の立ち上がりが遅い。事務は変わらない', () => {
    const prod = [person('manufacturing', 'production', { hireChannel: 'mid_career', tenureMonths: 3 })];
    expect(capacityOf('manufacturing', prod, { hiring: 'mid_career' }, true)).toBeLessThan(capacityOf('manufacturing', prod, { hiring: 'mid_career' }, false));
  });

  it('15：育成投資ありで、パートの実力の伸びが小さい。正社員は変わらない', () => {
    const grow = (e: Employee, withFits: boolean) => {
      const c = [{ ...e }];
      const policies = { ...defaultPolicies, training: '1' as const };
      growAbility(c, policies, withFits ? fitsOf('restaurant', { training: '1' }) : undefined);
      return c[0]!.ability - e.ability;
    };
    const part = person('restaurant', 'store_staff', { employmentType: 'part', age: 25 });
    const full = person('restaurant', 'store_staff', { age: 25 });
    expect(grow(part, true)).toBeLessThan(grow(part, false));
    expect(grow(full, true)).toBeCloseTo(grow(full, false));
  });

  it('13：新卒中心・29人で、新卒36か月未満が辞めやすい', () => {
    const e = person('trading', 'sales', { hireChannel: 'new_grad', tenureMonths: 12 });
    const ctx = { industry: industry('trading'), location: tokyo, policies: { ...defaultPolicies, hiring: 'new_grad' as const } };
    const small = coef('fit.small_company_headcount') - 1;
    const withFit = resignationProbability(e, { ...ctx, fits: fitsOf('trading', { hiring: 'new_grad' }, { headcount: small }) });
    const without = resignationProbability(e, ctx);
    expect(withFit.related).toBeGreaterThan(without.related);
  });

  it('14：特別条項で飲食の店長が辞めやすい', () => {
    const e = person('restaurant', 'store_manager');
    const ctx = { industry: industry('restaurant'), location: tokyo, policies: { ...defaultPolicies, overtime: 'special' as const } };
    expect(resignationProbability(e, { ...ctx, fits: fitsOf('restaurant', { overtime: 'special' }) }).related).toBeGreaterThan(
      resignationProbability(e, ctx).related,
    );
  });
});

describe('相性の効き目：会社のお金・採用', () => {
  const base = (_id: IndustryId, es: Employee[], policies: Partial<PolicySet>, f?: ActiveFits) =>
    computeFinance({
      employees: es,
      policies: { ...defaultPolicies, ...policies },
      demand: 1e9,
      capacity: 1e8,
      overtimeCapacity: 0,
      grossMargin: 0.3,
      hiringCost: 0,
      fits: f,
    });

  it('3・10：当てはまる社員の数に応じて運用の費用が増える', () => {
    const es = [person('restaurant', 'store_staff'), person('restaurant', 'hq')];
    expect(base('restaurant', es, { workHours: 'flex' }, fitsOf('restaurant', { workHours: 'flex' })).hrSystemCost).toBeGreaterThan(
      base('restaurant', es, { workHours: 'flex' }).hrSystemCost,
    );
    expect(base('restaurant', es, { evaluation: 'multi_rater' }, fitsOf('restaurant', { evaluation: 'multi_rater' })).hrSystemCost).toBeGreaterThan(
      base('restaurant', es, { evaluation: 'multi_rater' }).hrSystemCost,
    );
  });

  it('4：変形労働時間制で、飲食の残業代が相性なしより減る（良い相性）。商社は相性が効かない', () => {
    const es = [person('restaurant', 'store_staff', { overtimeHours: 30 })];
    expect(base('restaurant', es, { workHours: 'variable' }, fitsOf('restaurant', { workHours: 'variable' })).labor.overtime).toBeLessThan(
      base('restaurant', es, { workHours: 'variable' }).labor.overtime,
    );
    expect(fitsOf('trading', { workHours: 'variable' }).fits.map((f) => f.id)).not.toContain('variable_peaks');
  });

  it('9：29人で役割等級だと等級の運用コストが高い', () => {
    const es = [person('trading', 'sales')];
    const small = coef('fit.small_company_headcount') - 1;
    expect(base('trading', es, { grade: 'role' }, fitsOf('trading', { grade: 'role' }, { headcount: small })).hrSystemCost).toBeGreaterThan(
      base('trading', es, { grade: 'role' }).hrSystemCost,
    );
  });

  it('11・12・21：効いても効き目は中立', () => {
    const f = fitsOf('manufacturing', { pay: 'seniority', evaluation: 'ceo' }, { headcount: 500, foundingPatternId: 'carveout' });
    expect(f.fits.map((x) => x.id)).toEqual(expect.arrayContaining(['seniority_cyclical', 'ceo_eval_large', 'carveout_seniority']));
    const onlyExplain = { ...f, fits: f.fits.filter((x) => x.explainOnly) };
    const e = person('manufacturing', 'production');
    const a = factors('manufacturing', [e], { pay: 'seniority', evaluation: 'ceo' }, { headcount: 500, foundingPatternId: 'carveout' }, false).get(e.id);
    const ctx: EngagementContext = {
      industry: getIndustry('manufacturing'),
      location: tokyo,
      policies: f.company.policies,
      history: [],
      cash: 1e8,
      headcount: 1,
      fits: onlyExplain,
    };
    expect(computeFactorScores([e], ctx).get(e.id)).toEqual(a);
  });
});

describe('月の計算（tick）に相性が届く', () => {
  it('SaaS で職能資格にすると、1か月後にエンジニアの社外と比べた給与と成長の機会が、営業・CS より下がる', async () => {
    const { generateCompany, setFoundingPolicies } = await import('./generate');
    const { tick } = await import('./tick');
    const gap = (grade: PolicySet['grade']) => {
      const c = tick(setFoundingPolicies(generateCompany({ seed: 9, industryId: 'saas', foundingPatternId: 'carveout' }), { ...defaultPolicies, grade }));
      const avg = (role: string, k: 'externalPay' | 'growthOpportunity') => {
        const xs = c.employees.filter((e) => e.role === role && e.factorScores).map((e) => e.factorScores![k]);
        return xs.reduce((s, x) => s + x, 0) / xs.length;
      };
      return { pay: avg('engineer', 'externalPay') - avg('biz', 'externalPay'), growth: avg('engineer', 'growthOpportunity') - avg('biz', 'growthOpportunity') };
    };
    const skill = gap('skill');
    const none = gap('none');
    expect(skill.pay).toBeLessThan(none.pay);
    expect(skill.growth).toBeLessThan(none.growth);
  });

  it('月の記録に、効いている相性の id が残る（振り返りで使う）', async () => {
    const { generateCompany, setFoundingPolicies } = await import('./generate');
    const { tick } = await import('./tick');
    const c = tick(setFoundingPolicies(generateCompany({ seed: 9, industryId: 'saas' }), { ...defaultPolicies, grade: 'skill' }));
    expect(c.history[c.history.length - 1]!.fits).toContain('skill_grade_engineer');
  });
});

describe('評価のずれの上限と等級の正確さ（レビューでの直し）', () => {
  it('ずれが上限に届く大きな会社でも、等級制度の正確さの効き目は相性で消えない', () => {
    // 200人で社長評価：ずれはもともと上限。在宅の相性（×1.3）が付いても、職能資格の正確さ（15%）の分は小さくなるはず
    const es = many(200, () => person('trading', 'sales'));
    const spread = (grade: PolicySet['grade']) =>
      mean(Array.from({ length: 10 }, (_, seed) => {
        const f = fitsOf('trading', { workStyle: 'remote', evaluation: 'ceo', grade }, { headcount: es.length });
        const copy = es.map((e) => ({ ...e }));
        evaluate(copy, { rng: createRng(seed), policies: f.company.policies, industry: getIndustry('trading'), fits: f });
        return mean(copy.map((e) => Math.abs(e.perceivedPerformance - e.ability)));
      }));
    expect(spread('skill')).toBeLessThan(spread('none') * 0.9);
  });
});
