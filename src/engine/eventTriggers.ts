/**
 * イベントの発生（§2.1 の9、§8）。ステップ8。
 *
 * 毎月の終わりに、次の順で起きるイベントを決める。
 *   1. 予約された続きのイベント（前の判断が条件。連鎖イベント）
 *   2. 条件を満たした月に起きるイベント（景気後退への対応など）
 *   3. 毎月の抽選（平均で半年に1回）。条件を満たしているイベントの中から、重みで1つ選ぶ
 *
 * 条件は構造化した JSON で書く（events.json の trigger）。会社の指標（companyMetrics）と、
 * 対象者の条件（社員の項目）を比べる。条件に合う対象者がいなければ、そのイベントは起きない。
 * 法令のイベントは laws.ts から起きる（ここでは抽選しない）。
 */
import { coefGroup } from './coefficients';
import { getIndustry } from './data';
import { eventDefs } from './eventData';
import { compare, matchesEmployee } from './eventConditions';
import { applyEffects, getEvent, pushDecision } from './events';
import { hasProgram } from './programs';
import type { Rng } from './rng';
import type {
  CompanyCondition,
  CompanyMetric,
  CompanyState,
  Employee,
  EngagementFactor,
  EventDef,
  IndustryData,
  PendingDecision,
  TargetSpec,
} from './types';
import { COMPANY_METRICS, ENGAGEMENT_FACTORS, MONTHS_PER_YEAR } from './types';

const K = coefGroup({
  monthlyP: 'event.monthly_probability',
  cooldown: 'event.cooldown_months',
  disputeWindow: 'law.unpaid_overtime.statute_months',
});

/** 景気後退が一度もないときの「始まってからの月数」 */
const NEVER = 1e9;
const YEN_PER_MAN = 10000;
/** 直近何か月の平均で見るか（overtime3・demandCoverage3） */
const RECENT_MONTHS = 3;

// ---------------------------------------------------------------------------
// 会社の指標
// ---------------------------------------------------------------------------

export type CompanyMetrics = Record<CompanyMetric, number>;

export function companyMetrics(state: CompanyState): CompanyMetrics {
  const h = state.history;
  const last = h[h.length - 1];
  const recent = h.slice(-RECENT_MONTHS);
  const year = h.slice(-MONTHS_PER_YEAR);
  const active = state.employees.filter((e) => !e.leave);
  const scored = state.employees.filter((e) => e.factorScores);
  const demand = recent.reduce((s, r) => s + r.demand, 0);
  const lastRecession = state.market.recessionMonths[state.market.recessionMonths.length - 1];
  let disputeRisk = 0;
  for (const d of state.disputeSeeds) {
    if (d.resolved || state.month - d.month >= K().disputeWindow) continue;
    disputeRisk = Math.max(disputeRisk, 1 - d.reasonableness);
  }
  return {
    headcount: state.employees.length,
    month: state.month,
    economy: state.market.economy,
    cash: state.cash,
    profit12: year.reduce((s, r) => s + r.operatingProfit, 0),
    avgEngagement: active.length > 0 ? active.reduce((s, e) => s + e.engagement, 0) / active.length : 0,
    overtime: last?.overtimeHours ?? 0,
    overtime3: recent.length > 0 ? recent.reduce((s, r) => s + r.overtimeHours, 0) / recent.length : 0,
    demandCoverage3: demand > 0 ? recent.reduce((s, r) => s + r.revenue, 0) / demand : 1,
    partCount: state.employees.filter((e) => e.employmentType === 'part').length,
    keyPersons: state.employees.filter((e) => e.isKeyPerson).length,
    onLeave: state.employees.length - active.length,
    avgEvaluationScore:
      scored.length > 0 ? scored.reduce((s, e) => s + (e.factorScores?.evaluation ?? 0), 0) / scored.length : 50,
    disputeRisk,
    recessionAge: lastRecession === undefined ? NEVER : state.month - lastRecession,
    runway: runwayMonths(state.cash, recent.reduce((s, r) => s + r.operatingProfit, 0) / Math.max(1, recent.length)),
  };
}

/** 月の利益がこのままなら、手元資金が何か月もつか（黒字なら大きな値） */
export function runwayMonths(cash: number, monthlyProfit: number): number {
  if (monthlyProfit >= 0) return NEVER;
  return Math.max(0, cash) / -monthlyProfit;
}

// ---------------------------------------------------------------------------
// 条件
// ---------------------------------------------------------------------------

export function checkCompanyCondition(
  c: CompanyCondition,
  metrics: CompanyMetrics,
  policies: CompanyState['policies'],
): boolean {
  if ('metric' in c) {
    if (!COMPANY_METRICS.includes(c.metric)) throw new Error(`会社の指標がありません: ${c.metric}`);
    return compare(metrics[c.metric], c.op, c.value);
  }
  return c.in.includes(policies[c.policy]);
}

