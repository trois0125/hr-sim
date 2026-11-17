/**
 * 係数台帳（§6.2）の参照。数値はコードに直書きせず、ここから ID で取り出す。
 */
import { coefficients } from './data';
import type { Coefficient } from './types';

const byId = new Map<string, Coefficient>();
for (const c of coefficients) {
  if (byId.has(c.id)) throw new Error(`係数IDが重複しています: ${c.id}`);
  byId.set(c.id, c);
}

/** 係数の値を取り出す。ID がなければエラーにする（打ち間違いに気づくため） */
export function coef(id: string): number {
  const c = byId.get(id);
  if (!c) throw new Error(`係数がありません: ${id}`);
  return c.value;
}

/** 係数の行ごと取り出す（「この数字の根拠」表示用） */
export function coefEntry(id: string): Coefficient {
  const c = byId.get(id);
  if (!c) throw new Error(`係数がありません: ${id}`);
  return c;
}
