import { describe, expect, it } from 'vitest';
import { defaultPolicies } from '../engine/data';
import { eventDefs } from '../engine/eventData';
import { generateCompany, setFoundingPolicies } from '../engine/generate';
import { programDefs } from '../engine/programs';
import { runToEnd } from '../engine/tick';
import type { CompanyState, PolicySet } from '../engine/types';
import { collectChanges, groupChanges, swingScore, typicalSwing, windowStats, type ChangeItem } from './retrospective';

/** 自動で最後まで回した会社 */
function played(seed = 11, policies: PolicySet = defaultPolicies): CompanyState {
  return runToEnd(setFoundingPolicies(generateCompany({ seed, industryId: 'trading' }), policies));
}

const isInitiative = (eventId: string) => eventDefs.find((e) => e.id === eventId)?.trigger.type === 'initiative';

describe('変更の拾い出し', () => {
  it('制度の変更・施策・個別制度・組織改編を月の順に拾う。創業時の制度は拾わない', () => {
    const c = played(11);
    c.policyChanges = [{ month: 40, categories: ['training'], resistance: 4, method: null, transition: false, affected: 0, averageCutPct: 0 }];
    c.programLog = [{ month: 20, id: programDefs[0]!.id, action: 'install' }];
    c.organization.log = [{ month: 60, from: 'direct', to: 'functional', method: 'careful' }];
    const initiative = eventDefs.find((e) => e.trigger.type === 'initiative')!;
    c.decisions = [{ month: 30, eventId: initiative.id, choiceIndex: 0, targetId: null, axes: {}, diagnosis: {}, auto: false }];
    expect(collectChanges(c).map((x) => [x.month, x.kind])).toEqual([
      [20, 'program'],
      [30, 'initiative'],
      [40, 'policy'],
      [60, 'reorg'],
    ]);
  });

  it('制度の変更は、その月の制度の選択肢を持つ', () => {
    const c = played(11);
    c.policyChanges = [{ month: 40, categories: ['training'], resistance: 4, method: 'consent', transition: false, affected: 0, averageCutPct: 0 }];
    const p = collectChanges(c).find((x) => x.kind === 'policy');
    expect(p).toEqual({
      month: 40,
      kind: 'policy',
      changes: [{ category: 'training', option: c.history.find((r) => r.month === 40)!.policies!.training }],
      method: 'consent',
    });
  });

  it('施策でない出来事での判断は拾わない', () => {
    const c = played(11);
    c.policyChanges = [];
    c.programLog = [];
    c.organization.log = [];
    c.decisions = c.decisions.filter((d) => !isInitiative(d.eventId));
    expect(c.decisions.length).toBeGreaterThan(0);
    expect(collectChanges(c)).toEqual([]);
  });
});

describe('変更のまとめ', () => {
  const at = (month: number): ChangeItem => ({ month, kind: 'program', programId: 'x', action: 'install' });

  it('前の変更から6か月以内ならまとめ、離れていれば別にする', () => {
    expect(groupChanges([at(10), at(16), at(30)]).map((g) => [g.first, g.last, g.items.length])).toEqual([
      [10, 16, 2],
      [30, 30, 1],
    ]);
  });

  it('4か月おきに続く変更は、1つの長いまとまりになる', () => {
    const g = groupChanges([0, 4, 8, 12, 16, 20].map((m) => at(m + 10)));
    expect(g).toHaveLength(1);
    expect([g[0]!.first, g[0]!.last]).toEqual([10, 30]);
  });

  it('変更がなければ空', () => {
    expect(groupChanges([])).toEqual([]);
  });
});

describe('期間の数字', () => {
  it('6か月の人件費率・営業利益・離職率・入社・納得感を記録から計算する', () => {
    const c = played(11);
    const rows = c.history.filter((r) => r.month >= 24 && r.month < 30);
    const w = windowStats(c, 24, 30)!;
    const rev = rows.reduce((s, r) => s + r.revenue, 0);
    const head = rows.reduce((s, r) => s + r.headcount, 0) / 6;
    expect(w.months).toBe(6);
    expect(w.laborCostRatio).toBeCloseTo(rows.reduce((s, r) => s + r.labor.total, 0) / rev);
    expect(w.operatingProfit).toBeCloseTo(rows.reduce((s, r) => s + r.operatingProfit, 0) / 6);
    expect(w.attritionRate).toBeCloseTo((rows.reduce((s, r) => s + r.resignations, 0) / head) * 2);
    expect(w.hires).toBe(rows.reduce((s, r) => s + r.hires, 0));
    expect(w.engagement).toBeCloseTo(rows.reduce((s, r) => s + r.avgEngagement, 0) / 6);
    expect(w.economy).toBeCloseTo(rows.reduce((s, r) => s + r.economy, 0) / 6);
  });

  it('退職理由はその期間に自分から辞めた人でいちばん多いもの', () => {
    const c = played(11);
    const base = { employeeId: 'e', name: 'n', role: 'r', age: 30, tenureMonths: 12, salaryMonthly: 1, engagement: 1 };
    c.departures = [
      { ...base, month: 25, kind: 'resignation', reason: 'workload' },
      { ...base, month: 26, kind: 'resignation', reason: 'workload' },
      { ...base, month: 27, kind: 'resignation', reason: 'pay' },
      { ...base, month: 28, kind: 'retirement', reason: null },
      { ...base, month: 40, kind: 'resignation', reason: 'pay' },
    ] as CompanyState['departures'];
    expect(windowStats(c, 24, 30)!.topReason).toBe('workload');
    expect(windowStats(c, 0, 6)!.topReason).toBeNull();
  });

  it('売上が0の期間は人件費率が null で、NaN が出ない', () => {
    const c = played(11);
    for (const r of c.history) if (r.month < 6) r.revenue = 0;
    const w = windowStats(c, 0, 6)!;
    expect(w.laborCostRatio).toBeNull();
    expect(Number.isNaN(w.attritionRate)).toBe(false);
  });

  it('社員が0人の期間でも離職率は0で、NaN が出ない', () => {
    const c = played(11);
    for (const r of c.history) if (r.month < 6) r.headcount = 0;
    expect(windowStats(c, 0, 6)!.attritionRate).toBe(0);
  });

  it('記録のない期間は null', () => {
    expect(windowStats(played(11), 9999, 10005)).toBeNull();
  });

  it('納得感の内訳は記録がある月の平均。内訳がない古い記録では null', () => {
    const c = played(11);
    expect(windowStats(c, 24, 30)!.factors).not.toBeNull();
    for (const r of c.history) delete r.org;
    expect(windowStats(c, 24, 30)!.factors).toBeNull();
  });
});

describe('ふだんの揺れ', () => {
  it('動きのある会社では正の値', () => {
    expect(typicalSwing(played(11), 'operatingProfit')).toBeGreaterThan(0);
  });

  it('ずっと同じ値なら0で、点数も0（0で割らない）', () => {
    const c = played(11);
    for (const r of c.history) r.avgEngagement = 50;
    expect(typicalSwing(c, 'engagement')).toBe(0);
    expect(swingScore(55, 50, 0)).toBe(0);
  });

  it('点数は差÷ふだんの揺れ。どちらかが null なら0', () => {
    expect(swingScore(0.4, 0.3, 0.05)).toBeCloseTo(2);
    expect(swingScore(0.3, 0.4, 0.05)).toBeCloseTo(2);
    expect(swingScore(null, 0.3, 0.05)).toBe(0);
  });
});
