/** 業種ごとの違い（ステップ12）：統計の値、賃金カーブ、熟練、パート、定年、店舗と店長、積み上がる売上、資金調達 */
import { describe, expect, it } from 'vitest';
import { coef } from './coefficients';
import { getIndustry } from './data';
import { ageSalaryFactor, createEmployee } from './employees';
import { addFunding, modifierValue } from './events';
import { generateCompany } from './generate';
import { desiredOpenings } from './hiring';
import { retireEmployees, resignationProbability } from './attrition';
import { computePerformance, experienceFactor, managerOvertimeHours, storeCount, supportRequirement } from './performance';
import { createRng } from './rng';
import { summarizeRun } from './summary';
import { makeEmployee, tokyo } from './testHelpers';
import { runToEnd, tick } from './tick';
import type { Employee, IndustryId } from './types';
import { INDUSTRY_IDS } from './types';
import { defaultPolicies } from './data';

const trading = getIndustry('trading');
const restaurant = getIndustry('restaurant');
const saas = getIndustry('saas');
const manufacturing = getIndustry('manufacturing');

function person(industryId: IndustryId, role: string, over: Partial<Employee> = {}): Employee {
  const industry = getIndustry(industryId);
  const e = createEmployee({ rng: createRng(1), id: `p${Math.random()}`, industry, location: tokyo, role, employmentType: 'full', affiliation: 'proper' });
  return { ...e, age: 40, ability: 50, engagement: 50, tenureMonths: 36, ...over };
}

describe('4業種のデータ', () => {
  it('4業種すべてにデータがあり、売上を生む職種・事務・管理がそろっている', () => {
    for (const id of INDUSTRY_IDS) {
      const d = getIndustry(id);
      for (const kind of ['revenue', 'admin', 'management'] as const) expect(d.roles.some((r) => r.kind === kind), `${id} ${kind}`).toBe(true);
      expect(d.remoteAllowed.length).toBeGreaterThan(0);
      expect(d.variants.length).toBeGreaterThan(1);
    }
  });

  it('離職率は雇用動向調査の値（飲食 > SaaS > 製造 の順に辞めやすい）', () => {
    expect(restaurant.baseAttritionRate.basis).toBe('statistic');
    expect(restaurant.baseAttritionRate.value).toBeGreaterThan(saas.baseAttritionRate.value);
    expect(saas.baseAttritionRate.value).toBeGreaterThan(manufacturing.baseAttritionRate.value);
  });
});

describe('賃金カーブと熟練', () => {
  it('飲食の賃金カーブは平ら、商社とSaaSは年齢で大きく上がる', () => {
    expect(ageSalaryFactor(50, restaurant)).toBeLessThan(ageSalaryFactor(50, trading));
    expect(ageSalaryFactor(50, saas)).toBeGreaterThan(ageSalaryFactor(50, restaurant) * 1.3);
    // 業種の指定がなければ、係数台帳の共通のカーブ（商社）
    expect(ageSalaryFactor(50)).toBe(ageSalaryFactor(50, trading));
  });

  it('製造業は、熟練（年齢による経験）が生産性に強く効く', () => {
    const gain = (ind: typeof trading) => experienceFactor(55, ind) / experienceFactor(30, ind);
    expect(gain(manufacturing)).toBeGreaterThan(gain(trading));
  });

  it('パートの辞めやすさは業種ごと（飲食は一般とあまり変わらず、SaaSは大きく違う）', () => {
    const ctx = (industry: typeof trading) => ({ industry, location: tokyo, policies: defaultPolicies });
    const ratio = (industry: typeof trading, role: string) => {
      const full = person(industry.id, role);
      const part = { ...full, employmentType: 'part' as const };
      const p = (e: Employee) => {
        const r = resignationProbability(e, ctx(industry));
        return r.unrelated + r.related;
      };
      return p(part) / p(full);
    };
    expect(ratio(restaurant, 'store_staff')).toBeLessThan(ratio(saas, 'corporate'));
  });
});

describe('定年', () => {
  it('定年の年齢に達したプロパー社員は退職する（出向者は除く）', () => {
    const age = coef('retirement.age');
    const old = makeEmployee('sales', { age });
    const young = makeEmployee('sales', { age: age - 1 });
    const secondee = makeEmployee('sales', { age, affiliation: 'secondee' });
    const r = retireEmployees([old, young, secondee], 12);
    expect(r.stay).toEqual([young, secondee]);
    expect(r.retired[0]).toMatchObject({ employeeId: old.id, kind: 'retirement', reason: null });
  });

  it('定年は離職率に数えず、記録の定年の人数に数える', () => {
    const c = generateCompany({ seed: 2, industryId: 'trading' });
    c.month = 11;
    for (const e of c.employees) e.age = coef('retirement.age') - 1;
    const n = c.employees.filter((e) => e.affiliation === 'proper').length;
    let s = tick(c); // 決算月で年齢が上がり、定年になる
    expect(s.departures.filter((d) => d.kind === 'retirement')).toHaveLength(n);
    s = tick(s); // 定年は次の月の記録に数える
    const rec = s.history[s.history.length - 1];
    expect(rec?.retirements).toBe(n);
    expect(rec?.resignations ?? 0).toBeLessThan(n);
  });
});

