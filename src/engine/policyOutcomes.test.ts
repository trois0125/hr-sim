/**
 * ステップ5の完了条件：制度を変えると、会社全体の人件費と納得感が変わることを確かめる。
 * 同じシードの会社を、制度だけ変えて同じ期間回し、平均を比べる。
 */
import { describe, expect, it } from 'vitest';
import { defaultPolicies } from './data';
import { generateCompany } from './generate';
import { runToEnd } from './tick';
import type { CompanyState, PolicySet } from './types';

const SEEDS = [1, 2, 3, 4, 5, 6];
const MONTHS = 96;

type Outcome = {
  /** 人件費の合計 ÷ 売上の合計 */
  laborRatio: number;
  /** 人件費の合計 */
  labor: number;
  /** 毎月の平均の納得感の平均 */
  engagement: number;
  /** 制度の運用コストの合計 */
  hrSystemCost: number;
  /** 1人あたりのその他の固定費 */
  otherCostPerHead: number;
  /** 在籍者の評価のずれ（最後の月） */
  evaluationError: number;
};

const cache = new Map<string, Outcome>();
function outcome(over: Partial<PolicySet>): Outcome {
  const key = JSON.stringify(over);
  const hit = cache.get(key);
  if (hit) return hit;
  let labor = 0;
  let revenue = 0;
  let eng = 0;
  let n = 0;
  let hr = 0;
  let other = 0;
  let heads = 0;
  let err = 0;
  let errN = 0;
  for (const seed of SEEDS) {
    const c: CompanyState = generateCompany({ seed, industryId: 'trading', foundingPatternId: 'carveout' });
    c.policies = { ...defaultPolicies, ...over };
    const end = runToEnd(c, MONTHS);
    for (const r of end.history) {
      labor += r.labor.total;
      revenue += r.revenue;
      eng += r.avgEngagement;
      hr += r.hrSystemCost;
      other += r.otherFixedCost;
      heads += r.headcount;
      n++;
    }
    for (const e of end.employees) {
      err += Math.abs(e.perceivedPerformance - e.ability);
      errN++;
    }
  }
  const out = {
    laborRatio: labor / revenue,
    labor,
    engagement: eng / n,
    hrSystemCost: hr,
    otherCostPerHead: other / heads,
    evaluationError: err / errN,
  };
  cache.set(key, out);
  return out;
}

describe('制度を変えると、会社全体の人件費と納得感が変わる', { timeout: 60000 }, () => {
  it('賞与：なしにすると人件費は下がるが、納得感も下がる', () => {
    const none = outcome({ bonus: 'none' });
    const fixed = outcome({ bonus: 'fixed_months' });
    expect(none.laborRatio).toBeLessThan(fixed.laborRatio);
    expect(none.engagement).toBeLessThan(fixed.engagement);
  });

  it('給与の決め方：年功は成果連動より納得感が高い（給与の見通しが立つ）', () => {
    expect(outcome({ pay: 'seniority' }).engagement).toBeGreaterThan(outcome({ pay: 'performance' }).engagement);
  });

  it('評価制度：360度評価は社長が決めるより評価のずれが小さく、納得感が高いが、運用コストがかかる', () => {
    const ceo = outcome({ evaluation: 'ceo' });
    const multi = outcome({ evaluation: 'multi_rater' });
    expect(multi.evaluationError).toBeLessThan(ceo.evaluationError);
    expect(multi.engagement).toBeGreaterThan(ceo.engagement);
    expect(multi.hrSystemCost).toBeGreaterThan(ceo.hrSystemCost);
  });

  it('等級制度：職務等級は評価のずれを小さくするが、運用コストがかかる', () => {
    const none = outcome({ grade: 'none' });
    const job = outcome({ grade: 'job' });
    expect(job.evaluationError).toBeLessThan(none.evaluationError);
    expect(job.hrSystemCost).toBeGreaterThan(none.hrSystemCost);
  });

  it('育成投資：増やすと人件費率が上がり、納得感も上がる', () => {
    const zero = outcome({ training: '0' });
    const one = outcome({ training: '1' });
    expect(one.laborRatio).toBeGreaterThan(zero.laborRatio);
    expect(one.engagement).toBeGreaterThan(zero.engagement);
  });

  it('労働時間：固定残業代は人件費が上がるが、報酬が高く見えて納得感が上がる', () => {
    const std = outcome({ workHours: 'standard' });
    const fixed = outcome({ workHours: 'fixed_overtime' });
    expect(fixed.labor).toBeGreaterThan(std.labor);
    expect(fixed.engagement).toBeGreaterThan(std.engagement);
  });

  it('働き方：ハイブリッドは1人あたりの固定費が下がり、納得感が上がる', () => {
    const office = outcome({ workStyle: 'office' });
    const hybrid = outcome({ workStyle: 'hybrid' });
    expect(hybrid.otherCostPerHead).toBeLessThan(office.otherCostPerHead);
    expect(hybrid.engagement).toBeGreaterThan(office.engagement);
  });

  it('残業の方針：残業なしは特別条項より納得感が高い', () => {
    expect(outcome({ overtime: 'none' }).engagement).toBeGreaterThan(outcome({ overtime: 'special' }).engagement);
  });
});
