import { describe, expect, it } from 'vitest';
import {
  createRng,
  createStreams,
  deriveSeed,
  getStreamsState,
  restoreRng,
  restoreStreams,
} from './rng';

const take = (n: number, f: () => number) => Array.from({ length: n }, f);

describe('createRng', () => {
  it('同じシードなら同じ乱数列が出る', () => {
    const a = createRng(12345);
    const b = createRng(12345);
    expect(take(1000, a.next)).toEqual(take(1000, b.next));
  });

  it('シードが違えば乱数列も違う', () => {
    const a = createRng(1);
    const b = createRng(2);
    expect(take(20, a.next)).not.toEqual(take(20, b.next));
  });

  it('既知のシードで決まった値が出る（実装が変わったら気づけるように）', () => {
    const r = createRng(42);
    const first = take(3, r.next);
    const again = createRng(42);
    expect(take(3, again.next)).toEqual(first);
    expect(first[0]).toBeCloseTo(0.6011037519201636, 15);
  });

  it('next は [0, 1) に収まり、平均はおよそ0.5', () => {
    const r = createRng(7);
    const xs = take(20000, r.next);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...xs)).toBeLessThan(1);
    const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
    expect(mean).toBeGreaterThan(0.49);
    expect(mean).toBeLessThan(0.51);
  });

  it('int は両端を含み、範囲外を出さない', () => {
    const r = createRng(99);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const v = r.int(1, 6);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(6);
      seen.add(v);
    }
    expect([...seen].sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('weightedPick は重みに比例して選ぶ', () => {
    const r = createRng(3);
    const counts = { a: 0, b: 0, c: 0 };
    for (let i = 0; i < 30000; i++) counts[r.weightedPick(['a', 'b', 'c'] as const, [1, 2, 0])]++;
    expect(counts.c).toBe(0);
    expect(counts.b / counts.a).toBeGreaterThan(1.8);
    expect(counts.b / counts.a).toBeLessThan(2.2);
  });

  it('weightedPick は不正な入力を拒否する', () => {
    const r = createRng(1);
    expect(() => r.weightedPick([], [])).toThrow();
    expect(() => r.weightedPick(['a'], [0])).toThrow();
    expect(() => r.weightedPick(['a', 'b'], [1, -1])).toThrow();
  });

  it('normal の平均と標準偏差がおよそ指定どおり', () => {
    const r = createRng(11);
    const xs = take(20000, () => r.normal(50, 10));
    const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
    const sd = Math.sqrt(xs.reduce((s, x) => s + (x - mean) ** 2, 0) / xs.length);
    expect(mean).toBeGreaterThan(49.5);
    expect(mean).toBeLessThan(50.5);
    expect(sd).toBeGreaterThan(9.7);
    expect(sd).toBeLessThan(10.3);
  });

  it('shuffle は元の配列を変えず、同じ要素を返す', () => {
    const r = createRng(5);
    const src = [1, 2, 3, 4, 5, 6, 7, 8];
    const out = r.shuffle(src);
    expect(src).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect([...out].sort((x, y) => x - y)).toEqual(src);
  });

  it('保存した状態から再開すると、続きの乱数列が一致する', () => {
    const a = createRng(2026);
    take(50, a.next);
    const saved = JSON.parse(JSON.stringify(a.getState()));
    const b = restoreRng(saved);
    expect(take(100, b.next)).toEqual(take(100, a.next));
  });
});

describe('用途ごとの乱数系列', () => {
  it('同じシードなら、各系列が同じ乱数列になる', () => {
    const a = createStreams(777);
    const b = createStreams(777);
    expect(take(100, a.events.next)).toEqual(take(100, b.events.next));
    expect(take(100, a.hiring.next)).toEqual(take(100, b.hiring.next));
  });

  it('系列どうしは別の乱数列になる', () => {
    expect(deriveSeed(777, 'hiring')).not.toBe(deriveSeed(777, 'events'));
    const s = createStreams(777);
    expect(take(10, s.hiring.next)).not.toEqual(take(10, s.events.next));
  });

  it('ある系列を多く引いても、他の系列の乱数列は変わらない', () => {
    const a = createStreams(31);
    const b = createStreams(31);
    take(500, a.hiring.next); // a だけ採用の抽選を多く行う
    expect(take(100, a.events.next)).toEqual(take(100, b.events.next));
  });

  it('全系列の状態を保存・復元できる', () => {
    const a = createStreams(8);
    take(30, a.market.next);
    take(7, a.attrition.next);
    const b = restoreStreams(JSON.parse(JSON.stringify(getStreamsState(a))));
    expect(take(50, b.market.next)).toEqual(take(50, a.market.next));
    expect(take(50, b.attrition.next)).toEqual(take(50, a.attrition.next));
  });
});
