/**
 * 組織の形と組織改編（§14.4。ステップ17）。
 *
 * 形（社長直下・機能別・事業部制・フラット・マトリクス）で、次が変わる。数値はすべて係数台帳の org.*。
 * - 管理職の数：管理職1人が見る人数（業種の managementSpan）に掛ける倍率。管理職の採用と人件費が変わる
 * - 判断の速さ：採用の強さに掛ける倍率（需要の変化に体制を合わせる速さ）。社長直下は「壁」を超えると遅くなる
 * - 納得感の要因：評価の正確さ・成長の機会。社長直下とフラットは、人が増えると評価が行き届かなくなる
 * - 部署どうしの調整の手間：部署の数が増えるほど、売れる上限が少し下がる
 * 改編すると、進め方（丁寧に／一気に）に応じた期間、売れる上限と納得感が下がる。
 * 社員は部署に割り当てない。部署の数と組織図は、形と人数から決める（dashboard.ts の orgUnits）。
 */
import { coef, coefPath } from './coefficients';
import { getIndustry } from './data';
import { addExtraordinaryCost } from './cash';
import { fte } from './performance';
import type { CompanyState, Employee, EngagementFactor, IndustryData, OrgForm, OrganizationState, ReorgMethod, RoleKind } from './types';

/** 形の効き目（その月の会社の人数で決まる） */
export type OrgEffects = {
  /** 管理職1人が見る人数に掛ける倍率 */
  spanMult: number;
  /** 採用の強さに掛ける倍率（判断の速さ） */
  speed: number;
  /** 全員の納得感の要因への上乗せ（点。マイナスもある） */
  factorBonus: Partial<Record<EngagementFactor, number>>;
  /** 部署・事業部・チームの数 */
  units: number;
  /** 部署どうしの調整の手間で、売れる上限が下がる割合 */
  coordinationLoss: number;
};

/** 新しい会社の組織（社長直下から始まる） */
export function initialOrganization(): OrganizationState {
  return { form: 'direct', since: 0, transition: null, log: [] };
}

/** 自動で進めるとき（simulate・同期創業の他社）の形：人数で決める */
export function autoForm(headcount: number): OrgForm {
  if (headcount >= coef('org.auto.divisional_at')) return 'divisional';
  if (headcount >= coef('org.auto.functional_at')) return 'functional';
  return 'direct';
}

/** 社員の内訳（形の効き目を計算するのに使う） */
export type OrgSize = { headcount: number; revenueFte: number; kinds: number };

export function orgSize(employees: readonly Employee[], industry: IndustryData): OrgSize {
  const kindOf = new Map(industry.roles.map((r) => [r.id, r.kind]));
  const kinds = new Set<RoleKind>();
  let revenueFte = 0;
  for (const e of employees) {
    const k = kindOf.get(e.role);
    if (k) kinds.add(k);
    if (k === 'revenue') revenueFte += fte(e);
  }
  return { headcount: employees.length, revenueFte, kinds: Math.max(1, kinds.size) };
}

/** 部署・事業部・チームの数 */
export function unitCount(form: OrgForm, size: OrgSize): number {
  switch (form) {
    case 'direct':
      return 1;
    case 'functional':
      return size.kinds;
    case 'divisional':
      return Math.max(1, Math.ceil(size.revenueFte / coef('org.unit_size.divisional')));
    case 'flat':
      return Math.max(1, Math.ceil(size.headcount / coef('org.unit_size.flat')));
    case 'matrix':
      return size.kinds + Math.max(1, Math.ceil(size.revenueFte / coef('org.unit_size.divisional')));
  }
}

/** 壁を超えた割合（0〜） */
const over = (n: number, wall: number) => Math.max(0, n - wall) / wall;

export function orgEffects(form: OrgForm, size: OrgSize): OrgEffects {
  const factorBonus: Partial<Record<EngagementFactor, number>> = {};
  for (const f of ['evaluation', 'growthOpportunity'] as const) {
    const id = `org.factor.${form}.${f}`;
    try {
      factorBonus[f] = coef(id);
    } catch {
      // その形に、その要因の上乗せはない
    }
  }
  let speed = coefPath('org', 'speed', form);
  if (form === 'direct') {
    const x = over(size.headcount, coef('org.direct.wall'));
    speed = Math.max(coef('org.direct.speed_min'), speed - coef('org.direct.speed_slope') * x);
    factorBonus.evaluation = -Math.min(coef('org.direct.evaluation_penalty_max'), coef('org.direct.evaluation_penalty') * x);
  }
  if (form === 'flat') {
    const x = over(size.headcount, coef('org.flat.limit'));
    factorBonus.evaluation = (factorBonus.evaluation ?? 0) - Math.min(coef('org.flat.evaluation_penalty_max'), coef('org.flat.evaluation_penalty') * x);
  }
  const units = unitCount(form, size);
  const coordinationLoss =
    form === 'direct' ? 0 : Math.min(coef('org.coordination.max'), coefPath('org', 'coordination', form) * Math.max(0, units - 1));
  return { spanMult: coefPath('org', 'span_mult', form), speed, factorBonus, units, coordinationLoss };
}

/** 会社のいまの形の効き目 */
export function companyOrgEffects(state: CompanyState, employees: readonly Employee[] = state.employees): OrgEffects {
  return orgEffects(state.organization.form, orgSize(employees, getIndustry(state.profile.industryId)));
}

/** いま改編の混乱で、売れる上限が下がっている割合 */
export function transitionLoss(org: OrganizationState, month: number): number {
  return org.transition && month < org.transition.until ? org.transition.productivityLoss : 0;
}

/** 改編の進め方ごとの、混乱の期間・下がり方・費用 */
export function reorgCost(method: ReorgMethod, headcount: number) {
  return {
    months: coefPath('org', 'reorg', method, 'months'),
    productivityLoss: coefPath('org', 'reorg', method, 'productivity_loss'),
    morale: coefPath('org', 'reorg', method, 'morale'),
    cash: coefPath('org', 'reorg', method, 'cost_per_employee') * headcount,
  };
}

/** 組織の形を変える（状態を書き換える）。同じ形なら何もしない。変えたら true */
export function reorganize(state: CompanyState, form: OrgForm, method: ReorgMethod): boolean {
  const org = state.organization;
  if (org.form === form) return false;
  const c = reorgCost(method, state.employees.length);
  if (c.cash > 0) addExtraordinaryCost(state, c.cash);
  state.modifiers.push({ type: 'morale', mult: -c.morale, untilMonth: state.month + c.months });
  org.log.push({ month: state.month, from: org.form, to: form, method });
  org.form = form;
  org.since = state.month;
  org.transition = { until: state.month + c.months, productivityLoss: c.productivityLoss };
  return true;
}

/** 管理職1人あたり、何人を見ているか（形の目安に対する割合。1を超えると管理職が足りない） */
export function spanLoad(state: CompanyState): number {
  const industry = getIndustry(state.profile.industryId);
  const kindOf = new Map(industry.roles.map((r) => [r.id, r.kind]));
  const managers = state.employees.filter((e) => !e.leave && kindOf.get(e.role) === 'management').reduce((s, e) => s + fte(e), 0);
  const span = industry.managementSpan.value * companyOrgEffects(state).spanMult;
  return state.employees.length / ((1 + managers) * span);
}
