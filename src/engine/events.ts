/**
 * イベントと判断待ち（§8、§7.2）。
 *
 * - 節目（法令の義務の発生）とイベントは「判断待ち」として積まれる。画面はそこで時間を止めて選ばせる
 * - 自動で進める方針（autoPlay）があるときは、その場で選んで先に進む
 * - 選択肢の効果（effects）はデータ（events.json）に書き、ここで状態に反映する
 * - 法令のイベントは法令対応の方針（autoPlay.legal）で、それ以外は判断の傾向（autoPlay.style）で自動に選ぶ
 * - 選んだ選択肢は state.decisions に記録する（社史レポートと人事スタイル診断に使う）
 */
import { coef } from './coefficients';
import { toDeparture } from './attrition';
import { getIndustry } from './data';
import { getLaw } from './lawData';
import { eventDefs } from './eventData';
import { matchesEmployee } from './eventConditions';
import { SCORE_MAX, SCORE_MIN, clamp } from './employees';
import { startLeave } from './leave';
import { getStreamsState, restoreStreams, type Rng } from './rng';
import type {
  AttritionReason,
  CompanyState,
  Employee,
  EventDef,
  EventEffects,
  GroupEffect,
  JudgmentStyle,
  LegalResponse,
  PendingDecision,
  TargetEffect,
  TemporaryModifier,
} from './types';
import { JUDGMENT_AXES } from './types';

/** % を比に直すときの分母 */
const PERCENT = 100;

export function getEvent(id: string): EventDef {
  const e = eventDefs.find((x) => x.id === id);
  if (!e) throw new Error(`イベントがありません: ${id}`);
  return e;
}

