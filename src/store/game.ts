/**
 * ゲームの進行（Zustand）。ステップ9。
 *
 * エンジン（src/engine）の状態を持ち、画面からの操作をエンジンの関数につなぐ。ゲームの計算はここではしない。
 * - 時間：速度に応じてタイマーで1か月ずつ進める。判断待ちの間は進めない
 * - 判断：節目・イベント・毎年の見直しをエンジンの関数で解決する
 * - フィード：状態の変化（声、判断、法令、入社、決算、制度変更）から、画面に流す出来事をつくる
 *
 * React に依存しない（zustand/vanilla）ので、Node のテストから最後まで遊べる。
 */
import { createStore } from 'zustand/vanilla';
import { coef } from '../engine/coefficients';
import { getEvent, addReflection, resolveEvent, resolveMilestone, resolveReview } from '../engine/events';
import { generateCompany, setFoundingPolicies } from '../engine/generate';
import { changePolicies, type ChangeOptions } from '../engine/policyChange';
import { isWaitingForDecision, tick } from '../engine/tick';
import type { CompanyState, IndustryId, LegalResponse, PolicySet, VoiceTone } from '../engine/types';
import { MONTHS_PER_YEAR } from '../engine/types';
import { yen } from '../ui/format';
import { feedStrings, policyStrings } from '../ui/strings';

export type Screen = 'title' | 'howto' | 'generate' | 'policies' | 'main' | 'end';

export type FeedItem = {
  id: number;
  month: number;
  kind: 'voice' | 'decision' | 'law' | 'hire' | 'yearEnd' | 'policy';
  tone: VoiceTone;
  text: string;
  /** 声の主（社員の詳細を開けるように） */
  employeeId?: string;
  name?: string;
};

/** 選んだ選択肢の学び（モーダルを閉じたあとに見せる） */
export type LessonNote = { title: string; label: string; lesson: string };

export type GameState = {
  screen: Screen;
  /** 会社の生成画面で見せている候補 */
  candidate: CompanyState | null;
  company: CompanyState | null;
  /** 0 は一時停止 */
  speed: number;
  feed: FeedItem[];
  selectedEmployeeId: string | null;
  /** 「制度を見直す」の画面を開いているか（毎年の見直しとは別に、いつでも開ける） */
  editorOpen: boolean;
  /** いま進んでいる1か月（始まった時刻と長さ。プログレスバー用）。止まっている間は null */
  cycle: { startedAt: number; ms: number } | null;
  lesson: LessonNote | null;
};

export type GameActions = {
  goto(screen: Screen): void;
  /** 会社の候補をつくる（industryId を省くとおまかせ） */
  newCandidate(industryId?: IndustryId): void;
  /** 最初の制度を決めて始める */
  startGame(policies: PolicySet): void;
  /** 1か月進める（判断待ちなら何もしない） */
  step(): void;
  setSpeed(speed: number): void;
  answerMilestone(decisionId: string, response: LegalResponse, reflection?: string): void;
  answerEvent(decisionId: string, choiceIndex: number): void;
  /** 毎年の見直しを終える（制度を変えるなら先に changePolicy） */
  finishReview(decisionId: string): void;
  changePolicy(next: PolicySet, options?: ChangeOptions): void;
  openEditor(): void;
  closeEditor(): void;
  selectEmployee(id: string | null): void;
  dismissLesson(): void;
};

export type GameStore = GameState & GameActions;

const initial: GameState = {
  screen: 'title',
  candidate: null,
  company: null,
  speed: 0,
  feed: [],
  selectedEmployeeId: null,
  editorOpen: false,
  lesson: null,
  cycle: null,
};

let seedCounter = 0;
/** 新しいゲームのシード（時刻から。ゲーム中の乱数はすべてシードから決まる） */
function newSeed(): number {
  seedCounter++;
  return (Date.now() + seedCounter * 7919) >>> 0;
}

let feedId = 0;

/** 状態の変化から、フィードに流す出来事をつくる（古い順） */
export function collectFeed(prev: CompanyState | null, next: CompanyState): FeedItem[] {
  const out: FeedItem[] = [];
  const item = (x: Omit<FeedItem, 'id'>) => out.push({ ...x, id: ++feedId });
  const from = <T,>(arr: readonly T[], prevArr: readonly T[] | undefined) => arr.slice(prevArr?.length ?? 0);

  for (const r of from(next.history, prev?.history)) {
    if (r.hires > 0) item({ month: r.month, kind: 'hire', tone: 'neutral', text: feedStrings.hires(r.hires) });
    if ((r.month + 1) % MONTHS_PER_YEAR === 0) {
      const year = next.history.slice(r.month + 1 - MONTHS_PER_YEAR, r.month + 1);
      const sum = (f: (x: (typeof year)[number]) => number) => year.reduce((s, x) => s + f(x), 0);
      item({
        month: r.month,
        kind: 'yearEnd',
        tone: 'neutral',
        text: feedStrings.yearEnd(
          (r.month + 1) / MONTHS_PER_YEAR,
          yen(sum((x) => x.revenue)),
          yen(sum((x) => x.operatingProfit)),
          sum((x) => x.resignations),
        ),
      });
    }
  }
  for (const l of from(next.legal.log, prev?.legal.log)) {
    if (l.kind === 'corrected' && l.ruleId === null) continue; // イベントの選択は判断の記録から出す
    item({ month: l.month, kind: 'law', tone: l.kind === 'response' || l.kind === 'obligation' ? 'neutral' : 'negative', text: l.text });
  }
  for (const d of from(next.decisions, prev?.decisions)) {
    const ev = getEvent(d.eventId);
    item({ month: d.month, kind: 'decision', tone: 'neutral', text: feedStrings.decision(ev.title, ev.choices[d.choiceIndex]?.label ?? '') });
  }
  for (const c of from(next.policyChanges, prev?.policyChanges)) {
    const names = c.categories.map((k) => `${policyStrings.categories[k]}→${optionName(k, next.policies[k])}`).join('、');
    item({ month: c.month, kind: 'policy', tone: 'neutral', text: feedStrings.policyChange(names) });
  }
  for (const v of from(next.voices, prev?.voices)) {
    item({ month: v.month, kind: 'voice', tone: v.tone, text: v.text, employeeId: v.employeeId, name: v.name });
  }
  return out;
}

