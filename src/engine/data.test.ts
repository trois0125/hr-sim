import { describe, expect, it } from 'vitest';
import coefficientsJson from '../data/coefficients.json';
import foundingsJson from '../data/foundings.json';
import tradingJson from '../data/industries/trading.json';
import locationsJson from '../data/locations.json';
import { coef } from './coefficients';
import { getIndustry } from './data';

const BASES = ['statistic', 'research', 'assumption'];

/** JSON を再帰的にたどり、数値を持つ { value } に basis と source が付いているか確かめる */
function findUnsourced(node: unknown, path: string, out: string[]) {
  if (Array.isArray(node)) {
    node.forEach((x, i) => findUnsourced(x, `${path}[${i}]`, out));
    return;
  }
  if (node && typeof node === 'object') {
    const o = node as Record<string, unknown>;
    if ('value' in o) {
      if (!BASES.includes(o.basis as string) || typeof o.source !== 'string' || o.source === '') {
        out.push(path);
      }
      return;
    }
    for (const [k, v] of Object.entries(o)) findUnsourced(v, `${path}.${k}`, out);
    return;
  }
  if (typeof node === 'number') out.push(`${path}（根拠なしの生の数値）`);
}

describe('データの根拠', () => {
  it.each([
    ['coefficients.json', coefficientsJson],
    ['foundings.json', foundingsJson],
    ['industries/trading.json', tradingJson],
    ['locations.json', locationsJson],
  ])('%s の数値はすべて basis と source を持つ', (_name, json) => {
    const out: string[] = [];
    findUnsourced(json, '$', out);
    expect(out).toEqual([]);
  });

  it('仮置きの値には出典の予定か理由が書いてある', () => {
    for (const c of coefficientsJson) expect(c.source.length).toBeGreaterThan(2);
  });

  it('存在しない係数IDはエラーになる', () => {
    expect(() => coef('no.such.coefficient')).toThrow();
  });
});

describe('商社データの整合性', () => {
  const trading = getIndustry('trading');

  it('中の要素の粗利率は業種全体の範囲に収まる', () => {
    const { min, max } = trading.grossMarginRange.value;
    for (const v of trading.variants) {
      expect(v.grossMarginRange.value.min).toBeGreaterThanOrEqual(min);
      expect(v.grossMarginRange.value.max).toBeLessThanOrEqual(max);
    }
  });

  it('範囲は min <= max になっている', () => {
    for (const r of trading.roles) expect(r.mixWeightRange.value.min).toBeLessThanOrEqual(r.mixWeightRange.value.max);
    for (const f of foundingsJson) {
      for (const key of ['headcountRange', 'initialCashRange', 'keyPersonCountRange'] as const) {
        expect(f[key].value.min).toBeLessThanOrEqual(f[key].value.max);
      }
    }
  });
});
