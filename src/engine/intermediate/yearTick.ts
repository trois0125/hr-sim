/**
 * 中級の1年ごとの進行（DESIGN.md §15.3、§15.4）。ステップ20。
 *
 * 1年の中は月ごとに、初級と同じ関数（景気・需要・稼働・残業・採用・損益）を「層の代表者×人数」に使う。
 * 年末に、層ごとに納得感・退職・出向者の帰任・加齢・定年を計算する。
 *
 * ステップ20で単純化していること（ステップ21以降で足す）：
 * - 昇格・昇給・評価・賞与の決め直しはしない（給与は年代が上がると相場の年齢カーブに沿って動くだけ）
 * - 法令の義務・イベント・施策・個別制度・組織の形は使わない
 * - 社内公平性は層の代表者どうしで比べる（人数の重みは付けない）
 */
import { coef } from '../coefficients';
import { getIndustry, getLocation } from '../data';
import { updateEngagement, type EngagementContext } from '../engagement';
import { computeFinance } from '../finance';
import { generateCompany, type GenerateOptions } from '../generate';
import { runHiring } from '../hiring';
import { demandAt, stepEconomy, updateShareFactor } from '../market';
import { computeOvertime, computePerformance, overtimeCap } from '../performance';
import { resignationProbability } from '../attrition';
import { getStreamsState, restoreStreams } from '../rng';
import type { CompanyState, Employee, MonthlyRecord } from '../types';
import { MONTHS_PER_YEAR } from '../types';
import {
  ageLayers,
  binomial,
  expand,
  mergeInto,
  pruneEmpty,
  secondmentReturnRate,
  toLayers,
  totalHeadcount,
} from './layers';
import { annualHr, bonusMonthly, defaultDetailedPolicies, levelsOf, toBasePolicies } from './detailedPolicy';
import { computePremise, findMismatches, fitEffects, nextChainStage, totalMismatch } from './fit';
import { applySalaryTransitions } from './regroup';
import type { IntermediateState, YearRecord } from './types';

function variantOf(state: Pick<IntermediateState, 'profile'>) {
  const industry = getIndustry(state.profile.industryId);
  const variant = industry.variants.find((v) => v.id === state.profile.variantId);
  if (!variant) throw new Error(`中の要素がありません: ${state.profile.variantId}`);
  return variant;
}

/** 初級の会社（生成した直後）を中級の状態に変える */
export function fromCompany(c: CompanyState): IntermediateState {
  const detail = defaultDetailedPolicies();
  const industry = getIndustry(c.profile.industryId);
  // 等級は細かい制度の段階に収め、賞与は細かい制度で決め直す（会社業績は標準とみなす）
  const employees = c.employees.map((e) => {
    const x = { ...e, grade: Math.min(e.grade, levelsOf(detail) - 1) };
    x.bonusMonthly = bonusMonthly(x, detail, industry, 1);
    return x;
  });
  return {
    difficulty: 'intermediate',
    seed: c.seed,
    year: 0,
    maxYears: Math.round(c.maxMonths / MONTHS_PER_YEAR),
    status: 'running',
    profile: c.profile,
    policies: toBasePolicies(detail, c.policies),
    detail,
    chainStage: 0,
    cash: c.cash,
    negativeCashMonths: 0,
    market: structuredClone(c.market),
    hiring: { ...c.hiring },
    layers: toLayers(employees),
    nextEmployeeId: c.nextEmployeeId,
    history: [],
    rng: c.rng,
  };
}

/** 中級（自由）：初級と同じく会社を生成して、創業から始める（§15.2） */
export function startIntermediate(options: GenerateOptions): IntermediateState {
  return fromCompany(generateCompany(options));
}

/** 人数で重み付けした納得感の平均 */
export function meanEngagement(state: Pick<IntermediateState, 'layers'>): number {
  const n = totalHeadcount(state.layers);
  return n > 0 ? state.layers.reduce((s, l) => s + l.rep.engagement * l.headcount, 0) / n : 0;
}

