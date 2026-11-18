/**
 * ティック処理（§2.1）。1ティック＝1か月。
 *
 * 入っているのは 1 市場と景気、2 採用、3 稼働と成果、4 売上・コスト・利益、5 納得感、6 退職、
 * 7 評価と昇給（年1回の決算月。賞与もここで決める）、8 法令（義務の発生は月のはじめ、違反の発覚は月の終わり）、10 記録。
 * 9 イベントの抽選はステップ8で足す（法令のイベントは 8 から起きる）。
 *
 * 判断待ち（節目・イベント）は state.pendingDecisions に積まれる。autoPlay があればその場で選ぶ。
 * autoPlay がなければ、判断待ちが残っている間はティックを進めない（画面で選んでから次に進む）。
 */
import { coef } from './coefficients';
import { getIndustry, getLocation } from './data';
import { runAttrition } from './attrition';
import { updateEngagement } from './engagement';
import { computeFinance } from './finance';
import { runHiring } from './hiring';
import { demandAt, stepEconomy, updateShareFactor } from './market';
import { computeOvertime, computePerformance, overtimeCap } from './performance';
import { growAbility, runAnnualReview, stepSalaryTransitions } from './evaluation';
import { hiringAttractionModifier } from './events';
import { checkObligations, checkViolations, legalMonthlyCost } from './laws';
import { currentResistance } from './policyChange';
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
/** 判断待ちで止まっているか（自動の方針がなく、判断待ちが残っている） */
export function isWaitingForDecision(state: CompanyState): boolean {
  return state.autoPlay === null && state.pendingDecisions.length > 0;
}

export function tickInPlace(state: CompanyState): CompanyState {
  if (state.status !== 'running' || isWaitingForDecision(state)) return state;
  const streams = restoreStreams(state.rng);

  // 8a. 法令の義務の発生（月のはじめ。初級では残業させる前に36協定の節目が来る）
  checkObligations(state, streams.laws);
  if (isWaitingForDecision(state)) {
    // 節目で止まる：この月の処理は、判断が済んでからやり直す
    state.rng = getStreamsState(streams);
    return state;
  }
  const { industry, variant } = variantOf(state);
  const location = getLocation(state.profile.locationId);

  // 1. 市場と景気
  const economy = stepEconomy(state.market.economy, streams.market);
  state.market.economy = economy.economy;
  if (economy.recession) state.market.recessionMonths.push(state.month);
  const demand = demandAt(state.market, state.profile, industry, state.month);

  // 2. 採用
  const before = computePerformance(state.employees, industry, variant, state.policies);
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
    policies: state.policies,
    month: state.month,
    reputation: hiringAttractionModifier(state),
    projectedDemand: demandAt(
      state.market,
      state.profile,
      industry,
      state.month + coef('policy.hiring.new_grad.projection_months'),
    ),
  });
  state.employees.push(...hiring.hires);
  state.nextEmployeeId += hiring.hires.length;

  // 3. 社員ごとの稼働と成果（足りないぶんは、売上を生むフルタイム社員の残業で埋める）
  const perf = computePerformance(state.employees, industry, variant, state.policies);
  const overtime = computeOvertime(demand, perf, overtimeCap(state.policies.overtime));
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
    legalCost: legalMonthlyCost(state),
  });
  state.cash += fin.operatingProfit;
  // 取りこぼした需要は、将来の取り分を減らす
  state.market.shareFactor = updateShareFactor(
    state.market.shareFactor,
    demand > 0 ? (demand - fin.revenue) / demand : 0,
  );

  // 10. 記録（納得感の計算で今月の業績を使うので、先につくっておく）
  const record: MonthlyRecord = {
    month: state.month,
    headcount: state.employees.length,
    hires: hiring.hires.length,
    resignations: 0,
    returns: 0,
    avgEngagement: 0,
    economy: state.market.economy,
    demand,
    capacity: perf.capacity,
    overtimeHours: overtime.hours,
    revenue: fin.revenue,
    grossProfit: fin.grossProfit,
    labor: fin.labor,
    otherFixedCost: fin.otherFixedCost,
    hrSystemCost: fin.hrSystemCost,
    legalCost: fin.legalCost,
    operatingProfit: fin.operatingProfit,
    extraordinaryCost: state.unrecordedExtraordinaryCost,
    violations: 0,
    cash: state.cash,
  };
  state.history.push(record);
  state.unrecordedExtraordinaryCost = 0;

  // 5. 納得感
  updateEngagement(state.employees, {
    industry,
    location,
    policies: state.policies,
    history: state.history,
    cash: state.cash,
    headcount: state.employees.length,
    resistance: currentResistance(state),
    violations: state.history[state.history.length - 2]?.violations ?? 0,
  });

  // 6. 退職（と出向者の帰任）
  const attrition = runAttrition(state.employees, {
    rng: streams.attrition,
    industry,
    location,
    month: state.month,
    policies: state.policies,
  });
  state.employees = attrition.stay;
  state.departures.push(...attrition.departures);
  record.resignations = attrition.departures.filter((d) => d.kind === 'resignation').length;
  record.returns = attrition.departures.filter((d) => d.kind === 'return').length;
  record.headcount = state.employees.length;

  // 8b. 法令：違反の判定と発覚、未払い残業代、長時間労働（臨時の支出は record.extraordinaryCost に入る）
  record.violations = checkViolations(state, {
    rng: streams.laws,
    overtimeHours: overtime.hours,
    resigned: attrition.departures.filter((d) => d.kind === 'resignation'),
  });
  record.headcount = state.employees.length;
  record.avgEngagement =
    state.employees.length > 0
      ? state.employees.reduce((s, e) => s + e.engagement, 0) / state.employees.length
      : 0;
  record.cash = state.cash;
  state.negativeCashMonths = state.cash < 0 ? state.negativeCashMonths + 1 : 0;

  // 激変緩和で下げている途中の給与を1か月ぶん下げ、実力を伸ばす
  stepSalaryTransitions(state.employees);
  growAbility(state.employees, state.policies);

  // 月を進める（勤続と年齢）。1年ごと（決算月）に 7. 評価・等級・昇給・賞与を行い、全員が1歳年をとる
  state.month += 1;
  const birthday = state.month % MONTHS_PER_YEAR === 0;
  if (birthday) {
    runAnnualReview(state.employees, {
      rng: streams.evaluation,
      policies: state.policies,
      industry,
      location,
      lastYearProfit: state.history.slice(-MONTHS_PER_YEAR).reduce((s, r) => s + r.operatingProfit, 0),
    });
  }
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
  while (state.status === 'running' && n < maxMonths && !isWaitingForDecision(state)) {
    tickInPlace(state);
    n++;
  }
  return state;
}
