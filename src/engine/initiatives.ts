/**
 * 施策（§14.1。ステップ14）。
 *
 * プレイヤーが「施策を打つ」から、いつでも（一時停止中でも）起こせるイベント（trigger.type が initiative）。
 * 起こすと判断待ち（稟議書）になり、その中で中身を選ぶ。同じ施策は cooldownMonths をあけないと打てない
 * （「やめる」を選んだときは数えない。eventTriggers.ts の cooledDown）。自動で進めるときは起きない。
 */
import { getIndustry } from './data';
import { eventDefs } from './eventData';
import { availableInIndustry, checkCompanyCondition, companyMetrics, cooledDown, eventVars } from './eventTriggers';
export { averageFactorScores, organizationVars } from './eventTriggers';
import { pushDecision } from './events';
import { hasProgram } from './programs';
import type { CompanyState, EventDef, PendingDecision } from './types';

export type InitiativeAvailability =
  | { available: true }
  | { available: false; reason: 'waiting' | 'ended' | 'cooldown' | 'headcount' | 'conditions'; months?: number };

/** その業種で打てる施策（打てない時期のものも含む） */
export function initiativesFor(state: CompanyState): EventDef[] {
  const industry = getIndustry(state.profile.industryId);
  return eventDefs.filter((e) => e.trigger.type === 'initiative' && availableInIndustry(e, industry));
}

/** あと何か月で同じ施策をまた打てるか */
function monthsUntilCooled(event: EventDef, state: CompanyState): number {
  const months = event.cooldownMonths ?? 0;
  let last = -Infinity;
  for (const d of state.decisions) {
    if (d.eventId === event.id && !event.choices[d.choiceIndex]?.cancel) last = Math.max(last, d.month);
  }
  return Math.max(0, last + months - state.month);
}

/** いまその施策を打てるか（打てないなら理由） */
export function initiativeAvailability(state: CompanyState, event: EventDef): InitiativeAvailability {
  const t = event.trigger;
  if (t.type !== 'initiative') throw new Error(`施策ではありません: ${event.id}`);
  if (state.status !== 'running') return { available: false, reason: 'ended' };
  if (state.pendingDecisions.length > 0) return { available: false, reason: 'waiting' };
  if (t.minHeadcount !== undefined && state.employees.length < t.minHeadcount) {
    return { available: false, reason: 'headcount', months: t.minHeadcount };
  }
  const metrics = companyMetrics(state);
  if (!(t.conditions ?? []).every((c) => checkCompanyCondition(c, metrics, state.policies))) {
    return { available: false, reason: 'conditions' };
  }
  if (!cooledDown(event, state)) return { available: false, reason: 'cooldown', months: monthsUntilCooled(event, state) };
  return { available: true };
}

/** その選択肢をいま選べるか（整えてある個別制度をもう一度整える選択肢は選べない） */
export function choiceAvailable(state: CompanyState, event: EventDef, index: number): boolean {
  const c = event.choices[index];
  if (!c) return false;
  const p = c.effects.installProgram;
  return !(p && hasProgram(state, p));
}

/** 施策を打つ（判断待ちを積む。状態を書き換える）。積んだ判断待ちを返す */
export function startInitiative(state: CompanyState, eventId: string): PendingDecision {
  const event = eventDefs.find((e) => e.id === eventId);
  if (!event || event.trigger.type !== 'initiative') throw new Error(`施策がありません: ${eventId}`);
  const a = initiativeAvailability(state, event);
  if (!a.available) throw new Error(`いまは打てません: ${eventId}（${a.reason}）`);
  // 施策は判断待ちで止めて選ばせる（自動の方針があっても、その場では選ばない）
  const autoPlay = state.autoPlay;
  state.autoPlay = null;
  pushDecision(state, {
    kind: 'event',
    eventId: event.id,
    ruleIds: [],
    vars: eventVars(event, state, null),
    targetId: null,
  });
  state.autoPlay = autoPlay;
  return state.pendingDecisions[state.pendingDecisions.length - 1] as PendingDecision;
}
