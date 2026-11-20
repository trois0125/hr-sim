import { describe, expect, it } from 'vitest';
import { ageBands, bucketize, businessSeries, orgSeries, orgStructure } from './dashboard';
import { generateCompany } from './generate';
import { runToEnd } from './tick';
import { makeEmployee } from './testHelpers';
import { ENGAGEMENT_FACTORS, MONTHS_PER_YEAR } from './types';

const played = runToEnd(generateCompany({ seed: 11, industryId: 'trading', foundingPatternId: 'cofounders', autoPlay: { legal: 'immediate' } }), 7 * MONTHS_PER_YEAR + 5);

describe('事業タブ・組織タブの数字（§14.2）', () => {
  it('期間の区切り：直近12か月は1か月ずつ、直近5年は四半期、創業からは1年ずつ', () => {
    const h = played.history;
    const months = bucketize(h, 'year1');
    expect(months).toHaveLength(12);
    expect(months.every((b) => b.records.length === 1)).toBe(true);
    expect(months.at(-1)!.endMonth).toBe(h.at(-1)!.month);

    const quarters = bucketize(h, 'year5');
    expect(quarters.reduce((s, b) => s + b.records.length, 0)).toBe(60);
    expect(quarters.slice(1, -1).every((b) => b.records.length === 3)).toBe(true);

    const years = bucketize(h, 'all');
    expect(years).toHaveLength(Math.ceil(h.length / MONTHS_PER_YEAR));
    expect(years[0]!.startMonth).toBe(0);
    expect(years.at(-1)!.records).toHaveLength(h.length % MONTHS_PER_YEAR || MONTHS_PER_YEAR);
  });

  it('事業：売上や利益は期間の合計、稼働率と需要を売上にできた割合は合計どうしで割る', () => {
    const [y] = businessSeries(bucketize(played.history, 'all'));
    const first = played.history.slice(0, MONTHS_PER_YEAR);
    const rev = first.reduce((s, r) => s + r.revenue, 0);
    expect(y!.revenue).toBeCloseTo(rev);
    expect(y!.utilization).toBeCloseTo(rev / first.reduce((s, r) => s + r.capacity, 0));
    expect(y!.coverage).toBeCloseTo(rev / first.reduce((s, r) => s + r.demand, 0));
    expect(y!.operatingProfit).toBeCloseTo(first.reduce((s, r) => s + r.operatingProfit, 0));
  });

  it('組織：要因の平均・入社と退職・理由ごとの退職・人件費の内訳がそろう', () => {
    const rows = orgSeries(bucketize(played.history, 'all'), played.departures);
    const allResign = played.history.reduce((s, r) => s + r.resignations, 0);
    expect(rows.reduce((s, r) => s + r.resignations, 0)).toBe(allResign);
    // 理由の合計は、記録の退職と同じ（理由のない退職はない）
    expect(rows.reduce((s, r) => s + Object.values(r.reasons).reduce((a, b) => a + b, 0), 0)).toBe(allResign);
    const last = rows.at(-1)!;
    for (const f of ENGAGEMENT_FACTORS) {
      expect(last.factors![f]).toBeGreaterThanOrEqual(0);
      expect(last.factors![f]).toBeLessThanOrEqual(100);
    }
    expect(Object.values(last.roles!).reduce((a, b) => a + b, 0)).toBe(last.headcount);
    const laborSum = Object.values(last.labor).reduce((a, b) => a + b, 0);
    const total = played.history.filter((r) => r.month >= last.startMonth).reduce((s, r) => s + r.labor.total, 0);
    expect(laborSum).toBeCloseTo(total);
  });

  it('古い記録（組織の様子が無い）は、その項目を null にする', () => {
    const old = played.history.map(({ org: _org, ...r }) => r);
    const rows = orgSeries(bucketize(old, 'year1'), played.departures);
    expect(rows.every((r) => r.factors === null && r.roles === null && r.onLeave === null)).toBe(true);
    expect(rows.every((r) => r.headcount > 0)).toBe(true);
  });

  it('年齢は10歳ごとに、フルタイムとパートを分けて数える', () => {
    const es = [makeEmployee('sales', { age: 24 }), makeEmployee('sales', { age: 29 }), makeEmployee('sales', { age: 41, employmentType: 'part' })];
    expect(ageBands(es)).toEqual([
      { band: 20, full: 2, part: 0 },
      { band: 40, full: 0, part: 1 },
    ]);
  });

  it('組織図：どの形でも、部署・事業部・チームの人数の合計は社員数', () => {
    for (const form of ['direct', 'functional', 'divisional', 'flat', 'matrix'] as const) {
      const c = { ...played, organization: { ...played.organization, form } };
      const s = orgStructure(c);
      expect(s.units.reduce((sum, u) => sum + u.headcount, 0), form).toBe(played.employees.length);
      if (form === 'flat') expect(s.units.length).toBeGreaterThan(1);
    }
  });
});
