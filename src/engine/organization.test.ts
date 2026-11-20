import { describe, expect, it } from 'vitest';
import { coef } from './coefficients';
import { getIndustry } from './data';
import { getEvent, resolveEvent, resolveReorg } from './events';
import { fireEvent, meetsConditions, companyMetrics } from './eventTriggers';
import { generateCompany } from './generate';
import { autoForm, orgEffects, reorgCost, reorganize, transitionLoss, unitCount, type OrgSize } from './organization';
import { supportRequirement } from './performance';
import { createRng } from './rng';
import { normalizeCompany } from './save';
import { staff } from './testHelpers';
import { runToEnd, tick } from './tick';
import type { CompanyState } from './types';

const size = (headcount: number, revenueFte = headcount * 0.8, kinds = 3): OrgSize => ({ headcount, revenueFte, kinds });

function company(headcount: number): CompanyState {
  const c = generateCompany({ seed: 2, industryId: 'trading', foundingPatternId: 'solo', autoPlay: null });
  c.employees = staff('sales', headcount);
  c.month = 60;
  return c;
}

describe('組織の形の効き目（§14.4）', () => {
  it('管理職の数：マトリクス＞事業部制＞機能別＞フラットの順に、要る管理職が多い', () => {
    const trading = getIndustry('trading');
    const need = (form: Parameters<typeof orgEffects>[0]) => supportRequirement(trading, 80, 100, orgEffects(form, size(100)).spanMult).management;
    expect(need('matrix')).toBeGreaterThan(need('divisional'));
    expect(need('divisional')).toBeGreaterThan(need('functional'));
    expect(need('functional')).toBeGreaterThan(need('flat'));
  });

  it('判断の速さ：事業部制は機能別より速い。社長直下は壁を超えると遅くなり、下限で止まる', () => {
    expect(orgEffects('divisional', size(100)).speed).toBeGreaterThan(orgEffects('functional', size(100)).speed);
    const wall = coef('org.direct.wall');
    expect(orgEffects('direct', size(wall)).speed).toBe(coef('org.speed.direct'));
    expect(orgEffects('direct', size(wall * 2)).speed).toBeLessThan(orgEffects('direct', size(wall)).speed);
    expect(orgEffects('direct', size(wall * 100)).speed).toBe(coef('org.direct.speed_min'));
  });

  it('評価の正確さ：社長直下は壁を超えると下がり、フラットは目安を超えると下がる（上限あり）。機能別は上がる', () => {
    const wall = coef('org.direct.wall');
    expect(orgEffects('direct', size(wall)).factorBonus.evaluation).toBeCloseTo(0);
    expect(orgEffects('direct', size(wall * 2)).factorBonus.evaluation!).toBeLessThan(0);
    expect(orgEffects('direct', size(wall * 100)).factorBonus.evaluation).toBe(-coef('org.direct.evaluation_penalty_max'));
    const limit = coef('org.flat.limit');
    expect(orgEffects('flat', size(limit * 2)).factorBonus.evaluation!).toBeLessThan(orgEffects('flat', size(limit)).factorBonus.evaluation ?? 0);
    expect(orgEffects('functional', size(50)).factorBonus.evaluation).toBeGreaterThan(0);
    expect(orgEffects('divisional', size(50)).factorBonus.growthOpportunity).toBeGreaterThan(0);
  });

  it('部署どうしの調整の手間：部署が多いほど大きく、上限で止まる。社長直下はない', () => {
    expect(orgEffects('direct', size(500)).coordinationLoss).toBe(0);
    expect(unitCount('divisional', size(300, 240))).toBeGreaterThan(unitCount('divisional', size(60, 48)));
    expect(orgEffects('divisional', size(300, 240)).coordinationLoss).toBeGreaterThan(orgEffects('divisional', size(60, 48)).coordinationLoss);
    expect(orgEffects('matrix', size(5000, 4000)).coordinationLoss).toBe(coef('org.coordination.max'));
  });

  it('自動で進めるときの形：人数で決まる', () => {
    expect(autoForm(10)).toBe('direct');
    expect(autoForm(coef('org.auto.functional_at'))).toBe('functional');
    expect(autoForm(coef('org.auto.divisional_at'))).toBe('divisional');
  });
});

