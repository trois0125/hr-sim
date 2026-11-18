import { describe, expect, it } from 'vitest';
import { availableIndustries } from '../engine/data';
import { industryEvidence } from '../engine/evidence';
import { evidenceStrings } from './strings';

describe('数字の根拠の項目名', () => {
  it('業種データの根拠付きの数値には、すべて日本語の項目名がある（業種データに項目を足したら、ここも足す）', () => {
    const missing = new Set<string>();
    for (const d of availableIndustries())
      for (const e of industryEvidence(d)) {
        const key = e.path.replace(/\[[^\]]+\]/g, '[]');
        if (!evidenceStrings.fields[key]) missing.add(key);
      }
    expect([...missing]).toEqual([]);
  });
});
