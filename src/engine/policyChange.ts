/**
 * 制度を変えたときの反応（§5.1）。
 *
 * - 変えた直後の数か月は、納得感の目標値が一時的に下がる（変化への抵抗）。安定を重視する人ほど強く効く
 * - 給与が下がる変更（給与の決め方の変更、賞与の引き下げ）は、下がる人の納得感が大きく下がる
 *   - 激変緩和を付けると、給与を一定期間かけて少しずつ下げ、納得感の下がり方も小さくなる
 *   - 不利益変更は「合意を取る」か「就業規則の変更で進める」かを選ぶ。
 *     合意は手間（費用）がかかるが納得感の下がり方が小さい。
 *     就業規則の変更は、合理性が足りないと後で紛争になる「紛争の種」を残す（イベントはステップ8）
 */
import { coef } from './coefficients';
import { SCORE_MAX, SCORE_MIN, clamp, marketSalaryFor } from './employees';
import { evaluationPercentiles } from './evaluation';
import { getIndustry, getLocation } from './data';
import { bonusMonthlyFor, policyEffect, validatePolicies } from './policies';
import type {
  ChangeMethod,
  CompanyState,
  Employee,
  PolicyChangeRecord,
  PolicySet,
} from './types';
import { MONTHS_PER_YEAR } from './types';

const PERCENT = 100;
const MIDDLE = 0.5;

export type ChangeOptions = {
  /** 激変緩和を付けるか */
  transition?: boolean;
  /** 不利益変更の進め方。給与が下がる人がいるときは必須 */
  method?: ChangeMethod;
};

/** 変えたカテゴリの一覧 */
export function changedCategories(before: PolicySet, after: PolicySet): (keyof PolicySet)[] {
  return (Object.keys(after) as (keyof PolicySet)[]).filter((k) => before[k] !== after[k]);
}

/** 新しい給与の決め方での「あるべき月給」（いまより低ければ、その差が不利益になる） */
export function targetSalaryUnder(
  e: Employee,
  pay: PolicySet['pay'],
  grade: PolicySet['grade'],
  market: number,
  percentile: number,
): number {
  switch (pay) {
    case 'seniority':
      return market * (1 + coef('policy.pay.seniority.extra_raise') * (e.tenureMonths / MONTHS_PER_YEAR));
    case 'performance':
      return (
        market *
        (1 + coef('policy.pay.performance.spread') * policyEffect('grade', grade, 'raise_flex') * (percentile - MIDDLE))
      );
    case 'market':
      return market;
  }
}

export type ChangePreview = {
  categories: (keyof PolicySet)[];
  /** 社員IDごとの、年収（給与＋賞与）の下げ幅（%）。下がらない人は入らない */
  cuts: Map<string, { newSalary: number; newBonusMonthly: number; cutPct: number }>;
  /** 給与・賞与が下がる人がいるか（不利益変更か） */
  isDisadvantageous: boolean;
};

/** 変更した場合に誰の報酬がどれだけ下がるかを調べる（状態は変えない）。画面の「予想される影響」にも使う */
export function previewChange(state: CompanyState, next: PolicySet): ChangePreview {
  const categories = changedCategories(state.policies, next);
  const cuts: ChangePreview['cuts'] = new Map();
  if (!categories.includes('pay') && !categories.includes('bonus') && !categories.includes('grade')) {
    return { categories, cuts, isDisadvantageous: false };
  }
  const industry = getIndustry(state.profile.industryId);
  const location = getLocation(state.profile.locationId);
  const pct = evaluationPercentiles(state.employees);
  const lastYearProfit = state.history.slice(-MONTHS_PER_YEAR).reduce((s, r) => s + r.operatingProfit, 0);
  const eligible = state.employees.filter((e) => e.employmentType !== 'part' && e.affiliation === 'proper');
  const totalSalaries = eligible.reduce((s, e) => s + e.salaryMonthly, 0);

  for (const e of eligible) {
    const p = pct.get(e.id) ?? MIDDLE;
    let newSalary = e.salaryMonthly;
    if (categories.includes('pay') || categories.includes('grade')) {
      const market = marketSalaryFor(industry, location, e.role, e.age, e.employmentType);
      newSalary = Math.min(e.salaryMonthly, targetSalaryUnder(e, next.pay, next.grade, market, p));
    }
    const newBonusMonthly = categories.includes('bonus')
      ? bonusMonthlyFor({ ...e, salaryMonthly: newSalary }, { policies: next, percentile: p, lastYearProfit, totalSalaries })
      : (e.bonusMonthly * newSalary) / e.salaryMonthly;
    const before = e.salaryMonthly + e.bonusMonthly;
    const after = newSalary + newBonusMonthly;
    // 1円未満の差は丸めの誤差として無視する
    if (before - after >= 1) {
      cuts.set(e.id, { newSalary, newBonusMonthly, cutPct: ((before - after) / before) * PERCENT });
    }
  }
  return { categories, cuts, isDisadvantageous: cuts.size > 0 };
}

