/**
 * 事業タブ・組織タブのグラフの数字（§14.2。ステップ15）。
 *
 * 毎月の記録（history）を、選んだ期間で区切ってまとめる。
 * - 直近12か月：1か月ずつ／直近5年：四半期ずつ／創業から：1年ずつ
 * - 流れの量（売上・費用・入社・退職）は足し、様子（景気・納得感・人数）は平均か期末の値をとる
 * - 割合（稼働率など）は、期間の合計どうしで割る（月の割合の平均にはしない）
 * 古い記録（組織の様子が無いもの）は、その項目を null にする（グラフはそこを空ける）
 */
import { getIndustry } from './data';
import type {
  AttritionReason,
  CompanyState,
  Departure,
  Employee,
  EngagementFactor,
  FactorScores,
  LaborCost,
  MonthlyRecord,
  OrgSnapshot,
  RoleId,
  RoleKind,
} from './types';
import { ATTRITION_REASONS, ENGAGEMENT_FACTORS, MONTHS_PER_YEAR } from './types';

/** 月の数（四半期） */
const QUARTER = 3;
/** 直近5年 */
const FIVE_YEARS = 5 * MONTHS_PER_YEAR;
/** 年齢の区切り（10歳ごと） */
const AGE_BAND = 10;

export const PERIODS = ['year1', 'year5', 'all'] as const;
export type Period = (typeof PERIODS)[number];
/** 1本の棒・1つの点がまとめる長さ */
export type BucketUnit = 'month' | 'quarter' | 'year';

export type Bucket = {
  unit: BucketUnit;
  /** 期間の最初と最後の月（創業からの経過月） */
  startMonth: number;
  endMonth: number;
  records: MonthlyRecord[];
};

// ---------------------------------------------------------------------------
// 月末の組織の様子（tick.ts から呼ぶ）
// ---------------------------------------------------------------------------

export function orgSnapshot(employees: readonly Employee[]): OrgSnapshot {
  const roles: Record<RoleId, number> = {};
  let part = 0;
  let onLeave = 0;
  const scored: FactorScores[] = [];
  for (const e of employees) {
    roles[e.role] = (roles[e.role] ?? 0) + 1;
    if (e.employmentType === 'part') part++;
    if (e.leave) onLeave++;
    else if (e.factorScores) scored.push(e.factorScores);
  }
  let factors: FactorScores | null = null;
  if (scored.length > 0) {
    factors = {} as FactorScores;
    for (const f of ENGAGEMENT_FACTORS) factors[f] = scored.reduce((s, x) => s + x[f], 0) / scored.length;
  }
  return { factors, roles, part, onLeave };
}

// ---------------------------------------------------------------------------
// 期間の区切り
// ---------------------------------------------------------------------------

export function bucketUnit(period: Period): BucketUnit {
  return period === 'year1' ? 'month' : period === 'year5' ? 'quarter' : 'year';
}

/** 記録を期間で区切る。四半期と年は、創業月から数えて区切る（途中の区切りは、そこまでの月だけ） */
export function bucketize(history: readonly MonthlyRecord[], period: Period): Bucket[] {
  const unit = bucketUnit(period);
  const span = period === 'year1' ? MONTHS_PER_YEAR : period === 'year5' ? FIVE_YEARS : Infinity;
  const size = unit === 'month' ? 1 : unit === 'quarter' ? QUARTER : MONTHS_PER_YEAR;
  const last = history[history.length - 1];
  if (!last) return [];
  const from = span === Infinity ? 0 : Math.max(0, last.month + 1 - span);
  const out: Bucket[] = [];
  for (const r of history) {
    if (r.month < from) continue;
    const start = Math.floor(r.month / size) * size;
    const b = out[out.length - 1];
    if (b && b.startMonth === Math.max(start, from)) {
      b.records.push(r);
      b.endMonth = r.month;
    } else out.push({ unit, startMonth: Math.max(start, from), endMonth: r.month, records: [r] });
  }
  return out;
}

const sum = (rs: readonly MonthlyRecord[], f: (r: MonthlyRecord) => number) => rs.reduce((s, r) => s + f(r), 0);
const avg = (rs: readonly MonthlyRecord[], f: (r: MonthlyRecord) => number) => (rs.length > 0 ? sum(rs, f) / rs.length : 0);
const ratio = (a: number, b: number) => (b > 0 ? a / b : null);

// ---------------------------------------------------------------------------
// 事業
// ---------------------------------------------------------------------------

export type BusinessRow = {
  startMonth: number;
  endMonth: number;
  /** 景気（0が平常。プラスが好況） */
  economy: number;
  demand: number;
  revenue: number;
  /** 残業なしで出せる上限 */
  capacity: number;
  /** 稼働率：売上 ÷ 残業なしで出せる上限（100%を超えたぶんは残業で出している） */
  utilization: number | null;
  /** 需要を売上にできた割合：売上 ÷ 需要 */
  coverage: number | null;
  grossProfit: number;
  operatingProfit: number;
};

export function businessSeries(buckets: readonly Bucket[]): BusinessRow[] {
  return buckets.map((b) => {
    const rs = b.records;
    const revenue = sum(rs, (r) => r.revenue);
    const capacity = sum(rs, (r) => r.capacity);
    const demand = sum(rs, (r) => r.demand);
    return {
      startMonth: b.startMonth,
      endMonth: b.endMonth,
      economy: avg(rs, (r) => r.economy),
      demand,
      revenue,
      capacity,
      utilization: ratio(revenue, capacity),
      coverage: ratio(revenue, demand),
      grossProfit: sum(rs, (r) => r.grossProfit),
      operatingProfit: sum(rs, (r) => r.operatingProfit),
    };
  });
}

