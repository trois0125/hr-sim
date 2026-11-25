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
