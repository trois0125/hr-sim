/**
 * 制度と会社の相性：兆しのイベント（DESIGN.md §14.8。ステップ22）
 */
import { describe, expect, it } from 'vitest';
import { coef } from './coefficients';
import { defaultPolicies } from './data';
import { eventDefs, localizeEvent } from './eventData';
import { applyEffects, groupMembers } from './events';
import { runEvents } from './eventTriggers';
import { fitDefs } from './fitData';
import { generateCompany, setFoundingPolicies } from './generate';
import { createRng } from './rng';
import { runToEnd } from './tick';
import type { CompanyState, EventDef, PolicySet } from './types';

const fitEvents = eventDefs.filter((e) => e.trigger.type === 'fit');
const eventOf = (fitId: string) => fitEvents.find((e) => e.trigger.type === 'fit' && e.trigger.fitId === fitId) as EventDef;

/** 相性が続けて効いていたことにする（月の記録に相性の id を書く） */
function withStreak(c: CompanyState, fitId: string, months: number): CompanyState {
  const last = c.history[c.history.length - 1]!;
  c.history = Array.from({ length: months }, (_, i) => ({ ...last, month: i, fits: [fitId] }));
  c.month = months;
  return c;
}
function saasSkill(): CompanyState {
  // 子会社として始めると最初から社員が10人ほどいる（エンジニアが2人以上いる）
  const c = setFoundingPolicies(generateCompany({ seed: 4, industryId: 'saas', foundingPatternId: 'subsidiary', autoPlay: null }), {
    ...defaultPolicies,
    grade: 'skill',
  });
  return runToEnd(c, 1);
}

describe('兆しのイベントのデータ', () => {
  it('悪い相性の18個それぞれに1つずつある（良い相性 4・7・17 にはない）', () => {
    const bad = fitDefs.filter((f) => f.tone === 'bad').map((f) => f.id).sort();
    expect(bad).toHaveLength(18);
    expect(fitEvents.map((e) => (e.trigger.type === 'fit' ? e.trigger.fitId : '')).sort()).toEqual(bad);
  });

  it('どれも選択肢が3つで、学びの一言・判断の傾向の印がある。制度を見直す選択肢がある', () => {
    for (const e of fitEvents) {
      expect(e.choices, e.id).toHaveLength(3);
      for (const c of e.choices) {
        expect(c.lesson?.length ?? 0, e.id).toBeGreaterThan(10);
        expect(Object.keys(c.axes ?? {}).length, e.id).toBeGreaterThan(0);
      }
      expect(e.choices.some((c) => c.effects.openReview), e.id).toBe(true);
    }
  });

  it('「運用で補う」「様子を見る」は、当てはまる社員だけに効く', () => {
    for (const e of fitEvents) {
      const groups = e.choices.flatMap((c) => c.effects.groups ?? []);
      const fitId = e.trigger.type === 'fit' ? e.trigger.fitId : '';
      for (const g of groups) expect(g.fitId, e.id).toBe(fitId);
    }
  });

  it('業種に合わせた文がある（フレックス×全員が同じ時間に動く仕事：飲食は店舗、製造はライン）', () => {
    const e = eventOf('flex_synchronous');
    expect(localizeEvent(e, 'restaurant').body).toContain('店舗');
    expect(localizeEvent(e, 'manufacturing').body).toContain('ライン');
  });
});

