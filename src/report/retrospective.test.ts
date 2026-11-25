import { describe, expect, it } from 'vitest';
import { defaultPolicies } from '../engine/data';
import { eventDefs } from '../engine/eventData';
import { generateCompany, setFoundingPolicies } from '../engine/generate';
import { programDefs } from '../engine/programs';
import { runToEnd } from '../engine/tick';
import type { CompanyState, PolicySet } from '../engine/types';
import { coef } from '../engine/coefficients';
import { changePolicies } from '../engine/policyChange';
import {
  buildCards,
  buildRetrospective,
  collectChanges,
  groupChanges,
  swingScore,
  typicalSwing,
  windowStats,
  type ChangeItem,
} from './retrospective';

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

describe('変更の振り返り', () => {
  const W = () => coef('retrospective.window_months');
  /** 研修なしで3年回し、研修を売上比1%に変えて1年半回した会社と、変えずに回した会社 */
  function pair() {
    const start = setFoundingPolicies(generateCompany({ seed: 21, industryId: 'trading' }), { ...defaultPolicies, training: '0' });
    const base = runToEnd(start, 36);
    const changed = runToEnd(changePolicies(base, { ...base.policies, training: '1' }), 18);
    const control = runToEnd(base, 18);
    return { changed, control, month: base.month };
  }
  const noChanges = (c: CompanyState) => {
    c.policyChanges = [];
    c.programLog = [];
    c.organization.log = [];
    c.decisions = c.decisions.filter((d) => !isInitiative(d.eventId));
  };
  const trainingChange = (month: number) => ({
    month,
    categories: ['training' as const],
    resistance: 4,
    method: null,
    transition: false,
    affected: 0,
    averageCutPct: 0,
  });

  it('研修を増やすと、1年後の人件費率が変えなかった会社の同じ時期より高い（制度の方向に動く）', () => {
    const { changed, control, month } = pair();
    const a = windowStats(changed, month + W(), month + 2 * W())!.laborCostRatio!;
    const b = windowStats(control, month + W(), month + 2 * W())!.laborCostRatio!;
    expect(a).toBeGreaterThan(b);
  });

  it('前・直後・1年後の期間がそろい、人件費率の矢印は良い悪いを付けない', () => {
    const { changed, month } = pair();
    const card = buildCards(changed).find((x) => x.group.items.some((i) => i.kind === 'policy'))!;
    expect(card.group.first).toBe(month);
    expect(card.before.months).toBe(W());
    expect(card.soon.months).toBe(W());
    expect(card.later.months).toBe(W());
    expect(card.arrows.laborCostRatio.later.tone).toBe('neutral');
    expect(card.arrows.laborCostRatio.soon.tone).toBe('neutral');
  });

  it('矢印：営業利益が上がれば良い、離職率が上がれば悪い、小さな差は「→」', () => {
    const { changed } = pair();
    const card = buildCards(changed).find((x) => x.group.items.some((i) => i.kind === 'policy'))!;
    const swingAttr = typicalSwing(changed, 'attritionRate');
    for (const r of changed.history) {
      if (r.month >= card.group.last + W() && r.month < card.group.last + 2 * W()) r.resignations += 3;
    }
    const again = buildCards(changed).find((x) => x.group.first === card.group.first)!;
    expect(again.arrows.attritionRate.later).toEqual({ dir: 'up', tone: 'bad' });
    expect(swingAttr).toBeGreaterThan(0);
    for (const r of changed.history) r.operatingProfit = 100;
    const flat = buildCards(changed).find((x) => x.group.first === card.group.first)!;
    expect(flat.arrows.operatingProfit.later).toEqual({ dir: 'flat', tone: 'neutral' });
    for (const r of changed.history) if (r.month >= card.group.last + W()) r.operatingProfit = 1e9;
    const up = buildCards(changed).find((x) => x.group.first === card.group.first)!;
    expect(up.arrows.operatingProfit.later).toEqual({ dir: 'up', tone: 'good' });
  });

  it('終わりまで1年ない変更と、前が3か月に満たない変更は出ない', () => {
    const c = played(11);
    noChanges(c);
    c.policyChanges = [trainingChange(1), trainingChange(c.month - 6)];
    expect(buildCards(c)).toEqual([]);
  });

  it('最大5件、月の順、点数は目安以上', () => {
    const c = played(11);
    noChanges(c);
    c.policyChanges = Array.from({ length: 12 }, (_, i) => trainingChange(20 + i * 14));
    const all = buildCards(c);
    expect(all.length).toBeGreaterThan(coef('retrospective.max_cards'));
    const r = buildRetrospective(c);
    expect(r.length).toBeLessThanOrEqual(coef('retrospective.max_cards'));
    for (let i = 1; i < r.length; i++) expect(r[i]!.group.first).toBeGreaterThan(r[i - 1]!.group.first);
    for (const x of r) expect(x.score).toBeGreaterThanOrEqual(coef('retrospective.notable_score'));
  });

  it('点数の高いものから選ぶ', () => {
    const c = played(11);
    noChanges(c);
    c.policyChanges = Array.from({ length: 12 }, (_, i) => trainingChange(20 + i * 14));
    const all = buildCards(c);
    const picked = buildRetrospective(c);
    const threshold = coef('retrospective.notable_score');
    const eligible = all.filter((x) => x.score >= threshold).map((x) => x.score).sort((a, b) => b - a);
    const minPicked = Math.min(...picked.map((x) => x.score));
    const dropped = eligible.slice(picked.length);
    for (const s of dropped) expect(s).toBeLessThanOrEqual(minPicked);
  });

  it('変更がなければ空', () => {
    const c = played(11);
    noChanges(c);
    expect(buildRetrospective(c)).toEqual([]);
  });

  it('同じ状態からは同じ振り返り', () => {
    const { changed } = pair();
    expect(buildRetrospective(structuredClone(changed))).toEqual(buildRetrospective(changed));
  });

  it('納得感の内訳がない古い記録でも落ちず、要因は null', () => {
    const { changed } = pair();
    for (const r of changed.history) delete r.org;
    const cards = buildCards(changed);
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) {
      expect(card.factorUp).toBeNull();
      expect(card.factorDown).toBeNull();
    }
  });

  it('要因：1年後に前より最も上がったものと最も下がったもの', () => {
    const { changed } = pair();
    const card = buildCards(changed).find((x) => x.group.items.some((i) => i.kind === 'policy'))!;
    for (const r of changed.history) {
      if (!r.org?.factors) continue;
      const after = r.month >= card.group.last + W();
      r.org.factors = { ...r.org.factors, evaluation: after ? 90 : 10, workload: after ? 10 : 90 };
    }
    const again = buildCards(changed).find((x) => x.group.first === card.group.first)!;
    expect(again.factorUp).toBe('evaluation');
    expect(again.factorDown).toBe('workload');
  });

  it('声は最大2つで、直後〜1年後の期間のふだんの声（不満・前向きがなければふつうの声で埋める）', () => {
    const { changed } = pair();
    const cards = buildCards(changed);
    expect(cards.some((x) => x.voices.length > 0)).toBe(true);
    for (const card of cards) {
      expect(card.voices.length).toBeLessThanOrEqual(2);
      expect(new Set(card.voices).size).toBe(card.voices.length);
      for (const v of card.voices) {
        expect(v.kind).toBe('voice');
        expect(v.month).toBeGreaterThanOrEqual(card.group.last);
        expect(v.month).toBeLessThan(card.group.last + 2 * W());
      }
    }
  });
});

