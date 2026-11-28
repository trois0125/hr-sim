/**
 * 追体験（DESIGN.md §15.7）。ステップ23。
 *
 * - 史実の会社（いまは三菱商事）を、実際に近い人数の層で始める（src/data/intermediate/cases/*.json）
 * - 年ごとに：需要（社員数の目安から逆算）、大きな景気の落ち込み、定年の年齢（時代ごと）、前提（直近の場面に書いたもの）を当てる
 * - 場面は史実の年に順に出る。プレイヤーの選択で流れは変わらない（会社の数字は変わる）
 * - 史実の影の計算：同じシードで、すべての場面で史実の方針を選んだ場合を計算する（振り返りで比べる。ステップ24）
 * データにない数字は仮置き（docs/DATA_TODO.md）。
 */
import mitsubishi from '../../data/intermediate/cases/mitsubishi.json';
import { getIndustry, getLocation } from '../data';
import { marketSalaryFor } from '../employees';
import { generateCompany } from '../generate';
import { nominalOutputPerRevenueStaff } from '../performance';
import type { Employee, PolicySet } from '../types';
import { MONTHS_PER_YEAR } from '../types';
import { bonusMonthly, levelsOf, type DetailedPolicies } from './detailedPolicy';
import type { Premise } from './fit';
import { mergeInto, totalHeadcount } from './layers';
import { applyStance, type Scene } from './scenes';
import type { IntermediateLayer, IntermediateState } from './types';
import { fromCompany, runIntermediateToEnd } from './yearTick';

type Patch = { [K in keyof DetailedPolicies]?: Partial<DetailedPolicies[K]> };

export type CaseScene = {
  id: string;
  year: number;
  /** 年が資料で確かめられているか（false なら画面に年を出さない） */
  yearConfirmed: boolean;
  source: string;
  title: string;
  body: string;
  premise: Premise;
  history: { stanceId: string; summary: string; patch?: Patch; base?: Partial<PolicySet> };
};

export type CaseData = {
  id: string;
  name: string;
  title: string;
  description: string;
  disclaimer: string;
  sourceDocument: string;
  startYear: number;
  endYear: number;
  industryId: 'trading';
  variantId: string;
  locationId: string;
  initialCash: { value: number };
  grossMargin: { value: number };
  initialAgeShares: { bands: Record<string, number> };
  headcountPath: { points: { year: number; headcount: number }[] };
  retirementAges: { eras: { fromYear: number; age: number }[] };
  economyShocks: { points: { year: number; economy: number }[] };
  scenes: CaseScene[];
};

export const CASES: Record<string, CaseData> = { mitsubishi: mitsubishi as unknown as CaseData };

export function getCase(id: string): CaseData {
  const c = CASES[id];
  if (!c) throw new Error(`追体験のデータがありません: ${id}`);
  return c;
}

/** 史実の暦年（state.year は始まりからの年数） */
export function calendarYear(state: Pick<IntermediateState, 'year' | 'caseId'>): number {
  return getCase(state.caseId ?? '').startYear + state.year;
}

/** 社員数の目安（年のあいだは直線で結ぶ） */
export function headcountTarget(data: CaseData, year: number): number {
  const pts = data.headcountPath.points;
  const first = pts[0]!;
  if (year <= first.year) return first.headcount;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    if (year <= b.year) return a.headcount + ((b.headcount - a.headcount) * (year - a.year)) / (b.year - a.year);
  }
  return pts[pts.length - 1]!.headcount;
}

export function retirementAgeAt(data: CaseData, year: number): number {
  let age = data.retirementAges.eras[0]!.age;
  for (const e of data.retirementAges.eras) if (year >= e.fromYear) age = e.age;
  return age;
}

/** その年の前提（直近の場面に書いたもの） */
export function casePremise(state: IntermediateState): Premise {
  const data = getCase(state.caseId ?? '');
  const year = calendarYear(state);
  let premise = data.scenes[0]!.premise;
  for (const s of data.scenes) if (s.year <= year) premise = s.premise;
  return premise;
}

/** 年の初めに、需要・景気の落ち込み・定年の年齢を当てる（状態を書き換える） */
export function applyCaseYear(state: IntermediateState): void {
  const data = getCase(state.caseId ?? '');
  const year = calendarYear(state);
  const industry = getIndustry(state.profile.industryId);
  const variant = industry.variants.find((v) => v.id === state.profile.variantId)!;
  // 需要：目安の人数のうち売上を生む職種の人が、標準の働きで売れる額
  const revenueRole = industry.roles.find((r) => r.kind === 'revenue')!;
  const share = state.profile.roleMix[revenueRole.id] ?? 0;
  const demand = headcountTarget(data, year) * share * nominalOutputPerRevenueStaff(industry, variant, revenueRole.id);
  state.market.initialDemandMonthly = demand;
  state.market.matureDemandMonthly = demand;
  state.market.stableDemandMonthly = demand * state.profile.stableDemandShare;
  const shock = data.economyShocks.points.find((p) => p.year === year);
  if (shock) state.market.economy = shock.economy;
}