describe('兆しのイベントの起き方', () => {
  it('相性が目安の月数続き、当てはまる社員が目安の人数以上いると起きる', () => {
    const c = withStreak(saasSkill(), 'skill_grade_engineer', coef('fit.sign_months'));
    expect(runEvents(c, createRng(1))).toContain(eventOf('skill_grade_engineer').id);
  });

  it('続いた月数が足りなければ起きない', () => {
    const c = withStreak(saasSkill(), 'skill_grade_engineer', coef('fit.sign_months') - 1);
    expect(runEvents(c, createRng(1))).not.toContain(eventOf('skill_grade_engineer').id);
  });

  it('途中で相性が切れた月があると、そこから数え直す', () => {
    const c = withStreak(saasSkill(), 'skill_grade_engineer', coef('fit.sign_months') + 2);
    c.history[c.history.length - 3]!.fits = [];
    expect(runEvents(c, createRng(1))).not.toContain(eventOf('skill_grade_engineer').id);
  });

  it('当てはまる社員が目安の人数より少なければ起きない', () => {
    const c = withStreak(saasSkill(), 'skill_grade_engineer', coef('fit.sign_months'));
    c.employees = c.employees.filter((e) => e.role !== 'engineer');
    expect(runEvents(c, createRng(1))).not.toContain(eventOf('skill_grade_engineer').id);
  });

  it('1社につき1回だけ起きる', () => {
    const c = withStreak(saasSkill(), 'skill_grade_engineer', coef('fit.sign_months'));
    const id = eventOf('skill_grade_engineer').id;
    expect(runEvents(c, createRng(1))).toContain(id);
    c.history.push({ ...c.history[c.history.length - 1]!, month: c.month });
    c.month += 1;
    expect(runEvents(c, createRng(2))).not.toContain(id);
  });

  it('兆しが2つ同時に出ていても、起きるのは1か月に1つ（次の月にもう1つ）', () => {
    const c = withStreak(saasSkill(), 'skill_grade_engineer', coef('fit.sign_months'));
    for (const r of c.history) r.fits = ['skill_grade_engineer', 'secondee_proper_fairness'];
    const first = runEvents(c, createRng(1)).filter((id) => id.startsWith('fit_'));
    expect(first).toHaveLength(1);
    c.history.push({ ...c.history[c.history.length - 1]!, month: c.month });
    c.month += 1;
    const second = runEvents(c, createRng(2)).filter((id) => id.startsWith('fit_'));
    expect(second).toHaveLength(1);
    expect(second[0]).not.toBe(first[0]);
  });

  it('対象者は当てはまる社員の1人（本文の {name} に入る）', () => {
    const c = withStreak(saasSkill(), 'skill_grade_engineer', coef('fit.sign_months'));
    runEvents(c, createRng(1));
    const d = c.pendingDecisions.find((x) => x.eventId === eventOf('skill_grade_engineer').id)!;
    const target = c.employees.find((e) => e.id === d.targetId);
    expect(target?.role).toBe('engineer');
  });
});

describe('会社全体の相性でも対象者がいる', () => {
  it('小さい会社の等級（会社全体の相性）でも、本文の {name} に入る対象者が選ばれる', () => {
    const c = setFoundingPolicies(generateCompany({ seed: 4, industryId: 'trading', foundingPatternId: 'subsidiary', autoPlay: null }), {
      ...defaultPolicies,
      grade: 'role',
    });
    const s = withStreak(runToEnd(c, 1), 'grade_small_company', coef('fit.sign_months'));
    runEvents(s, createRng(1));
    const d = s.pendingDecisions.find((x) => x.eventId === eventOf('grade_small_company').id)!;
    expect(d.targetId).not.toBeNull();
    expect(String(d.vars.name ?? '').length).toBeGreaterThan(0);
  });
});

describe('兆しのイベントの選択肢の効果', () => {
  it('当てはまる社員だけを集める（fitId の集団）', () => {
    const c = saasSkill();
    const members = groupMembers(c, { where: [], fitId: 'skill_grade_engineer' }, null);
    expect(members.length).toBeGreaterThan(0);
    expect(members.every((e) => e.role === 'engineer')).toBe(true);
  });

  it('「制度を見直す」は、画面で遊ぶときは制度の見直しを開く。自動で進めるときは開かない', () => {
    const c = saasSkill();
    applyEffects(c, { openReview: true }, { id: 'x', month: c.month, kind: 'event', eventId: null, ruleIds: [], vars: {} });
    expect(c.pendingDecisions.some((d) => d.kind === 'review' && d.vars.from === 'event')).toBe(true);
    const auto = saasSkill();
    auto.autoPlay = { legal: 'immediate' };
    applyEffects(auto, { openReview: true }, { id: 'x', month: auto.month, kind: 'event', eventId: null, ruleIds: [], vars: {} });
    expect(auto.pendingDecisions.some((d) => d.kind === 'review')).toBe(false);
  });

  it('自動で最後まで回すと、職能資格の SaaS で兆しのイベントが起き、判断が記録される', () => {
    const c = setFoundingPolicies(generateCompany({ seed: 4, industryId: 'saas', foundingPatternId: 'subsidiary' }), {
      ...defaultPolicies,
      grade: 'skill',
    } as PolicySet);
    const end = runToEnd(c, 60);
    expect(end.decisions.some((d) => d.eventId === eventOf('skill_grade_engineer').id)).toBe(true);
  });
});
