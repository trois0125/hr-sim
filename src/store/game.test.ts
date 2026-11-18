import { describe, expect, it } from 'vitest';
import { defaultPolicies } from '../engine/data';
import { createGameStore, collectFeed } from './game';
import { previewChange } from '../engine/policyChange';
import type { PolicySet } from '../engine/types';

/** 画面のプレイヤーと同じ操作で、最後まで遊ぶ（タイマーは使わず、1か月ずつ進める） */
function playToEnd(store: ReturnType<typeof createGameStore>, maxSteps = 5000) {
  let steps = 0;
  let reviews = 0;
  let milestones = 0;
  while (store.getState().screen === 'main' && steps < maxSteps) {
    steps++;
    const s = store.getState();
    const d = s.company?.pendingDecisions[0];
    if (!d) {
      s.step();
      continue;
    }
    if (d.kind === 'milestone') s.answerMilestone(d.id, 'immediate', ++milestones === 1 ? '辞めない会社にしたい' : undefined);
    else if (d.kind === 'event') s.answerEvent(d.id, 0);
    else {
      reviews++;
      // 3年目の見直しでは、育成投資を増やす
      if (reviews === 3) {
        const c = s.company!;
        const next: PolicySet = { ...c.policies, training: '1' };
        s.changePolicy(next, previewChange(c, next).isDisadvantageous ? { method: 'consent' } : {});
      } else s.finishReview(d.id);
    }
  }
  return { steps, reviews };
}

describe('ゲームの進行（画面と同じ操作）', () => {
  it('タイトル → 会社の生成 → 最初の制度 → メイン → 終了画面 まで遊べる', () => {
    const store = createGameStore({ timers: false });
    const s = store.getState();
    expect(s.screen).toBe('title');
    s.goto('generate');
    s.newCandidate('trading');
    expect(store.getState().candidate?.profile.industryId).toBe('trading');
    s.goto('policies');
    s.startGame({ ...defaultPolicies, overtime: 'limit20' });
    expect(store.getState().screen).toBe('main');
    expect(store.getState().company?.policies.overtime).toBe('limit20');

    const { reviews } = playToEnd(store);
    const end = store.getState();
    expect(end.screen).toBe('end');
    expect(end.company?.status).not.toBe('running');
    expect(reviews).toBeGreaterThan(0);
    expect(end.company?.reflections[0]?.text).toBe('辞めない会社にしたい');
    expect(end.feed.length).toBeGreaterThan(0);
    // 3年目の見直しで育成投資を変えた（見直しは同時に終わる）
    if ((end.company?.month ?? 0) > 36) {
      expect(end.company?.policies.training).toBe('1');
      expect(end.company?.policyChanges).toHaveLength(1);
    }
  });

  it('判断待ちの間は、1か月進めようとしても進まない', () => {
    const store = createGameStore({ timers: false });
    store.getState().newCandidate('trading');
    store.getState().startGame(defaultPolicies);
    for (let i = 0; i < 400 && !store.getState().company?.pendingDecisions.length; i++) store.getState().step();
    const month = store.getState().company?.month;
    expect(store.getState().company?.pendingDecisions.length).toBeGreaterThan(0);
    store.getState().step();
    expect(store.getState().company?.month).toBe(month);
  });

  it('制度の見直しの画面を開いている間は進まない', () => {
    const store = createGameStore({ timers: false });
    store.getState().newCandidate('trading');
    store.getState().startGame(defaultPolicies);
    // 最初の節目を片づける
    const d = store.getState().company?.pendingDecisions[0];
    if (d?.kind === 'milestone') store.getState().answerMilestone(d.id, 'immediate');
    store.getState().openEditor();
    const month = store.getState().company?.month;
    store.getState().step();
    expect(store.getState().company?.month).toBe(month);
    store.getState().closeEditor();
  });

  it('イベントを選ぶと、学びの一言が残る', () => {
    const store = createGameStore({ timers: false });
    store.getState().newCandidate('trading');
    store.getState().startGame(defaultPolicies);
    for (let i = 0; i < 2000; i++) {
      const s = store.getState();
      const d = s.company?.pendingDecisions[0];
      if (s.screen !== 'main') break;
      if (d?.kind === 'event') {
        s.answerEvent(d.id, 0);
        if (store.getState().lesson) break;
      } else if (d?.kind === 'milestone') s.answerMilestone(d.id, 'immediate');
      else if (d?.kind === 'review') s.finishReview(d.id);
      else s.step();
    }
    expect(store.getState().lesson?.lesson.length ?? 0).toBeGreaterThan(5);
    store.getState().dismissLesson();
    expect(store.getState().lesson).toBeNull();
  });

  it('フィードは状態の変化（入社・声・判断）から新しい分だけつくる', () => {
    const store = createGameStore({ timers: false });
    store.getState().newCandidate('trading');
    store.getState().startGame(defaultPolicies);
    const c0 = store.getState().company!;
    expect(collectFeed(c0, c0)).toEqual([]);
  });

  it('タイトルに戻ると、最初の状態に戻る', () => {
    const store = createGameStore({ timers: false });
    store.getState().newCandidate('trading');
    store.getState().startGame(defaultPolicies);
    store.getState().goto('title');
    expect(store.getState().company).toBeNull();
    expect(store.getState().screen).toBe('title');
  });
});