describe('組織改編（§14.4）', () => {
  it('丁寧に進めると費用がかかり、混乱は長いが浅い。一気に切り替えると費用はなく、混乱は短いが深い', () => {
    const careful = reorgCost('careful', 50);
    const abrupt = reorgCost('abrupt', 50);
    expect(careful.cash).toBeGreaterThan(abrupt.cash);
    expect(careful.months).toBeGreaterThan(abrupt.months);
    expect(careful.productivityLoss).toBeLessThan(abrupt.productivityLoss);
    expect(careful.morale).toBeLessThan(abrupt.morale);
  });

  it('改編すると形・記録・混乱の期間が変わり、費用を払う。同じ形なら何も起きない', () => {
    const c = company(40);
    const cash = c.cash;
    expect(reorganize(c, 'functional', 'careful')).toBe(true);
    expect(c.organization.form).toBe('functional');
    expect(c.organization.log).toEqual([{ month: c.month, from: 'direct', to: 'functional', method: 'careful' }]);
    expect(transitionLoss(c.organization, c.month)).toBe(coef('org.reorg.careful.productivity_loss'));
    expect(transitionLoss(c.organization, c.month + coef('org.reorg.careful.months'))).toBe(0);
    expect(cash - c.cash).toBe(coef('org.reorg.careful.cost_per_employee') * 40);
    expect(reorganize(c, 'functional', 'abrupt')).toBe(false);
  });

  it('改編の混乱の間は、同じ会社で改編しなかった場合より売上が下がる', () => {
    const base = runToEnd(generateCompany({ seed: 4, industryId: 'trading', foundingPatternId: 'cofounders', autoPlay: { legal: 'immediate' } }), 36);
    base.organization.form = 'functional';
    const a = structuredClone(base);
    const b = structuredClone(base);
    reorganize(b, 'divisional', 'abrupt');
    b.organization.form = 'functional'; // 形の違いを除き、混乱だけを比べる
    expect(tick(b).history.at(-1)!.capacity).toBeLessThan(tick(a).history.at(-1)!.capacity);
  });

  it('30人の壁：社長直下の会社だけに起き、「見直す」を選ぶと形を選ぶ判断待ちになる。今の形のままも選べる', () => {
    const c = company(30);
    const wall = getEvent('org_wall_30');
    expect(meetsConditions(wall, c, companyMetrics(c))).toBe(true);
    const f = company(30);
    f.organization.form = 'functional';
    expect(meetsConditions(wall, f, companyMetrics(f))).toBe(false);

    fireEvent(c, wall, null, createRng(1));
    resolveEvent(c, c.pendingDecisions[0]!.id, 0);
    const d = c.pendingDecisions[0]!;
    expect(d.kind).toBe('reorg');
    resolveReorg(c, d.id, null);
    expect(c.organization.form).toBe('direct');
    expect(c.pendingDecisions).toHaveLength(0);
  });

  it('自動で進めるときは、改編の判断を人数で決めた形で片づける', () => {
    const c = company(45);
    c.autoPlay = { legal: 'immediate' };
    fireEvent(c, getEvent('org_wall_30'), null, createRng(3));
    // 自動の方針は選択肢を傾向で選ぶ。見直しを選んだときは、人数で決めた形（機能別）になる
    if (c.decisions.at(-1)?.choiceIndex === 0) expect(c.organization.form).toBe('functional');
    expect(c.pendingDecisions).toHaveLength(0);
  });

  it('古いセーブ（組織の形がない）は、人数に合った形で読む', () => {
    const c = company(120) as Partial<CompanyState>;
    delete c.organization;
    const n = normalizeCompany(c as CompanyState);
    expect(n.organization.form).toBe(autoForm(120));
  });
});
