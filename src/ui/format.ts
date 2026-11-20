/** 数字の表示（画面用） */
import { formatGameDate } from '../engine/calendar';
import { unitStrings } from './strings';

const MAN = 1e4;
const OKU = 1e8;

/** 金額：1億円以上は「1.2億円」、それ未満は「340万円」 */
export function yen(x: number): string {
  if (Math.abs(x) >= OKU) return `${(x / OKU).toFixed(1)}${unitStrings.oku}`;
  return `${Math.round(x / MAN).toLocaleString('ja-JP')}${unitStrings.man}`;
}

export const pct = (x: number, digits = 1) => `${(x * 100).toFixed(digits)}%`;
export const score = (x: number) => x.toFixed(0);
export const dateLabel = (month: number) => formatGameDate(month);
