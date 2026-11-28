import { describe, expect, it } from 'vitest';
import { coef } from '../coefficients';
import { getIndustry } from '../data';
import { generateCompany } from '../generate';
import { createRng } from '../rng';
import { defaultPolicies } from '../data';
import { annualHr, defaultDetailedPolicies, toBasePolicies, validateDetailed, type DetailedPolicies } from './detailedPolicy';
import { computePremise, findMismatches, fitEffects, nextChainStage, totalMismatch, type Premise } from './fit';
import { toLayers, totalHeadcount } from './layers';
import { changeDetailedPolicies, proportionalMapping } from './regroup';
import { fromCompany, meanEngagement, yearTickInPlace } from './yearTick';
import type { IntermediateState } from './types';

const noPremise: Premise = { growth: false, aging: false, postGlut: false, recession: false, large: false };
/** 年功が強く、社長が評価し、変動が大きく、上位評価が少ない（成長期・大きな会社には合わない） */
const mismatched = (): DetailedPolicies => {
  const d = defaultDetailedPolicies();
  return {
    grade: { ...d.grade, levels: 3, seniorityCap: 2 },
    evaluation: { ...d.evaluation, system: 'ceo', topShare: 0.05 },
    pay: { ...d.pay, meritSpread: 0.05 },
    bonus: { ...d.bonus, variableShare: 0.4, companyWeight: 0.8 },
  };
};

describe('中級の細かい制度（§15.5）', () => {
  it('標準の値は範囲の中にあり、範囲の外はエラーになる', () => {
    expect(() => validateDetailed(defaultDetailedPolicies())).not.toThrow();
    const d = defaultDetailedPolicies();
    expect(() => validateDetailed({ ...d, bonus: { ...d.bonus, variableShare: 0.9 } })).toThrow();
    expect(() => validateDetailed({ ...d, grade: { ...d.grade, levels: 3, seniorityCap: 5 } })).toThrow();
  });

  it('初級の制度に読み替える：変動部分が無ければ固定の賞与、会社業績の割合が大きければ業績連動', () => {
    const d = defaultDetailedPolicies();
    expect(toBasePolicies(d, defaultPolicies).bonus).toBe('fixed_months');
    expect(toBasePolicies({ ...d, bonus: { ...d.bonus, baseMonths: 0 } }, defaultPolicies).bonus).toBe('none');
    expect(toBasePolicies({ ...d, bonus: { ...d.bonus, variableShare: 0.3, companyWeight: 0.8 } }, defaultPolicies).bonus).toBe('company_linked');
    expect(toBasePolicies({ ...d, bonus: { ...d.bonus, variableShare: 0.3, companyWeight: 0.2 } }, defaultPolicies).bonus).toBe('individual_linked');
  });

  it('年次で上がれる範囲を広げると、昇格が増える', () => {
    const promotions = (cap: number) => {
      const c = generateCompany({ seed: 4, industryId: 'trading', foundingPatternId: 'carveout' });
      const d = { ...defaultDetailedPolicies(), grade: { ...defaultDetailedPolicies().grade, seniorityCap: cap } };
      const layers = toLayers(c.employees.map((e) => ({ ...e, grade: 0 })));
      for (const l of layers) l.headcount *= 20;
      return annualHr({ layers, detail: d, policies: defaultPolicies, industry: getIndustry('trading'), profitMargin: 0.02, rng: createRng(1) }).promotions;
    };
    expect(promotions(5)).toBeGreaterThan(promotions(0));
  });

  it('会社業績で決まる割合が大きいと、利益が少ない年の賞与が下がる', () => {
    const c = generateCompany({ seed: 4, industryId: 'trading' });
    const d = mismatched();
    const total = (margin: number) => {
      const layers = toLayers(c.employees);
      const r = annualHr({ layers, detail: d, policies: defaultPolicies, industry: getIndustry('trading'), profitMargin: margin, rng: createRng(1) });
      return r.layers.reduce((s, l) => s + l.rep.bonusMonthly * l.headcount, 0);
    };
    expect(total(0)).toBeLessThan(total(0.04));
  });
});

