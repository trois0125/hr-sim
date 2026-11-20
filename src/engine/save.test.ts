import { describe, expect, it } from 'vitest';
import { generateCompany } from './generate';
import { normalizeCompany, parseSave, serializeSave } from './save';
import { runToEnd } from './tick';
import { SAVE_VERSION } from './types';

describe('セーブデータ', () => {
  it('書いて読むと同じ会社に戻る（版と保存した時刻がつく）', () => {
    const c = runToEnd(generateCompany({ seed: 3, industryId: 'restaurant' }), 30);
    const r = parseSave(serializeSave(c, '2026-11-18T00:00:00Z', { feed: [1, 2] }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.version).toBe(SAVE_VERSION);
    expect(r.data.savedAt).toBe('2026-11-18T00:00:00Z');
    expect(r.data.company).toEqual(c);
    expect(r.data.ui).toEqual({ feed: [1, 2] });
  });

  it('途中の版で足した項目が無いセーブも、既定値で埋めて読める', () => {
    const c = runToEnd(generateCompany({ seed: 3, industryId: 'trading' }), 6);
    const old = JSON.parse(serializeSave(c, 'x'));
    delete old.company.voices;
    delete old.company.decisions;
    delete old.company.reflections;
    for (const e of old.company.employees) delete e.leave;
    const r = parseSave(JSON.stringify(old));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.company.voices).toEqual([]);
    expect(r.data.company.decisions).toEqual([]);
    expect(r.data.company.employees.every((e) => e.leave === null)).toBe(true);
    // 埋めたあとも、そのまま続きを回せる
    expect(runToEnd(r.data.company, 3).month).toBe(9);
  });

  it('空・壊れている・このゲームより新しい版のセーブは読まない', () => {
    expect(parseSave(null)).toEqual({ ok: false, reason: 'empty' });
    expect(parseSave('{not json')).toEqual({ ok: false, reason: 'broken' });
    expect(parseSave(JSON.stringify({ version: SAVE_VERSION, company: { hello: 1 } }))).toEqual({ ok: false, reason: 'broken' });
    expect(parseSave(JSON.stringify({ version: SAVE_VERSION + 1, company: {} }))).toEqual({ ok: false, reason: 'newer' });
  });

  it('既定値で埋めるのは、無い項目だけ', () => {
    const c = runToEnd(generateCompany({ seed: 3, industryId: 'trading' }), 12);
    const before = structuredClone(c);
    expect(normalizeCompany(c)).toEqual({ ...before, unrecordedFunding: before.unrecordedFunding ?? 0 });
  });
});