/** 本文の {name} などを差し込む */
export function renderText(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`));
}

/**
 * 臨時の支出を払う。その月の記録がもうあればそこに載せ、まだなければ（月のはじめや、
 * 画面で判断した場合）ためておいて、次にできる記録に載せる
 */
export function addExtraordinaryCost(state: CompanyState, amount: number): void {
  state.cash -= amount;
  const last = state.history[state.history.length - 1];
  if (last && last.month === state.month) last.extraordinaryCost += amount;
  else state.unrecordedExtraordinaryCost += amount;
}

/**
 * 資金調達のお金を入れる（利益ではないので臨時の支出には入れず、記録の funding に載せる）。
 * その月の記録がもうあればそこに、まだなければ次にできる記録に載せる
 */
export function addFunding(state: CompanyState, amount: number): void {
  state.cash += amount;
  const last = state.history[state.history.length - 1];
  if (last && last.month === state.month) {
    last.funding = (last.funding ?? 0) + amount;
    last.cash = state.cash;
  } else state.unrecordedFunding = (state.unrecordedFunding ?? 0) + amount;
}

/**
 * 判断待ちを積む。自動の方針があれば、その場で選ぶ。
 * ティック処理の途中から呼ぶときは、そのティックの乱数（法令は laws 系列、イベントは events 系列）を rng に渡す
 */
export function pushDecision(
  state: CompanyState,
  d: Omit<PendingDecision, 'id' | 'month'>,
  rng?: Rng,
): void {
  const decision: PendingDecision = { ...d, id: `d${state.nextDecisionId++}`, month: state.month };
  state.pendingDecisions.push(decision);
  if (!state.autoPlay || decision.kind === 'review') return;
  if (decision.kind === 'milestone') {
    resolveMilestone(state, decision.id, state.autoPlay.legal, rng);
    return;
  }
  const event = getEvent(decision.eventId ?? '');
  let index: number;
  if (event.category === 'law') {
    index = autoChoiceIndex(event, state.autoPlay.legal);
  } else {
    // ティックの途中ならそのティックの乱数を、そうでなければ状態に保存された events 系列を使う
    const streams = rng ? null : restoreStreams(state.rng);
    index = styleChoiceIndex(event, state.autoPlay.style, rng ?? (streams as NonNullable<typeof streams>).events);
    if (streams) state.rng = getStreamsState(streams);
  }
  resolveEvent(state, decision.id, index, { auto: true });
}

/** 自動で進めるときに選ぶ選択肢（法令のイベント：方針に合うもの。なければ最初） */
export function autoChoiceIndex(event: EventDef, legal: LegalResponse): number {
  const i = event.choices.findIndex((c) => c.auto?.includes(legal));
  return i >= 0 ? i : 0;
}

/** 傾向がないとき（すべての軸が0） */
export const NEUTRAL_STYLE: JudgmentStyle = { reward: 0, horizon: 0, rules: 0, people: 0 };

/** 選択肢と判断の傾向の合い具合（軸の印 × 傾向 の合計） */
export function styleFit(axes: EventDef['choices'][number]['axes'], style: JudgmentStyle): number {
  let s = 0;
  for (const a of JUDGMENT_AXES) s += (axes?.[a] ?? 0) * style[a];
  return s;
}

/**
 * 判断の傾向で選択肢を選ぶ（法令以外のイベント）。合い具合にばらつきを足して、いちばん高いものを選ぶ。
 * 乱数は選択肢1つにつき1回引く
 */
export function styleChoiceIndex(event: EventDef, style: JudgmentStyle | undefined, rng: Rng): number {
  const noise = coef('event.auto.choice_noise');
  let best = 0;
  let bestScore = -Infinity;
  event.choices.forEach((c, i) => {
    const score = styleFit(c.axes, style ?? NEUTRAL_STYLE) + noise * rng.next();
    if (score > bestScore) {
      best = i;
      bestScore = score;
    }
  });
  return best;
}

function takeDecision(state: CompanyState, decisionId: string): PendingDecision {
  const i = state.pendingDecisions.findIndex((d) => d.id === decisionId);
  if (i < 0) throw new Error(`判断待ちがありません: ${decisionId}`);
  const [d] = state.pendingDecisions.splice(i, 1);
  return d as PendingDecision;
}

/**
 * 節目（法令の義務）への対応を決める（状態を書き換える）。
 * すぐ対応：費用がかかり、まれに不備が残る（気づかないまま違反になる）。
 * 社労士に依頼：費用は高いが確実。後回し：費用はかからないが、違反の状態になる。
 */
export function resolveMilestone(
  state: CompanyState,
  decisionId: string,
  response: LegalResponse,
  rng?: Rng,
): void {
  const d = takeDecision(state, decisionId);
  // 画面から呼ばれたときは状態に保存された乱数を使い、ティックの途中ならそのティックの乱数を使う
  const streams = rng ? null : restoreStreams(state.rng);
  const lawsRng = rng ?? (streams as NonNullable<typeof streams>).laws;
  for (const ruleId of d.ruleIds) {
    const rule = getLaw(ruleId);
    const c = state.legal.compliance.find((x) => x.ruleId === ruleId);
    if (!c) continue;
    c.response = response;
    // 乱数は義務1つにつき1回だけ引く（選択によって乱数列がずれないように）
    const errorRoll = lawsRng.next();
    if (response === 'postpone') {
      c.status = 'noncompliant';
    } else {
      addExtraordinaryCost(state, rule.cost[response].value);
      const error = response === 'immediate' && errorRoll < rule.selfErrorRate.value;
      c.status = error ? 'noncompliant' : 'compliant';
    }
    state.legal.log.push({
      month: state.month,
      ruleId,
      kind: 'response',
      text: `${rule.name}：${{ immediate: 'すぐ対応した', postpone: '後回しにした', outsource: '社労士に依頼した' }[response]}`,
    });
  }
  if (streams) state.rng = getStreamsState(streams);
}

/** 毎年の制度の見直しを終える（制度を変えるときは、先に policyChange.ts の changePolicies を呼ぶ） */
export function resolveReview(state: CompanyState, decisionId: string): void {
  const d = takeDecision(state, decisionId);
  if (d.kind !== 'review') throw new Error(`制度の見直しではありません: ${decisionId}`);
}

/** 節目の問いかけへの答えを記録する（空なら記録しない） */
export function addReflection(state: CompanyState, text: string): void {
  const t = text.trim();
  if (t) state.reflections.push({ month: state.month, text: t });
}

/** イベントの選択肢を選ぶ（状態を書き換える） */
export function resolveEvent(
  state: CompanyState,
  decisionId: string,
  choiceIndex: number,
  options: { auto?: boolean } = {},
): void {
  const d = takeDecision(state, decisionId);
  const event = getEvent(d.eventId ?? '');
  const choice = event.choices[choiceIndex];
  if (!choice) throw new Error(`選択肢がありません: ${event.id} ${choiceIndex}`);
  state.decisions.push({
    month: state.month,
    eventId: event.id,
    choiceIndex,
    targetId: d.targetId ?? null,
    axes: choice.axes ?? {},
    diagnosis: choice.diagnosis ?? {},
    auto: options.auto ?? false,
  });
  applyEffects(state, choice.effects, d);
  if (event.category === 'law') {
    state.legal.log.push({
      month: state.month,
      ruleId: d.ruleIds[0] ?? null,
      kind: 'corrected',
      text: `${event.title}：${choice.label}${choice.lesson ? `（${choice.lesson}）` : ''}`,
    });
  }
}

/** 社員を退職させる（去った人の記録も残す） */
function resignEmployee(state: CompanyState, e: Employee, reason: AttritionReason): void {
  state.employees = state.employees.filter((x) => x.id !== e.id);
  state.departures.push(toDeparture(e, state.month, 'resignation', reason));
}

function roundSalary(x: number): number {
  const unit = coef('generation.salary.rounding_unit');
  return Math.round(x / unit) * unit;
}

function addModifier(state: CompanyState, type: TemporaryModifier['type'], mult: number, months: number): void {
  state.modifiers.push({ type, mult, untilMonth: state.month + months });
}

function applyTargetEffect(state: CompanyState, e: Employee, t: TargetEffect): void {
  if (t.engagement) e.engagement = clamp(e.engagement + t.engagement, SCORE_MIN, SCORE_MAX);
  if (t.salaryPct) e.salaryMonthly = roundSalary(e.salaryMonthly * (1 + t.salaryPct / PERCENT));
  if (t.ability) e.ability = clamp(e.ability + t.ability, SCORE_MIN, SCORE_MAX);
  if (t.roleKind) {
    const role = getIndustry(state.profile.industryId).roles.find((r) => r.kind === t.roleKind);
    if (role) e.role = role.id;
  }
  if (t.isKeyPerson !== undefined) e.isKeyPerson = t.isKeyPerson;
  if (t.leave) {
    startLeave(e, t.leave.kind, state.month, {
      monthsMult: t.leave.monthsMult,
      returnRateBonus: t.leave.returnRateBonus,
    });
  }
  if (t.returnRateDelta && e.leave) e.leave.returnRate = clamp(e.leave.returnRate + t.returnRateDelta, 0, 1);
  if (t.resign) resignEmployee(state, e, t.resign);
}

/** 集団への効果の対象（条件に合う人を並べて、人数を絞る） */
export function groupMembers(state: CompanyState, g: GroupEffect, targetId: string | null): Employee[] {
  const industry = getIndustry(state.profile.industryId);
  let members = state.employees.filter(
    (e) => !(g.excludeTarget && e.id === targetId) && matchesEmployee(e, g.where, industry),
  );
  if (g.sortBy) {
    const key = g.sortBy;
    const sign = g.order === 'asc' ? 1 : -1;
    members = [...members].sort((a, b) => sign * (a[key] - b[key]));
  }
  let limit = g.limit ?? Infinity;
  if (g.limitShare !== undefined) limit = Math.min(limit, Math.max(1, Math.round(g.limitShare * state.employees.length)));
  return members.slice(0, limit);
}

function applyGroupEffect(state: CompanyState, g: GroupEffect, targetId: string | null): void {
  for (const e of groupMembers(state, g, targetId)) {
    if (g.engagement) e.engagement = clamp(e.engagement + g.engagement, SCORE_MIN, SCORE_MAX);
    if (g.salaryPct) e.salaryMonthly = roundSalary(e.salaryMonthly * (1 + g.salaryPct / PERCENT));
    if (g.bonusPct) e.bonusMonthly *= 1 + g.bonusPct / PERCENT;
    if (g.ability) e.ability = clamp(e.ability + g.ability, SCORE_MIN, SCORE_MAX);
    if (g.resign) {
      if (g.severanceMonths) addExtraordinaryCost(state, e.salaryMonthly * g.severanceMonths);
      resignEmployee(state, e, g.resign);
    }
  }
}

/** 選択肢の効果を状態に反映する */
export function applyEffects(state: CompanyState, effects: EventEffects, d: PendingDecision): void {
  const targetId = d.targetId ?? null;
  if (effects.cash) addExtraordinaryCost(state, -effects.cash);
  if (effects.cashPerEmployee) addExtraordinaryCost(state, -effects.cashPerEmployee * state.employees.length);
  if (effects.fundingPayrollMonths) {
    const payroll = state.employees.reduce((s, e) => s + e.salaryMonthly, 0);
    addFunding(state, payroll * effects.fundingPayrollMonths);
  }
  if (effects.cashRevenueMonths) {
    const revenue = state.history[state.history.length - 1]?.revenue ?? 0;
    addExtraordinaryCost(state, -revenue * effects.cashRevenueMonths);
  }
  if (effects.engagementAll || effects.engagementOthers) {
    for (const e of state.employees) {
      const delta = (effects.engagementAll ?? 0) + (e.id === targetId ? 0 : effects.engagementOthers ?? 0);
      e.engagement = clamp(e.engagement + delta, SCORE_MIN, SCORE_MAX);
    }
  }
  if (effects.morale) addModifier(state, 'morale', effects.morale.delta, effects.morale.months);
  if (effects.hiringAttraction) addModifier(state, 'hiringAttraction', effects.hiringAttraction.mult, effects.hiringAttraction.months);
  if (effects.hiringIntensity) addModifier(state, 'hiringIntensity', effects.hiringIntensity.mult, effects.hiringIntensity.months);
  if (effects.demand) addModifier(state, 'demand', effects.demand.mult, effects.demand.months);
  if (effects.hiringHeadroom) addModifier(state, 'hiringHeadroom', effects.hiringHeadroom.delta, effects.hiringHeadroom.months);
  if (effects.matureDemandMult) state.market.matureDemandMonthly *= effects.matureDemandMult;
  // 集団への効果を先に（対象者が退職する場合でも、集団の選び方が変わらないように）
  for (const g of effects.groups ?? []) applyGroupEffect(state, g, targetId);
  if (effects.target) {
    const target = state.employees.find((e) => e.id === targetId);
    if (target) applyTargetEffect(state, target, effects.target);
  }
  if (effects.resolveDisputes) for (const s of state.disputeSeeds) s.resolved = true;
  if (effects.followUp) {
    state.scheduledEvents.push({
      eventId: effects.followUp.eventId,
      dueMonth: state.month + effects.followUp.afterMonths,
      probability: effects.followUp.probability,
      targetId: effects.followUp.sameTarget ? targetId : null,
    });
  }
  if (effects.correct) {
    const ids = effects.correct === 'detected' ? d.ruleIds : effects.correct;
    for (const ruleId of ids) {
      const c = state.legal.compliance.find((x) => x.ruleId === ruleId);
      if (!c) continue;
      const rule = getLaw(ruleId);
      addExtraordinaryCost(state, rule.cost.immediate.value * (effects.correctionCostMult ?? 1));
      // 社会保険の未加入は、違反だった期間（最大2年）の保険料をさかのぼって納める
      if (rule.backPaySocialInsurance && c.status === 'noncompliant') {
        const months = Math.min(c.violationMonths, coef('law.social_insurance.back_pay_months'));
        const payroll = state.employees.reduce((s, e) => s + e.salaryMonthly, 0);
        addExtraordinaryCost(state, payroll * coef('labor.legal_welfare_rate') * months);
      }
      c.status = 'compliant';
      c.detected = false;
      // 特別条項の年6か月を超えていたら、残業の上限を限度時間（月45時間）までに改める
      if (ruleId === 'agreement_36' && state.legal.overtimeCapExceeded) {
        state.legal.overtimeCapExceeded = false;
        if (state.policies.overtime === 'special') state.policies = { ...state.policies, overtime: 'limit45' };
      }
      c.response = c.response ?? 'immediate';
      state.legal.log.push({ month: state.month, ruleId, kind: 'corrected', text: `${rule.name}：是正した` });
    }
  }
  if (effects.payUnpaidOvertime) {
    const total = state.legal.unpaidOvertime.reduce((s, u) => s + u.amount, 0);
    addExtraordinaryCost(state, total * effects.payUnpaidOvertime * (effects.unpaidOvertimeMult ?? 1));
    state.legal.unpaidOvertime = [];
    state.legal.fixedOvertimeMisoperation = false;
  }
  if (effects.setPolicies) {
    // その業種で選べない働き方にはしない（念のため。そうなるイベントは excludeIndustries で起きないようにしている）
    const next = { ...state.policies, ...effects.setPolicies };
    if (!getIndustry(state.profile.industryId).remoteAllowed.includes(next.workStyle)) next.workStyle = state.policies.workStyle;
    state.policies = next;
  }
}

/** 判断待ちの画面に出す、節目の義務の一覧（安衛法の注記が要るかも返す） */
export function milestoneSummary(d: PendingDecision): { names: string[]; workplaceNote: boolean } {
  const rules = d.ruleIds.map(getLaw);
  return { names: rules.map((r) => r.name), workplaceNote: rules.some((r) => r.workplaceUnit) };
}

/** 期限の切れた一時的な効果を消す（月のはじめに呼ぶ） */
export function pruneModifiers(state: CompanyState): void {
  state.modifiers = state.modifiers.filter((m) => m.untilMonth > state.month);
}

/** いま効いている一時的な効果の倍率（morale は点数の合計、hiringHeadroom は割合の合計） */
export function modifierValue(state: CompanyState, type: TemporaryModifier['type']): number {
  if (type === 'morale' || type === 'hiringHeadroom') {
    return state.modifiers.reduce((s, m) => (m.type === type && m.untilMonth > state.month ? s + m.mult : s), 0);
  }
  return state.modifiers.reduce((p, m) => (m.type === type && m.untilMonth > state.month ? p * m.mult : p), 1);
}

/** 期限の切れた一時的な効果を消し、いま効いている求人の埋まりやすさの倍率を返す */
export function hiringAttractionModifier(state: CompanyState): number {
  pruneModifiers(state);
  return modifierValue(state, 'hiringAttraction');
}
