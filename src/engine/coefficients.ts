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

/**
 * 部品に分けた ID で係数を取り出す（例：coefPath('policy', 'pay', 'market', 'stability_bonus')）。
 * ID の文字列をその都度組み立てると遅いので、部品ごとの入れ子の Map に結果を覚えておく。
 */
type PathCache = Map<string, PathCache | number>;
const pathCache: PathCache = new Map();
export function coefPath(...parts: string[]): number {
  let node: PathCache = pathCache;
  const last = parts.length - 1;
  for (let i = 0; i < last; i++) {
    const key = parts[i] as string;
    let next = node.get(key);
    if (next === undefined) {
      next = new Map();
      node.set(key, next);
    }
    node = next as PathCache;
  }
  const leaf = parts[last] as string;
  const hit = node.get(leaf);
  if (typeof hit === 'number') return hit;
  const value = coef(parts.join('.'));
  node.set(leaf, value);
  return value;
}

/**
 * よく使う係数をまとめて1回だけ読み、以後は同じオブジェクトを返す関数をつくる。
 * 毎月・社員ごとに呼ばれる関数で使う（係数は実行中に変わらない）。
 *   const K = coefGroup({ slope: 'engagement.external_pay.slope' });
 *   K().slope
 */
export function coefGroup<T extends Record<string, string>>(ids: T): () => { readonly [K in keyof T]: number } {
  let cached: { [K in keyof T]: number } | undefined;
  return () => {
    if (!cached) {
      const out = {} as { [K in keyof T]: number };
      for (const key of Object.keys(ids) as (keyof T)[]) out[key] = coef(ids[key] as string);
      cached = out;
    }
    return cached;
  };
}

/** 係数の行ごと取り出す（「この数字の根拠」表示用） */
export function coefEntry(id: string): Coefficient {
  const c = byId.get(id);
  if (!c) throw new Error(`係数がありません: ${id}`);
  return c;
}