/** いまの時点で効いている「変化への抵抗」（点）。変更から時間がたつほど小さくなる */
export function currentResistance(state: Pick<CompanyState, 'policyChanges' | 'month'>): number {
  const months = coef('policy_change.resistance_months');
  let total = 0;
  for (const c of state.policyChanges) {
    const elapsed = state.month - c.month;
    if (elapsed < 0 || elapsed >= months) continue;
    total += c.resistance * (1 - elapsed / months);
  }
  return Math.min(total, coef('policy_change.resistance_max'));
}

/**
 * 制度を変える（新しい状態を返す。元の状態は変えない）。
 * 給与・賞与が下がる人がいるのに method を指定しないとエラーになる（画面で必ず選ばせるため）。
 */
export function changePolicies(state: CompanyState, next: PolicySet, options: ChangeOptions = {}): CompanyState {
  const industry = getIndustry(state.profile.industryId);
  validatePolicies(next, industry);
  const preview = previewChange(state, next);
  if (preview.categories.length === 0) return state;
  if (preview.isDisadvantageous && !options.method) {
    throw new Error('給与や賞与が下がる人がいます。合意を取るか、就業規則の変更で進めるかを選んでください');
  }

  const out = structuredClone(state);
  out.policies = { ...next };
  const transition = options.transition ?? false;
  const method = preview.isDisadvantageous ? (options.method ?? null) : null;

  // 給与・賞与の引き下げと、下がる人の納得感
  let penaltyMult = 1;
  if (method === 'consent') penaltyMult *= coef('policy_change.consent_penalty_mult');
  if (transition) penaltyMult *= coef('policy_change.transition_penalty_mult');
  const affectedIds: string[] = [];
  let cutSum = 0;
  for (const e of out.employees) {
    const cut = preview.cuts.get(e.id);
    if (cut) {
      affectedIds.push(e.id);
      cutSum += cut.cutPct;
      if (transition && cut.newSalary < e.salaryMonthly) {
        e.salaryTransition = {
          target: cut.newSalary,
          stepPerMonth: (e.salaryMonthly - cut.newSalary) / coef('policy_change.transition_months'),
        };
      } else {
        e.salaryMonthly = cut.newSalary;
      }
      e.bonusMonthly = cut.newBonusMonthly;
      e.engagement = clamp(
        e.engagement - cut.cutPct * coef('policy_change.cut_penalty_per_pct') * penaltyMult,
        SCORE_MIN,
        SCORE_MAX,
      );
    } else if (preview.categories.includes('bonus')) {
      // 下がらない人も、新しい賞与の制度で賞与を決め直す
      const pct = evaluationPercentiles(out.employees).get(e.id) ?? MIDDLE;
      const eligible = out.employees.filter((x) => x.employmentType !== 'part');
      e.bonusMonthly = bonusMonthlyFor(e, {
        policies: next,
        percentile: pct,
        lastYearProfit: out.history.slice(-MONTHS_PER_YEAR).reduce((s, r) => s + r.operatingProfit, 0),
        totalSalaries: eligible.reduce((s, x) => s + x.salaryMonthly, 0),
      });
    }
  }
  const averageCutPct = affectedIds.length > 0 ? cutSum / affectedIds.length : 0;

  // 合意を取る手間
  if (method === 'consent') {
    out.cash -= coef('policy_change.consent_cost_per_employee') * out.employees.length;
  }

  // 就業規則の変更で進めたら、紛争の種を残す
  if (method === 'rules') {
    const reasonableness = clamp(
      coef('policy_change.reasonableness.base') +
        (transition ? coef('policy_change.reasonableness.transition') : 0) -
        coef('policy_change.reasonableness.cut_per_pct') * averageCutPct,
      0,
      1,
    );
    out.disputeSeeds.push({ month: out.month, affectedIds, reasonableness, averageCutPct });
  }

  const record: PolicyChangeRecord = {
    month: out.month,
    categories: preview.categories,
    resistance: Math.min(
      coef('policy_change.resistance_max'),
      coef('policy_change.resistance_per_category') * preview.categories.length,
    ),
    method,
    transition,
    affected: affectedIds.length,
    averageCutPct,
  };
  out.policyChanges.push(record);
  return out;
}
