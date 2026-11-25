/**
 * 社史レポート（§9）の材料：年表、数字の推移、従業員の声、分岐点の解説、同期創業の他社。ステップ11。
 * 文言は画面（src/ui/strings.ts）でつける。ここでは何が起きたかだけを返す。
 */
import { defaultPolicies } from '../engine/data';
import { eventDefs, localizeEvent } from '../engine/eventData';
import { generateCompany, setFoundingPolicies } from '../engine/generate';
import { getLaw } from '../engine/lawData';
import { runToEnd } from '../engine/tick';
import type { CompanyState, CompanyStatus, MonthlyRecord, PolicySet, VoiceRecord } from '../engine/types';
import { MONTHS_PER_YEAR } from '../engine/types';

// ---------------------------------------------------------------------------
// 年表
// ---------------------------------------------------------------------------

/** 年表に載せる社員数の節目 */
export const HEADCOUNT_MARKS = [10, 30, 50, 100, 300, 1000] as const;

export type TimelineEntry =
  | { month: number; kind: 'founding'; headcount: number }
  | { month: number; kind: 'headcount'; threshold: number }
  | { month: number; kind: 'obligation'; names: string[] }
  | { month: number; kind: 'violation'; text: string }
  | { month: number; kind: 'policy'; changes: { category: keyof PolicySet; option: string }[] }
  | { month: number; kind: 'recession' }
  | { month: number; kind: 'event'; eventId: string; choiceIndex: number }
  | { month: number; kind: 'reflection'; text: string }
  | { month: number; kind: 'end'; status: CompanyStatus };

/** 年表に載せるイベント（人のイベントは数が多いので、続きのイベントだけ載せる） */
function isMajorEvent(eventId: string): boolean {
  const e = eventDefs.find((x) => x.id === eventId);
  if (!e) return false;
  return e.category !== 'people' || e.trigger.type === 'followUp';
}

/** その月の記録にある制度（なければ今の制度） */
export function policiesAt(state: CompanyState, month: number): PolicySet {
  return state.history.find((r) => r.month === month)?.policies ?? state.policies;
}

export function buildTimeline(state: CompanyState): TimelineEntry[] {
  const out: TimelineEntry[] = [];
  const first = state.history[0];
  out.push({ month: 0, kind: 'founding', headcount: first?.headcount ?? state.employees.length });
  for (const threshold of HEADCOUNT_MARKS) {
    const r = state.history.find((x) => x.headcount >= threshold);
    if (r && r.month > 0) out.push({ month: r.month, kind: 'headcount', threshold });
  }
  const obligations = new Map<number, string[]>();
  for (const l of state.legal.log) {
    if (l.kind === 'obligation' && l.ruleId) obligations.set(l.month, [...(obligations.get(l.month) ?? []), getLaw(l.ruleId).name]);
    if (l.kind === 'violation_detected') out.push({ month: l.month, kind: 'violation', text: l.text });
  }
  for (const [month, names] of obligations) out.push({ month, kind: 'obligation', names });
  for (const c of state.policyChanges) {
    const after = policiesAt(state, c.month);
    out.push({ month: c.month, kind: 'policy', changes: c.categories.map((category) => ({ category, option: after[category] })) });
  }
  for (const m of state.market.recessionMonths) out.push({ month: m, kind: 'recession' });
  for (const d of state.decisions) {
    if (isMajorEvent(d.eventId)) out.push({ month: d.month, kind: 'event', eventId: d.eventId, choiceIndex: d.choiceIndex });
  }
  for (const r of state.reflections) out.push({ month: r.month, kind: 'reflection', text: r.text });
  out.push({ month: state.month, kind: 'end', status: state.status });
  // 同じ月の中は、上の順（創業・節目・法令・制度・景気・出来事・問いかけ・終わり）を保つ
  return out.map((e, i) => ({ e, i })).sort((a, b) => a.e.month - b.e.month || a.i - b.i).map((x) => x.e);
}

// ---------------------------------------------------------------------------
// 数字の推移（年ごと）
// ---------------------------------------------------------------------------

export type YearPoint = {
  year: number;
  revenue: number;
  operatingProfit: number;
  laborCostRatio: number;
  headcount: number;
  attritionRate: number;
  engagement: number;
};

