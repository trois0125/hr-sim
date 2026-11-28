import { afterEach, describe, expect, it, vi } from 'vitest';
import { coef } from '../engine/coefficients';
import { defaultPolicies } from '../engine/data';
import { generateCompany } from '../engine/generate';
import { createGameStore, collectFeed } from './game';
import { previewChange } from '../engine/policyChange';
import { AUTOSAVE_KEY, memoryStorage } from './persist';
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
      else if (d) s.finishReview(d.id);
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

describe('1か月の進み具合（プログレスバー）', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('進んでいる間は今の月の始まりと長さを持ち、速度で長さが変わる', () => {
    const store = createGameStore({ timers: false });
    store.getState().newCandidate('trading');
    store.getState().startGame(defaultPolicies);
    expect(store.getState().cycle?.ms).toBe(coef('ui.tick_ms_at_1x'));
    store.getState().setSpeed(4);
    expect(store.getState().cycle?.ms).toBe(coef('ui.tick_ms_at_1x') / 4);
    store.getState().setSpeed(0);
    expect(store.getState().cycle).toBeNull();
  });

  it('判断待ち・見直しの画面を開いている間は止まり、答えると月の頭から始まる', () => {
    const store = createGameStore({ timers: false });
    store.getState().newCandidate('trading');
    store.getState().startGame(defaultPolicies);
    for (let i = 0; i < 50 && !store.getState().company?.pendingDecisions.length; i++) store.getState().step();
    expect(store.getState().cycle).toBeNull();
    const d = store.getState().company?.pendingDecisions[0];
    if (d?.kind === 'milestone') store.getState().answerMilestone(d.id, 'immediate');
    else if (d?.kind === 'event') store.getState().answerEvent(d.id, 0);
    else if (d) store.getState().finishReview(d.id);
    if (!store.getState().company?.pendingDecisions.length) expect(store.getState().cycle).not.toBeNull();
    store.getState().openEditor();
    expect(store.getState().cycle).toBeNull();
    store.getState().closeEditor();
    if (!store.getState().company?.pendingDecisions.length) expect(store.getState().cycle).not.toBeNull();
  });

  it('数字の根拠を開いている間は止まり、閉じると続きから進む', () => {
    const store = createGameStore({ timers: false });
    store.getState().newCandidate('trading');
    store.getState().startGame(defaultPolicies);
    expect(store.getState().cycle).not.toBeNull();
    store.getState().openEvidence();
    expect(store.getState().cycle).toBeNull();
    store.getState().closeEvidence();
    expect(store.getState().cycle).not.toBeNull();
  });

  it('タイマーで1か月ずつ進み、判断待ちで止まり、答えると再開する', () => {
    vi.useFakeTimers();
    const store = createGameStore();
    store.getState().newCandidate('trading');
    store.getState().startGame(defaultPolicies);
    const ms = coef('ui.tick_ms_at_1x');
    // 1か月たつと進む（最初の月に法令の節目が来て止まる）
    vi.advanceTimersByTime(ms);
    const s1 = store.getState().company!;
    expect(s1.history.length > 0 || s1.pendingDecisions.length > 0).toBe(true);
    expect(s1.pendingDecisions.length).toBeGreaterThan(0);
    // 判断待ちの間は、いくら待っても進まない
    if (s1.pendingDecisions.length > 0) {
      const month = s1.month;
      vi.advanceTimersByTime(ms * 5);
      expect(store.getState().company?.month).toBe(month);
      const d = s1.pendingDecisions[0]!;
      if (d.kind === 'milestone') store.getState().answerMilestone(d.id, 'immediate');
      vi.advanceTimersByTime(ms);
      expect(store.getState().company?.month).toBeGreaterThan(month);
    }
    store.getState().goto('title');
  });
});