describe('カードの声の選び方', () => {
  it('不満と前向きの声があればそれを選び、同じ要因の声を優先する', () => {
    const { changed } = (() => {
      const start = setFoundingPolicies(generateCompany({ seed: 21, industryId: 'trading' }), { ...defaultPolicies, training: '0' });
      const base = runToEnd(start, 36);
      return { changed: runToEnd(changePolicies(base, { ...base.policies, training: '1' }), 18) };
    })();
    const card = buildCards(changed).find((x) => x.group.items.some((i) => i.kind === 'policy'))!;
    for (const r of changed.history) {
      if (!r.org?.factors) continue;
      const after = r.month >= card.group.last + coef('retrospective.window_months');
      r.org.factors = { ...r.org.factors, evaluation: after ? 90 : 10, workload: after ? 10 : 90 };
    }
    const v = (month: number, tone: 'negative' | 'positive', factor: 'evaluation' | 'workload' | 'stability') => ({
      month, employeeId: 'e', name: 'n', role: 'r', kind: 'voice' as const, tone, factor, text: `${tone}:${factor}`,
    });
    changed.voices = [v(card.group.last + 1, 'negative', 'stability'), v(card.group.last + 2, 'negative', 'workload'), v(card.group.last + 3, 'positive', 'evaluation'), v(card.group.last + 4, 'positive', 'stability')];
    const again = buildCards(changed).find((x) => x.group.first === card.group.first)!;
    expect(again.voices.map((x) => x.text)).toEqual(['negative:workload', 'positive:evaluation']);
  });
});
