/**
 * セーブデータ（ステップ13）。React や保存先（localStorage）には依存しない。
 *
 * - 形式には version を付ける（types.ts の SAVE_VERSION）。形式を変えたら版を上げ、MIGRATIONS に
 *   「前の版 → 次の版」の変換を足す。読み込むときに、古い版から順に変換する
 * - 開発中に足した項目（休職・判断の記録・声など）は、無くても読めるように既定値で埋める
 * - 新しい版のセーブ（このゲームより新しい）と、壊れたセーブは読まない
 */
import { autoForm } from './organization';
import type { CompanyState, SaveData } from './types';
import { SAVE_VERSION } from './types';

/** 版ごとの変換。キーは「変換前の版」。例：{ 1: (d) => ({ ...d, version: 2, ... }) } */
type RawSave = { version: number; savedAt: string; company: unknown; ui?: Record<string, unknown> };
const MIGRATIONS: Record<number, (d: RawSave) => RawSave> = {};

export function toSaveData(company: CompanyState, savedAt: string, ui?: Record<string, unknown>): SaveData {
  return { version: SAVE_VERSION, savedAt, company, ...(ui ? { ui } : {}) };
}

export function serializeSave(company: CompanyState, savedAt: string, ui?: Record<string, unknown>): string {
  return JSON.stringify(toSaveData(company, savedAt, ui));
}

export type LoadResult =
  | { ok: true; data: SaveData }
  | { ok: false; reason: 'empty' | 'broken' | 'newer' };

/** 途中の版で足した項目を既定値で埋める（無ければ足すだけで、あるものは変えない） */
export function normalizeCompany(c: CompanyState): CompanyState {
  c.decisions ??= [];
  c.scheduledEvents ??= [];
  c.reflections ??= [];
  c.voices ??= [];
  c.modifiers ??= [];
  c.disputeSeeds ??= [];
  c.policyChanges ??= [];
  c.pendingDecisions ??= [];
  c.unrecordedFunding ??= 0;
  // 組織の形のない古いセーブは、人数に合った形（自動で進めるときの規則）で始める
  c.organization ??= { form: autoForm(c.employees.length), since: c.month, transition: null, log: [] };
  c.programs ??= [];
  c.programLog ??= [];
  c.mitigations ??= [];
  for (const e of c.employees) e.leave ??= null;
  return c;
}

function isCompany(x: unknown): x is CompanyState {
  if (!x || typeof x !== 'object') return false;
  const c = x as Partial<CompanyState>;
  return (
    typeof c.seed === 'number' &&
    typeof c.month === 'number' &&
    Array.isArray(c.employees) &&
    Array.isArray(c.history) &&
    typeof c.profile === 'object' &&
    typeof c.rng === 'object'
  );
}

/** セーブの文字列を読む。古い版は順に変換し、足りない項目は既定値で埋める */
export function parseSave(text: string | null | undefined): LoadResult {
  if (!text) return { ok: false, reason: 'empty' };
  let raw: RawSave;
  try {
    raw = JSON.parse(text) as RawSave;
  } catch {
    return { ok: false, reason: 'broken' };
  }
  if (!raw || typeof raw.version !== 'number') return { ok: false, reason: 'broken' };
  if (raw.version > SAVE_VERSION) return { ok: false, reason: 'newer' };
  while (raw.version < SAVE_VERSION) {
    const step = MIGRATIONS[raw.version];
    if (!step) return { ok: false, reason: 'broken' };
    raw = step(raw);
  }
  if (!isCompany(raw.company)) return { ok: false, reason: 'broken' };
  return {
    ok: true,
    data: { version: SAVE_VERSION, savedAt: raw.savedAt, company: normalizeCompany(raw.company), ...(raw.ui ? { ui: raw.ui } : {}) },
  };
}
