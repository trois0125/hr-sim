import { describe, expect, it } from 'vitest';
import { defaultPolicies, getLocation } from './data';
import { desiredOpenings, runHiring, type HiringInput } from './hiring';
import { computePerformance } from './performance';
import { createRng } from './rng';
import { chemicals, staff, tokyo, trading } from './testHelpers';

const team = [...staff('sales', 6), ...staff('admin', 3)];
const capacity = computePerformance(team, trading, chemicals).capacity;

const input = (over: Partial<HiringInput> = {}): HiringInput => ({
  rng: createRng(1),
  employees: team,
  industry: trading,
  variant: chemicals,
  location: tokyo,
  partTimeRatio: 0,
  demand: capacity * 2,
  capacity,
  cash: 1_000_000_000,
  intensity: 1,
  nextEmployeeId: 100,
  policies: defaultPolicies,
  ...over,
});

/** シードを変えて何度も採用し、採用できた人数の合計を返す */
const totalHires = (over: Partial<HiringInput>, runs = 300) => {
  let n = 0;
  for (let seed = 1; seed <= runs; seed++) n += runHiring(input({ ...over, rng: createRng(seed) })).hires.length;
  return n;
};

describe('求人の数', () => {
  it('需要が売れる上限以下なら、営業の求人は出ない', () => {
    expect(desiredOpenings(input({ demand: capacity * 0.9 })).sales).toBe(0);
  });

  it('需要に足りないと、足りないぶんだけ営業の求人が出る', () => {
    const few = desiredOpenings(input({ demand: capacity * 1.5 })).sales ?? 0;
    const many = desiredOpenings(input({ demand: capacity * 3 })).sales ?? 0;
    expect(few).toBeGreaterThan(0);
    expect(many).toBeGreaterThan(few);
  });

  it('営業に対して事務が足りないと、事務の求人が出る', () => {
    const noAdmin = staff('sales', 8);
    const cap = computePerformance(noAdmin, trading, chemicals).capacity;
    expect(desiredOpenings(input({ employees: noAdmin, capacity: cap, demand: cap })).admin).toBeGreaterThan(0);
  });

  it('人数が増えて管理が足りないと、管理の求人が出る', () => {
    const big = [...staff('sales', 20), ...staff('admin', 10)];
    const cap = computePerformance(big, trading, chemicals).capacity;
    expect(desiredOpenings(input({ employees: big, capacity: cap, demand: cap })).management).toBeGreaterThan(0);
  });
});

describe('採用の結果', () => {
  it('同じシードなら同じ人が採用される', () => {
    expect(runHiring(input())).toEqual(runHiring(input()));
  });

  it('採用された人は勤続0のプロパー社員で、社員番号が続きになる', () => {
    const r = runHiring(input({ rng: createRng(5), employees: [...team, ...staff('sales', 40)] }));
    expect(r.hires.length).toBeGreaterThan(0);
    r.hires.forEach((e, i) => {
      expect(e.id).toBe(`e${100 + i}`);
      expect(e.tenureMonths).toBe(0);
      expect(e.affiliation).toBe('proper');
    });
    expect(r.cost).toBeGreaterThan(0);
  });

  it('需要が足りていて事務・管理も足りていれば、採用しない', () => {
    expect(totalHires({ demand: capacity * 0.9 })).toBe(0);
  });

  it('資金が足りないと採用しない（採用費もかからない）', () => {
    expect(totalHires({ cash: 0 })).toBe(0);
    expect(runHiring(input({ cash: 0 })).cost).toBe(0);
  });

  it('採用の強さを上げると、採用できる人数が増える', () => {
    expect(totalHires({ intensity: 2 })).toBeGreaterThan(totalHires({ intensity: 1 }) * 1.3);
    expect(totalHires({ intensity: 0 })).toBe(0);
  });

  it('採用が難しい地域では、採用できる人数が減る', () => {
    expect(totalHires({ location: getLocation('kochi') })).toBeLessThan(totalHires({ location: tokyo }));
  });
});
