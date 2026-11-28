/**
 * ゲームの進行（Zustand）。ステップ9。
 *
 * エンジン（src/engine）の状態を持ち、画面からの操作をエンジンの関数につなぐ。ゲームの計算はここではしない。
 * - 時間：速度に応じてタイマーで1か月ずつ進める。判断待ちの間は進めない
 * - 判断：節目・イベント・毎年の見直しをエンジンの関数で解決する
 * - フィード：状態の変化（声、判断、法令、入社、決算、制度変更、個別制度）から、画面に流す出来事をつくる
 *
 * React に依存しない（zustand/vanilla）ので、Node のテストから最後まで遊べる。
 */
import { createStore } from 'zustand/vanilla';
import { coef } from '../engine/coefficients';
import { localizeEvent } from '../engine/eventData';
import { getEvent, addReflection, renderText, resolveEvent, resolveMilestone, resolveReorg, resolveReview } from '../engine/events';
import type { Period } from '../engine/dashboard';
import type { GuideRef } from '../ui/guide';
import { initiativeAvailability, startInitiative as startInitiativeInEngine } from '../engine/initiatives';
import { getProgram, stopProgram as stopProgramInEngine } from '../engine/programs';
import { generateCompany, setFoundingPolicies } from '../engine/generate';
import { changePolicies, type ChangeOptions } from '../engine/policyChange';
import { isWaitingForDecision, tick } from '../engine/tick';
import type { CompanyState, IndustryId, LegalResponse, OrgForm, PolicySet, ReorgMethod, VoiceTone } from '../engine/types';
import { MONTHS_PER_YEAR } from '../engine/types';
import type { DetailedPolicies } from '../engine/intermediate/detailedPolicy';
import type { ChangeOptions as DetailChangeOptions } from '../engine/intermediate/regroup';
import { changeDetailedPolicies } from '../engine/intermediate/regroup';
import { isWaitingForScene, resolveScene } from '../engine/intermediate/scenes';
import type { Difficulty, IntermediateState } from '../engine/intermediate/types';
import { toCompanyView } from '../engine/intermediate/view';
import { fromCompany, yearTick } from '../engine/intermediate/yearTick';
import { getCase, startCase } from '../engine/intermediate/caseMode';
import { setCalendarStartYear } from '../engine/calendar';
import { yen } from '../ui/format';
import { browserStorage, readSave, writeSave, type SaveStorage } from './persist';
import { feedStrings, intermediateStrings, orgStrings, policyStrings } from '../ui/strings';
import { getIndustry } from '../engine/data';
import { ageBandOf, bandWidth } from '../engine/intermediate/layers';
import type { Employee } from '../engine/types';

export type Screen = 'title' | 'howto' | 'generate' | 'policies' | 'main' | 'end';

export type FeedItem = {
  id: number;
  month: number;
  kind: 'voice' | 'decision' | 'law' | 'hire' | 'yearEnd' | 'policy' | 'program';
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
  /** 自動セーブがあれば、その会社の名前・月・終わり方（タイトルの「つづきから」に出す） */
  savedGame: { name: string; month: number; status: CompanyState['status'] } | null;
  /** 自動セーブを読めなかったときの理由（壊れている・新しい版） */
  saveProblem: 'broken' | 'newer' | null;
  /** 保存先に書けなかったか（容量不足など） */
  saveFailed: boolean;
  /** 「数字の根拠」を開いているか（メイン画面の上に重ねる） */
  evidenceOpen: boolean;
  /** このブラウザで保存できるか（保存が止められている環境では false。タイトルの説明を変える） */
  canSave: boolean;
  /** 施策のメニューを開いているか */
  initiativesOpen: boolean;
  /** メイン画面のタブ（現場／事業／組織。§14.2） */
  view: MainView;
  /** 判断待ちの稟議書をいったん閉じて、画面（事業・組織のタブや辞典）を見ているか。時間は止まったまま */
  decisionHidden: boolean;
  /** 人事の辞典を開いているか。開いている項目（null なら一覧）。§14.3 */
  guide: { ref: GuideRef | null } | null;
  /** 事業・組織のグラフの期間 */
  chartPeriod: Period;
  /** 1回に進める月数（1か月ずつ／四半期ずつ。§14.5） */
  stepMonths: StepMonths;
  /** 会社の生成の画面で選んだゲームの長さ（年） */
  gameYears: number;
  /** 難易度（§15.2）。中級なら intermediate に中級の状態を持ち、company はその表示用の形 */
  difficulty: Difficulty;
  intermediate: IntermediateState | null;
};

