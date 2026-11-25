/**
 * ティック処理（§2.1）。1ティック＝1か月。
 *
 * 入っているのは 1 市場と景気、2 採用、3 稼働と成果、4 売上・コスト・利益、5 納得感、6 退職、
 * 7 評価と昇給（年1回の決算月。賞与もここで決める）、8 法令（義務の発生は月のはじめ、違反の発覚は月の終わり）、10 記録。
 * 9 イベント（毎月の抽選・条件・連鎖。法令のイベントは 8 から起きる）。休職の終わり（復帰か退職か）は月のはじめに決める。
 *
 * 判断待ち（節目・イベント）は state.pendingDecisions に積まれる。autoPlay があればその場で選ぶ。
 * autoPlay がなければ、判断待ちが残っている間はティックを進めない（画面で選んでから次に進む）。
 */
import { companyFitEffects, fitsFor } from './fits';
import { coef } from './coefficients';
import { getIndustry, getLocation } from './data';
import { retireEmployees, runAttrition } from './attrition';
import { updateEngagement } from './engagement';
import { computeFinance } from './finance';
import { runHiring } from './hiring';
import { demandAt, stepEconomy, updateShareFactor } from './market';
import {
  computeOvertime,
  computePerformance,
  isBusyMonth,
  managerOvertimeHours,
  nominalOutputPerRevenueStaff,
  overtimeCap,
  overtimeCeiling,
} from './performance';
import { growAbility, runAnnualReview, stepSalaryTransitions } from './evaluation';
import { hiringAttractionModifier, modifierValue, pruneModifiers, pushDecision } from './events';
import { generateVoices } from './voices';
import { runEvents } from './eventTriggers';
import { processLeaves } from './leave';
import { programMonthlyCost } from './programs';
import { companyOrgEffects, transitionLoss } from './organization';
import { orgSnapshot } from './dashboard';
import { checkObligations, checkViolations, legalMonthlyCost } from './laws';
import { currentResistance } from './policyChange';
import { createRng, deriveSeed, getStreamsState, restoreStreams } from './rng';
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
  if (state.month >= (state.maxMonths ?? coef('end.max_months'))) return 'timeout';

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
  pruneModifiers(state);
  // イベントと休職の乱数は、月ごとにシードから決める。同じ会社で制度だけ変えて比べるとき、
  // ある月の抽選が変わっても、ほかの月のイベントの抽選がずれないようにするため（共通の乱数）
  const eventsRng = createRng(deriveSeed(state.seed, `events:${state.month}`));

  // 休職の期間が終わった人は、復帰するか退職するか
  const leaves = processLeaves(state, eventsRng);

  // 1. 市場と景気
  const economy = stepEconomy(state.market.economy, streams.market);
  state.market.economy = economy.economy;
  if (economy.recession) state.market.recessionMonths.push(state.month);
  // イベントによる一時的な需要の増減（大型案件・取引先の倒産など）
  const demandMult = modifierValue(state, 'demand');
  const demand = demandAt(state.market, state.profile, industry, state.month) * demandMult;

  // 組織の形の効き目（管理職の数・判断の速さ・調整の手間・改編の混乱。§14.4）
  if (state.organization.transition && state.month >= state.organization.transition.until) state.organization.transition = null;
  const orgNow = companyOrgEffects(state);
  // 制度と会社の相性（§14.8）：月のはじめの会社の状態で1回求める
  const fits = fitsFor(state);
  const orgPerf = () => {
    const e = companyOrgEffects(state);
    return { spanMult: e.spanMult, capacityMult: 1 - e.coordinationLoss - transitionLoss(state.organization, state.month) };
  };

  // 2. 採用
  const before = computePerformance(state.employees, industry, variant, state.policies, orgPerf(), fits);
  // 積み上がる売上の業種（SaaS）は、需要いっぱいではなく「今の売上＋先行投資の分」までの体制を目指して採る
  const rr = industry.recurringRevenue;
  // 小さい会社でも1人は先に採れるよう、売上を生む職種1人ぶんの売上を足す
  const oneHire = rr
    ? Math.max(...industry.roles.filter((r) => r.kind === 'revenue').map((r) => nominalOutputPerRevenueStaff(industry, variant, r.id)))
    : 0;
  const headroom = rr ? rr.hiringHeadroom.value + modifierValue(state, 'hiringHeadroom') : 0;
  const hiringCeiling = rr ? (state.market.recurringRevenue ?? 0) * (1 + headroom) + oneHire : Infinity;
  const hiring = runHiring({
    rng: streams.hiring,
    employees: state.employees,
    industry,
    variant,
    location,
    partTimeRatio: state.profile.partTimeRatio,
    demand: Math.min(demand, hiringCeiling),
    capacity: before.capacity,
    cash: state.cash,
    intensity: state.hiring.intensity * modifierValue(state, 'hiringIntensity') * orgNow.speed,
    spanMult: orgNow.spanMult,
    nextEmployeeId: state.nextEmployeeId,
    policies: state.policies,
    month: state.month,
    reputation: hiringAttractionModifier(state),
    hiringDifficultyMult: companyFitEffects(fits, state.employees).hiringDifficultyMult,
    projectedDemand: Math.min(
      demandAt(state.market, state.profile, industry, state.month + coef('policy.hiring.new_grad.projection_months')) *
        demandMult,
      hiringCeiling,
    ),
  });
  state.employees.push(...hiring.hires);
  state.nextEmployeeId += hiring.hires.length;

  // 3. 社員ごとの稼働と成果（足りないぶんは、売上を生むフルタイム社員の残業で埋める）
  const perf = computePerformance(state.employees, industry, variant, state.policies, orgPerf(), fits);
  // 残業の上限：ふだんは方針の上限の半分、繁忙（需要の急増・人手の急減）の月だけ方針の上限まで（§14.5）
  const busy = isBusyMonth(state.history.slice(-coef('overtime.lookback_months')), demand, perf.capacity);
  const fiscalYear = Math.floor(state.month / MONTHS_PER_YEAR);
  const cap = overtimeCeiling({
    cap: overtimeCap(state.policies.overtime),
    busy,
    over45MonthsThisYear: state.legal.overtimeOver45Months.filter((m) => Math.floor(m / MONTHS_PER_YEAR) === fiscalYear).length,
  });
  // 積み上がる売上の業種（SaaS）は、採用と同じく「今の売上＋先行投資の分」までを残業で埋める
  const overtime = computeOvertime(Math.min(demand, hiringCeiling), perf, cap);
  const revenueRoles = new Set(industry.roles.filter((r) => r.kind === 'revenue').map((r) => r.id));
  const managementRoles = new Set(industry.roles.filter((r) => r.kind === 'management').map((r) => r.id));
  // 店舗のある業種（飲食）：店長のいない店舗は、いまの店長が残業で見る（店長の負荷）
  const managerHours = industry.store ? managerOvertimeHours(perf, cap) : 0;
  for (const e of state.employees) {
    const working = e.employmentType !== 'part' && !e.leave;
    e.overtimeHours = !working ? 0 : revenueRoles.has(e.role) ? overtime.hours : managementRoles.has(e.role) ? managerHours : 0;
  }

  // 売上にできる上限（需要と、残業を含めた売れる上限の小さいほう）
  const servable = Math.min(demand, perf.capacity + overtime.extraCapacity);
  // 積み上がる売上の業種（SaaS）：売上は、出せる上限に向かって少しずつ近づく（契約が少しずつ増え、少しずつ減る）
  let revenue: number | undefined;
  if (industry.recurringRevenue) {
    const prev = state.market.recurringRevenue ?? 0;
    revenue = prev + industry.recurringRevenue.convergence.value * (servable - prev);
    state.market.recurringRevenue = revenue;
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
    programCost: programMonthlyCost(state, state.employees.length),
    revenue,
    fits,
  });
  state.cash += fin.operatingProfit;
  // 取りこぼした需要は、将来の取り分を減らす（積み上がる売上の業種でも、取りこぼしは「出せる上限」で見る）
  state.market.shareFactor = updateShareFactor(
    state.market.shareFactor,
    demand > 0 ? (demand - servable) / demand : 0,
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
    programCost: fin.programCost,
    busy,
    overtimeCeiling: cap,
    operatingProfit: fin.operatingProfit,
    extraordinaryCost: state.unrecordedExtraordinaryCost,
    funding: state.unrecordedFunding ?? 0,
    violations: 0,
    cash: state.cash,
    policies: state.policies,
    fits: fits.fits.map((f) => f.id),
  };
  state.history.push(record);
  state.unrecordedExtraordinaryCost = 0;
  state.unrecordedFunding = 0;

  // 5. 納得感
  updateEngagement(state.employees, {
    industry,
    location,
    policies: state.policies,
    history: state.history,
    cash: state.cash,
    headcount: state.employees.length,
    // 制度変更への抵抗と、イベントによる一時的な士気の上下（リストラの不安など）
    resistance: currentResistance(state) - modifierValue(state, 'morale'),
    violations: state.history[state.history.length - 2]?.violations ?? 0,
    programs: state.programs,
    orgBonus: companyOrgEffects(state).factorBonus,
    fits,
  });

  // 6. 退職（と出向者の帰任）
  const attrition = runAttrition(state.employees, {
    rng: streams.attrition,
    industry,
    location,
    month: state.month,
    policies: state.policies,
    fits,
  });
  state.employees = attrition.stay;
  state.departures.push(...attrition.departures);

  // 8b. 法令：違反の判定と発覚、未払い残業代、長時間労働（臨時の支出は record.extraordinaryCost に入る）
  record.violations = checkViolations(state, {
    rng: streams.laws,
    overtimeHours: overtime.hours,
    resigned: attrition.departures.filter((d) => d.kind === 'resignation'),
  });

  // 9. イベント（自動の方針があれば、ここで選んで効果まで反映される）
  runEvents(state, eventsRng);

  // 退職と帰任は、この月に去った人の記録から数える（休職明けの退職・イベントでの退職・画面で選んだ判断を含む）
  record.resignations = 0;
  record.returns = 0;
  record.retirements = 0;
  for (let i = state.departures.length - 1; i >= 0; i--) {
    const d = state.departures[i];
    if (!d || d.month !== state.month) break;
    if (d.kind === 'resignation') record.resignations++;
    else if (d.kind === 'return') record.returns++;
    else record.retirements++;
  }
  // 従業員の声（この月に去った人のあいさつ、休職からの復帰、ふだんの声）
  generateVoices(state, streams.voices, {
    departures: state.departures.filter((d) => d.month === state.month),
    returned: leaves.returned,
  });

  record.headcount = state.employees.length;
  record.org = orgSnapshot(state.employees);
  record.avgEngagement =
    state.employees.length > 0
      ? state.employees.reduce((s, e) => s + e.engagement, 0) / state.employees.length
      : 0;
  record.cash = state.cash;
  state.negativeCashMonths = state.cash < 0 ? state.negativeCashMonths + 1 : 0;

  // 激変緩和で下げている途中の給与を1か月ぶん下げ、実力を伸ばす
  stepSalaryTransitions(state.employees);
  growAbility(state.employees, state.policies, fits);

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
      fits: fitsFor(state),
    });
  }
  for (const e of state.employees) {
    e.tenureMonths += 1;
    if (birthday) e.age += 1;
  }
  // 定年：年度末に定年の年齢に達した人は退職する（次の月の記録に数える）
  if (birthday) {
    const r = retireEmployees(state.employees, state.month);
    state.employees = r.stay;
    state.departures.push(...r.retired);
  }

  state.rng = getStreamsState(streams);
  state.status = checkEnd(state);
  // 画面で遊ぶときは、決算月ごとに「制度を変えますか？」で止まる（§2.2）。自動で進めるときは止まらない
  if (birthday && state.status === 'running' && state.autoPlay === null) {
    pushDecision(state, { kind: 'review', ruleIds: [], eventId: null, vars: { year: state.month / MONTHS_PER_YEAR } });
  }
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
