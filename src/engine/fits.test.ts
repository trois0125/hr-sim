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
