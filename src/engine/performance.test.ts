import { describe, expect, it } from 'vitest';
import { coef } from './coefficients';
import {
  abilityFactor,
  computeOvertime,
  computePerformance,
  engagementFactor,
  founderOutput,
  fte,
  overtimeCap,
  rampFactor,
} from './performance';
import { chemicals, makeEmployee, staff, trading } from './testHelpers';

const perf = (employees: ReturnType<typeof staff>) => computePerformance(employees, trading, chemicals);

describe('個人の補正', () => {
  it('納得感の補正は 20→0.8、50→1.0、80→1.1 で、間は直線', () => {
    expect(engagementFactor(20)).toBeCloseTo(0.8);
    expect(engagementFactor(50)).toBeCloseTo(1.0);
    expect(engagementFactor(80)).toBeCloseTo(1.1);
    expect(engagementFactor(35)).toBeCloseTo(0.9);
    expect(engagementFactor(65)).toBeCloseTo(1.05);
    expect(engagementFactor(0)).toBeCloseTo(0.8);
    expect(engagementFactor(100)).toBeCloseTo(1.1);
  });

  it('実力が高いほど、勤続が長いほど（一人前まで）成果が上がる', () => {
    expect(abilityFactor(50)).toBeCloseTo(1);
    expect(abilityFactor(80)).toBeGreaterThan(abilityFactor(50));
    expect(abilityFactor(20)).toBeLessThan(abilityFactor(50));
    expect(rampFactor(0)).toBeCloseTo(coef('performance.ramp_start'));
    expect(rampFactor(3)).toBeGreaterThan(rampFactor(0));
    expect(rampFactor(coef('performance.ramp_months'))).toBeCloseTo(1);
    expect(rampFactor(100)).toBeCloseTo(1);
  });

  it('パートの稼働はフルタイムより小さい', () => {
    expect(fte(makeEmployee('sales'))).toBe(1);
    expect(fte(makeEmployee('sales', { employmentType: 'part' }))).toBeLessThan(1);
  });
});

describe('会社全体の売れる上限', () => {
  it('社員がいなくても、社長のぶんの売上はある', () => {
    expect(perf([]).capacity).toBeCloseTo(founderOutput(trading, chemicals));
  });

  it('営業が増えると上限が上がる', () => {
    expect(perf(staff('sales', 3)).capacity).toBeGreaterThan(perf(staff('sales', 2)).capacity);
  });

  it('納得感が高いと上限が上がり、低いと下がる', () => {
    const base = perf(staff('sales', 4)).capacity;
    expect(perf(staff('sales', 4, { engagement: 80 })).capacity).toBeGreaterThan(base);
    expect(perf(staff('sales', 4, { engagement: 20 })).capacity).toBeLessThan(base);
  });

  it('事務が足りないと営業の稼働が下がり、事務を入れると戻る', () => {
    const noAdmin = perf(staff('sales', 6));
    const withAdmin = perf([...staff('sales', 6), ...staff('admin', 3)]);
    expect(noAdmin.adminFactor).toBeLessThan(1);
    expect(withAdmin.adminFactor).toBeCloseTo(1);
    expect(withAdmin.capacity).toBeGreaterThan(noAdmin.capacity);
  });

  it('事務は必要な人数を超えて増やしても、上限は上がらない', () => {
    const enough = perf([...staff('sales', 4), ...staff('admin', 2)]);
    const more = perf([...staff('sales', 4), ...staff('admin', 4)]);
    expect(more.capacity).toBeCloseTo(enough.capacity);
  });

  it('社員が1人増えただけで効率が急に落ちることはない（段差がない）', () => {
    for (let n = 1; n < 40; n++) {
      const a = perf(staff('sales', n));
      const b = perf(staff('sales', n + 1));
      expect(b.capacity).toBeGreaterThan(a.capacity);
      expect(a.managementFactor - b.managementFactor).toBeLessThan(0.05);
    }
  });

  it('社長が見られる人数までは、管理がいなくても効率は落ちない', () => {
    const small = perf([...staff('sales', 4), ...staff('admin', 2)]);
    expect(small.managementFactor).toBe(1);
  });

  it('人数が増えると管理が必要になり、管理を入れるほど効率が戻る', () => {
    const team = [...staff('sales', 20), ...staff('admin', 10)];
    const none = perf(team);
    const some = perf([...team, ...staff('management', 1)]);
    const enough = perf([...team, ...staff('management', 4)]);
    expect(none.managementFactor).toBeLessThan(1);
    expect(some.managementFactor).toBeGreaterThan(none.managementFactor);
    expect(enough.managementFactor).toBeCloseTo(1);
  });
});

describe('残業', () => {
  const p = perf([...staff('sales', 4), ...staff('admin', 2)]);

  it('需要が上限以下なら残業は0', () => {
    expect(computeOvertime(p.capacity * 0.9, p, 45)).toEqual({ hours: 0, extraCapacity: 0 });
  });

  it('需要が上限を少し超えると、そのぶんだけ残業する', () => {
    const o = computeOvertime(p.capacity * 1.05, p, 45);
    expect(o.hours).toBeGreaterThan(0);
    expect(o.hours).toBeLessThan(45);
    expect(p.capacity + o.extraCapacity).toBeCloseTo(p.capacity * 1.05);
  });

  it('残業の方針の上限が低いほど、残業も売上の上積みも小さい', () => {
    const caps = ['none', 'limit20', 'limit45', 'special'] as const;
    const results = caps.map((c) => computeOvertime(p.capacity * 3, p, overtimeCap(c)));
    expect(results[0]).toEqual({ hours: 0, extraCapacity: 0 });
    for (let i = 1; i < results.length; i++) {
      expect(results[i]?.hours).toBeGreaterThan(results[i - 1]?.hours ?? 0);
      expect(results[i]?.extraCapacity).toBeGreaterThan(results[i - 1]?.extraCapacity ?? 0);
    }
    expect(overtimeCap('limit45')).toBe(45);
  });

  it('需要が大きく超えても、残業は上限で止まる', () => {
    const o = computeOvertime(p.capacity * 3, p, 45);
    expect(o.hours).toBe(45);
    expect(p.capacity + o.extraCapacity).toBeLessThan(p.capacity * 3);
  });
});
