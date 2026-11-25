import { describe, expect, it } from 'vitest';
import { defaultPolicies } from '../engine/data';
import { eventDefs } from '../engine/eventData';
import { generateCompany, setFoundingPolicies } from '../engine/generate';
import { programDefs } from '../engine/programs';
import { runToEnd } from '../engine/tick';
import type { CompanyState, PolicySet } from '../engine/types';
import { collectChanges, groupChanges, type ChangeItem } from './retrospective';

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
