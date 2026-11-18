import { describe, expect, it } from 'vitest';
import { coef } from './coefficients';
import { createEmployee } from './employees';
import { generateCompany } from './generate';
import { ageBand, keyPeople, layerOf, summarizeLayers, usesLayerView } from './layers';
import { createRng } from './rng';
import { makeEmployee, tokyo, trading } from './testHelpers';
import { tick, tickInPlace } from './tick';
import type { Departure, Employee } from './types';

describe('層の分け方', () => {
  it('職種×年代（10歳刻み）。20代以下・60代以上はまとめる', () => {
    expect(ageBand(19)).toBe(20);
    expect(ageBand(29)).toBe(20);
    expect(ageBand(30)).toBe(30);
    expect(ageBand(67)).toBe(60);
    expect(layerOf({ role: 'sales', age: 34, employmentType: 'full' }).key).toBe('sales|30');
  });

  it('パートは年代で分けず、職種ごとに1つの層', () => {
    expect(layerOf({ role: 'admin', age: 24, employmentType: 'part' })).toEqual({ role: 'admin', band: null, key: 'admin|part' });
    expect(layerOf({ role: 'admin', age: 58, employmentType: 'part' }).key).toBe('admin|part');
  });
});

describe('層ごとの集計', () => {
  const team = (): Employee[] => [
    makeEmployee('sales', { age: 32, engagement: 30, salaryMonthly: 300000 }),
    makeEmployee('sales', { age: 35, engagement: 50, salaryMonthly: 400000 }),
    makeEmployee('sales', { age: 45, engagement: 70 }),
    makeEmployee('admin', { age: 33, engagement: 60, employmentType: 'part' }),
  ];

  it('人数・納得感の平均とばらつき・不満の人数・平均月給', () => {
    const layers = summarizeLayers(team(), { industry: trading });
    const s30 = layers.find((l) => l.key === 'sales|30');
    expect(s30?.count).toBe(2);
    expect(s30?.engagementMean).toBeCloseTo(40);
    expect(s30?.engagementSd).toBeCloseTo(10);
    expect(s30?.lowEngagement).toBe(1);
    expect(s30?.salaryMean).toBeCloseTo(350000);
    expect(layers.map((l) => l.key)).toEqual(['sales|30', 'sales|40', 'admin|part']);
  });

  it('層全体でいちばん納得感を下げている要因を出す', () => {
    const scores = { externalPay: 50, internalFairness: 50, evaluation: 50, workload: 10, growthOpportunity: 50, stability: 50 };
    const t = team().map((e) => ({ ...e, factorScores: scores }));
    const l = summarizeLayers(t, { industry: trading }).find((x) => x.key === 'sales|30');
    expect(l?.biggestDrag).toBe('workload');
    expect(l?.factorMeans?.workload).toBeCloseTo(10);
  });

  it('直近12か月の退職を層ごとに数える（パートの退職はパートの層）', () => {
    const d = (age: number, month: number, employmentType: Departure['employmentType'] = 'full'): Departure =>
      ({ employeeId: 'x', name: 'x', role: 'sales', employmentType, month, kind: 'resignation', reason: 'pay', age }) as Departure;
    const departures = [d(31, 50), d(38, 45), d(33, 30), d(40, 50, 'part')];
    const layers = summarizeLayers(team(), { industry: trading, departures, month: 50 });
    expect(layers.find((l) => l.key === 'sales|30')?.resignations12).toBe(2); // 30か月目は12か月より前
  });

  it('等級で絞り込める（そのときは退職を数えない）', () => {
    const t = team();
    (t[0] as Employee).grade = 2;
    const layers = summarizeLayers(t, { industry: trading, grade: 2, departures: [], month: 10 });
    expect(layers).toHaveLength(1);
    expect(layers[0]?.count).toBe(1);
    expect(layers[0]?.resignations12).toBeNull();
  });
});

describe('主要人物', () => {
  it('主要人物 → 創業メンバー → 実力の高い順に選び、上限で止める', () => {
    const key = makeEmployee('sales', { isKeyPerson: true, hireChannel: 'founding' });
    const founder = makeEmployee('sales', { hireChannel: 'founding', ability: 40 });
    const others = [90, 80, 70, 60].map((ability) => makeEmployee('sales', { hireChannel: 'mid_career', ability }));
    const out = keyPeople([...others, founder, key], 4);
    expect(out.map((x) => x.reason)).toEqual(['key', 'founding', 'ace', 'ace']);
    expect(out[0]?.employee).toBe(key);
    expect(out.slice(2).map((x) => x.employee.ability)).toEqual([90, 80]);
  });

  it('上限は係数台帳の値（20人）', () => {
    const many = Array.from({ length: 50 }, (_, i) => makeEmployee('sales', { ability: i, hireChannel: 'mid_career' }));
    expect(keyPeople(many)).toHaveLength(coef('ui.key_people_max'));
  });

  it('100人を超えたら層の表示に切り替える', () => {
    expect(usesLayerView(100)).toBe(false);
    expect(usesLayerView(101)).toBe(true);
  });
});

describe('計算が重くならない', () => {
  /** n人の会社（資金は十分にあり、勤続3年） */
  function bigCompany(n: number) {
    const c = generateCompany({ seed: 5, industryId: 'trading' });
    const rng = createRng(1);
    const roles = ['sales', 'sales', 'admin', 'management'];
    c.employees = Array.from({ length: n }, (_, i) => ({
      ...createEmployee({ rng, id: `x${i}`, industry: trading, location: tokyo, role: roles[i % roles.length] as string, employmentType: 'full', affiliation: 'proper' }),
      tenureMonths: 36,
    }));
    c.month = 120;
    c.cash = 1e12;
    return c;
  }
  /** 1か月あたりの時間（ミリ秒）。最初の1か月は準備として外す */
  function msPerMonth(step: () => void, months = 12): number {
    step();
    const t0 = performance.now();
    for (let i = 0; i < months; i++) step();
    return (performance.now() - t0) / months;
  }

  it('1,000人の会社でも、1か月の計算が50ms以内（画面と同じく状態をコピーしても100ms以内）', () => {
    const a = bigCompany(1000);
    const inPlace = msPerMonth(() => tickInPlace(a));
    expect(a.employees.length).toBeGreaterThan(800);
    let b = bigCompany(1000);
    const cloned = msPerMonth(() => {
      b = tick(b);
    });
    expect(inPlace).toBeLessThan(50);
    expect(cloned).toBeLessThan(100);
  });

  it('1,000人を層にまとめるのは10ms以内', () => {
    const c = bigCompany(1000);
    const t0 = performance.now();
    const layers = summarizeLayers(c.employees, { industry: trading, departures: c.departures, month: c.month });
    keyPeople(c.employees);
    expect(performance.now() - t0).toBeLessThan(10);
    expect(layers.reduce((s, l) => s + l.count, 0)).toBe(1000);
  });
});
