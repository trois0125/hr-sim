/**
 * 自動セーブの保存先（ブラウザの localStorage）。ステップ13。
 * 使えない環境（プライベートウィンドウ、保存を止めているブラウザ、テストなど）では保存をあきらめ、ゲームは止めない。
 */
import { parseSave, serializeSave, type LoadResult } from '../engine/save';
import type { CompanyState } from '../engine/types';

/** 保存先として使う最小の形（テストでは置き換える） */
export type SaveStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export const AUTOSAVE_KEY = 'hr-sim:autosave';

/** ブラウザの保存先。使えなければ null */
export function browserStorage(): SaveStorage | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const probe = `${AUTOSAVE_KEY}:probe`;
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return null;
  }
}

/** 保存する。容量不足などで書けなければ false */
export function writeSave(storage: SaveStorage | null, company: CompanyState, ui: Record<string, unknown>): boolean {
  if (!storage) return false;
  try {
    storage.setItem(AUTOSAVE_KEY, serializeSave(company, new Date().toISOString(), ui));
    return true;
  } catch {
    return false;
  }
}

export function readSave(storage: SaveStorage | null): LoadResult {
  if (!storage) return { ok: false, reason: 'empty' };
  try {
    return parseSave(storage.getItem(AUTOSAVE_KEY));
  } catch {
    return { ok: false, reason: 'broken' };
  }
}

export function clearSave(storage: SaveStorage | null): void {
  try {
    storage?.removeItem(AUTOSAVE_KEY);
  } catch {
    // 消せなくても続ける
  }
}

/** テスト用：メモリだけの保存先 */
export function memoryStorage(): SaveStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}