// ---------------------------------------------------------------------------
// 組織
// ---------------------------------------------------------------------------

export type LaborPart = Exclude<keyof LaborCost, 'total'>;
export const LABOR_PARTS: readonly LaborPart[] = ['salaries', 'bonus', 'legalWelfare', 'overtime', 'hiring', 'training'];

export type OrgRow = {
  startMonth: number;
  endMonth: number;
  /** 納得感の6要因の平均（期間の平均。記録の無い期間は null） */
  factors: FactorScores | null;
  /** 納得感の平均（期間の平均） */
  engagement: number;
  /** 期末の人数 */
  headcount: number;
  /** 期末の職種ごとの人数（記録の無い期間は null） */
  roles: Record<RoleId, number> | null;
  part: number | null;
  onLeave: number | null;
  hires: number;
  resignations: number;
  retirements: number;
  /** 退職理由ごとの人数 */
  reasons: Record<AttritionReason, number>;
  /** 年あたりの離職率（期間の退職 ÷ 期間の平均人数 を1年に直す） */
  attritionRate: number | null;
  /** 人件費の内訳（期間の合計） */
  labor: Record<LaborPart, number>;
  /** 売上を生む社員の残業（期間の平均。時間/月） */
  overtime: number;
};

export function orgSeries(buckets: readonly Bucket[], departures: readonly Departure[]): OrgRow[] {
  return buckets.map((b) => {
    const rs = b.records;
    const lastRec = rs[rs.length - 1] as MonthlyRecord;
    const withOrg = rs.filter((r) => r.org?.factors);
    let factors: FactorScores | null = null;
    if (withOrg.length > 0) {
      factors = {} as FactorScores;
      for (const f of ENGAGEMENT_FACTORS) factors[f] = avg(withOrg, (r) => r.org?.factors?.[f] ?? 0);
    }
    const reasons = Object.fromEntries(ATTRITION_REASONS.map((x) => [x, 0])) as Record<AttritionReason, number>;
    for (const d of departures) {
      if (d.kind !== 'resignation' || d.month < b.startMonth || d.month > b.endMonth || !d.reason) continue;
      reasons[d.reason] += 1;
    }
    const resignations = sum(rs, (r) => r.resignations);
    const avgHead = avg(rs, (r) => r.headcount);
    const labor = Object.fromEntries(LABOR_PARTS.map((k) => [k, sum(rs, (r) => r.labor[k])])) as Record<LaborPart, number>;
    return {
      startMonth: b.startMonth,
      endMonth: b.endMonth,
      factors,
      engagement: avg(rs, (r) => r.avgEngagement),
      headcount: lastRec.headcount,
      roles: lastRec.org ? { ...lastRec.org.roles } : null,
      part: lastRec.org ? lastRec.org.part : null,
      onLeave: lastRec.org ? lastRec.org.onLeave : null,
      hires: sum(rs, (r) => r.hires),
      resignations,
      retirements: sum(rs, (r) => r.retirements ?? 0),
      reasons,
      attritionRate: avgHead > 0 ? (resignations / avgHead) * (MONTHS_PER_YEAR / rs.length) : null,
      labor,
      overtime: avg(rs, (r) => r.overtimeHours),
    };
  });
}

/** いまの年齢構成（10歳ごと。フルタイムとパート） */
export function ageBands(employees: readonly Employee[]): { band: number; full: number; part: number }[] {
  const map = new Map<number, { full: number; part: number }>();
  for (const e of employees) {
    const band = Math.floor(e.age / AGE_BAND) * AGE_BAND;
    const x = map.get(band) ?? { full: 0, part: 0 };
    if (e.employmentType === 'part') x.part++;
    else x.full++;
    map.set(band, x);
  }
  return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([band, x]) => ({ band, ...x }));
}

/** いまの等級ごとの人数（等級の制度がないときは空） */
export function gradeCounts(state: CompanyState): { grade: number; count: number }[] {
  if (state.policies.grade === 'none') return [];
  const map = new Map<number, number>();
  for (const e of state.employees) map.set(e.grade, (map.get(e.grade) ?? 0) + 1);
  return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([grade, count]) => ({ grade, count }));
}

// ---------------------------------------------------------------------------
// 組織図（ステップ15は仮の形：社長の下に、職種の種類ごとの箱を並べる。ステップ17で部署と組織の形にする）
// ---------------------------------------------------------------------------

export type OrgChartRole = { id: RoleId; name: string; full: number; part: number; onLeave: number };
export type OrgChartGroup = { kind: RoleKind; roles: OrgChartRole[]; total: number };

export function orgChart(state: CompanyState): OrgChartGroup[] {
  const industry = getIndustry(state.profile.industryId);
  const kinds: RoleKind[] = ['management', 'revenue', 'admin'];
  return kinds
    .map((kind) => {
      const roles = industry.roles
        .filter((r) => r.kind === kind)
        .map((r) => {
          const es = state.employees.filter((e) => e.role === r.id);
          return {
            id: r.id,
            name: r.name,
            full: es.filter((e) => e.employmentType !== 'part').length,
            part: es.filter((e) => e.employmentType === 'part').length,
            onLeave: es.filter((e) => e.leave).length,
          };
        });
      return { kind, roles, total: roles.reduce((s, r) => s + r.full + r.part, 0) };
    })
    .filter((g) => g.total > 0 || g.kind !== 'admin');
}

/** 要因の並び（グラフの色の順番を固定するため） */
export const FACTOR_ORDER: readonly EngagementFactor[] = ENGAGEMENT_FACTORS;