export function caseRetirementAge(state: IntermediateState): number {
  return retirementAgeAt(getCase(state.caseId ?? ''), calendarYear(state));
}

/** その年の初めに出す場面（なければ null） */
export function caseSceneAt(state: IntermediateState): Scene | null {
  const data = getCase(state.caseId ?? '');
  const year = calendarYear(state);
  const s = data.scenes.find((x) => x.year === year);
  if (!s) return null;
  return {
    kind: 'case',
    caseSceneId: s.id,
    year: state.year,
    premiseOn: [],
    premiseOff: [],
    chainStage: state.chainStage,
    vars: { headcount: totalHeadcount(state.layers), growthRate: 0, agingShare: 0, economy: state.market.economy },
  };
}

export function getCaseScene(state: Pick<IntermediateState, 'caseId'>, sceneId: string): CaseScene {
  const s = getCase(state.caseId ?? '').scenes.find((x) => x.id === sceneId);
  if (!s) throw new Error(`場面がありません: ${sceneId}`);
  return s;
}

/** 史実の選択（方針を当てはめ、史実の中身で上書きする） */
export function historicalChoice(state: IntermediateState, scene: CaseScene): { stanceId: string; detail: DetailedPolicies; base: Partial<PolicySet> } {
  const detail = applyStance(state.detail, scene.history.stanceId);
  for (const cat of Object.keys(scene.history.patch ?? {}) as (keyof DetailedPolicies)[]) {
    Object.assign(detail[cat], scene.history.patch?.[cat]);
  }
  detail.grade.seniorityCap = Math.min(detail.grade.seniorityCap, Math.max(0, levelsOf(detail) - 1));
  return { stanceId: scene.history.stanceId, detail, base: scene.history.base ?? {} };
}

/** 追体験を始める（実際に近い人数の層をつくる） */
export function startCase(caseId: string, seed: number, options: { autoScenes?: boolean; historical?: boolean } = {}): IntermediateState {
  const data = getCase(caseId);
  const c = generateCompany({
    seed,
    industryId: data.industryId,
    foundingPatternId: 'carveout',
    locationId: data.locationId,
    lengthYears: data.endYear - data.startYear + 1,
  });
  const industry = getIndustry(data.industryId);
  const variant = industry.variants.find((v) => v.id === data.variantId);
  if (!variant) throw new Error(`中の要素がありません: ${data.variantId}`);
  const mid = (r: { min: number; max: number }) => (r.min + r.max) / 2;
  c.profile = {
    ...c.profile,
    name: data.name,
    variantId: data.variantId,
    grossMargin: data.grossMargin.value,
    cyclicality: mid(variant.cyclicalityRange.value),
  };
  c.cash = data.initialCash.value;

  const state = fromCompany({ ...c, employees: [] }, { autoScenes: options.autoScenes });
  state.caseId = caseId;
  state.historical = options.historical ?? false;
  state.maxYears = data.endYear - data.startYear + 1;

  // 層：職種の構成×年代の構成で、初めの人数に合わせる。属性は生成した社員を型にする
  const location = getLocation(data.locationId);
  const n0 = headcountTarget(data, data.startYear);
  const people: Employee[] = [];
  for (const [roleId, roleShare] of Object.entries(c.profile.roleMix)) {
    const template = c.employees.find((e) => e.role === roleId) ?? c.employees[0];
    if (!template) continue;
    for (const [band, bandShare] of Object.entries(data.initialAgeShares.bands)) {
      const age = Number(band) + 2;
      const n = Math.round(n0 * roleShare * bandShare);
      const person: Employee = {
        ...template,
        role: roleId,
        age,
        grade: 0,
        employmentType: 'full',
        affiliation: 'proper',
        hireChannel: 'mid_career',
        tenureMonths: Math.max(0, age - 22) * MONTHS_PER_YEAR,
        salaryMonthly: marketSalaryFor(industry, location, roleId, age, 'full'),
        salaryTransition: null,
        leave: null,
      };
      person.bonusMonthly = bonusMonthly(person, state.detail, industry, 1);
      for (let i = 0; i < n; i++) people.push(person);
    }
  }
  const layers: IntermediateLayer[] = [];
  mergeInto(layers, people);
  state.layers = layers;
  state.pendingScene = caseSceneAt(state);
  applyCaseYear(state);
  return state;
}

/** 史実の影の計算：同じシードで、すべての場面で史実の方針を選んだ場合 */
export function runHistoricalShadow(caseId: string, seed: number): IntermediateState {
  return runIntermediateToEnd(startCase(caseId, seed, { autoScenes: true, historical: true }));
}
