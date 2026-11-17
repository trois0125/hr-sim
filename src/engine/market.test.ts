import { describe, expect, it } from 'vitest';
import { coef } from './coefficients';
import { demandAt, growthProgress, stepEconomy, updateShareFactor } from './market';
import { createRng } from './rng';
import { trading } from './testHelpers';
import type { MarketState } from './types';

const market = (over: Partial<MarketState> = {}): MarketState => ({
  economy: 0,
  initialDemandMonthly: 20_000_000,
  matureDemandMonthly: 2_000_000_000,
  stableDemandMonthly: 0,
  shareFactor: 1,
  recessionMonths: [],
  ...over,
});
const profile = (cyclicality: number) => ({ cyclicality });

describe('需要のS字カーブ', () => {
  it('0か月で0から始まり、単調に増えて1に近づく', () => {
    const months = trading.growthCurve.growthMonths.value;
    expect(growthProgress(0, months)).toBeCloseTo(0);
    let prev = -1;
    for (let m = 0; m <= 300; m += 12) {
      const p = growthProgress(m, months);
      expect(p).toBeGreaterThan(prev);
      prev = p;
    }
    expect(growthProgress(300, months)).toBeGreaterThan(0.99);
  });

  it('景気が平常なら、需要は創業時の値から成熟時の値へ伸びる', () => {
    const m = market();
    expect(demandAt(m, profile(1), trading, 0)).toBeCloseTo(m.initialDemandMonthly);
    expect(demandAt(m, profile(1), trading, 120)).toBeGreaterThan(demandAt(m, profile(1), trading, 60));
    expect(demandAt(m, profile(1), trading, 600)).toBeCloseTo(m.matureDemandMonthly, -3);
  });
});

describe('景気の影響', () => {
  it('不況だと需要が減り、好況だと増える', () => {
    const normal = demandAt(market(), profile(1), trading, 60);
    expect(demandAt(market({ economy: -0.2 }), profile(1), trading, 60)).toBeLessThan(normal);
    expect(demandAt(market({ economy: 0.2 }), profile(1), trading, 60)).toBeGreaterThan(normal);
  });

  it('景気感応度が高いほど、不況での落ち込みが大きい', () => {
    const recession = market({ economy: -0.2 });
    expect(demandAt(recession, profile(1.5), trading, 60)).toBeLessThan(
      demandAt(recession, profile(0.5), trading, 60),
    );
  });

  it('底堅い需要（親会社向け・既存顧客）があると、不況でも落ち込みが小さい', () => {
    const drop = (stable: number) => {
      const normal = demandAt(market({ stableDemandMonthly: stable }), profile(1), trading, 0);
      const bad = demandAt(market({ stableDemandMonthly: stable, economy: -0.3 }), profile(1), trading, 0);
      return 1 - bad / normal;
    };
    expect(drop(10_000_000)).toBeLessThan(drop(0));
    expect(drop(20_000_000)).toBeCloseTo(0); // すべて底堅い需要なら落ちない
  });

  it('需要はマイナスにならない', () => {
    expect(demandAt(market({ economy: -5 }), profile(1.5), trading, 60)).toBeGreaterThanOrEqual(0);
  });
});

describe('景気の動き', () => {
  it('同じシードなら同じ動きになり、長い目で見ると平常（0）のまわりを揺れる', () => {
    const run = (seed: number) => {
      const rng = createRng(seed);
      let e = 0;
      const xs: number[] = [];
      for (let i = 0; i < 5000; i++) xs.push((e = stepEconomy(e, rng).economy));
      return xs;
    };
    const a = run(1);
    expect(run(1)).toEqual(a);
    const mean = a.reduce((s, x) => s + x, 0) / a.length;
    expect(Math.abs(mean)).toBeLessThan(0.05);
    expect(Math.min(...a)).toBeGreaterThanOrEqual(coef('market.economy.floor'));
    expect(Math.max(...a) - Math.min(...a)).toBeGreaterThan(0.05); // 動いている
  });
});

describe('景気後退', () => {
  it('まれに景気後退が始まり、その月に景気が大きく落ち込む', () => {
    const rng = createRng(3);
    let e = 0;
    let recessions = 0;
    const months = 12000;
    for (let i = 0; i < months; i++) {
      const before = e;
      const r = stepEconomy(e, rng);
      e = r.economy;
      if (r.recession) {
        recessions++;
        expect(e).toBeLessThan(before);
      }
    }
    const expected = months * coef('market.recession.monthly_probability');
    expect(recessions).toBeGreaterThan(expected * 0.7);
    expect(recessions).toBeLessThan(expected * 1.3);
  });
});

describe('取りこぼした需要', () => {
  it('取りこぼすと市場での取り分が下がり、取りこぼさなければ戻っていく', () => {
    const down = updateShareFactor(1, 0.5);
    expect(down).toBeLessThan(1);
    expect(updateShareFactor(1, 0)).toBe(1);
    let s = 0.8;
    for (let i = 0; i < 200; i++) s = updateShareFactor(s, 0);
    expect(s).toBeGreaterThan(0.99);
  });

  it('取りこぼし続けると、取り分は一定の水準まで下がる（なくなりはしない）', () => {
    let s = 1;
    for (let i = 0; i < 500; i++) s = updateShareFactor(s, 0.2);
    expect(s).toBeLessThan(0.95);
    expect(s).toBeGreaterThan(0.8);
  });

  it('取り分が下がると、景気に左右される部分の需要が減る（底堅い需要は減らない）', () => {
    const full = demandAt(market({ stableDemandMonthly: 5_000_000 }), profile(1), trading, 60);
    const less = demandAt(market({ stableDemandMonthly: 5_000_000, shareFactor: 0.8 }), profile(1), trading, 60);
    expect(less).toBeLessThan(full);
    expect(less).toBeGreaterThan(5_000_000);
  });
});
