/**
 * ティック処理（§2.1）。1ティック＝1か月。
 *
 * ステップ3で入っているのは 1 市場と景気、2 採用、3 稼働と成果、4 売上・コスト・利益、10 記録。
 * 5 納得感、6 退職（ステップ4）、7 昇給と評価（ステップ5）、8 法令（ステップ7）、9 イベント（ステップ8）は後で足す。
 */
import { coef } from './coefficients';
import { getIndustry, getLocation } from './data';
import { computeFinance } from './finance';
import { runHiring } from './hiring';
import { demandAt, stepEconomy } from './market';
import { computeOvertime, computePerformance } from './performance';
import { getStreamsState, restoreStreams } from './rng';
import { MONTHS_PER_YEAR, type CompanyState, type CompanyStatus, type MonthlyRecord } from './types';

function variantOf(state: CompanyState) {
  const industry = getIndustry(state.profile.industryId);
  const variant = industry.variants.find((v) => v.id === state.profile.variantId);
  if (!variant) throw new Error(`中の要素がありません: ${state.profile.variantId}`);
  return { industry, variant };
}

/** 終了条件（§2.3）を確かめる */
export function checkEnd(state: CompanyState): CompanyStatus {
  if (state.negativeCashMonths >= coef('end.bankruptcy_months')) return 'bankrupt';
  if (state.month >= coef('end.max_months')) return 'timeout';

  // 成熟：成熟ラインに届き、直近の数年とも社員数の伸びが小さい（年の区切りで判定）
  const industry = getIndustry(state.profile.industryId);
  const years = coef('end.maturity_years');
  const yearsElapsed = state.month / MONTHS_PER_YEAR;
  if (
    Number.isInteger(yearsElapsed) &&
    yearsElapsed >= years &&
    state.employees.length >= industry.maturityHeadcount.value
  ) {
    /** k年目の終わりの社員数（0年目は創業した月） */
    const headcountAtYearEnd = (k: number) =>
      state.history[k === 0 ? 0 : k * MONTHS_PER_YEAR - 1]?.headcount ?? 0;
    let slow = true;
    for (let k = yearsElapsed; k > yearsElapsed - years; k--) {
      const before = headcountAtYearEnd(k - 1);
      if (before <= 0 || headcountAtYearEnd(k) / before - 1 >= coef('end.maturity_growth_threshold')) {
        slow = false;
        break;
      }
    }
    if (slow) return 'matured';
  }
  return 'running';
}

/** 1か月進める（渡された状態を書き換える）。大量に回すとき用 */
export function tickInPlace(state: CompanyState): CompanyState {
  if (state.status !== 'running') return state;
  const streams = restoreStreams(state.rng);
  const { industry, variant } = variantOf(state);
  const location = getLocation(state.profile.locationId);

  // 1. 市場と景気
  state.market.economy = stepEconomy(state.market.economy, streams.market);
  const demand = demandAt(state.market, state.profile, industry, state.month);

  // 2. 採用
  const before = computePerformance(state.employees, industry, variant);
  const hiring = runHiring({
    rng: streams.hiring,
    employees: state.employees,
    industry,
    variant,
    location,
    partTimeRatio: state.profile.partTimeRatio,
    demand,
    capacity: before.capacity,
    cash: state.cash,
    intensity: state.hiring.intensity,
    nextEmployeeId: state.nextEmployeeId,
  });
  state.employees.push(...hiring.hires);
  state.nextEmployeeId += hiring.hires.length;

  // 3. 社員ごとの稼働と成果（足りないぶんは、売上を生むフルタイム社員の残業で埋める）
  const perf = computePerformance(state.employees, industry, variant);
  const overtime = computeOvertime(demand, perf);
  const revenueRoles = new Set(industry.roles.filter((r) => r.kind === 'revenue').map((r) => r.id));
  for (const e of state.employees) {
    e.overtimeHours = revenueRoles.has(e.role) && e.employmentType !== 'part' ? overtime.hours : 0;
  }

  // 4. 売上・コスト・利益
  const fin = computeFinance({
    employees: state.employees,
    policies: state.policies,
    demand,
    capacity: perf.capacity,
    overtimeCapacity: overtime.extraCapacity,
    grossMargin: state.profile.grossMargin,
    hiringCost: hiring.cost,
  });
  state.cash += fin.operatingProfit;
  state.negativeCashMonths = state.cash < 0 ? state.negativeCashMonths + 1 : 0;

  // 10. 記録
  const record: MonthlyRecord = {
    month: state.month,
    headcount: state.employees.length,
    hires: hiring.hires.length,
    economy: state.market.economy,
    demand,
    capacity: perf.capacity,
    overtimeHours: overtime.hours,
    revenue: fin.revenue,
    grossProfit: fin.grossProfit,
    labor: fin.labor,
    otherFixedCost: fin.otherFixedCost,
    operatingProfit: fin.operatingProfit,
    cash: state.cash,
  };
  state.history.push(record);

  // 月を進める（勤続と年齢）
  state.month += 1;
  const birthday = state.month % MONTHS_PER_YEAR === 0;
  for (const e of state.employees) {
    e.tenureMonths += 1;
    if (birthday) e.age += 1;
  }

  state.rng = getStreamsState(streams);
  state.status = checkEnd(state);
  return state;
}

/** 1か月進めた新しい状態を返す（元の状態は変えない）。画面用 */
export function tick(state: CompanyState): CompanyState {
  return tickInPlace(structuredClone(state));
}

/** 終了条件に届くまで（または指定の月数まで）回す。元の状態は変えない */
export function runToEnd(initial: CompanyState, maxMonths = Infinity): CompanyState {
  const state = structuredClone(initial);
  let n = 0;
  while (state.status === 'running' && n < maxMonths) {
    tickInPlace(state);
    n++;
  }
  return state;
}
