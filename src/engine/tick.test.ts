import { describe, expect, it } from 'vitest';
import { coef } from './coefficients';
import { generateCompany } from './generate';
import { runToEnd, tick } from './tick';
import { FOUNDING_PATTERN_IDS, MONTHS_PER_YEAR } from './types';

const company = (seed: number, foundingPatternId: (typeof FOUNDING_PATTERN_IDS)[number] = 'cofounders') =>
  generateCompany({ seed, industryId: 'trading', foundingPatternId });

describe('ティック処理', () => {
  it('1か月進めても、元の状態は変わらない', () => {
    const c = company(1);
    const snapshot = structuredClone(c);
    const next = tick(c);
    expect(c).toEqual(snapshot);
    expect(next.month).toBe(1);
    expect(next.history).toHaveLength(1);
  });

  it('同じシードなら、最後まで同じ結果になる', () => {
    expect(runToEnd(company(11))).toEqual(runToEnd(company(11)));
  });

  it.each(FOUNDING_PATTERN_IDS)('%s：制度を固定して終了条件まで回せ、毎月の記録が残る', (pattern) => {
    const end = runToEnd(company(21, pattern));
    expect(end.status).not.toBe('running');
    expect(end.history).toHaveLength(end.month);
    for (const r of end.history) {
      for (const v of [r.revenue, r.grossProfit, r.labor.total, r.operatingProfit, r.cash, r.demand]) {
        expect(Number.isFinite(v)).toBe(true);
      }
      expect(r.revenue).toBeGreaterThanOrEqual(0);
      expect(r.revenue).toBeLessThanOrEqual(r.demand + 1);
      expect(r.labor.total).toBeGreaterThan(0);
    }
  });

  it('需要が伸びなければ成熟も倒産もせず、300か月（25年）で時間切れになる', () => {
    const c = company(5);
    c.market.matureDemandMonthly = c.market.initialDemandMonthly;
    c.cash = 10_000_000_000;
    const end = runToEnd(c);
    expect(end.status).toBe('timeout');
    expect(end.month).toBe(coef('end.max_months'));
    expect(end.history).toHaveLength(300);
  });

  it('手元資金は、毎月の営業利益のぶんだけ動く', () => {
    const end = runToEnd(company(3), 36);
    let cash = end.profile.initialCash;
    for (const r of end.history) {
      cash += r.operatingProfit;
      expect(r.cash).toBeCloseTo(cash, 0);
    }
  });

  it('1年たつと残っている全員が1歳年をとり、勤続が12か月増える', () => {
    const c = company(4, 'carveout');
    c.hiring.intensity = 0; // 途中入社を止めて、創業時の社員だけで確かめる
    const end = runToEnd(c, MONTHS_PER_YEAR);
    const before = new Map(c.employees.map((e) => [e.id, e]));
    expect(end.employees.length).toBeGreaterThan(0);
    for (const e of end.employees) {
      expect(e.age).toBe((before.get(e.id)?.age ?? 0) + 1);
      expect(e.tenureMonths).toBe((before.get(e.id)?.tenureMonths ?? 0) + MONTHS_PER_YEAR);
    }
  });
});

describe('終了条件', () => {
  it('手元資金がマイナスのまま6か月続くと倒産する', () => {
    const c = company(2);
    c.cash = -1_000_000_000_000;
    const end = runToEnd(c);
    expect(end.status).toBe('bankrupt');
    expect(end.month).toBe(coef('end.bankruptcy_months'));
  });

  it('終了した会社は、それ以上進まない', () => {
    const c = company(2);
    c.cash = -1_000_000_000_000;
    const end = runToEnd(c);
    expect(tick(end)).toEqual(end);
  });

  it('成熟で終わった会社は、成熟ラインを超えていて、直近3年の伸びが小さい', { timeout: 30000 }, () => {
    const matured = [1, 2, 3, 4, 5, 6, 7, 8]
      .map((seed) => runToEnd(company(seed, 'carveout')))
      .filter((c) => c.status === 'matured');
    expect(matured.length).toBeGreaterThan(0);
    for (const c of matured) {
      expect(c.employees.length).toBeGreaterThanOrEqual(300);
      const h = (yearsAgo: number) => c.history[c.history.length - 1 - yearsAgo * MONTHS_PER_YEAR]?.headcount ?? 0;
      for (let y = 0; y < 3; y++) expect(h(y) / h(y + 1) - 1).toBeLessThan(0.05);
    }
  });
});