/** 1年進める（渡された状態を書き換える） */
export function yearTickInPlace(state: IntermediateState): IntermediateState {
  if (state.status !== 'running') return state;
  const streams = restoreStreams(state.rng);
  const industry = getIndustry(state.profile.industryId);
  const variant = variantOf(state);
  const location = getLocation(state.profile.locationId);
  const startHeadcount = totalHeadcount(state.layers);

  // 前提（会社の状態から）と、合わない組み合わせ。連鎖は、ずれが基準以上なら1段進み、下回れば1段戻る
  const premise = computePremise({
    layers: state.layers,
    history: state.history,
    detail: state.detail,
    economy: state.market.economy,
  });
  const mismatches = findMismatches(premise, state.detail);
  state.chainStage = nextChainStage(state.chainStage, totalMismatch(mismatches));
  const effects = fitEffects(mismatches, state.chainStage);
  applySalaryTransitions(state.layers);

  // 納得感の「雇用の安定」「成長の機会」は直近の月の記録を見るので、その年の月の記録を簡単な形で持つ
  const monthly: Pick<MonthlyRecord, 'month' | 'headcount' | 'operatingProfit'>[] = [];
  const hires: Employee[] = [];
  let revenue = 0;
  let laborCost = 0;
  let operatingProfit = 0;
  let overtimeSum = 0;

  for (let m = 0; m < MONTHS_PER_YEAR; m++) {
    const month = state.year * MONTHS_PER_YEAR + m;
    // 年の途中で入った人は年末まで一人ひとりで持つので、勤続を毎月のばす（立ち上がりが進むように）
    for (const h of hires) h.tenureMonths += 1;
    const economy = stepEconomy(state.market.economy, streams.market);
    state.market.economy = economy.economy;
    if (economy.recession) state.market.recessionMonths.push(month);
    const demand = demandAt(state.market, state.profile, industry, month);

    const employees = [...expand(state.layers), ...hires];
    const perf = computePerformance(employees, industry, variant, state.policies, { spanMult: 1, capacityMult: effects.capacityMult });
    const ot = computeOvertime(demand, perf, overtimeCap(state.policies.overtime));
    for (const e of employees) e.overtimeHours = ot.hours;
    overtimeSum += ot.hours;

    const hiring = runHiring({
      rng: streams.hiring,
      employees,
      industry,
      variant,
      location,
      partTimeRatio: state.profile.partTimeRatio,
      demand,
      capacity: perf.capacity,
      cash: state.cash,
      intensity: state.hiring.intensity,
      nextEmployeeId: state.nextEmployeeId,
      policies: state.policies,
      month,
    });
    state.nextEmployeeId += hiring.hires.length;

    const fin = computeFinance({
      employees,
      policies: state.policies,
      demand,
      capacity: perf.capacity,
      overtimeCapacity: ot.extraCapacity,
      grossMargin: state.profile.grossMargin,
      hiringCost: hiring.cost,
    });
    hires.push(...hiring.hires);
    state.cash += fin.operatingProfit;
    state.negativeCashMonths = state.cash < 0 ? state.negativeCashMonths + 1 : 0;
    const servable = perf.capacity + ot.extraCapacity;
    state.market.shareFactor = updateShareFactor(
      state.market.shareFactor,
      demand > 0 ? Math.max(0, demand - servable) / demand : 0,
    );
    revenue += fin.revenue;
    laborCost += fin.labor.total;
    operatingProfit += fin.operatingProfit;
    monthly.push({ month, headcount: employees.length + hiring.hires.length, operatingProfit: fin.operatingProfit });
  }

  // 年の途中で入った人を層に合流させる
  mergeInto(state.layers, hires);

  // 年末の人事：評価 → 昇格 → 昇給 → 賞与（§15.5）
  const hr = annualHr({
    layers: state.layers,
    detail: state.detail,
    policies: state.policies,
    industry,
    profitMargin: revenue > 0 ? operatingProfit / revenue : 0,
    rng: streams.evaluation,
  });
  state.layers = hr.layers;

  // 納得感：層の代表者ごとに、月の更新を12回くり返す（毎月少しずつ目標に近づくのと同じ）
  const reps = state.layers.map((l) => l.rep);
  const ctx: EngagementContext = {
    industry,
    location,
    policies: state.policies,
    // 納得感の計算が見るのは社員数と営業利益だけなので、簡単な形の記録を渡す
    history: monthly as unknown as MonthlyRecord[],
    cash: state.cash,
    headcount: totalHeadcount(state.layers),
    orgBonus: effects.orgBonus,
  };
  for (let m = 0; m < MONTHS_PER_YEAR; m++) updateEngagement(reps, ctx);

  // 退職と出向者の帰任（層ごとに、年の確率で人数を抽選する）
  let leavers = 0;
  let secondmentReturns = 0;
  const returnRate = secondmentReturnRate();
  for (const l of state.layers) {
    if (l.rep.affiliation === 'secondee') {
      const n = binomial(l.headcount, returnRate, streams.attrition);
      l.headcount -= n;
      secondmentReturns += n;
      continue;
    }
    const p = resignationProbability(l.rep, { industry, location, policies: state.policies });
    // 連鎖2段目：優秀層（実力が基準以上）の退職が増える
    const highMult = l.rep.ability >= coef('intermediate.chain.stage2_high_ability') ? effects.highAbilityAttritionMult : 1;
    const annual = 1 - Math.pow(1 - Math.min(1, p.unrelated + p.related * highMult), MONTHS_PER_YEAR);
    const n = binomial(l.headcount, annual, streams.attrition);
    l.headcount -= n;
    leavers += n;
  }
  state.layers = pruneEmpty(state.layers);

  // 加齢と定年
  const aged = ageLayers(state.layers, industry, streams.attrition);
  state.layers = aged.layers;

  const headcount = totalHeadcount(state.layers);
  const record: YearRecord = {
    year: state.year,
    headcount,
    layerCount: state.layers.length,
    revenue,
    laborCost,
    laborCostRatio: revenue > 0 ? laborCost / revenue : 0,
    operatingProfit,
    hires: hires.length,
    promotions: hr.promotions,
    leavers,
    retirees: aged.retirees,
    secondmentReturns,
    turnoverRate: startHeadcount > 0 ? leavers / startHeadcount : 0,
    engagement: meanEngagement(state),
    overtimeHours: overtimeSum / MONTHS_PER_YEAR,
    cash: state.cash,
    premise,
    mismatches,
    chainStage: state.chainStage,
  };
  state.history.push(record);
  state.year += 1;
  state.rng = getStreamsState(streams);
  state.status = checkEndYear(state);
  return state;
}

