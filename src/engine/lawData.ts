/** 法令データ（laws.json）を型付きで読む */
import lawsJson from '../data/laws.json';
import type { LawRule } from './types';

export const laws = lawsJson as LawRule[];

export function getLaw(id: string): LawRule {
  const r = laws.find((x) => x.id === id);
  if (!r) throw new Error(`法令ルールがありません: ${id}`);
  return r;
}