describe('自動セーブと再開（ステップ13）', () => {
  /** 判断待ちを片づけながら n か月進める */
  function advance(store: ReturnType<typeof createGameStore>, months: number) {
    const target = (store.getState().company?.month ?? 0) + months;
    for (let i = 0; i < 2000 && store.getState().screen === 'main' && (store.getState().company?.month ?? 0) < target; i++) {
      const s = store.getState();
      const d = s.company?.pendingDecisions[0];
      if (d?.kind === 'milestone') s.answerMilestone(d.id, 'immediate');
      else if (d?.kind === 'event') s.answerEvent(d.id, 0);
      else if (d) s.finishReview(d.id);
      else s.step();
    }
  }

  it('途中で閉じても、続きから遊べる（同じ状態から、閉じなかった場合と同じ続きになる）', () => {
    const storage = memoryStorage();
    const a = createGameStore({ timers: false, storage });
    a.getState().newCandidate('trading');
    a.getState().startGame(defaultPolicies);
    advance(a, 30);
    const atClose = structuredClone(a.getState().company!);

    // ページを閉じて開き直す（新しいストアが、同じ保存先を読む）
    const b = createGameStore({ timers: false, storage });
    expect(b.getState().savedGame).toMatchObject({ name: atClose.profile.name, month: atClose.month });
    b.getState().continueGame();
    expect(b.getState().screen).toBe('main');
    expect(b.getState().speed).toBe(0); // 一時停止で再開する
    expect(b.getState().company).toEqual(atClose);
    expect(b.getState().feed.length).toBeGreaterThan(0);

    // 続きを12か月：閉じなかった a と、開き直した b は同じになる
    advance(a, 12);
    advance(b, 12);
    expect(b.getState().company?.history).toEqual(a.getState().company?.history);
    expect(b.getState().company?.employees).toEqual(a.getState().company?.employees);
  });

  it('終わった会社は、再開すると社史レポートが出る', () => {
    const storage = memoryStorage();
    const a = createGameStore({ timers: false, storage });
    a.getState().newCandidate('trading');
    a.getState().startGame(defaultPolicies);
    playToEnd(a);
    const b = createGameStore({ timers: false, storage });
    b.getState().continueGame();
    expect(b.getState().screen).toBe('end');
    expect(b.getState().company?.status).not.toBe('running');
  });

  it('新しく始めると、自動セーブは新しい会社で上書きされる', () => {
    const storage = memoryStorage();
    const a = createGameStore({ timers: false, storage });
    a.getState().newCandidate('trading');
    a.getState().startGame(defaultPolicies);
    advance(a, 5);
    const first = a.getState().company!.profile.name;
    a.getState().goto('title');
    a.getState().newCandidate('saas');
    a.getState().startGame(defaultPolicies);
    const b = createGameStore({ timers: false, storage });
    b.getState().continueGame();
    expect(b.getState().company?.profile.industryId).toBe('saas');
    expect(b.getState().company?.month).toBe(0);
    expect(first.length).toBeGreaterThan(0);
  });

  it('壊れたセーブは読まず、理由を出す。保存先がなくてもゲームは動く', () => {
    const storage = memoryStorage();
    storage.setItem(AUTOSAVE_KEY, '{broken');
    const s = createGameStore({ timers: false, storage });
    expect(s.getState().savedGame).toBeNull();
    expect(s.getState().saveProblem).toBe('broken');

    const none = createGameStore({ timers: false, storage: null });
    none.getState().newCandidate('trading');
    none.getState().startGame(defaultPolicies);
    none.getState().step();
    expect(none.getState().company?.history.length ?? 0).toBeGreaterThanOrEqual(0);
    expect(none.getState().saveFailed).toBe(false);
    expect(none.getState().canSave).toBe(false);
    const ok = createGameStore({ timers: false, storage: memoryStorage() });
    expect(ok.getState().canSave).toBe(true);
    ok.getState().newCandidate('trading');
    ok.getState().startGame(defaultPolicies);
    ok.getState().goto('title');
    expect(ok.getState().canSave).toBe(true); // 始めても、タイトルに戻っても変わらない
  });

  it('保存先に書けない（容量不足など）ときは、そのことを知らせる', () => {
    const storage = { ...memoryStorage(), setItem: () => { throw new Error('QuotaExceededError'); } };
    const s = createGameStore({ timers: false, storage });
    s.getState().newCandidate('trading');
    s.getState().startGame(defaultPolicies);
    expect(s.getState().saveFailed).toBe(true);
  });
});