/** 終了条件（中級は年の区切りで判定する）：倒産・年数の経過・成熟（初級の checkEnd と同じ基準） */
export function checkEndYear(state: IntermediateState): IntermediateState['status'] {
  if (state.negativeCashMonths >= coef('end.bankruptcy_months')) return 'bankrupt';
  if (state.year >= state.maxYears) return 'timeout';
  const years = coef('end.maturity_years');
  const industry = getIndustry(state.profile.industryId);
  const h = state.history;
  const last = h[h.length - 1];
  if (h.length > years && last && last.headcount >= industry.maturityHeadcount.value) {
    let slow = true;
    for (let k = h.length - 1; k > h.length - 1 - years; k--) {
      const before = h[k - 1]?.headcount ?? 0;
      if (before <= 0 || (h[k]?.headcount ?? 0) / before - 1 >= coef('end.maturity_growth_threshold')) {
        slow = false;
        break;
      }
    }
    if (slow) return 'matured';
  }
  return 'running';
}

/** 元の状態を変えずに1年進める */
export function yearTick(state: IntermediateState): IntermediateState {
  return yearTickInPlace(structuredClone(state));
}

/** 終わりまで回す */
export function runIntermediateToEnd(initial: IntermediateState): IntermediateState {
  const state = structuredClone(initial);
  while (state.status === 'running') yearTickInPlace(state);
  return state;
}