/**
 * 対象者を選ぶ。条件に合う人がいなければ null。
 * 並べ方の指定がなければ無作為に選ぶ（そのときだけ乱数を1回引く）
 */
export function selectTarget(
  employees: readonly Employee[],
  spec: TargetSpec,
  industry: IndustryData,
  rng: Rng,
): Employee | null {
  const pool = employees.filter((e) => matchesEmployee(e, spec.where, industry));
  if (pool.length === 0) return null;
  if (!spec.sortBy) return rng.pick(pool);
  const key = spec.sortBy;
  const sign = spec.order === 'asc' ? 1 : -1;
  return [...pool].sort((a, b) => sign * (a[key] - b[key]))[0] ?? null;
}

/** イベントの条件（人数・会社の指標）を満たしているか。対象者は別に確かめる */
export function meetsConditions(event: EventDef, state: CompanyState, metrics: CompanyMetrics): boolean {
  const t = event.trigger;
  if (t.type === 'law') return false;
  if (t.minHeadcount !== undefined && metrics.headcount < t.minHeadcount) return false;
  return (t.conditions ?? []).every((c) => checkCompanyCondition(c, metrics, state.policies));
}

/** 業種ごとのイベントは、その業種の specialEvents にあるときだけ起きる */
export function availableInIndustry(event: EventDef, industry: IndustryData): boolean {
  if (event.excludeIndustries?.includes(industry.id)) return false;
  return event.category !== 'industry' || industry.specialEvents.includes(event.id);
}

/**
 * 同じイベントを最後に起こしてから、空ける月数がたったか（判断待ちのもの・個別制度で軽く済んだものも数える）。
 * 施策の「やめる」（cancel の選択肢）は数えない
 */
export function cooledDown(event: EventDef, state: CompanyState): boolean {
  if (state.pendingDecisions.some((d) => d.eventId === event.id)) return false;
  const months = event.cooldownMonths ?? K().cooldown;
  const recent = (m: number) => state.month - m < months;
  if (state.decisions.some((d) => d.eventId === event.id && recent(d.month) && !event.choices[d.choiceIndex]?.cancel)) return false;
  return !state.mitigations.some((m) => m.eventId === event.id && recent(m.month));
}

/** 対象者が条件に合う人がいるか（対象者の指定がなければ true） */
function hasTarget(event: EventDef, state: CompanyState, industry: IndustryData): boolean {
  const t = event.trigger;
  if (t.type === 'law' || !t.target) return true;
  const where = t.target.where;
  return state.employees.some((e) => matchesEmployee(e, where, industry));
}

/** いま毎月の抽選で起きうるイベント */
export function eligibleRandomEvents(state: CompanyState, metrics = companyMetrics(state)): EventDef[] {
  const industry = getIndustry(state.profile.industryId);
  return eventDefs.filter(
    (e) =>
      e.trigger.type === 'random' &&
      availableInIndustry(e, industry) &&
      cooledDown(e, state) &&
      meetsConditions(e, state, metrics) &&
      hasTarget(e, state, industry),
  );
}

// ---------------------------------------------------------------------------
// 起こす
// ---------------------------------------------------------------------------

/** 全社の納得感の要因の平均（休職中の人と、まだ点数のない人は除く） */
export function averageFactorScores(state: CompanyState): Record<EngagementFactor, number> | null {
  const scored = state.employees.filter((e) => !e.leave && e.factorScores);
  if (scored.length === 0) return null;
  const out = {} as Record<EngagementFactor, number>;
  for (const f of ENGAGEMENT_FACTORS) out[f] = scored.reduce((s, e) => s + (e.factorScores?.[f] ?? 0), 0) / scored.length;
  return out;
}

/**
 * 組織の様子の差し込み（サーベイの結果など）。weakFactor／strongFactor は要因のID（画面で名前にする）、
 * weakScore／strongScore はその平均点、engagement は納得感の平均
 */
export function organizationVars(state: CompanyState): Record<string, string | number> {
  const avg = averageFactorScores(state);
  const active = state.employees.filter((e) => !e.leave);
  const vars: Record<string, string | number> = {
    engagement: active.length > 0 ? Math.round(active.reduce((s, e) => s + e.engagement, 0) / active.length) : 0,
  };
  if (avg) {
    const sorted = [...ENGAGEMENT_FACTORS].sort((a, b) => avg[a] - avg[b]);
    const weak = sorted[0] as EngagementFactor;
    const strong = sorted[sorted.length - 1] as EngagementFactor;
    Object.assign(vars, {
      weakFactor: weak,
      weakScore: Math.round(avg[weak]),
      strongFactor: strong,
      strongScore: Math.round(avg[strong]),
    });
  }
  return vars;
}