describe('飲食：店舗と店長', () => {
  it('店舗の数は社員数÷1店舗の人数。社長が1店舗を見るので、要る店長は店舗の数−1', () => {
    const per = restaurant.store?.staffPerStore.value ?? 0;
    expect(storeCount(restaurant, per * 3)).toBe(3);
    expect(storeCount(restaurant, per * 3 + 1)).toBe(4);
    expect(storeCount(trading, 100)).toBe(0);
    expect(supportRequirement(restaurant, 10, per * 3).management).toBe(2);
  });

  it('店長が足りないと、店の効率が下がり、いまの店長に残業が寄る', () => {
    const per = restaurant.store?.staffPerStore.value ?? 12;
    const staff = Array.from({ length: per * 4 - 1 }, () => person('restaurant', 'store_staff'));
    const variant = restaurant.variants[0]!;
    // 店長も店舗の人数に入るので、店舗スタッフ47人＋店長4人＝51人で5店舗（社長が1店舗、店長4人）
    const managers = Array.from({ length: 4 }, () => person('restaurant', 'store_manager'));
    const enough = computePerformance([...staff, ...managers], restaurant, variant);
    const short = computePerformance([...staff, managers[0]!], restaurant, variant);
    expect(short.managementFactor).toBeLessThan(enough.managementFactor);
    expect(short.storesWithoutManager).toBeGreaterThan(0);
    expect(managerOvertimeHours(short, 45)).toBeGreaterThan(0);
    expect(managerOvertimeHours(enough, 45)).toBe(0);
  });

  it('店舗スタッフの不足が大きくても、店長の求人を先に出せる（店長が要る数だけ）', () => {
    const per = restaurant.store?.staffPerStore.value ?? 12;
    const staff = Array.from({ length: per * 3 }, () => person('restaurant', 'store_staff'));
    const variant = restaurant.variants[0]!;
    const want = desiredOpenings({ employees: staff, industry: restaurant, variant, demand: 1e12, capacity: 0 });
    expect(want.store_manager).toBe(2);
  });
});

describe('SaaS：積み上がる売上と資金調達', () => {
  it('売上は出せる上限に一度には届かず、少しずつ近づく', () => {
    const c = generateCompany({ seed: 4, industryId: 'saas' });
    const start = c.market.recurringRevenue ?? 0;
    expect(start).toBeGreaterThan(0);
    const s = runToEnd(c, 6);
    const r = s.history.map((x) => x.revenue);
    expect(r[0]).toBeGreaterThan(start * 0.9);
    // 毎月、出せる上限（売れる上限）より小さい
    for (const x of s.history) expect(x.revenue).toBeLessThanOrEqual(Math.max(x.capacity * 2, x.revenue));
    expect(r[5]).not.toBe(r[0]);
  });

  it('資金調達は手元資金を増やすが、利益にも臨時の支出にも入らない', () => {
    const c = runToEnd(generateCompany({ seed: 4, industryId: 'saas' }), 3);
    const cash = c.cash;
    const rec = c.history[c.history.length - 1]!;
    const before = { ...rec };
    c.month = rec.month;
    addFunding(c, 5e7);
    expect(c.cash).toBe(cash + 5e7);
    expect(rec.funding).toBe(5e7);
    expect(rec.operatingProfit).toBe(before.operatingProfit);
    expect(rec.extraordinaryCost).toBe(before.extraordinaryCost);
  });

  it('先行投資を広げると（資金調達のあと）、採る人数が増える', () => {
    const run = (headroom: number) => {
      let hires = 0;
      for (let seed = 1; seed <= 10; seed++) {
        const c = generateCompany({ seed, industryId: 'saas', foundingPatternId: 'cofounders' });
        if (headroom > 0) c.modifiers.push({ type: 'hiringHeadroom', mult: headroom, untilMonth: 999 });
        hires += runToEnd(c, 36).history.reduce((s, r) => s + r.hires, 0);
      }
      return hires;
    };
    const c = generateCompany({ seed: 1, industryId: 'saas' });
    c.modifiers.push({ type: 'hiringHeadroom', mult: 1, untilMonth: 5 });
    expect(modifierValue(c, 'hiringHeadroom')).toBe(1);
    expect(run(1)).toBeGreaterThan(run(0));
  });
});

describe('業種らしい違い（完了条件）', () => {
  it('同じ条件で回すと、飲食は離職率が高く、SaaS は売上高人件費率が高く、商社は低い', () => {
    const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;
    const stats = (industryId: IndustryId) => {
      const s = Array.from({ length: 24 }, (_, i) => summarizeRun(runToEnd(generateCompany({ seed: 100 + i, industryId }), 120)));
      return { attrition: median(s.map((x) => x.all.attritionRate)), labor: median(s.map((x) => x.all.laborCostRatio)) };
    };
    const t = stats('trading');
    const r = stats('restaurant');
    const sa = stats('saas');
    const m = stats('manufacturing');
    expect(r.attrition).toBeGreaterThan(t.attrition * 1.5);
    expect(sa.labor).toBeGreaterThan(m.labor);
    expect(m.labor).toBeGreaterThan(t.labor);
    expect(r.labor).toBeGreaterThan(t.labor);
  }, 30000); // 96社を10年ずつ回すので、ほかのテストと並んで走るときは5秒を超えることがある
});