export type MainView = 'floor' | 'business' | 'org';
/** 1回に進める月数：1か月ずつ／四半期ずつ */
export type StepMonths = 1 | 3;

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
  /** 毎年の見直しを終える（制度を変えるなら先に changePolicy）。組織の形を選ぶ判断待ちなら、今の形のままで終える */
  finishReview(decisionId: string): void;
  /** 組織の形を選ぶ（null なら今の形のまま）。§14.4 */
  answerReorg(decisionId: string, choice: { form: OrgForm; method: ReorgMethod } | null): void;
  changePolicy(next: PolicySet, options?: ChangeOptions): void;
  openEditor(): void;
  closeEditor(): void;
  selectEmployee(id: string | null): void;
  dismissLesson(): void;
  /** 自動セーブから再開する */
  continueGame(): void;
  openEvidence(): void;
  closeEvidence(): void;
  /** 施策を打つ（判断待ちになる。打てないときは何もしない） */
  startInitiative(eventId: string): void;
  /** 個別制度を止める */
  stopProgram(id: string): void;
  /** 施策のメニューを開く・閉じる（開いている間は時間を止める） */
  openInitiatives(): void;
  closeInitiatives(): void;
  setView(view: MainView): void;
  /** 人事の辞典を開く（ref を渡すとその項目から。開いている間は時間を止める） */
  openGuide(ref?: GuideRef | null): void;
  /** 判断待ちの稟議書をいったん閉じる・開き直す（判断待ちのあいだ時間は止まったまま） */
  hideDecision(): void;
  showDecision(): void;
  closeGuide(): void;
  setChartPeriod(period: Period): void;
  /** 1か月ずつ／四半期ずつを切り替える（途中でも変えられる。結果は同じ） */
  setStepMonths(months: StepMonths): void;
  /** ゲームの長さ（年）を選ぶ（会社の生成の画面） */
  setGameYears(years: number): void;
  setDifficulty(d: Difficulty): void;
  /** 中級：生成した会社で始める（最初の制度は創業の場面で決める） */
  startIntermediateGame(): void;
  /** 中級：場面で制度を決める */
  answerScene(stanceId: string, detail: DetailedPolicies, options?: DetailChangeOptions, base?: Partial<PolicySet>): void;
  /** 中級：場面の外で制度を設計し直す */
  redesign(detail: DetailedPolicies, options?: DetailChangeOptions, base?: Partial<PolicySet>): void;
  /** 追体験を始める（§15.7） */
  startCaseGame(caseId: string): void;
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
  savedGame: null,
  saveProblem: null,
  saveFailed: false,
  evidenceOpen: false,
  canSave: false,
  initiativesOpen: false,
  view: 'floor',
  chartPeriod: 'year1',
  stepMonths: 1,
  gameYears: 25,
  guide: null,
  decisionHidden: false,
  difficulty: 'beginner',
  intermediate: null,
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
    const ev = localizeEvent(getEvent(d.eventId), next.profile.industryId);
    if (ev.choices[d.choiceIndex]?.cancel) continue; // 施策を「やめる」は流さない
    item({ month: d.month, kind: 'decision', tone: 'neutral', text: feedStrings.decision(ev.title, ev.choices[d.choiceIndex]?.label ?? '') });
  }
  for (const c of from(next.policyChanges, prev?.policyChanges)) {
    const names = c.categories.map((k) => `${policyStrings.categories[k]}→${optionName(k, next.policies[k])}`).join('、');
    item({ month: c.month, kind: 'policy', tone: 'neutral', text: feedStrings.policyChange(names) });
  }
  for (const o of from(next.organization?.log ?? [], prev?.organization?.log)) {
    item({
      month: o.month,
      kind: 'policy',
      tone: 'neutral',
      text: feedStrings.reorg(orgStrings.forms[o.from], orgStrings.forms[o.to], orgStrings.methods[o.method]),
    });
  }
  for (const p of from(next.programLog ?? [], prev?.programLog)) {
    const name = getProgram(p.id).name;
    item({ month: p.month, kind: 'program', tone: 'neutral', text: p.action === 'install' ? feedStrings.programInstalled(name) : feedStrings.programStopped(name) });
  }
  for (const m of from(next.mitigations ?? [], prev?.mitigations)) {
    const ev = getEvent(m.eventId);
    item({
      month: m.month,
      kind: 'program',
      tone: 'positive',
      text: feedStrings.mitigated(getProgram(m.programId).name, renderText(ev.mitigatedBy?.text ?? ev.title, m.vars)),
      employeeId: m.targetId ?? undefined,
    });
  }
  for (const v of from(next.voices, prev?.voices)) {
    item({ month: v.month, kind: 'voice', tone: v.tone, text: v.text, employeeId: v.employeeId, name: v.name });
  }
  return out;
}