describe('施策と個別制度（ステップ14）', () => {
  it('施策のメニューを開いている間は止まり、施策を打つと判断待ちになってメニューが閉じる', () => {
    const store = createGameStore({ timers: false, storage: null });
    store.getState().newCandidate('trading');
    store.getState().startGame(defaultPolicies);
    for (let i = 0; i < 60 && (store.getState().company?.employees.length ?? 0) < 5; i++) {
      const s = store.getState();
      const d = s.company?.pendingDecisions[0];
      if (d?.kind === 'milestone') s.answerMilestone(d.id, 'immediate');
      else if (d?.kind === 'event') s.answerEvent(d.id, 0);
      else if (d) s.finishReview(d.id);
      else s.step();
    }
    const s = store.getState();
    for (const d of [...(s.company?.pendingDecisions ?? [])]) {
      if (d.kind === 'milestone') s.answerMilestone(d.id, 'immediate');
      else if (d.kind === 'event') s.answerEvent(d.id, 0);
      else s.finishReview(d.id);
    }
    store.getState().setSpeed(1);
    store.getState().openInitiatives();
    expect(store.getState().cycle).toBeNull();
    store.getState().startInitiative('initiative_programs');
    expect(store.getState().initiativesOpen).toBe(false);
    const d = store.getState().company!.pendingDecisions[0]!;
    expect(d.eventId).toBe('initiative_programs');
    store.getState().answerEvent(d.id, 0); // 両立支援を整える
    expect(store.getState().company!.programs.map((p) => p.id)).toEqual(['work_life_support']);
    expect(store.getState().feed[0]?.kind).toBe('program');
    store.getState().stopProgram('work_life_support');
    expect(store.getState().company!.programs).toEqual([]);
    expect(store.getState().feed[0]?.text).toContain('止めた');
  });
});

describe('判断待ちの稟議書をいったん閉じる', () => {
  it('閉じても時間は止まったままで、答えて判断待ちがなくなると、次はまた開いて出る', () => {
    const store = createGameStore({ timers: false, storage: null });
    store.getState().newCandidate('trading');
    store.getState().startGame(defaultPolicies);
    for (let i = 0; i < 60 && !store.getState().company?.pendingDecisions.length; i++) store.getState().step();
    const d = store.getState().company!.pendingDecisions[0]!;
    store.getState().setSpeed(1);
    store.getState().hideDecision();
    expect(store.getState().decisionHidden).toBe(true);
    expect(store.getState().cycle).toBeNull();
    const month = store.getState().company!.month;
    store.getState().step();
    expect(store.getState().company!.month).toBe(month); // 判断待ちの間は進まない
    store.getState().setView('business');
    for (const x of [...store.getState().company!.pendingDecisions]) {
      if (x.kind === 'milestone') store.getState().answerMilestone(x.id, 'immediate');
      else if (x.kind === 'event') store.getState().answerEvent(x.id, 0);
      else store.getState().finishReview(x.id);
    }
    expect(d.id).toBeTruthy();
    expect(store.getState().decisionHidden).toBe(false);
  });
});