/** 本文への差し込み */
export function eventVars(
  event: EventDef,
  state: CompanyState,
  target: Employee | null,
): Record<string, string | number> {
  const annual = target ? Math.round((target.salaryMonthly * MONTHS_PER_YEAR) / YEN_PER_MAN) : 0;
  const revenue = Math.round((state.history[state.history.length - 1]?.revenue ?? 0) / YEN_PER_MAN);
  const vars: Record<string, string | number> = { headcount: state.employees.length };
  if (target) {
    const industry = getIndustry(state.profile.industryId);
    Object.assign(vars, {
      role: industry.roles.find((r) => r.id === target.role)?.name ?? target.role,
      name: target.name,
      age: target.age,
      tenure: Math.floor(target.tenureMonths / MONTHS_PER_YEAR),
      annual,
    });
  }
  // 本文で組織の様子（サーベイの結果など）を使うイベントだけ、全社の要因の平均を差し込む
  if (/\{(engagement|weakFactor|weakScore|strongFactor|strongScore)\}/.test(event.body)) Object.assign(vars, organizationVars(state));
  const base = { annual, headcount: state.employees.length, revenue };
  for (const [k, spec] of Object.entries(event.extraVars ?? {})) vars[k] = Math.round(base[spec.of] * spec.mult);
  return vars;
}

/**
 * イベントを起こす：選ぶ前の効果を反映し、判断待ちを積む（自動の方針があればその場で選ぶ）。
 * 対応する個別制度が整っていれば、判断待ちにせず軽く済ませる（§14.1）
 */
export function fireEvent(state: CompanyState, event: EventDef, target: Employee | null, rng: Rng): void {
  const d: Omit<PendingDecision, 'id' | 'month'> = {
    kind: 'event',
    eventId: event.id,
    ruleIds: [],
    vars: eventVars(event, state, target),
    targetId: target?.id ?? null,
  };
  const m = event.mitigatedBy;
  if (m && hasProgram(state, m.program)) {
    applyEffects(state, m.effects, { ...d, id: '', month: state.month });
    state.mitigations.push({ month: state.month, eventId: event.id, programId: m.program, targetId: d.targetId ?? null, vars: d.vars });
    return;
  }
  if (event.onTrigger) applyEffects(state, event.onTrigger, { ...d, id: '', month: state.month });
  pushDecision(state, d, rng);
}

/** 対象者を決めてから起こす。対象者がいなければ起こさない */
function tryFire(state: CompanyState, event: EventDef, industry: IndustryData, rng: Rng, fixedTargetId?: string | null): boolean {
  const t = event.trigger;
  if (t.type === 'law') return false;
  let target: Employee | null = null;
  if (fixedTargetId) {
    target = state.employees.find((e) => e.id === fixedTargetId) ?? null;
    if (!target || (t.target && !matchesEmployee(target, t.target.where, industry))) return false;
  } else if (t.target) {
    target = selectTarget(state.employees, t.target, industry, rng);
    if (!target) return false;
  }
  fireEvent(state, event, target, rng);
  return true;
}

/**
 * その月のイベントを起こす（月の終わりに呼ぶ。状態を書き換える）。起きたイベントのIDを返す。
 * 乱数：予約1件につき1回、条件のイベント1つにつき1回、毎月の抽選で1回（起きるなら選ぶのにもう1回）。
 * 対象者を無作為に選ぶとき・自動で選択肢を選ぶときにも引く
 */
export function runEvents(state: CompanyState, rng: Rng): string[] {
  const industry = getIndustry(state.profile.industryId);
  const fired: string[] = [];

  // 1. 予約された続きのイベント
  const due = state.scheduledEvents.filter((s) => s.dueMonth <= state.month);
  state.scheduledEvents = state.scheduledEvents.filter((s) => s.dueMonth > state.month);
  for (const s of due) {
    const roll = rng.next();
    const event = getEvent(s.eventId);
    if (roll >= s.probability || !meetsConditions(event, state, companyMetrics(state))) continue;
    if (tryFire(state, event, industry, rng, s.targetId)) fired.push(event.id);
  }

  // 2. 条件を満たした月に起きるイベント
  for (const event of eventDefs) {
    if (event.trigger.type !== 'condition') continue;
    const roll = rng.next();
    if (roll >= (event.trigger.probability ?? 1)) continue;
    if (!availableInIndustry(event, industry) || !cooledDown(event, state)) continue;
    if (!meetsConditions(event, state, companyMetrics(state))) continue;
    if (tryFire(state, event, industry, rng)) fired.push(event.id);
  }

  // 3. 毎月の抽選
  if (rng.next() < K().monthlyP) {
    const pool = eligibleRandomEvents(state);
    if (pool.length > 0) {
      const event = rng.weightedPick(pool, pool.map((e) => e.weight));
      if (tryFire(state, event, industry, rng)) fired.push(event.id);
    }
  }
  return fired;
}
