import { describe, expect, it } from 'vitest';
import { generateCompany } from '../generate';
import { changeDetailedPolicies } from './regroup';
import { createRng } from '../rng';
import { getIndustry } from '../data';
import { ageBandOf, ageLayers, bandWidth, expand, layerKey, toLayers, totalHeadcount } from './layers';
import { fromCompany, meanEngagement, runIntermediateToEnd, startIntermediate, yearTick } from './yearTick';

const company = (seed: number) => generateCompany({ seed, industryId: 'trading', foundingPatternId: 'carveout' });

describe('中級の層（§15.4）', () => {
  it('社員を層にまとめても、人数と給与の合計は変わらない', () => {
    const c = company(3);
    const layers = toLayers(c.employees);
    expect(totalHeadcount(layers)).toBe(c.employees.length);
    const pay = (xs: { salaryMonthly: number }[]) => xs.reduce((s, e) => s + e.salaryMonthly, 0);
    expect(pay(expand(layers))).toBeCloseTo(pay(c.employees), 0);
    expect(expand(layers)).toHaveLength(c.employees.length);
  });

  it('層は職種・雇用形態・所属・等級・年代（5歳刻み）で分かれる', () => {
    const c = company(3);
    for (const l of toLayers(c.employees)) {
      expect(l.key).toBe(layerKey(l.rep));
      expect(ageBandOf(l.rep.age) % bandWidth()).toBe(0);
    }
  });

  it('年をとると一部が次の年代へ移り、定年の年代からは退職する。人数は退職のぶんだけ減る', () => {
    const c = company(5);
    const layers = toLayers(c.employees);
    // 全員を定年の直前の年代にする
    for (const l of layers) l.rep.age = 62;
    const before = totalHeadcount(layers);
    const r = ageLayers(layers, getIndustry('trading'), createRng(1));
    expect(r.retirees).toBeGreaterThan(0);
    expect(totalHeadcount(r.layers)).toBe(before - r.retirees);
  });
});

describe('中級の1年ごとの進行（§15.3）', () => {
  it('同じシードなら同じ結果になる', () => {
    const a = runIntermediateToEnd(startIntermediate({ seed: 11, industryId: 'trading' }));
    const b = runIntermediateToEnd(startIntermediate({ seed: 11, industryId: 'trading' }));
    expect(a.history).toEqual(b.history);
  });

  it('1年進めると年の記録が1つ増え、元の状態は変わらない', () => {
    const s = startIntermediate({ seed: 2, industryId: 'trading' });
    const next = yearTick(s);
    expect(s.history).toHaveLength(0);
    expect(next.history).toHaveLength(1);
    expect(next.year).toBe(1);
    const r = next.history[0]!;
    expect(r.revenue).toBeGreaterThan(0);
    expect(r.laborCost).toBeGreaterThan(0);
    expect(r.headcount).toBe(totalHeadcount(next.layers));
  });

  it('創業から終わりまで回せる（終了条件のどれかで止まる）', () => {
    const end = runIntermediateToEnd(startIntermediate({ seed: 7, industryId: 'trading', lengthYears: 10 }));
    expect(end.status).not.toBe('running');
    expect(end.year).toBeLessThanOrEqual(10);
  });

  it('数千人の会社でも1年の計算が重くならない', () => {
    const s = fromCompany(company(9));
    for (const l of s.layers) l.headcount *= 120; // 30人前後 → 数千人
    expect(totalHeadcount(s.layers)).toBeGreaterThan(2000);
    const t = Date.now();
    yearTick(s);
    expect(Date.now() - t).toBeLessThan(5000);
  });
});

describe('制度を変えたときの向き（中級でも初級と同じ向きになる）', () => {
  const run = (baseMonths: number, seed: number) => {
    const s = fromCompany(company(seed));
    changeDetailedPolicies(s, { ...s.detail, bonus: { ...s.detail.bonus, baseMonths } });
    return runIntermediateToEnd({ ...s, maxYears: 8 });
  };
  it('賞与をなくすと、納得感が下がり離職が増える', () => {
    let engDiff = 0;
    let toDiff = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const none = run(0, seed);
      const std = run(1, seed);
      engDiff += meanEngagement(none) - meanEngagement(std);
      const to = (s: typeof none) => s.history.reduce((a, r) => a + r.turnoverRate, 0) / s.history.length;
      toDiff += to(none) - to(std);
    }
    expect(engDiff).toBeLessThan(0);
    expect(toDiff).toBeGreaterThan(0);
  });
});