describe('四半期ずつ進める・ゲームの長さ（ステップ18）', () => {
  function start(store: ReturnType<typeof createGameStore>) {
    store.getState().newCandidate('trading');
    store.getState().startGame(defaultPolicies);
  }
  /** 判断待ちを片づける（最初の選択肢・今の形のまま） */
  function clear(store: ReturnType<typeof createGameStore>) {
    for (const d of [...(store.getState().company?.pendingDecisions ?? [])]) {
      if (d.kind === 'milestone') store.getState().answerMilestone(d.id, 'immediate');
      else if (d.kind === 'event') store.getState().answerEvent(d.id, 0);
      else store.getState().finishReview(d.id);
    }
  }

  it('四半期ずつなら1回で3か月進み、途中で判断待ちになったらそこで止まる', () => {
    const store = createGameStore({ timers: false, storage: null });
    start(store);
    store.getState().setStepMonths(3);
    let moved3 = false;
    for (let i = 0; i < 40; i++) {
      clear(store);
      const before = store.getState().company!.month;
      store.getState().step();
      const after = store.getState().company!;
      const delta = after.month - before;
      // 月のはじめに法令の節目が出たときは、その月を進めずに止まる（0）
      expect(delta).toBeGreaterThanOrEqual(0);
      expect(delta).toBeLessThanOrEqual(3);
      if (delta < 3) expect(after.pendingDecisions.length > 0 || after.status !== 'running').toBe(true);
      else moved3 = true;
    }
    expect(moved3).toBe(true);
  });

  it('1か月ずつでも四半期ずつでも、同じ会社・同じ判断なら同じ結果になる', () => {
    const candidate = generateCompany({ seed: 77, industryId: 'trading', autoPlay: null });
    const play = (stepMonths: 1 | 3) => {
      const store = createGameStore({ timers: false, storage: null });
      store.setState({ candidate: structuredClone(candidate) });
      store.getState().setStepMonths(stepMonths);
      store.getState().startGame(defaultPolicies);
      for (let i = 0; i < 300 && store.getState().company!.month < 36; i++) {
        clear(store);
        store.getState().step();
      }
      return store.getState().company!;
    };
    const a = play(1);
    const b = play(3);
    expect(b.month).toBe(a.month);
    expect(b.cash).toBe(a.cash);
    expect(b.employees.map((e) => e.id)).toEqual(a.employees.map((e) => e.id));
  });

  it('選んだ長さで始まり、四半期の設定は再開しても残る', () => {
    const storage = memoryStorage();
    const store = createGameStore({ timers: false, storage });
    store.getState().setGameYears(10);
    start(store);
    expect(store.getState().company!.maxMonths).toBe(120);
    store.getState().setStepMonths(3);
    store.getState().step();
    const again = createGameStore({ timers: false, storage });
    again.getState().continueGame();
    expect(again.getState().stepMonths).toBe(3);
    expect(again.getState().company!.maxMonths).toBe(120);
  });
});

describe('中級（ステップ22）', () => {
  it('難易度で中級を選ぶと、創業の場面から始まり、場面に答えながら最後まで進められる', () => {
    const store = createGameStore({ timers: false, storage: null });
    const a = store.getState();
    a.newCandidate('trading');
    a.setGameYears(10);
    a.setDifficulty('intermediate');
    a.startIntermediateGame();
    let s = store.getState();
    expect(s.screen).toBe('main');
    expect(s.intermediate?.pendingScene?.kind).toBe('founding');
    // 場面が出ている間は進まない
    s.step();
    expect(store.getState().intermediate?.year).toBe(0);
    let scenes = 0;
    for (let i = 0; i < 40 && store.getState().screen === 'main'; i++) {
      s = store.getState();
      if (s.intermediate?.pendingScene) {
        scenes++;
        s.answerScene('keep', s.intermediate.detail);
      } else s.step();
    }
    s = store.getState();
    expect(s.screen).toBe('end');
    expect(s.intermediate?.status).not.toBe('running');
    expect(scenes).toBeGreaterThanOrEqual(1);
    expect(s.company?.history.length).toBe((s.intermediate?.year ?? 0) * 12);
  });
});