/** 中級の層の名前（画面用） */
function layerNamer(industryId: CompanyState['profile']['industryId']) {
  const roles = new Map(getIndustry(industryId).roles.map((r) => [r.id, r.name]));
  return (rep: Employee) => {
    const band = ageBandOf(rep.age);
    return intermediateStrings.layerName(roles.get(rep.role) ?? rep.role, band, band + bandWidth() - 1, rep.grade);
  };
}
const view = (s: IntermediateState) => toCompanyView(s, layerNamer(s.profile.industryId));

/** 制度の選択肢の名前 */
export function optionName<K extends keyof PolicySet>(category: K, option: PolicySet[K]): string {
  const opts = policyStrings.options[category] as Record<string, readonly [string, string]>;
  return opts[option]?.[0] ?? String(option);
}

/** 自動セーブの間隔の下限（ミリ秒）。速い速度でも書き込みが続きすぎないように。最後の状態はあとから必ず書く */
const SAVE_INTERVAL_MS = 1000;

export function createGameStore(options: { timers?: boolean; storage?: SaveStorage | null } = {}) {
  const useTimers = options.timers ?? true;
  const storage = options.storage === undefined ? browserStorage() : options.storage;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastSaveAt = 0;
  let saveTimer: ReturnType<typeof setTimeout> | null = null;

  /** 起動したときの自動セーブの様子 */
  const loaded = readSave(storage);
  const initialSaved: Pick<GameState, 'savedGame' | 'saveProblem'> = loaded.ok
    ? { savedGame: { name: loaded.data.company.profile.name, month: loaded.data.company.month, status: loaded.data.company.status }, saveProblem: null }
    : { savedGame: null, saveProblem: loaded.reason === 'empty' ? null : loaded.reason };

  const store = createStore<GameStore>()((set, get) => {
    /** いまの会社を保存する（すぐに書く） */
    const saveNow = () => {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = null;
      const c = get().company;
      // 中級はまだ保存しない（初級の自動セーブを上書きしないように）
      if (!c || !storage || get().intermediate) return;
      lastSaveAt = Date.now();
      const ok = writeSave(storage, c, { feed: get().feed, stepMonths: get().stepMonths });
      set({ saveFailed: !ok, savedGame: ok ? { name: c.profile.name, month: c.month, status: c.status } : get().savedGame });
    };
    /** 保存する。直前に保存したばかりなら少し待ってから（最後の状態は必ず書く） */
    const save = () => {
      if (!storage || get().intermediate) return;
      const wait = SAVE_INTERVAL_MS - (Date.now() - lastSaveAt);
      if (!useTimers || wait <= 0) {
        saveNow();
        return;
      }
      if (!saveTimer) saveTimer = setTimeout(saveNow, wait);
    };
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
        // 判断待ちがなくなったら、次の稟議書はまた最初から開いて出す
        ...(next.pendingDecisions.length === 0 ? { decisionHidden: false } : {}),
        feed: [...items, ...get().feed].slice(0, coef('ui.feed_max')),
        ...extra,
        ...(ended ? { screen: 'end' as const, speed: 0 } : {}),
      });
      if (ended) {
        stopTimer();
        saveNow(); // 終わったときは社史を後で見られるよう、すぐに書く
      } else save();
    };
    const mutate = (f: (c: CompanyState) => void, extra: Partial<GameState> = {}) => {
      const c = get().company;
      if (!c) return;
      const next = structuredClone(c);
      f(next);
      commit(next, extra);
    };
    /** 中級の状態を新しくし、表示用の会社を作り直す */
    const commitIntermediate = (next: IntermediateState, extra: Partial<GameState> = {}) => {
      set({ intermediate: next });
      commit(view(next), extra);
    };
    const stopTimer = () => {
      if (timer) clearTimeout(timer);
      timer = null;
    };
    /** 時間が進む状態か（速度が0でなく、判断待ちでも見直しの画面を開いてもいない） */
    const running = () => {
      const { speed, screen, company, editorOpen, evidenceOpen, initiativesOpen, guide } = get();
      return (
        speed > 0 &&
        screen === 'main' &&
        !!company &&
        company.status === 'running' &&
        !isWaitingForDecision(company) &&
        !(get().intermediate && isWaitingForScene(get().intermediate as IntermediateState)) &&
        !editorOpen &&
        !evidenceOpen && // 数字の根拠を読んでいる間は止める
        !initiativesOpen &&
        !guide // 人事の辞典を読んでいる間も止める
      );
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
      ...initialSaved,
      canSave: storage !== null,
      goto(screen) {
        if (screen === 'title') {
          stopTimer();
          setCalendarStartYear(null);
          if (saveTimer) saveNow(); // 書きかけの保存を先に書く
          set({ ...initial, savedGame: get().savedGame, saveProblem: get().saveProblem, saveFailed: get().saveFailed, canSave: get().canSave, difficulty: get().difficulty });
          return;
        }
        set({ screen });
      },
      continueGame() {
        const r = readSave(storage);
        if (!r.ok) {
          set({ savedGame: null, saveProblem: r.reason === 'empty' ? null : r.reason });
          return;
        }
        const company = r.data.company;
        const feed = Array.isArray(r.data.ui?.feed) ? (r.data.ui.feed as FeedItem[]) : [];
        feedId = Math.max(feedId, ...feed.map((f) => f.id), 0);
        // 再開は一時停止で始める（どこまで進んでいたかを見てから再開できるように）
        const stepMonths: StepMonths = r.data.ui?.stepMonths === 3 ? 3 : 1;
        set({
          ...initial,
          savedGame: get().savedGame,
          canSave: get().canSave,
          company,
          feed,
          stepMonths,
          screen: company.status === 'running' ? 'main' : 'end',
          speed: 0,
        });
      },
      hideDecision() {
        set({ decisionHidden: true });
      },
      showDecision() {
        set({ decisionHidden: false });
      },
      openGuide(ref = null) {
        set({ guide: { ref } });
        schedule();
      },
      closeGuide() {
        set({ guide: null });
        schedule();
      },
      setView(view) {
        set({ view });
      },
      setChartPeriod(chartPeriod) {
        set({ chartPeriod });
      },
      setStepMonths(stepMonths) {
        set({ stepMonths });
        save(); // 再開したときも同じ進め方にする
        schedule();
      },
      setGameYears(gameYears) {
        set({ gameYears });
      },
      setDifficulty(difficulty) {
        set({ difficulty });
      },
      startCaseGame(caseId) {
        setCalendarStartYear(getCase(caseId).startYear);
        const inter = startCase(caseId, newSeed(), { autoScenes: false });
        set({ ...initial, canSave: get().canSave, difficulty: 'intermediate', screen: 'main', intermediate: inter, company: view(inter), speed: 1 });
        schedule();
      },
      startIntermediateGame() {
        setCalendarStartYear(null);
        const cand = get().candidate;
        if (!cand) return;
        const c = structuredClone(cand);
        c.maxMonths = get().gameYears * MONTHS_PER_YEAR;
        const inter = fromCompany(c, { autoScenes: false });
        set({ ...initial, canSave: get().canSave, gameYears: get().gameYears, difficulty: 'intermediate', screen: 'main', intermediate: inter, company: view(inter), speed: 1 });
        schedule();
      },
      answerScene(stanceId, detail, opts, base) {
        const inter = get().intermediate;
        if (!inter?.pendingScene) return;
        const next = structuredClone(inter);
        resolveScene(next, { stanceId, detail, options: opts, base });
        commitIntermediate(next, { editorOpen: false });
        schedule();
      },
      redesign(detail, opts, base) {
        const inter = get().intermediate;
        if (!inter) return;
        const next = structuredClone(inter);
        if (base) next.policies = { ...next.policies, ...base };
        changeDetailedPolicies(next, detail, opts);
        commitIntermediate(next, { editorOpen: false });
        schedule();
      },
      openInitiatives() {
        set({ initiativesOpen: true });
        schedule();
      },
      closeInitiatives() {
        set({ initiativesOpen: false });
        schedule();
      },
      startInitiative(eventId) {
        const c = get().company;
        if (!c) return;
        const ev = getEvent(eventId);
        if (!initiativeAvailability(c, ev).available) return;
        mutate((x) => startInitiativeInEngine(x, eventId), { initiativesOpen: false });
        schedule();
      },
      stopProgram(id) {
        mutate((x) => stopProgramInEngine(x, id));
        schedule();
      },
      openEvidence() {
        set({ evidenceOpen: true });
        schedule();
      },
      closeEvidence() {
        set({ evidenceOpen: false });
        schedule();
      },
      newCandidate(industryId) {
        set({ candidate: generateCompany({ seed: newSeed(), industryId, autoPlay: null }) });
      },
      startGame(policies) {
        setCalendarStartYear(null);
        const cand = get().candidate;
        if (!cand) return;
        const company = setFoundingPolicies(structuredClone(cand), policies);
        company.maxMonths = get().gameYears * MONTHS_PER_YEAR; // 会社の生成の画面で選んだ長さ
        // 新しく始めると、自動セーブはこの会社で上書きされる（画面で先に確かめている）
        set({ ...initial, canSave: get().canSave, gameYears: get().gameYears, difficulty: 'beginner', screen: 'main', company, speed: 1 });
        saveNow();
        schedule();
      },
      step() {
        const inter = get().intermediate;
        if (inter) {
          // 中級：1年ずつ進める（場面で待っている間と、設計の画面を開いている間は進めない）
          if (inter.status !== 'running' || isWaitingForScene(inter) || get().editorOpen) return;
          commitIntermediate(yearTick(inter));
          schedule();
          return;
        }
        const c = get().company;
        // 判断待ちと、制度の見直しの画面を開いている間は進めない
        if (!c || c.status !== 'running' || isWaitingForDecision(c) || get().editorOpen) return;
        // 四半期ずつなら、3か月ぶん進めてから画面を1回だけ更新する。途中で判断待ちや終わりになったら、そこで止まる
        let next = tick(c);
        for (let i = 1; i < get().stepMonths && next.status === 'running' && !isWaitingForDecision(next); i++) {
          next = tick(next);
        }
        commit(next);
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
        const ev = d?.eventId && c ? localizeEvent(getEvent(d.eventId), c.profile.industryId) : null;
        const choice = ev?.choices[choiceIndex];
        mutate((x) => resolveEvent(x, decisionId, choiceIndex), {
          lesson: ev && choice?.lesson && !choice.cancel ? { title: ev.title, label: choice.label, lesson: choice.lesson } : null,
        });
        schedule();
      },
      finishReview(decisionId) {
        // 組織の形を選ぶ判断待ちなら「今の形のまま」で終える
        const d = get().company?.pendingDecisions.find((x) => x.id === decisionId);
        if (d?.kind === 'reorg') {
          get().answerReorg(decisionId, null);
          return;
        }
        mutate((c) => resolveReview(c, decisionId), { editorOpen: false });
        schedule();
      },
      answerReorg(decisionId, choice) {
        mutate((c) => resolveReorg(c, decisionId, choice));
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