describe('前提と合わない組み合わせ（§15.6）', () => {
  it('成長期に年功が強いと「ずれ」が出る。年功を弱めると消える', () => {
    const d = defaultDetailedPolicies();
    const senior = { ...d, grade: { ...d.grade, seniorityCap: d.grade.levels - 1 } };
    const growth = { ...noPremise, growth: true };
    expect(findMismatches(growth, senior).map((m) => m.id)).toContain('seniority_in_growth');
    expect(findMismatches(growth, { ...d, grade: { ...d.grade, seniorityCap: 0 } }).map((m) => m.id)).not.toContain('seniority_in_growth');
  });

  it('同じ制度でも、前提がなければ「ずれ」は出ない（合う・合わないは場面で決まる）', () => {
    const d = { ...defaultDetailedPolicies(), grade: { ...defaultDetailedPolicies().grade, seniorityCap: 5 } };
    expect(findMismatches(noPremise, d).map((m) => m.id)).not.toContain('seniority_in_growth');
  });

  it('大きな会社で段階が少ないと「次の段階が見えない」。職責の振れ幅があると軽くなる', () => {
    const d = defaultDetailedPolicies();
    const few = { ...d, grade: { ...d.grade, levels: 2, seniorityCap: 0 } };
    const sev = (x: DetailedPolicies) => findMismatches({ ...noPremise, large: true }, x).find((m) => m.id === 'few_levels_large')?.severity ?? 0;
    expect(sev(few)).toBeGreaterThan(0);
    expect(sev({ ...few, grade: { ...few.grade, dutySpread: 0.2 } })).toBeLessThan(sev(few));
  });

  it('不況のとき、会社業績で決まる部分が大きいと「雇用の安定」のずれが出る', () => {
    const ms = findMismatches({ ...noPremise, recession: true }, mismatched());
    expect(ms.find((m) => m.id === 'company_risk_in_recession')?.factor).toBe('stability');
  });

  it('前提は会社の状態から出す：50歳以上が多いと高齢化', () => {
    const c = generateCompany({ seed: 2, industryId: 'trading', foundingPatternId: 'carveout' });
    const layers = toLayers(c.employees.map((e) => ({ ...e, age: 55 })));
    expect(computePremise({ layers, history: [], detail: defaultDetailedPolicies(), economy: 0 }).aging).toBe(true);
  });

  it('すぐ効く影響：ずれの大きさに比例して、その要因から点を引く（初級の効果より大きい）', () => {
    const e = fitEffects([{ id: 'seniority_in_growth', severity: 1, factor: 'growthOpportunity' }], 0);
    expect(e.orgBonus.growthOpportunity).toBe(-coef('intermediate.mismatch.factor_penalty'));
    expect(e.capacityMult).toBe(1);
  });
});

describe('連鎖（§15.6）', () => {
  it('ずれが基準以上なら毎年1段進み（最大4段）、下回れば毎年1段戻る', () => {
    const t = coef('intermediate.chain.threshold');
    let s = 0;
    for (let i = 0; i < 6; i++) s = nextChainStage(s, t);
    expect(s).toBe(4);
    s = nextChainStage(s, 0);
    expect(s).toBe(3);
  });

  it('段が進むほど効き目が増える：2段目で優秀層の退職、4段目で売れる上限が下がる', () => {
    expect(fitEffects([], 1).highAbilityAttritionMult).toBe(1);
    expect(fitEffects([], 2).highAbilityAttritionMult).toBeGreaterThan(1);
    expect(fitEffects([], 3).capacityMult).toBe(1);
    expect(fitEffects([], 4).capacityMult).toBeLessThan(1);
  });
});

