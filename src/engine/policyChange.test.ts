import { describe, expect, it } from 'vitest';
import { coef } from './coefficients';
import { generateCompany } from './generate';
import { changePolicies, changedCategories, currentResistance, previewChange } from './policyChange';
import { runToEnd } from './tick';
import type { CompanyState } from './types';

/** 3年回した会社（評価・昇給が何度か入った状態） */
function grown(seed = 5, pay: CompanyState['policies']['pay'] = 'seniority'): CompanyState {
  const c = generateCompany({ seed, industryId: 'trading', foundingPatternId: 'carveout' });
  c.policies.pay = pay;
  return runToEnd(c, 36);
}

describe('変更の検出', () => {
  it('変えたカテゴリがわかる', () => {
    const c = grown();
    expect(changedCategories(c.policies, { ...c.policies, training: '1', workStyle: 'hybrid' }).sort()).toEqual(
      ['training', 'workStyle'].sort(),
    );
  });

  it('同じ制度なら何も起きない', () => {
    const c = grown();
    expect(changePolicies(c, { ...c.policies })).toBe(c);
  });

  it('業種で選べない制度はエラー', () => {
    const c = grown();
    expect(() => changePolicies(c, { ...c.policies, workStyle: 'remote' })).toThrow();
  });
});

describe('変化への抵抗（変更後6か月の揺れ）', () => {
  it('不利益のない変更でも、変更直後は納得感の目標値が下がり、6か月で消える', () => {
    const c = changePolicies(grown(), { ...grown().policies, training: '1', evaluation: 'mbo' });
    expect(currentResistance(c)).toBeCloseTo(coef('policy_change.resistance_per_category') * 2);
    expect(currentResistance({ ...c, month: c.month + 3 })).toBeLessThan(currentResistance(c));
    expect(currentResistance({ ...c, month: c.month + coef('policy_change.resistance_months') })).toBe(0);
  });

  it('変更した会社は、変更しなかった会社より数か月後の納得感が一時的に低い', () => {
    const base = grown();
    const changed = changePolicies(base, { ...base.policies, evaluation: 'mbo', grade: 'job', workHours: 'flex' }, { method: 'consent' });
    const avg = (c: CompanyState) => c.employees.reduce((s, e) => s + e.engagement, 0) / c.employees.length;
    const a = runToEnd(base, 3);
    const b = runToEnd(changed, 3);
    // 同じ人どうしで比べる（3か月の間の退職・採用の違いを除く）
    const ids = new Set(a.employees.map((e) => e.id));
    const common = (c: CompanyState) => ({ ...c, employees: c.employees.filter((e) => ids.has(e.id) && b.employees.some((x) => x.id === e.id)) });
    expect(avg(common(b))).toBeLessThan(avg(common(a)));
  });
});

describe('不利益変更（給与・賞与が下がる変更）', () => {
  it('年功から成果連動に変えると、評価の低い人を中心に給与が下がる人が出る', () => {
    const c = grown(5, 'seniority');
    const p = previewChange(c, { ...c.policies, pay: 'performance' });
    expect(p.isDisadvantageous).toBe(true);
    expect(p.cuts.size).toBeGreaterThan(0);
    expect(p.cuts.size).toBeLessThan(c.employees.length);
  });

  it('賞与を「一律」から「なし」にすると、全員が不利益', () => {
    const c = grown();
    const p = previewChange(c, { ...c.policies, bonus: 'none' });
    const eligible = c.employees.filter((e) => e.employmentType !== 'part' && e.affiliation === 'proper');
    expect(p.cuts.size).toBe(eligible.length);
  });

  it('不利益変更なのに進め方を選ばないとエラー', () => {
    const c = grown();
    expect(() => changePolicies(c, { ...c.policies, bonus: 'none' })).toThrow();
  });

  it('激変緩和なしなら給与がすぐ下がり、ありなら少しずつ下がる', () => {
    const c = grown(5, 'seniority');
    const next = { ...c.policies, pay: 'performance' as const };
    const cut = [...previewChange(c, next).cuts.keys()][0] ?? '';
    const before = c.employees.find((e) => e.id === cut)?.salaryMonthly ?? 0;
    const now = changePolicies(c, next, { method: 'rules' }).employees.find((e) => e.id === cut);
    const slow = changePolicies(c, next, { method: 'rules', transition: true }).employees.find((e) => e.id === cut);
    expect(now?.salaryMonthly).toBeLessThan(before);
    expect(slow?.salaryMonthly).toBe(before);
    expect(slow?.salaryTransition?.target).toBe(now?.salaryMonthly);
  });

  it('給与が下がる人の納得感は大きく下がり、激変緩和や合意で下がり方が小さくなる', () => {
    const c = grown(5, 'seniority');
    const next = { ...c.policies, bonus: 'none' as const };
    const avg = (s: CompanyState) => s.employees.reduce((t, e) => t + e.engagement, 0) / s.employees.length;
    const rules = avg(changePolicies(c, next, { method: 'rules' }));
    const rulesT = avg(changePolicies(c, next, { method: 'rules', transition: true }));
    const consent = avg(changePolicies(c, next, { method: 'consent' }));
    expect(rules).toBeLessThan(avg(c));
    expect(rulesT).toBeGreaterThan(rules);
    expect(consent).toBeGreaterThan(rules);
  });

  it('合意を取ると費用がかかり、紛争の種は残らない', () => {
    const c = grown();
    const after = changePolicies(c, { ...c.policies, bonus: 'none' }, { method: 'consent' });
    expect(after.cash).toBeLessThan(c.cash);
    expect(after.disputeSeeds).toHaveLength(0);
  });

  it('就業規則の変更で進めると紛争の種が残り、激変緩和を付けると合理性が高い', () => {
    const c = grown();
    const next = { ...c.policies, bonus: 'none' as const };
    const plain = changePolicies(c, next, { method: 'rules' });
    const soft = changePolicies(c, next, { method: 'rules', transition: true });
    expect(plain.disputeSeeds).toHaveLength(1);
    expect(plain.disputeSeeds[0]?.affectedIds.length).toBeGreaterThan(0);
    expect(soft.disputeSeeds[0]?.reasonableness).toBeGreaterThan(plain.disputeSeeds[0]?.reasonableness ?? 1);
  });

  it('元の状態は変わらない', () => {
    const c = grown();
    const snapshot = structuredClone(c);
    changePolicies(c, { ...c.policies, bonus: 'none' }, { method: 'rules' });
    expect(c).toEqual(snapshot);
  });
});