export function yearlySeries(history: readonly MonthlyRecord[]): YearPoint[] {
  const out: YearPoint[] = [];
  for (let y = 0; y * MONTHS_PER_YEAR < history.length; y++) {
    const rows = history.slice(y * MONTHS_PER_YEAR, (y + 1) * MONTHS_PER_YEAR);
    const last = rows[rows.length - 1];
    if (!last) continue;
    const sum = (f: (r: MonthlyRecord) => number) => rows.reduce((s, r) => s + f(r), 0);
    const revenue = sum((r) => r.revenue);
    const avgHead = sum((r) => r.headcount) / rows.length;
    out.push({
      year: y + 1,
      revenue,
      operatingProfit: sum((r) => r.operatingProfit),
      laborCostRatio: revenue > 0 ? sum((r) => r.labor.total) / revenue : 0,
      headcount: last.headcount,
      attritionRate: avgHead > 0 ? (sum((r) => r.resignations) / avgHead) * (MONTHS_PER_YEAR / rows.length) : 0,
      engagement: sum((r) => r.avgEngagement) / rows.length,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// 同期創業の他社（§9 の3）：同じ会社を、標準の制度・法令はすぐ対応で自動で回す
// ---------------------------------------------------------------------------

export function runRival(state: CompanyState): CompanyState {
  const c = generateCompany({
    seed: state.seed,
    industryId: state.profile.industryId,
    foundingPatternId: state.profile.foundingPatternId,
    locationId: state.profile.locationId,
    autoPlay: { legal: 'immediate' },
  });
  c.maxMonths = state.maxMonths; // 同じ長さで回す
  return runToEnd(setFoundingPolicies(c, defaultPolicies));
}

// ---------------------------------------------------------------------------
// 従業員の声（§9 の4）：時期（5年ごと）ごとに、不満の声・前向きな声・退職のあいさつを1つずつ
// ---------------------------------------------------------------------------

export const VOICE_PERIOD_YEARS = 5;

export type VoicePeriod = { fromYear: number; toYear: number; voices: VoiceRecord[] };

/** 並びの真ん中のもの（乱数を使わずに、その時期らしい1件を選ぶ） */
const middle = <T,>(xs: T[]): T | undefined => xs[Math.floor(xs.length / 2)];

export function pickVoices(state: CompanyState): VoicePeriod[] {
  const out: VoicePeriod[] = [];
  const span = VOICE_PERIOD_YEARS * MONTHS_PER_YEAR;
  for (let start = 0; start < Math.max(1, state.month); start += span) {
    const inPeriod = state.voices.filter((v) => v.month >= start && v.month < start + span);
    const picks = [
      middle(inPeriod.filter((v) => v.kind === 'voice' && v.tone === 'negative')),
      middle(inPeriod.filter((v) => v.kind === 'voice' && v.tone === 'positive')),
      middle(inPeriod.filter((v) => v.kind === 'farewell')),
    ].filter((v): v is VoiceRecord => v !== undefined);
    if (picks.length > 0) {
      out.push({
        fromYear: start / MONTHS_PER_YEAR + 1,
        toYear: Math.min(start + span, state.month) / MONTHS_PER_YEAR,
        voices: picks.sort((a, b) => a.month - b.month),
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// 法令と出来事の学び（§14.7。もとは §9 の6「分岐点の解説」。制度の変更は「変更の振り返り」で扱う）
// ---------------------------------------------------------------------------

export const LESSONS_MAX = 5;
/** 法令から挙げる上限。出来事での判断も入るように */
const LAW_LESSONS_MAX = 2;
/** 法令を後回しにした月数がこれ以上なら挙げる */
const VIOLATION_MONTHS_NOTABLE = 6;

export type LessonPoint =
  | { month: number; kind: 'event'; eventId: string; choiceIndex: number; lesson: string }
  | { month: number; kind: 'law'; ruleId: string; violationMonths: number; lesson: string };

/** 候補の重さ（大きいほど優先して挙げる） */
const WEIGHT = { law: 5, followUp: 4, condition: 4, market: 3, industry: 3, hiring: 3, lawEvent: 3, people: 2 };

export function pickLessons(state: CompanyState): LessonPoint[] {
  const cands: { score: number; point: LessonPoint }[] = [];
  for (const c of state.legal.compliance) {
    if (c.violationMonths < VIOLATION_MONTHS_NOTABLE) continue;
    const rule = getLaw(c.ruleId);
    cands.push({
      score: WEIGHT.law,
      point: { month: c.triggeredMonth, kind: 'law', ruleId: c.ruleId, violationMonths: c.violationMonths, lesson: rule.lesson },
    });
  }
  const seen = new Set<string>();
  for (const d of state.decisions) {
    const def = eventDefs.find((x) => x.id === d.eventId);
    const e = def ? localizeEvent(def, state.profile.industryId) : undefined;
    const lesson = e?.choices[d.choiceIndex]?.lesson;
    if (!e || !lesson || seen.has(e.id)) continue;
    seen.add(e.id);
    const score =
      e.trigger.type === 'followUp'
        ? WEIGHT.followUp
        : e.trigger.type === 'condition'
          ? WEIGHT.condition
          : e.category === 'law'
            ? WEIGHT.lawEvent
            : WEIGHT[e.category];
    cands.push({ score, point: { month: d.month, kind: 'event', eventId: e.id, choiceIndex: d.choiceIndex, lesson } });
  }
  const picked: LessonPoint[] = [];
  let laws = 0;
  for (const c of cands.sort((a, b) => b.score - a.score || a.point.month - b.point.month)) {
    if (picked.length >= LESSONS_MAX) break;
    if (c.point.kind === 'law' && laws >= LAW_LESSONS_MAX) continue;
    if (c.point.kind === 'law') laws++;
    picked.push(c.point);
  }
  return picked.sort((a, b) => a.month - b.month);
}
