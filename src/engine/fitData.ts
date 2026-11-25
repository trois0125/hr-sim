/**
 * 制度と会社の相性（DESIGN.md §14.8。ステップ21）のデータ。中身は src/data/fits.json。
 */
import fitsJson from '../data/fits.json';
import type { FitDef } from './types';

export const fitDefs = fitsJson as FitDef[];

export function getFit(id: string): FitDef {
  const f = fitDefs.find((x) => x.id === id);
  if (!f) throw new Error(`相性がありません: ${id}`);
  return f;
}
