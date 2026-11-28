/**
 * 中級の制度の細かい設計（DESIGN.md §15.5）。ステップ21。
 *
 * - 報酬の核4制度（等級・評価・給与・賞与）を、細かい選択肢と数値で持つ（src/data/intermediate/detailFields.json）
 * - 初級の制度（PolicySet）に読み替えて、初級の効果（評価のずれ、運用コスト、納得感への上乗せなど）を活かす
 * - 年末の人事：評価 → 昇格（年次で上がる範囲と選抜）→ 昇給 → 賞与（固定・個人・会社業績）を層ごとに計算する
 */
import fields from '../../data/intermediate/detailFields.json';
import { coef } from '../coefficients';
import { annualAbilityGain, evaluationNoise } from '../policies';
import { abilityFactor } from '../performance';
import { SCORE_MAX, SCORE_MIN, clamp } from '../employees';
import type { Rng } from '../rng';
import type { BonusPolicy, Employee, EvaluationSystem, GradeSystem, IndustryData, PayPolicy, PolicySet } from '../types';
import { MONTHS_PER_YEAR } from '../types';
import { binomial, mergeInto, pruneEmpty } from './layers';
import type { IntermediateLayer } from './types';

export type DetailedPolicies = {
  grade: { system: GradeSystem; levels: number; seniorityCap: number; dutySpread: number };
  evaluation: { system: EvaluationSystem; separateGrowthTalk: boolean; topShare: number };
  pay: { basis: PayPolicy; raiseRate: number; meritSpread: number };
  bonus: { baseMonths: number; variableShare: number; companyWeight: number; progressive: boolean };
};

type Field = { id: string; default: unknown; min?: number; max?: number };
const ALL_FIELDS: Field[] = [...(fields.choices as Field[]), ...(fields.numbers as Field[])];

function fieldDefault<T>(id: string): T {
  const f = ALL_FIELDS.find((x) => x.id === id);
  if (!f) throw new Error(`中級の制度の項目がありません: ${id}`);
  return f.default as T;
}

/** 数値の項目の上限 */
export function fieldMax(id: string): number {
  const f = fields.numbers.find((x) => x.id === id);
  if (!f) throw new Error(`中級の制度の項目がありません: ${id}`);
  return f.max;
}

/** 標準の細かい制度（detailFields.json の default） */
export function defaultDetailedPolicies(): DetailedPolicies {
  const d = <T>(id: string) => fieldDefault<T>(id);
  return {
    grade: { system: d('grade.system'), levels: d('grade.levels'), seniorityCap: d('grade.seniorityCap'), dutySpread: d('grade.dutySpread') },
    evaluation: { system: d('evaluation.system'), separateGrowthTalk: d('evaluation.separateGrowthTalk'), topShare: d('evaluation.topShare') },
    pay: { basis: d('pay.basis'), raiseRate: d('pay.raiseRate'), meritSpread: d('pay.meritSpread') },
    bonus: { baseMonths: d('bonus.baseMonths'), variableShare: d('bonus.variableShare'), companyWeight: d('bonus.companyWeight'), progressive: d('bonus.progressive') },
  };
}

/** 数値が範囲の中にあるか確かめる（範囲の外ならエラー） */
export function validateDetailed(p: DetailedPolicies): void {
  for (const f of fields.numbers) {
    const [cat, key] = f.id.split('.') as [keyof DetailedPolicies, string];
    const v = (p[cat] as Record<string, unknown>)[key] as number;
    if (typeof v !== 'number' || v < f.min - 1e-9 || v > f.max + 1e-9) throw new Error(`範囲の外です: ${f.id}=${v}`);
  }
  if (p.grade.seniorityCap > p.grade.levels - 1) throw new Error('年次で上がれる上限が、等級の段階を超えています');
}

/** 等級の段階の数（等級なしなら1） */
export function levelsOf(p: DetailedPolicies): number {
  return p.grade.system === 'none' ? 1 : p.grade.levels;
}

/** 初級の制度に読み替える（報酬の核4つ以外は base のまま） */
export function toBasePolicies(p: DetailedPolicies, base: PolicySet): PolicySet {
  let bonus: BonusPolicy;
  if (p.bonus.variableShare <= 0) bonus = p.bonus.baseMonths > 0 ? 'fixed_months' : 'none';
  else bonus = p.bonus.companyWeight >= 0.5 ? 'company_linked' : 'individual_linked';
  return { ...base, grade: p.grade.system, evaluation: p.evaluation.system, pay: p.pay.basis, bonus };
}

