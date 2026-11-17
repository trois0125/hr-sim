import { describe, expect, it } from 'vitest';
import { getLocation } from './data';
import { minimumMonthlyWage } from './employees';
import { allocateRoles, generateCompany } from './generate';
import { coef } from './coefficients';
import { FOUNDING_PATTERN_IDS, type CompanyState } from './types';

const seeds = Array.from({ length: 200 }, (_, i) => i + 1);
const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

describe('allocateRoles', () => {
  it('合計人数が n になり、比率の大きい職種から埋まる', () => {
    const mix = { sales: 0.6, admin: 0.3, management: 0.1 };
    expect(allocateRoles(1, mix)).toEqual(['sales']);
    expect(allocateRoles(10, mix).filter((r) => r === 'sales')).toHaveLength(6);
    expect(allocateRoles(25, mix)).toHaveLength(25);
  });
});

describe('generateCompany', () => {
  it('同じシードなら同じ会社が生成される', () => {
    expect(generateCompany({ seed: 2026 })).toEqual(generateCompany({ seed: 2026 }));
  });

  it('シードが違えば違う会社になる', () => {
    const a = generateCompany({ seed: 1, industryId: 'trading' });
    const b = generateCompany({ seed: 2, industryId: 'trading' });
    expect(a.profile).not.toEqual(b.profile);
  });

  it('創業パターンを指定しても、他の要素（商材・所在地・粗利率）は同じシードのおまかせと同じ', () => {
    for (const seed of seeds.slice(0, 20)) {
      const auto = generateCompany({ seed });
      const fixed = generateCompany({ seed, foundingPatternId: 'carveout' });
      expect(fixed.profile.variantId).toBe(auto.profile.variantId);
      expect(fixed.profile.locationId).toBe(auto.profile.locationId);
      expect(fixed.profile.grossMargin).toBe(auto.profile.grossMargin);
    }
  });

  it('商社の会社が生成できる', () => {
    const c = generateCompany({ seed: 10, industryId: 'trading' });
    expect(c.profile.industryId).toBe('trading');
    expect(['food', 'machinery', 'chemicals', 'it_equipment']).toContain(c.profile.variantId);
    expect(c.month).toBe(0);
    expect(c.cash).toBe(c.profile.initialCash);
    expect(c.profile.name.length).toBeGreaterThan(0);
  });

  it('個人創業は社員1人から始まる（創業社長は社員に数えない）', () => {
    for (const seed of seeds.slice(0, 30)) {
      const c = generateCompany({ seed, industryId: 'trading', foundingPatternId: 'solo' });
      expect(c.employees).toHaveLength(1);
      expect(c.employees[0]?.employmentType).toBe('full');
      expect(c.profile.founderName).not.toBe('');
    }
  });

  it('共同創業は2〜4人で、全員が主要人物', () => {
    for (const seed of seeds.slice(0, 30)) {
      const c = generateCompany({ seed, industryId: 'trading', foundingPatternId: 'cofounders' });
      expect(c.employees.length).toBeGreaterThanOrEqual(2);
      expect(c.employees.length).toBeLessThanOrEqual(4);
      expect(c.employees.every((e) => e.isKeyPerson)).toBe(true);
    }
  });

  it('子会社は10人前後で、出向者がいて、出向者の給与はプロパーより高い傾向', () => {
    const premium: number[] = [];
    for (const seed of seeds) {
      const c = generateCompany({ seed, industryId: 'trading', foundingPatternId: 'subsidiary' });
      expect(c.employees.length).toBeGreaterThanOrEqual(8);
      expect(c.employees.length).toBeLessThanOrEqual(12);
      expect(c.employees.some((e) => e.affiliation === 'secondee')).toBe(true);
      expect(c.profile.stableDemandShare).toBeGreaterThan(0);
      expect(c.market.stableDemandMonthly).toBeGreaterThan(0);
      expect(c.profile.legalObligationsAtStart).toBe(true);
      const sec = c.employees.filter((e) => e.affiliation === 'secondee' && e.employmentType === 'full');
      const pro = c.employees.filter((e) => e.affiliation === 'proper' && e.employmentType === 'full');
      if (sec.length && pro.length) premium.push(mean(sec.map((e) => e.salaryMonthly)) / mean(pro.map((e) => e.salaryMonthly)));
    }
    expect(mean(premium)).toBeGreaterThan(1.1);
  });

  it('カーブアウトは20〜30人で、他のパターンより年齢と勤続が高い', () => {
    const ages = { carveout: [] as number[], cofounders: [] as number[] };
    for (const seed of seeds) {
      const cv = generateCompany({ seed, industryId: 'trading', foundingPatternId: 'carveout' });
      expect(cv.employees.length).toBeGreaterThanOrEqual(20);
      expect(cv.employees.length).toBeLessThanOrEqual(30);
      expect(cv.employees.every((e) => e.tenureMonths >= 12)).toBe(true);
      ages.carveout.push(...cv.employees.map((e) => e.age));
      const cf = generateCompany({ seed, industryId: 'trading', foundingPatternId: 'cofounders' });
      ages.cofounders.push(...cf.employees.map((e) => e.age));
    }
    expect(mean(ages.carveout) - mean(ages.cofounders)).toBeGreaterThan(4);
  });

  it('子会社とカーブアウトは個人創業より資金が多い', () => {
    const cash = (id: (typeof FOUNDING_PATTERN_IDS)[number]) =>
      mean(seeds.map((seed) => generateCompany({ seed, industryId: 'trading', foundingPatternId: id }).cash));
    expect(cash('subsidiary')).toBeGreaterThan(cash('solo') * 5);
    expect(cash('carveout')).toBeGreaterThan(cash('solo') * 5);
  });

  it('おまかせで4つの創業パターンがすべて出る', () => {
    const seen = new Set(seeds.map((seed) => generateCompany({ seed }).profile.foundingPatternId));
    expect([...seen].sort()).toEqual([...FOUNDING_PATTERN_IDS].sort());
  });
});

