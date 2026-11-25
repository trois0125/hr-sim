/**
 * 社史レポートの「変更の振り返り」（DESIGN.md §14.7。ステップ20）。
 * 途中で変えた制度・打った施策・個別制度・組織改編について、前・直後・1年後の数字を今ある記録から組み立てる。
 * 文言は画面（src/ui/strings.ts）でつける。乱数は使わない。
 */
import { coef } from '../engine/coefficients';
import { eventDefs } from '../engine/eventData';
import type {
  AttritionReason,
  ChangeMethod,
  CompanyState,
  EngagementFactor,
  FactorScores,
  MonthlyRecord,
  OrgForm,
  PolicySet,
  ProgramId,
  VoiceRecord,
} from '../engine/types';
import { ENGAGEMENT_FACTORS, MONTHS_PER_YEAR } from '../engine/types';
import { policiesAt } from './history';

// ---------------------------------------------------------------------------
// 変更の拾い出しとまとめ
// ---------------------------------------------------------------------------

export type ChangeItem =
  | { month: number; kind: 'policy'; changes: { category: keyof PolicySet; option: string }[]; method: ChangeMethod | null }
  | { month: number; kind: 'initiative'; eventId: string; choiceIndex: number }
  | { month: number; kind: 'program'; programId: ProgramId; action: 'install' | 'stop' }
  | { month: number; kind: 'reorg'; from: OrgForm; to: OrgForm };

export type ChangeGroup = { first: number; last: number; items: ChangeItem[] };

const KIND_ORDER: Record<ChangeItem['kind'], number> = { policy: 0, initiative: 1, program: 2, reorg: 3 };

/** 振り返りの対象の変更（月の順。同じ月は制度・施策・個別制度・組織改編の順）。創業時の制度は変更ではないので入らない */
export function collectChanges(state: CompanyState): ChangeItem[] {
  const out: ChangeItem[] = [];
  for (const c of state.policyChanges) {
    const after = policiesAt(state, c.month);
    out.push({
      month: c.month,
      kind: 'policy',
      changes: c.categories.map((category) => ({ category, option: after[category] })),
      method: c.method,
    });
  }
  for (const d of state.decisions) {
    if (eventDefs.find((e) => e.id === d.eventId)?.trigger.type !== 'initiative') continue;
    out.push({ month: d.month, kind: 'initiative', eventId: d.eventId, choiceIndex: d.choiceIndex });
  }
  for (const p of state.programLog) out.push({ month: p.month, kind: 'program', programId: p.id, action: p.action });
  for (const r of state.organization.log) out.push({ month: r.month, kind: 'reorg', from: r.from, to: r.to });
  return out
    .map((x, i) => ({ x, i }))
    .sort((a, b) => a.x.month - b.x.month || KIND_ORDER[a.x.kind] - KIND_ORDER[b.x.kind] || a.i - b.i)
    .map((y) => y.x);
}