/** 制度の選択肢の名前 */
export function optionName<K extends keyof PolicySet>(category: K, option: PolicySet[K]): string {
  const opts = policyStrings.options[category] as Record<string, readonly [string, string]>;
  return opts[option]?.[0] ?? String(option);
}

export function createGameStore(options: { timers?: boolean } = {}) {
  const useTimers = options.timers ?? true;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const store = createStore<GameStore>()((set, get) => {
    /** 状態を新しくし、フィードを足す。終わっていたら終了画面へ */
    const commit = (next: CompanyState, extra: Partial<GameState> = {}) => {
      const prev = get().company;
      const items = collectFeed(prev, next).reverse();
      const ended = next.status !== 'running';
      // 詳細を開いていた社員が去ったら閉じる
      const selected = get().selectedEmployeeId;
      const keepSelected = selected !== null && next.employees.some((e) => e.id === selected);
      set({
        selectedEmployeeId: keepSelected ? selected : null,
        company: next,
        feed: [...items, ...get().feed].slice(0, coef('ui.feed_max')),
        ...extra,
        ...(ended ? { screen: 'end' as const, speed: 0 } : {}),
      });
      if (ended) stopTimer();
    };
    const mutate = (f: (c: CompanyState) => void, extra: Partial<GameState> = {}) => {
      const c = get().company;
      if (!c) return;
      const next = structuredClone(c);
      f(next);
      commit(next, extra);
    };
    const stopTimer = () => {
      if (timer) clearTimeout(timer);
      timer = null;
    };
    /** 時間が進む状態か（速度が0でなく、判断待ちでも見直しの画面を開いてもいない） */
    const running = () => {
      const { speed, screen, company, editorOpen } = get();
      return speed > 0 && screen === 'main' && !!company && company.status === 'running' && !isWaitingForDecision(company) && !editorOpen;
    };
    /** 次の1か月を始める（止まる状態なら止める）。状態が変わる操作のたびに呼ぶ */
    const schedule = () => {
      stopTimer();
      if (!running()) {
        if (get().cycle) set({ cycle: null });
        return;
      }
      const ms = coef('ui.tick_ms_at_1x') / get().speed;
      set({ cycle: { startedAt: Date.now(), ms } });
      if (useTimers) timer = setTimeout(() => get().step(), ms);
    };

    return {
      ...initial,
      goto(screen) {
        if (screen === 'title') {
          stopTimer();
          set({ ...initial });
          return;
        }
        set({ screen });
      },
      newCandidate(industryId) {
        set({ candidate: generateCompany({ seed: newSeed(), industryId, autoPlay: null }) });
      },
      startGame(policies) {
        const cand = get().candidate;
        if (!cand) return;
        const company = setFoundingPolicies(structuredClone(cand), policies);
        set({ ...initial, screen: 'main', company, speed: 1 });
        schedule();
      },
      step() {
        const c = get().company;
        // 判断待ちと、制度の見直しの画面を開いている間は進めない
        if (!c || c.status !== 'running' || isWaitingForDecision(c) || get().editorOpen) return;
        commit(tick(c));
        schedule();
      },
      setSpeed(speed) {
        set({ speed });
        schedule();
      },
      answerMilestone(decisionId, response, reflection) {
        mutate((c) => {
          resolveMilestone(c, decisionId, response);
          if (reflection) addReflection(c, reflection);
        });
        schedule();
      },
      answerEvent(decisionId, choiceIndex) {
        const c = get().company;
        const d = c?.pendingDecisions.find((x) => x.id === decisionId);
        const ev = d?.eventId ? getEvent(d.eventId) : null;
        const choice = ev?.choices[choiceIndex];
        mutate((x) => resolveEvent(x, decisionId, choiceIndex), {
          lesson: ev && choice?.lesson ? { title: ev.title, label: choice.label, lesson: choice.lesson } : null,
        });
        schedule();
      },
      finishReview(decisionId) {
        mutate((c) => resolveReview(c, decisionId), { editorOpen: false });
        schedule();
      },
      changePolicy(next, opts) {
        const c = get().company;
        if (!c) return;
        const changed = changePolicies(c, next, opts);
        // 毎年の見直しの途中で変えたなら、見直しも終える
        const review = changed.pendingDecisions.find((d) => d.kind === 'review');
        if (review) {
          if (changed === c) {
            mutate((x) => resolveReview(x, review.id), { editorOpen: false });
            schedule();
            return;
          }
          resolveReview(changed, review.id);
        }
        commit(changed, { editorOpen: false });
        schedule();
      },
      openEditor() {
        set({ editorOpen: true });
        schedule();
      },
      closeEditor() {
        set({ editorOpen: false });
        schedule();
      },
      selectEmployee(id) {
        set({ selectedEmployeeId: id });
      },
      dismissLesson() {
        set({ lesson: null });
      },
    };
  });
  return store;
}

/** 画面で使うストア（1つだけ） */
export const gameStore = createGameStore();