describe('生成された社員の妥当性', () => {
  const companies: CompanyState[] = seeds.map((seed) => generateCompany({ seed }));
  const all = companies.flatMap((c) => c.employees.map((e) => ({ c, e })));

  it('能力・納得感は0〜100、年齢は範囲内', () => {
    for (const { e } of all) {
      expect(e.ability).toBeGreaterThanOrEqual(0);
      expect(e.ability).toBeLessThanOrEqual(100);
      expect(e.engagement).toBeGreaterThanOrEqual(0);
      expect(e.engagement).toBeLessThanOrEqual(100);
      expect(e.age).toBeGreaterThanOrEqual(coef('generation.age.min'));
      expect(e.age).toBeLessThanOrEqual(coef('generation.age.max'));
    }
  });

  it('価値観の合計は1.0', () => {
    for (const { e } of all) {
      const v = e.values;
      expect(v.growth + v.stability + v.money + v.balance).toBeCloseTo(1, 10);
    }
  });

  it('フルタイムの月給は最低賃金を下回らない', () => {
    for (const { c, e } of all) {
      if (e.employmentType !== 'full') continue;
      expect(e.salaryMonthly).toBeGreaterThanOrEqual(minimumMonthlyWage(getLocation(c.profile.locationId)));
    }
  });

  it('社員IDは会社の中で重複しない', () => {
    for (const c of companies) {
      const ids = c.employees.map((e) => e.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(c.nextEmployeeId).toBe(ids.length + 1);
    }
  });

  it('職種構成比の合計は1.0', () => {
    for (const c of companies) {
      expect(Object.values(c.profile.roleMix).reduce((s, x) => s + x, 0)).toBeCloseTo(1, 10);
    }
  });

  it('生成後の状態は JSON にして戻しても同じ（セーブできる）', () => {
    const c = companies[0] as CompanyState;
    expect(JSON.parse(JSON.stringify(c))).toEqual(c);
  });
});
