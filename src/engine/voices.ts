/**
 * 従業員の声（§10 のメイン画面のフィード、§9 の社史レポートの「従業員の声」）。ステップ9。
 *
 * テンプレート（src/data/voices.json）の組み合わせでつくる。
 * - ふだんの声：毎月、在籍者から無作為に選んだ人が話す。納得感が低い人は「いちばん足を引っ張っている要因」、
 *   高い人は「いちばん支えている要因」、その間の人はとりとめのないことを話す
 * - 退職のあいさつ：その月に辞めた人の一部が、退職理由に合ったことを話す
 * - 休職からの復帰、出向からの帰任
 * 乱数は voices 系列だけを使う（声の有無でほかの抽選がずれないように）
 */
import { coefGroup } from './coefficients';
import { biggestDrag, factorWeights } from './engagement';
import type { Rng } from './rng';
import type {
  AttritionReason,
  CompanyState,
  Departure,
  Employee,
  EngagementFactor,
  FactorScores,
  LeaveKind,
  Values,
  VoiceRecord,
  VoiceTone,
} from './types';
import { ENGAGEMENT_FACTORS, MONTHS_PER_YEAR } from './types';
import voicesJson from '../data/voices.json';

type VoiceData = {
  negative: Record<EngagementFactor, string[]>;
  positive: Record<EngagementFactor, string[]>;
  neutral: string[];
  farewell: Record<AttritionReason, string[]>;
  return: Record<LeaveKind, string[]>;
  secondment: string[];
  retirement: string[];
};
export const voiceData = voicesJson as unknown as VoiceData;

const K = coefGroup({
  perMonth: 'voices.per_month',
  farewellMax: 'voices.farewell_max',
  negativeBelow: 'voices.negative_below',
  positiveAbove: 'voices.positive_above',
});

/** 納得感を最も支えている要因（重み×点数が最大のもの） */
export function biggestSupport(scores: FactorScores, values: Values): EngagementFactor {
  const w = factorWeights(values);
  let best: EngagementFactor = 'stability';
  let bestValue = -Infinity;
  for (const f of ENGAGEMENT_FACTORS) {
    const v = w[f] * scores[f];
    if (v > bestValue) {
      bestValue = v;
      best = f;
    }
  }
  return best;
}

function fill(text: string, e: Pick<Employee, 'overtimeHours' | 'tenureMonths'>): string {
  return text
    .replace('{overtime}', String(Math.round(e.overtimeHours)))
    .replace('{tenure}', String(Math.max(1, Math.floor(e.tenureMonths / MONTHS_PER_YEAR))));
}

/** ふだんの声の調子と、何についての声か */
export function voiceTopic(e: Employee): { tone: VoiceTone; factor: EngagementFactor | null } {
  const k = K();
  if (!e.factorScores) return { tone: 'neutral', factor: null };
  if (e.engagement < k.negativeBelow) return { tone: 'negative', factor: biggestDrag(e.factorScores, e.values) };
  if (e.engagement > k.positiveAbove) return { tone: 'positive', factor: biggestSupport(e.factorScores, e.values) };
  return { tone: 'neutral', factor: null };
}

/** 1人のふだんの声 */
export function everydayVoice(e: Employee, month: number, rng: Rng): VoiceRecord {
  const { tone, factor } = voiceTopic(e);
  const pool = tone === 'neutral' || !factor ? voiceData.neutral : voiceData[tone][factor];
  return {
    month,
    employeeId: e.id,
    name: e.name,
    role: e.role,
    kind: 'voice',
    tone,
    factor,
    text: fill(rng.pick(pool), e),
  };
}

function departureVoice(d: Departure, rng: Rng): VoiceRecord {
  const base = { month: d.month, employeeId: d.employeeId, name: d.name, role: d.role, factor: null };
  if (d.kind === 'return') return { ...base, kind: 'secondment', tone: 'neutral', text: rng.pick(voiceData.secondment) };
  if (d.kind === 'retirement') return { ...base, kind: 'retirement', tone: 'positive', text: rng.pick(voiceData.retirement) };
  const reason = d.reason ?? 'family';
  const tone: VoiceTone = reason === 'family' ? 'neutral' : 'negative';
  return { ...base, kind: 'farewell', tone, text: rng.pick(voiceData.farewell[reason]) };
}

export type VoiceContext = {
  /** その月に去った人 */
  departures: readonly Departure[];
  /** その月に休職から復帰した人 */
  returned: readonly { employee: Employee; kind: LeaveKind }[];
};

/** その月の声をつくり、状態に記録する（状態を書き換える）。つくった声を返す */
export function generateVoices(state: CompanyState, rng: Rng, ctx: VoiceContext): VoiceRecord[] {
  const out: VoiceRecord[] = [];
  for (const r of ctx.returned) {
    out.push({
      month: state.month,
      employeeId: r.employee.id,
      name: r.employee.name,
      role: r.employee.role,
      kind: 'return',
      tone: 'positive',
      factor: null,
      text: rng.pick(voiceData.return[r.kind]),
    });
  }
  for (const d of rng.shuffle(ctx.departures).slice(0, K().farewellMax)) out.push(departureVoice(d, rng));
  const speakers = state.employees.filter((e) => !e.leave);
  for (let i = 0; i < K().perMonth && speakers.length > 0; i++) {
    out.push(everydayVoice(rng.pick(speakers), state.month, rng));
  }
  state.voices.push(...out);
  return out;
}
