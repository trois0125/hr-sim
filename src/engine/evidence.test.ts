import { describe, expect, it } from 'vitest';
import { coefficients, getIndustry } from './data';
import { coefficientEvidence, industryEvidence } from './evidence';
import { INDUSTRY_IDS } from './types';

describe('数字の根拠の一覧', () => {
  it('係数台帳のすべての係数が、根拠と出典つきで並ぶ', () => {
    const e = coefficientEvidence();
    expect(e).toHaveLength(coefficients.length);
    for (const x of e) {
      expect(['statistic', 'research', 'assumption']).toContain(x.basis);
      expect(x.source.length).toBeGreaterThan(0);
    }
  });

  it('業種データの根拠付きの数値を、場所と一緒に集める（範囲は「a〜b」）', () => {
    for (const id of INDUSTRY_IDS) {
      const e = industryEvidence(getIndustry(id));
      expect(e.length).toBeGreaterThan(20);
      expect(e.some((x) => x.path === 'baseAttritionRate' && x.basis === 'statistic')).toBe(true);
      expect(e.some((x) => x.path.startsWith('roles[') && x.path.endsWith('.marketSalaryMonthly'))).toBe(true);
    }
    const range = industryEvidence(getIndustry('trading')).find((x) => x.path === 'grossMarginRange');
    expect(range?.value).toMatch(/〜/);
  });
});
