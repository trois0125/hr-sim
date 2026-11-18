import { describe, expect, it } from 'vitest';
import { eventDefs } from '../engine/eventData';
import { laws } from '../engine/lawData';
import { programDefs } from '../engine/programs';
import { guide, optionKey } from './guide';
import { policyStrings } from './strings';

describe('初級者向けの解説（§14.3）', () => {
  it('制度のカテゴリと選択肢には、すべて解説がある', () => {
    for (const [cat, options] of Object.entries(policyStrings.options)) {
      expect(guide.policyCategories[cat], cat).toBeDefined();
      for (const opt of Object.keys(options)) {
        const g = guide.policyOptions[optionKey(cat, opt)];
        expect(g, `${cat}.${opt}`).toBeDefined();
        expect(g!.merits.length).toBeGreaterThanOrEqual(2);
        expect(g!.demerits.length).toBeGreaterThanOrEqual(2);
        expect(g!.cautions.length).toBeGreaterThanOrEqual(1);
        expect(g!.pitfalls.length).toBeGreaterThanOrEqual(1);
        expect(g!.fits.length).toBeGreaterThan(5);
      }
    }
    // 解説だけあって、ゲームにない選択肢はない
    for (const key of Object.keys(guide.policyOptions)) {
      const [cat, opt] = [key.slice(0, key.indexOf('.')), key.slice(key.indexOf('.') + 1)];
      expect(Object.keys(policyStrings.options[cat as keyof typeof policyStrings.options] ?? {}), key).toContain(opt);
    }
  });

  it('法令には、すべて解説と出典（公式のページの URL）がある', () => {
    for (const r of laws) {
      const g = guide.laws[r.id];
      expect(g, r.id).toBeDefined();
      expect(g!.legal.length).toBeGreaterThan(0);
      expect(g!.sources.length).toBeGreaterThan(0);
      for (const s of g!.sources) expect(s.url).toMatch(/^https:\/\/([a-z0-9-]+\.)*(mhlw|nenkin|jeed)\.go\.jp\//);
    }
    expect(Object.keys(guide.laws).sort()).toEqual(laws.map((r) => r.id).sort());
  });

  it('個別制度と施策には、すべて解説がある', () => {
    for (const p of programDefs) expect(guide.programs[p.id], p.id).toBeDefined();
    for (const e of eventDefs.filter((x) => x.trigger.type === 'initiative')) expect(guide.initiatives[e.id], e.id).toBeDefined();
  });

  it('法令のポイントを書いた解説には、必ず出典がある', () => {
    const all = [
      ...Object.entries(guide.policyCategories),
      ...Object.entries(guide.policyOptions),
      ...Object.entries(guide.programs),
      ...Object.entries(guide.initiatives),
    ];
    for (const [id, g] of all) if (g.legal?.length) expect(g.sources?.length ?? 0, id).toBeGreaterThan(0);
  });
});