describe('合わない制度を選ぶと結果が悪くなり、放っておくと連鎖が進む（ステップ21の完了条件）', () => {
  const start = (seed: number, detail: DetailedPolicies): IntermediateState => {
    const s = fromCompany(generateCompany({ seed, industryId: 'trading', foundingPatternId: 'carveout' }));
    changeDetailedPolicies(s, detail);
    return s;
  };
  const runYears = (s: IntermediateState, years: number) => {
    for (let i = 0; i < years && s.status === 'running'; i++) yearTickInPlace(s);
    return s;
  };

  it('同じ会社で比べると、合わない制度のほうが納得感が低く、離職が多い', () => {
    let eng = 0;
    let to = 0;
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const bad = runYears(start(seed, mismatched()), 8);
      const good = runYears(start(seed, defaultDetailedPolicies()), 8);
      eng += meanEngagement(bad) - meanEngagement(good);
      const t = (s: IntermediateState) => s.history.reduce((a, r) => a + r.leavers, 0) / Math.max(1, s.history.reduce((a, r) => a + r.headcount, 0));
      to += t(bad) - t(good);
    }
    expect(eng).toBeLessThan(0);
    expect(to).toBeGreaterThan(0);
  });

  it('合わない制度を放っておくと連鎖が進み、合う制度に直すと1年に1段ずつ戻る', () => {
    const s = start(3, mismatched());
    runYears(s, 6);
    const peak = s.chainStage;
    expect(peak).toBeGreaterThanOrEqual(2);
    changeDetailedPolicies(s, defaultDetailedPolicies());
    yearTickInPlace(s);
    // 直した年に前提が変わって別のずれが出ることもあるので、「進まない」ことを確かめる
    expect(s.chainStage).toBeLessThanOrEqual(peak);
    const before = s.chainStage;
    yearTickInPlace(s);
    if (totalMismatch(s.history.at(-1)!.mismatches) < coef('intermediate.chain.threshold')) expect(s.chainStage).toBe(Math.max(0, before - 1));
  });
});

describe('等級の組み直し（§15.4）', () => {
  const base = () => {
    const s = fromCompany(generateCompany({ seed: 5, industryId: 'trading', foundingPatternId: 'carveout' }));
    for (const l of s.layers) l.rep.grade = Math.min(5, Math.floor(l.rep.age / 10) - 1);
    return s;
  };
  const toThree = (d: DetailedPolicies): DetailedPolicies => ({ ...d, grade: { ...d.grade, levels: 3, seniorityCap: 1 } });

  it('比例の対応表は上下の位置を保つ', () => {
    expect(proportionalMapping(6, 3)).toEqual([0, 0, 1, 1, 2, 2]);
  });

  it('対応表で等級を下げると給与が下がる人が出て、人数は変わらない', () => {
    const s = base();
    const n = totalHeadcount(s.layers);
    const r = changeDetailedPolicies(s, toThree(s.detail), { gradeMapping: [0, 0, 0, 1, 1, 2] });
    expect(r.regrouped).toBe(true);
    expect(r.cutHeadcount).toBeGreaterThan(0);
    expect(totalHeadcount(s.layers)).toBe(n);
    expect(Math.max(...s.layers.map((l) => l.rep.grade))).toBeLessThanOrEqual(2);
  });

  it('激変緩和の年数を長くすると、すぐの給与は下がらず、納得感の落ち込みも小さい', () => {
    const pay = (s: IntermediateState) => s.layers.reduce((a, l) => a + l.rep.salaryMonthly * l.headcount, 0);
    const now = base();
    changeDetailedPolicies(now, toThree(now.detail), { gradeMapping: [0, 0, 0, 1, 1, 2], transitionYears: 0 });
    const slow = base();
    changeDetailedPolicies(slow, toThree(slow.detail), { gradeMapping: [0, 0, 0, 1, 1, 2], transitionYears: 3 });
    expect(pay(slow)).toBeGreaterThan(pay(now));
    expect(meanEngagement(slow)).toBeGreaterThan(meanEngagement(now));
  });

  it('正しくない対応表はエラーになる', () => {
    const s = base();
    expect(() => changeDetailedPolicies(s, toThree(s.detail), { gradeMapping: [0, 1, 2] })).toThrow();
    const t = base();
    expect(() => changeDetailedPolicies(t, toThree(t.detail), { gradeMapping: [0, 0, 0, 1, 1, 5] })).toThrow();
  });
});
