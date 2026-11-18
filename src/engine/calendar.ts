/**
 * ゲーム内の日付。創業月（係数台帳の calendar.*）から数えた経過月を、年月に直す。
 * 法令の施行日（laws.json の effectiveFrom）と比べるのに使う。
 */
import { coef } from './coefficients';
import { MONTHS_PER_YEAR } from './types';

export type GameDate = { year: number; month: number };

export function gameDate(elapsedMonths: number): GameDate {
  const start = (coef('calendar.start_month') - 1) + elapsedMonths;
  return {
    year: coef('calendar.start_year') + Math.floor(start / MONTHS_PER_YEAR),
    month: (start % MONTHS_PER_YEAR) + 1,
  };
}

/** 'YYYY-MM-DD' を、その月の初日の経過月に直す（その月の途中の施行日は、その月から適用とみなす） */
export function monthIndexOf(isoDate: string): number {
  const [y, m] = isoDate.split('-').map(Number) as [number, number];
  return (y - coef('calendar.start_year')) * MONTHS_PER_YEAR + (m - coef('calendar.start_month'));
}

/** 画面用の表記（例：2026年4月） */
export function formatGameDate(elapsedMonths: number): string {
  const d = gameDate(elapsedMonths);
  return `${d.year}年${d.month}月`;
}
