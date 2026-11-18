/**
 * イベントと判断待ち（§8、§7.2）。
 *
 * - 節目（法令の義務の発生）とイベントは「判断待ち」として積まれる。画面はそこで時間を止めて選ばせる
 * - 自動で進める方針（autoPlay）があるときは、その場で選んで先に進む
 * - 選択肢の効果（effects）はデータ（events.json）に書き、ここで状態に反映する
 */
import { coef } from './coefficients';
import { getLaw } from './lawData';
import { eventDefs } from './eventData';
import { SCORE_MAX, SCORE_MIN, clamp } from './employees';
import { getStreamsState, restoreStreams, type Rng } from './rng';
import type {
  CompanyState,
  EventDef,
  EventEffects,
  LegalResponse,
  PendingDecision,
} from './types';

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

/** 判断待ちを積む。自動の方針があれば、その場で選ぶ */
/**
 * 判断待ちを積む。自動の方針があれば、その場で選ぶ。
 * ティック処理の途中から呼ぶときは、そのティックの乱数（laws 系列）を rng に渡す
 */
export function pushDecision(
  state: CompanyState,
  d: Omit<PendingDecision, 'id' | 'month'>,
  rng?: Rng,
): void {
  const decision: PendingDecision = { ...d, id: `d${state.nextDecisionId++}`, month: state.month };
  state.pendingDecisions.push(decision);
  if (state.autoPlay) {
    if (decision.kind === 'milestone') resolveMilestone(state, decision.id, state.autoPlay.legal, rng);
    else resolveEvent(state, decision.id, autoChoiceIndex(getEvent(decision.eventId ?? ''), state.autoPlay.legal));
  }
}

/** 自動で進めるときに選ぶ選択肢（方針に合うもの。なければ最初） */
export function autoChoiceIndex(event: EventDef, legal: LegalResponse): number {
  const i = event.choices.findIndex((c) => c.auto?.includes(legal));
  return i >= 0 ? i : 0;
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

/** イベントの選択肢を選ぶ（状態を書き換える） */
export function resolveEvent(state: CompanyState, decisionId: string, choiceIndex: number): void {
  const d = takeDecision(state, decisionId);
  const event = getEvent(d.eventId ?? '');
  const choice = event.choices[choiceIndex];
  if (!choice) throw new Error(`選択肢がありません: ${event.id} ${choiceIndex}`);
  applyEffects(state, choice.effects, d);
  state.legal.log.push({
    month: state.month,
    ruleId: d.ruleIds[0] ?? null,
    kind: event.category === 'law' ? 'corrected' : 'response',
    text: `${event.title}：${choice.label}${choice.lesson ? `（${choice.lesson}）` : ''}`,
  });
}

/** 選択肢の効果を状態に反映する */
export function applyEffects(state: CompanyState, effects: EventEffects, d: PendingDecision): void {
  if (effects.cash) addExtraordinaryCost(state, -effects.cash);
  if (effects.cashPerEmployee) addExtraordinaryCost(state, -effects.cashPerEmployee * state.employees.length);
  if (effects.engagementAll) {
    for (const e of state.employees) e.engagement = clamp(e.engagement + effects.engagementAll, SCORE_MIN, SCORE_MAX);
  }
  if (effects.hiringAttraction) {
    state.modifiers.push({
      type: 'hiringAttraction',
      mult: effects.hiringAttraction.mult,
      untilMonth: state.month + effects.hiringAttraction.months,
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
  if (effects.setPolicies) state.policies = { ...state.policies, ...effects.setPolicies };
}

/** 判断待ちの画面に出す、節目の義務の一覧（安衛法の注記が要るかも返す） */
export function milestoneSummary(d: PendingDecision): { names: string[]; workplaceNote: boolean } {
  const rules = d.ruleIds.map(getLaw);
  return { names: rules.map((r) => r.name), workplaceNote: rules.some((r) => r.workplaceUnit) };
}

/** 期限の切れた一時的な効果を消し、いま効いている求人の埋まりやすさの倍率を返す */
export function hiringAttractionModifier(state: CompanyState): number {
  state.modifiers = state.modifiers.filter((m) => m.untilMonth > state.month);
  return state.modifiers.reduce((p, m) => (m.type === 'hiringAttraction' ? p * m.mult : p), 1);
}