/** 前の変更から間隔（係数台帳）以内の変更を、1つのまとまりにする */
export function groupChanges(items: readonly ChangeItem[]): ChangeGroup[] {
  const gap = coef('retrospective.group_gap_months');
  const out: ChangeGroup[] = [];
  for (const item of items) {
    const g = out[out.length - 1];
    if (g && item.month - g.last <= gap) {
      g.items.push(item);
      g.last = item.month;
    } else {
      out.push({ first: item.month, last: item.month, items: [item] });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// 期間の数字とふだんの揺れ
// ---------------------------------------------------------------------------

export const RETRO_METRICS = ['laborCostRatio', 'operatingProfit', 'attritionRate', 'engagement'] as const;
export type RetroMetric = (typeof RETRO_METRICS)[number];

export type WindowStats = {
  months: number;
  /** 人件費の合計÷売上の合計。売上が0なら null */
  laborCostRatio: number | null;
  /** 月平均 */
  operatingProfit: number;
  /** 年に換算（退職の合計÷平均社員数×12÷月数）。平均社員数が0なら0 */
  attritionRate: number;
  /** 合計 */
  hires: number;
  /** 月平均 */
  engagement: number;
  /** 月平均 */
  economy: number;
  /** 納得感の6要因（記録がある月の平均）。1か月もなければ null */
  factors: FactorScores | null;
  /** その期間に自分から辞めた人でいちばん多い理由。いなければ null */
  topReason: AttritionReason | null;
};

/** 月 from 以上 to 未満の記録の数字。1か月もなければ null */
export function windowStats(state: CompanyState, from: number, to: number): WindowStats | null {
  const rows = state.history.filter((r) => r.month >= from && r.month < to);
  if (rows.length === 0) return null;
  const sum = (f: (r: MonthlyRecord) => number) => rows.reduce((s, r) => s + f(r), 0);
  const revenue = sum((r) => r.revenue);
  const avgHead = sum((r) => r.headcount) / rows.length;
  return {
    months: rows.length,
    laborCostRatio: revenue > 0 ? sum((r) => r.labor.total) / revenue : null,
    operatingProfit: sum((r) => r.operatingProfit) / rows.length,
    attritionRate: avgHead > 0 ? (sum((r) => r.resignations) / avgHead) * (MONTHS_PER_YEAR / rows.length) : 0,
    hires: sum((r) => r.hires),
    engagement: sum((r) => r.avgEngagement) / rows.length,
    economy: sum((r) => r.economy) / rows.length,
    factors: averageFactors(rows),
    topReason: topReason(state, from, to),
  };
}

function averageFactors(rows: readonly MonthlyRecord[]): FactorScores | null {
  const withFactors = rows.map((r) => r.org?.factors).filter((f): f is FactorScores => !!f);
  if (withFactors.length === 0) return null;
  const out = {} as FactorScores;
  for (const k of ENGAGEMENT_FACTORS) out[k] = withFactors.reduce((s, f) => s + f[k], 0) / withFactors.length;
  return out;
}

function topReason(state: CompanyState, from: number, to: number): AttritionReason | null {
  const counts = new Map<AttritionReason, number>();
  for (const d of state.departures) {
    if (d.kind !== 'resignation' || !d.reason || d.month < from || d.month >= to) continue;
    counts.set(d.reason, (counts.get(d.reason) ?? 0) + 1);
  }
  let best: AttritionReason | null = null;
  for (const [r, n] of counts) if (best === null || n > (counts.get(best) ?? 0)) best = r;
  return best;
}

/** ゲーム全体で、6か月平均がその前の6か月平均から動いた量（絶対値）の中央値。計算できなければ0 */
export function typicalSwing(state: CompanyState, metric: RetroMetric): number {
  const w = coef('retrospective.window_months');
  const diffs: number[] = [];
  for (const r of state.history) {
    const a = windowStats(state, r.month - w, r.month);
    const b = windowStats(state, r.month, r.month + w);
    if (!a || !b || a.months < w || b.months < w) continue;
    const x = a[metric];
    const y = b[metric];
    if (x === null || y === null) continue;
    diffs.push(Math.abs(y - x));
  }
  if (diffs.length === 0) return 0;
  diffs.sort((p, q) => p - q);
  const mid = Math.floor(diffs.length / 2);
  return diffs.length % 2 === 1 ? diffs[mid]! : (diffs[mid - 1]! + diffs[mid]!) / 2;
}

/** 前後の差の大きさを、ふだんの揺れの何倍かで表す。どちらかが null か、揺れが0なら0 */
export function swingScore(a: number | null, b: number | null, swing: number): number {
  if (a === null || b === null || swing <= 0) return 0;
  return Math.abs(a - b) / swing;
}

// ---------------------------------------------------------------------------
// カード
// ---------------------------------------------------------------------------

export type Arrow = { dir: 'up' | 'down' | 'flat'; tone: 'good' | 'bad' | 'neutral' };

export type RetroCard = {
  group: ChangeGroup;
  /** 最初の変更の前の期間 */
  before: WindowStats;
  /** 最後の変更の月からの期間 */
  soon: WindowStats;
  /** その次の期間（最後の変更から7〜12か月目） */
  later: WindowStats;
  /** 4つの指標のうち、前との差がふだんの揺れの何倍か（いちばん大きいもの） */
  score: number;
  arrows: Record<RetroMetric, { soon: Arrow; later: Arrow }>;
  /** 1年後に前より最も上がった要因（上がったものがなければ null） */
  factorUp: EngagementFactor | null;
  /** 1年後に前より最も下がった要因（下がったものがなければ null） */
  factorDown: EngagementFactor | null;
  /** 不満の声と前向きな声を1つずつまで（なければふつうの声で埋める。月の順） */
  voices: VoiceRecord[];
};

/** 上がると良い（+1）・悪い（−1）・どちらとも言えない（0）。人件費率は投資の場合もあるので0 */
const GOOD_WHEN_UP: Record<RetroMetric, 1 | -1 | 0> = {
  laborCostRatio: 0,
  operatingProfit: 1,
  attritionRate: -1,
  engagement: 1,
};

function arrow(metric: RetroMetric, before: number | null, after: number | null, swing: number): Arrow {
  if (before === null || after === null || Math.abs(after - before) < swing * coef('retrospective.flat_ratio') || after === before) {
    return { dir: 'flat', tone: 'neutral' };
  }
  const dir = after > before ? 'up' : 'down';
  const sign = GOOD_WHEN_UP[metric] * (dir === 'up' ? 1 : -1);
  return { dir, tone: sign > 0 ? 'good' : sign < 0 ? 'bad' : 'neutral' };
}

function factorMoves(before: FactorScores | null, later: FactorScores | null) {
  if (!before || !later) return { up: null, down: null };
  let up: EngagementFactor | null = null;
  let down: EngagementFactor | null = null;
  for (const k of ENGAGEMENT_FACTORS) {
    const d = later[k] - before[k];
    if (d > 0 && (up === null || d > later[up] - before[up])) up = k;
    if (d < 0 && (down === null || d < later[down] - before[down])) down = k;
  }
  return { up, down };
}

/** 並びの真ん中のもの（乱数を使わずに、その時期らしい1件を選ぶ） */
const middle = <T,>(xs: T[]): T | undefined => xs[Math.floor(xs.length / 2)];

function pickCardVoices(
  state: CompanyState,
  from: number,
  to: number,
  up: EngagementFactor | null,
  down: EngagementFactor | null,
): VoiceRecord[] {
  const inPeriod = state.voices.filter((v) => v.kind === 'voice' && v.month >= from && v.month < to);
  const used = new Set<VoiceRecord>();
  const pick = (tone: VoiceRecord['tone'], factor: EngagementFactor | null) => {
    const same = inPeriod.filter((v) => v.tone === tone && !used.has(v));
    const v = middle(same.filter((x) => factor !== null && x.factor === factor)) ?? middle(same);
    if (v) used.add(v);
    return v;
  };
  // 不満の声と前向きな声。その調子の声がなければ、同じ要因についてのふつうの声で埋める
  const negative = pick('negative', down) ?? pick('neutral', down);
  const positive = pick('positive', up) ?? pick('neutral', up);
  return [negative, positive].filter((v): v is VoiceRecord => v !== undefined).sort((a, b) => a.month - b.month);
}

/** 振り返りのカード（月の順）。前が短いもの・1年後まで見届けられないものだけ外し、大きさで選ぶ前のもの */
export function buildCards(state: CompanyState): RetroCard[] {
  const w = coef('retrospective.window_months');
  const minBefore = coef('retrospective.min_before_months');
  const groups = groupChanges(collectChanges(state));
  if (groups.length === 0) return [];
  const swings = Object.fromEntries(RETRO_METRICS.map((m) => [m, typicalSwing(state, m)])) as Record<RetroMetric, number>;
  const out: RetroCard[] = [];
  for (const group of groups) {
    const before = windowStats(state, group.first - w, group.first);
    const soon = windowStats(state, group.last, group.last + w);
    const later = windowStats(state, group.last + w, group.last + 2 * w);
    if (!before || !soon || !later || before.months < minBefore || later.months < w) continue;
    let score = 0;
    const arrows = {} as RetroCard['arrows'];
    for (const m of RETRO_METRICS) {
      score = Math.max(score, swingScore(soon[m], before[m], swings[m]), swingScore(later[m], before[m], swings[m]));
      arrows[m] = { soon: arrow(m, before[m], soon[m], swings[m]), later: arrow(m, before[m], later[m], swings[m]) };
    }
    const { up, down } = factorMoves(before.factors, later.factors);
    out.push({
      group,
      before,
      soon,
      later,
      score,
      arrows,
      factorUp: up,
      factorDown: down,
      voices: pickCardVoices(state, group.last, group.last + 2 * w, up, down),
    });
  }
  return out;
}

/** 社史レポートに出す振り返り：大きく動いたもの（目安以上）を点数の高い順に最大件数まで選び、月の順に並べる */
export function buildRetrospective(state: CompanyState): RetroCard[] {
  const threshold = coef('retrospective.notable_score');
  return buildCards(state)
    .filter((c) => c.score >= threshold)
    .sort((a, b) => b.score - a.score || a.group.first - b.group.first)
    .slice(0, coef('retrospective.max_cards'))
    .sort((a, b) => a.group.first - b.group.first);
}
