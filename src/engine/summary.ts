/**
 * 1社の結果をまとめる（scripts/simulate.ts の集計と、社史レポート（ステップ11）で使う）。
 */
import type { AttritionReason, CompanyState, MonthlyRecord } from './types';
import { ATTRITION_REASONS, MONTHS_PER_YEAR } from './types';

export type PeriodMetrics = {
  months: number;
  /** 年率の離職率（退職者 ÷ 平均の社員数。出向者の帰任は含まない） */
  attritionRate: number;
  /** 人件費 ÷ 売上 */
  laborCostRatio: number;
  /** 営業利益 ÷ 売上 */
  operatingMargin: number;
  /** 毎月の平均の納得感の平均 */
  engagement: number;
  /** 売上を生むフルタイム社員の、月の残業時間の平均 */
  overtimeHours: number;
  /** 需要のうち売上にできた割合 */
  demandCoverage: number;
  /** 期間の終わりの社員数 */
  endHeadcount: number;
  /** 営業利益の合計（円） */
  totalOperatingProfit: number;
  /** 臨時の支出（法令対応・是正・未払い残業代・納付金・イベントなど）の合計（円） */
  totalExtraordinaryCost: number;
  /** 営業利益から臨時の支出を引いた合計（円）。制度や方針の良し悪しはこれで比べる */
  totalNetProfit: number;
  /** 違反の状態にあった月の数 */
  violationMonths: number;
};

export type RunSummary = {
  status: CompanyState['status'];
  months: number;
  finalHeadcount: number;
  /** 最後の月の手元資金（円） */
  finalCash: number;
  totalHires: number;
  all: PeriodMetrics;
  /** 創業期（最初の5年） */
  early: PeriodMetrics | null;
  /** 成熟期（11年目以降） */
  late: PeriodMetrics | null;
  /** 退職理由の割合（退職者がいなければ全部0） */
  reasons: Record<AttritionReason, number>;
  /** 違反が見つかった回数 */
  detections: number;
};

/** 創業期・成熟期の区切り（年） */
export const EARLY_YEARS = 5;
export const LATE_FROM_YEAR = 10;

export function periodMetrics(records: readonly MonthlyRecord[]): PeriodMetrics | null {
  if (records.length === 0) return null;
  let resign = 0;
  let heads = 0;
  let labor = 0;
  let revenue = 0;
  let profit = 0;
  let eng = 0;
  let ot = 0;
  let demand = 0;
  let extraordinary = 0;
  let violationMonths = 0;
  for (const r of records) {
    extraordinary += r.extraordinaryCost;
    if (r.violations > 0) violationMonths++;
    resign += r.resignations;
    heads += r.headcount;
    labor += r.labor.total;
    revenue += r.revenue;
    profit += r.operatingProfit;
    eng += r.avgEngagement;
    ot += r.overtimeHours;
    demand += r.demand;
  }
  const n = records.length;
  const avgHeads = heads / n;
  return {
    months: n,
    attritionRate: avgHeads > 0 ? (resign / avgHeads) * (MONTHS_PER_YEAR / n) : 0,
    laborCostRatio: revenue > 0 ? labor / revenue : 0,
    operatingMargin: revenue > 0 ? profit / revenue : 0,
    engagement: eng / n,
    overtimeHours: ot / n,
    demandCoverage: demand > 0 ? revenue / demand : 1,
    endHeadcount: records[n - 1]?.headcount ?? 0,
    totalOperatingProfit: profit,
    totalExtraordinaryCost: extraordinary,
    totalNetProfit: profit - extraordinary,
    violationMonths,
  };
}

export function summarizeRun(state: CompanyState): RunSummary {
  const h = state.history;
  const reasons = Object.fromEntries(ATTRITION_REASONS.map((r) => [r, 0])) as Record<AttritionReason, number>;
  const resignations = state.departures.filter((d) => d.kind === 'resignation');
  for (const d of resignations) if (d.reason) reasons[d.reason] += 1 / resignations.length;
  return {
    status: state.status,
    months: state.month,
    finalHeadcount: state.employees.length,
    finalCash: state.cash,
    totalHires: h.reduce((s, r) => s + r.hires, 0),
    all: periodMetrics(h) as PeriodMetrics,
    early: periodMetrics(h.slice(0, EARLY_YEARS * MONTHS_PER_YEAR)),
    late: periodMetrics(h.slice(LATE_FROM_YEAR * MONTHS_PER_YEAR)),
    reasons,
    detections: state.legal.log.filter((l) => l.kind === 'violation_detected').length,
  };
}