/** 年末の人事の結果 */
export type AnnualHrResult = { layers: IntermediateLayer[]; promotions: number };

/**
 * 年末の人事（layers を書き換える）。
 * 1. 評価：見えた成果 = 実力 + 評価のずれ（初級と同じ大きさ）。実力は年に1回伸びる
 * 2. 昇格：年次で上がる範囲は一律の確率、上の範囲は選抜（実力が高いほど上がる）
 * 3. 昇給：相場の年齢カーブに上乗せする昇給率 + 評価による差
 * 4. 賞与：固定（相場の月数×比）+ 変動（個人の成績と会社業績。上位の等級ほど大きくもできる）
 */
export function annualHr(input: {
  layers: IntermediateLayer[];
  detail: DetailedPolicies;
  policies: PolicySet;
  industry: IndustryData;
  /** その年の営業利益率 */
  profitMargin: number;
  rng: Rng;
}): AnnualHrResult {
  const { detail, policies, industry, rng } = input;
  const headcount = input.layers.reduce((s, l) => s + l.headcount, 0);
  const noise = evaluationNoise(policies, headcount, industry);
  const levels = levelsOf(detail);
  for (const l of input.layers) {
    const r = l.rep;
    r.ability = clamp(r.ability + annualAbilityGain(r, policies), SCORE_MIN, SCORE_MAX);
    r.perceivedPerformance = clamp(r.ability + rng.normal(0, noise), SCORE_MIN, SCORE_MAX);
    if (r.grade > levels - 1) r.grade = levels - 1;
  }

  // 昇格（上がった人は1段上の層へ）
  let promotions = 0;
  const promoted: Employee[] = [];
  const step = coef('intermediate.grade.pay_step');
  for (const l of input.layers) {
    const r = l.rep;
    if (r.employmentType === 'part' || r.grade >= levels - 1) continue;
    const bySeniority = r.grade < detail.grade.seniorityCap;
    const p = bySeniority
      ? coef('intermediate.promotion.seniority_rate')
      : Math.min(1, coef('intermediate.promotion.selective_rate') * abilityFactor(r.perceivedPerformance));
    const n = binomial(l.headcount, p, rng);
    if (n === 0) continue;
    l.headcount -= n;
    promotions += n;
    // 年次で上がる昇格の給与の伸びは、相場の年齢カーブ（年代が上がるときの昇給）に含まれているとみなし、上乗せしない。
    // 選抜で上がったときだけ、1段ぶん上乗せする
    const salaryMonthly = bySeniority ? r.salaryMonthly : r.salaryMonthly * (1 + step);
    const person: Employee = { ...r, grade: r.grade + 1, salaryMonthly };
    for (let i = 0; i < n; i++) promoted.push(person);
  }
  const layers = pruneEmpty(input.layers);
  mergeInto(layers, promoted);

  // 昇給と賞与
  const profitFactor = clamp(
    input.profitMargin / coef('intermediate.bonus.expected_margin'),
    0,
    coef('intermediate.bonus.profit_factor_max'),
  );
  for (const l of layers) {
    const r = l.rep;
    const merit = detail.pay.meritSpread * ((r.perceivedPerformance - 50) / 50);
    r.salaryMonthly *= 1 + detail.pay.raiseRate + merit;
    r.bonusMonthly = bonusMonthly(r, detail, industry, profitFactor);
  }
  return { layers, promotions };
}

/** 賞与の月割り（円） */
export function bonusMonthly(
  r: Pick<Employee, 'salaryMonthly' | 'perceivedPerformance' | 'grade' | 'employmentType'>,
  detail: DetailedPolicies,
  industry: Pick<IndustryData, 'marketBonusMonths'>,
  profitFactor: number,
): number {
  if (r.employmentType === 'part') return 0;
  const fixed = (r.salaryMonthly * industry.marketBonusMonths.value * detail.bonus.baseMonths) / MONTHS_PER_YEAR;
  const share = detail.bonus.variableShare;
  if (share <= 0) return fixed;
  // 変動部分の標準額：年収（固定部分）に対して share / (1 - share)
  const progressive = detail.bonus.progressive ? 1 + coef('intermediate.bonus.progressive_slope') * r.grade : 1;
  const standard = (r.salaryMonthly + fixed) * (share / (1 - share)) * progressive;
  const personal = clamp(r.perceivedPerformance / 50, 0, 2);
  const w = detail.bonus.companyWeight;
  return fixed + standard * (w * profitFactor + (1 - w) * personal);
}
