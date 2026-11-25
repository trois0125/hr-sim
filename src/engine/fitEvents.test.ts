/**
 * 制度と会社の相性：兆しのイベント（DESIGN.md §14.8。ステップ22）
 */
import { describe, expect, it } from 'vitest';
import { coef } from './coefficients';
import { defaultPolicies } from './data';
import { eventDefs, localizeEvent } from './eventData';
import { applyEffects, groupMembers, resolveEvent } from './events';
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
      // 出向者との差（19）は制度では消せないので、見直しの代わりにプロパーの給与を上げる選択肢
      if (e.trigger.type === 'fit' && e.trigger.fitId === 'secondee_proper_fairness') continue;
      expect(e.choices.some((c) => c.effects.openReview), e.id).toBe(true);
    }
  });

  it('「制度を見直す」には、見直しの画面が開くことを知らせる補足がある', () => {
    for (const e of fitEvents) {
      for (const c of e.choices.filter((x) => x.effects.openReview)) expect(c.hint ?? '', e.id).toContain('見直しの画面が開きます');
    }
  });

  it('費用は当てはまる社員の人数で払う（社員に当てはまる相性）。会社全体の相性は全員で払う', () => {
    for (const e of fitEvents) {
      const fit = fitDefs.find((f) => e.trigger.type === 'fit' && f.id === e.trigger.fitId)!;
      for (const c of e.choices) {
        if (fit.who) expect(c.effects.cashPerEmployee, e.id).toBeUndefined();
      }
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

  it('当てはまる社員が目安の人数より少なければ起きない（1人だけ残す）', () => {
    const c = withStreak(saasSkill(), 'skill_grade_engineer', coef('fit.sign_months'));
    const engineers = c.employees.filter((e) => e.role === 'engineer');
    expect(engineers.length).toBeGreaterThanOrEqual(2);
    c.employees = c.employees.filter((e) => e.role !== 'engineer' || e.id === engineers[0]!.id);
    expect(runEvents(c, createRng(1))).not.toContain(eventOf('skill_grade_engineer').id);
  });

  it('休職中の人は当てはまる人数に数えない', () => {
    const c = withStreak(saasSkill(), 'skill_grade_engineer', coef('fit.sign_months'));
    const engineers = c.employees.filter((e) => e.role === 'engineer');
    for (const e of engineers.slice(1)) e.leave = { kind: 'mental', startMonth: 0, endsAt: 99, returnRate: 1 } as never;
    expect(runEvents(c, createRng(1))).not.toContain(eventOf('skill_grade_engineer').id);
  });

  it('判断を終えたあとも、2回目は起きない', () => {
    const c = withStreak(saasSkill(), 'skill_grade_engineer', coef('fit.sign_months'));
    const id = eventOf('skill_grade_engineer').id;
    runEvents(c, createRng(1));
    const d = c.pendingDecisions.find((x) => x.eventId === id)!;
    resolveEvent(c, d.id, 2);
    expect(c.decisions.some((x) => x.eventId === id)).toBe(true);
    c.history.push({ ...c.history[c.history.length - 1]!, month: c.month });
    c.month += 1;
    expect(runEvents(c, createRng(3))).not.toContain(id);
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
    // 相性の番号の順（6：職能資格×エンジニア が 19：出向者 より先）
    expect(first[0]).toBe(eventOf('skill_grade_engineer').id);
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

  it('「運用で補う」は当てはまる社員の納得感だけを上げ、「様子を見る」は下げる', () => {
    const e = eventOf('skill_grade_engineer');
    const run = (choice: number) => {
      const c = saasSkill();
      const before = new Map(c.employees.map((x) => [x.id, x.engagement]));
      applyEffects(c, e.choices[choice]!.effects, { id: 'x', month: c.month, kind: 'event', eventId: e.id, ruleIds: [], vars: {} });
      const diff = (role: string) => c.employees.filter((x) => x.role === role).map((x) => x.engagement - before.get(x.id)!);
      return { eng: diff('engineer'), biz: diff('biz') };
    };
    const comp = run(1);
    expect(comp.eng.every((d) => d > 0)).toBe(true);
    expect(comp.biz.every((d) => d === 0)).toBe(true);
    expect(run(2).eng.every((d) => d < 0)).toBe(true);
  });

  it('年の決算の見直しが判断待ちなら、兆しの「制度を見直す」でもう1枚は作らない', () => {
    const c = saasSkill();
    c.pendingDecisions.push({ id: 'r1', month: c.month, kind: 'review', ruleIds: [], eventId: null, vars: { year: 1 } });
    applyEffects(c, { openReview: true }, { id: 'x', month: c.month, kind: 'event', eventId: null, ruleIds: [], vars: {} });
    expect(c.pendingDecisions.filter((d) => d.kind === 'review')).toHaveLength(1);
  });

  it('対象者は、できればプロパーの正社員から選ぶ（会社全体の相性）', () => {
    const c = setFoundingPolicies(generateCompany({ seed: 4, industryId: 'trading', foundingPatternId: 'subsidiary', autoPlay: null }), {
      ...defaultPolicies,
      grade: 'role',
    });
    const s = withStreak(runToEnd(c, 1), 'grade_small_company', coef('fit.sign_months'));
    runEvents(s, createRng(1));
    const d = s.pendingDecisions.find((x) => x.eventId === eventOf('grade_small_company').id)!;
    const t = s.employees.find((e) => e.id === d.targetId)!;
    expect(t.affiliation).toBe('proper');
    expect(t.employmentType).toBe('full');
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