describe('採用と業績の向き', () => {
  it('採用を止めると社員は増えず、売上も採用する会社より小さい', () => {
    const frozen = company(9);
    frozen.hiring.intensity = 0;
    const a = runToEnd(frozen, 60);
    const b = runToEnd(company(9), 60);
    expect(a.employees.length).toBeLessThanOrEqual(frozen.employees.length); // 退職はある
    expect(b.employees.length).toBeGreaterThan(a.employees.length);
    const revenue = (c: typeof a) => c.history.reduce((s, r) => s + r.revenue, 0);
    expect(revenue(b)).toBeGreaterThan(revenue(a));
  });

  it('採用を強めると、5年後の社員数が増える（平均）', () => {
    const headcount = (intensity: number) => {
      let n = 0;
      for (let seed = 1; seed <= 20; seed++) {
        const c = company(seed);
        c.hiring.intensity = intensity;
        n += runToEnd(c, 60).employees.length;
      }
      return n;
    };
    expect(headcount(2)).toBeGreaterThan(headcount(1));
  });
});

describe('納得感と退職（ステップ4）', () => {
  const run = (overtime: 'none' | 'limit45' | 'special', months = 60) => {
    let eng = 0;
    let n = 0;
    let workloadExits = 0;
    let exits = 0;
    for (let seed = 1; seed <= 15; seed++) {
      const c = company(seed, 'solo');
      c.policies.overtime = overtime;
      const end = runToEnd(c, months);
      for (const r of end.history) {
        eng += r.avgEngagement;
        n++;
      }
      for (const d of end.departures) {
        if (d.kind !== 'resignation') continue;
        exits++;
        if (d.reason === 'workload') workloadExits++;
      }
    }
    return { eng: eng / n, workloadShare: workloadExits / Math.max(1, exits), exits };
  };

  it('残業の上限を上げるほど、平均の納得感が下がり、負荷を理由に辞める人の割合が増える', { timeout: 30000 }, () => {
    const none = run('none');
    const limit = run('limit45');
    const special = run('special');
    expect(limit.eng).toBeLessThan(none.eng);
    expect(special.eng).toBeLessThan(limit.eng);
    expect(special.workloadShare).toBeGreaterThan(none.workloadShare);
  });

  it('退職は理由付きで記録され、毎月の退職者数と一致する', () => {
    const end = runToEnd(company(8, 'carveout'), 120);
    const resignations = end.departures.filter((d) => d.kind === 'resignation');
    expect(resignations.length).toBeGreaterThan(0);
    for (const d of resignations) expect(d.reason).not.toBeNull();
    expect(end.history.reduce((s, r) => s + r.resignations, 0)).toBe(resignations.length);
  });

  it('社員ごとに納得感の要因の内訳が見える', () => {
    const end = runToEnd(company(8, 'carveout'), 3);
    for (const e of end.employees) {
      expect(e.factorScores).not.toBeNull();
      expect(Object.keys(e.factorScores ?? {})).toHaveLength(6);
    }
  });

  it('子会社の出向者は、出向期間が終わると全員戻る（退職には数えない）', () => {
    const c = company(3, 'subsidiary');
    const secondees = c.employees.filter((e) => e.affiliation === 'secondee');
    expect(secondees.length).toBeGreaterThan(0);
    const end = runToEnd(c, coef('secondment.term_months_max') + 1);
    expect(end.employees.some((e) => e.affiliation === 'secondee')).toBe(false);
    const returned = end.departures.filter((d) => d.kind === 'return');
    expect(returned).toHaveLength(secondees.length);
    expect(end.history.reduce((s, r) => s + r.returns, 0)).toBe(secondees.length);
  });

  it('年功で昇給：1年たつと、フルタイムの給与が全員上がる', () => {
    const c = company(4, 'carveout');
    c.hiring.intensity = 0;
    c.policies.pay = 'seniority';
    const end = runToEnd(c, MONTHS_PER_YEAR);
    const before = new Map(c.employees.map((e) => [e.id, e]));
    for (const e of end.employees) {
      const b = before.get(e.id);
      if (!b || e.employmentType === 'part' || b.age >= coef('generation.age.max')) continue;
      expect(e.salaryMonthly).toBeGreaterThan(b.salaryMonthly);
    }
  });
});
