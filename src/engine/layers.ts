/**
 * 層ごとの集計（§4.1）。ステップ10。
 *
 * 計算は一人ひとりのまま行い、社員が多くなったら「見せ方」を層にまとめる（ユーザーと決定）。
 * 層は「職種×年代（10歳刻み）」。パートは年代で分けず、職種ごとに1つの層にする。等級は絞り込みに使う。
 * 社史レポート（ステップ11）でも使う。
 */
import { coef } from './coefficients';
import { factorWeights } from './engagement';
import type { Departure, Employee, EngagementFactor, FactorScores, IndustryData, RoleId } from './types';
import { ENGAGEMENT_FACTORS, MONTHS_PER_YEAR } from './types';

/** 年代の刻み（歳）と、端の年代 */
const BAND_WIDTH = 10;
const YOUNGEST_BAND = 20;
const OLDEST_BAND = 60;

/** 年代（20〜60。20は「20代以下」、60は「60代以上」） */
export function ageBand(age: number): number {
  return Math.min(OLDEST_BAND, Math.max(YOUNGEST_BAND, Math.floor(age / BAND_WIDTH) * BAND_WIDTH));
}

/** 層のキー。パートは年代で分けない（band が null） */
export function layerOf(e: Pick<Employee, 'role' | 'age' | 'employmentType'>): { role: RoleId; band: number | null; key: string } {
  const band = e.employmentType === 'part' ? null : ageBand(e.age);
  return { role: e.role, band, key: `${e.role}|${band ?? 'part'}` };
}

export type Layer = {
  key: string;
  role: RoleId;
  /** 年代。パートの層は null */
  band: number | null;
  count: number;
  onLeave: number;
  engagementMean: number;
  /** 納得感のばらつき（標準偏差） */
  engagementSd: number;
  /** 納得感が不満の水準（従業員の声で不満を話す水準）より低い人数 */
  lowEngagement: number;
  salaryMean: number;
  /** 直近12か月にこの層から退職した人数（等級で絞り込んだときは数えない＝null） */
  resignations12: number | null;
  /** 6要因の平均（内訳がまだない層は null） */
  factorMeans: FactorScores | null;
  /** 層全体で納得感をいちばん引き下げている要因（重み×不足の合計が最大のもの） */
  biggestDrag: EngagementFactor | null;
  memberIds: string[];
};

export type LayerOptions = {
  industry: IndustryData;
  /** 退職者の記録と、いまの月（直近12か月の退職を数える） */
  departures?: readonly Departure[];
  month?: number;
  /** この等級の人だけで集計する */
  grade?: number;
};

/** 層ごとに集計する。並びは業種の職種の順 → 年代の若い順 → パート */
export function summarizeLayers(employees: readonly Employee[], options: LayerOptions): Layer[] {
  const members = new Map<string, Employee[]>();
  for (const e of employees) {
    if (options.grade !== undefined && e.grade !== options.grade) continue;
    const { key } = layerOf(e);
    const list = members.get(key);
    if (list) list.push(e);
    else members.set(key, [e]);
  }

  const resign = new Map<string, number>();
  if (options.grade === undefined && options.departures && options.month !== undefined) {
    const since = options.month - MONTHS_PER_YEAR;
    for (const d of options.departures) {
      if (d.kind !== 'resignation' || d.month <= since) continue;
      const { key } = layerOf({ role: d.role, age: d.age, employmentType: d.employmentType ?? 'full' });
      resign.set(key, (resign.get(key) ?? 0) + 1);
    }
  }

  const low = coef('voices.negative_below');
  const out: Layer[] = [];
  for (const [key, list] of members) {
    const first = list[0] as Employee;
    const { role, band } = layerOf(first);
    const n = list.length;
    const mean = list.reduce((s, e) => s + e.engagement, 0) / n;
    const variance = list.reduce((s, e) => s + (e.engagement - mean) ** 2, 0) / n;
    const scored = list.filter((e) => e.factorScores);
    let factorMeans: FactorScores | null = null;
    let biggestDrag: EngagementFactor | null = null;
    if (scored.length > 0) {
      const sums = Object.fromEntries(ENGAGEMENT_FACTORS.map((f) => [f, 0])) as FactorScores;
      const drag = Object.fromEntries(ENGAGEMENT_FACTORS.map((f) => [f, 0])) as FactorScores;
      for (const e of scored) {
        const w = factorWeights(e.values);
        for (const f of ENGAGEMENT_FACTORS) {
          const s = (e.factorScores as FactorScores)[f];
          sums[f] += s;
          drag[f] += w[f] * (100 - s);
        }
      }
      factorMeans = Object.fromEntries(ENGAGEMENT_FACTORS.map((f) => [f, sums[f] / scored.length])) as FactorScores;
      biggestDrag = ENGAGEMENT_FACTORS.reduce((best, f) => (drag[f] > drag[best] ? f : best), ENGAGEMENT_FACTORS[0]);
    }
    out.push({
      key,
      role,
      band,
      count: n,
      onLeave: list.filter((e) => e.leave).length,
      engagementMean: mean,
      engagementSd: Math.sqrt(variance),
      lowEngagement: list.filter((e) => e.engagement < low).length,
      salaryMean: list.reduce((s, e) => s + e.salaryMonthly, 0) / n,
      resignations12: options.grade === undefined && options.departures ? (resign.get(key) ?? 0) : null,
      factorMeans,
      biggestDrag,
      memberIds: list.map((e) => e.id),
    });
  }
  const roleOrder = new Map(options.industry.roles.map((r, i) => [r.id, i]));
  return out.sort(
    (a, b) =>
      (roleOrder.get(a.role) ?? 99) - (roleOrder.get(b.role) ?? 99) ||
      (a.band ?? Infinity) - (b.band ?? Infinity),
  );
}

/** 主要人物として一人ずつ見せる理由 */
export type KeyReason = 'key' | 'founding' | 'ace';

/**
 * 層の表示に切り替えたあとも一人ずつ見せる人（最大 ui.key_people_max 人）。
 * 主要人物（役員級・抜擢された人）→ 創業メンバー → 実力の高い順（エース）の順に選ぶ
 */
export function keyPeople(employees: readonly Employee[], max = coef('ui.key_people_max')): { employee: Employee; reason: KeyReason }[] {
  const out: { employee: Employee; reason: KeyReason }[] = [];
  const taken = new Set<string>();
  const add = (list: Employee[], reason: KeyReason) => {
    for (const e of list) {
      if (out.length >= max) return;
      if (taken.has(e.id)) continue;
      taken.add(e.id);
      out.push({ employee: e, reason });
    }
  };
  const byTenure = (a: Employee, b: Employee) => b.tenureMonths - a.tenureMonths;
  add(employees.filter((e) => e.isKeyPerson).sort(byTenure), 'key');
  add(employees.filter((e) => e.hireChannel === 'founding').sort(byTenure), 'founding');
  add([...employees].filter((e) => e.employmentType !== 'part').sort((a, b) => b.ability - a.ability), 'ace');
  return out;
}

/** 層の表示に切り替えるか */
export function usesLayerView(headcount: number): boolean {
  return headcount > coef('ui.layer_view_threshold');
}
