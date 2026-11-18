/**
 * 休職（育児休業・介護休業・私傷病休職）。ステップ8。
 *
 * - 休職中は働かない（稼働0）。採用の計算では「いない人」として扱うので、代わりの人を採る
 * - 給与・賞与は払わない（育児休業給付・介護休業給付は雇用保険、傷病手当金は健康保険から出る）
 * - 社会保険料の会社負担は、育児休業中だけ免除される（健康保険法159条・厚生年金保険法81条の2）。
 *   介護休業・私傷病休職では、休職前の給与（標準報酬月額）に応じて払い続ける（finance.ts）
 * - 在籍者には数える（法令の人数、社員数）
 * - 期間が終わる月のはじめに、復帰するか退職するかを抽選する
 */
import { coefGroup } from './coefficients';
import { toDeparture } from './attrition';
import type { Rng } from './rng';
import type { AttritionReason, CompanyState, Departure, Employee, Gender, Leave, LeaveKind } from './types';

const K = coefGroup({
  parentalF: 'leave.parental.female_months',
  parentalM: 'leave.parental.male_months',
  parentalReturn: 'leave.parental.return_rate',
  careMonths: 'leave.care.months',
  careReturn: 'leave.care.return_rate',
  sickMonths: 'leave.sick.months',
  sickReturn: 'leave.sick.return_rate',
});

export function isOnLeave(e: Pick<Employee, 'leave'>): boolean {
  return e.leave !== undefined && e.leave !== null;
}

/** 休職の標準の期間（月） */
export function standardLeaveMonths(kind: LeaveKind, gender: Gender): number {
  const k = K();
  switch (kind) {
    case 'parental':
      return gender === 'F' ? k.parentalF : k.parentalM;
    case 'care':
      return k.careMonths;
    case 'sick':
      return k.sickMonths;
  }
}

/** 休職から復帰する標準の確率 */
export function standardReturnRate(kind: LeaveKind): number {
  const k = K();
  return { parental: k.parentalReturn, care: k.careReturn, sick: k.sickReturn }[kind];
}

/** 休職のあとに辞めるときの理由 */
const RESIGN_REASON: Record<LeaveKind, AttritionReason> = {
  parental: 'family',
  care: 'family',
  sick: 'workload',
};

export type StartLeaveOptions = {
  /** 標準の期間に掛ける倍率 */
  monthsMult?: number;
  /** 復帰する確率に足す値（会社の支え方。0〜1に収める） */
  returnRateBonus?: number;
};

/** 休職に入る（社員を書き換える）。すでに休職中なら何もしない */
export function startLeave(e: Employee, kind: LeaveKind, month: number, options: StartLeaveOptions = {}): void {
  if (isOnLeave(e)) return;
  const months = Math.max(1, Math.round(standardLeaveMonths(kind, e.gender) * (options.monthsMult ?? 1)));
  const leave: Leave = {
    kind,
    startMonth: month,
    endsAt: month + months,
    returnRate: Math.min(1, Math.max(0, standardReturnRate(kind) + (options.returnRateBonus ?? 0))),
  };
  e.leave = leave;
  e.overtimeHours = 0;
}

/**
 * 期間の終わった休職を片づける（月のはじめに呼ぶ。状態を書き換える）。
 * 乱数は、期間の終わった休職1件につき1回だけ引く。去った人の記録を返す
 */
export function processLeaves(state: CompanyState, rng: Rng): Departure[] {
  const out: Departure[] = [];
  const stay: Employee[] = [];
  for (const e of state.employees) {
    const leave = e.leave;
    if (!leave || state.month < leave.endsAt) {
      stay.push(e);
      continue;
    }
    if (rng.next() < leave.returnRate) {
      e.leave = null;
      stay.push(e);
    } else {
      out.push(toDeparture(e, state.month, 'resignation', RESIGN_REASON[leave.kind]));
    }
  }
  state.employees = stay;
  state.departures.push(...out);
  return out;
}
