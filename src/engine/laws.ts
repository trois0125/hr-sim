/**
 * 法令チェック（§2.1 の8、§7）。
 *
 * 1. 義務の発生（月のはじめ）：社員数や残業の有無で義務が生じたら、節目の判断待ちを積む。
 *    初級では、残業させる前に36協定の節目が来る（事前警告）。
 * 2. 違反の判定と発覚（月の終わり）：未対応の義務は違反の状態になり、臨検・退職者の申告・
 *    ロクイチ報告などで発覚するとイベントになる。
 * 3. 固定残業代の運用ミス（含めた時間を超えた分を払わない）は、未払いの残業代として3年分たまる。
 * 4. 長時間労働は、健康被害のイベントを起こす。
 *
 * 安衛法の義務は本来は事業場単位だが、ゲームでは「1社＝1事業場」に単純化している。
 */
import { coefGroup } from './coefficients';
import { gameDate, monthIndexOf } from './calendar';
import { addExtraordinaryCost, pushDecision } from './events';
import { overtimePay } from './finance';
import { startLeave } from './leave';
import { laws } from './lawData';
import { overtimeCap } from './performance';
import type { Rng } from './rng';
import type { CompanyState, Departure, Employee, HeadcountMethod, LawRule } from './types';
import { MONTHS_PER_YEAR } from './types';

const K = coefGroup({
  inspectionP: 'law.inspection.monthly_probability',
  sizeFactor: 'law.inspection.size_factor',
  complaintP: 'law.complaint.per_resignation',
  misoperationP: 'law.unpaid_overtime.misoperation_probability',
  claimP: 'law.unpaid_overtime.claim_per_resignation',
  statuteMonths: 'law.unpaid_overtime.statute_months',
  levyPerPerson: 'law.disability.levy_per_person_month',
  levyHeadcount: 'law.disability.levy_headcount',
  reportMonth: 'law.disability.report_month',
  partWeight: 'law.disability.part_weight',
  specialMaxMonths: 'law.overtime.special_max_months',
  limitHours: 'law.overtime.limit_hours',
  healthAt80: 'law.overwork.health_probability_at80',
  healthNoDoctorMult: 'law.overwork.health_without_doctor_mult',
  specialCap: 'policy.overtime.cap.special',
  includedHours: 'policy.workHours.fixed_overtime.included_hours',
});

const YEN_PER_MAN = 10000;

/** 法令上の人数（数え方はルールごと） */
export function countHeadcount(employees: readonly Employee[], method: HeadcountMethod): number {
  if (method === 'all') return employees.length;
  // 障害者雇用率の算定基礎：出向者は除き、パートは週の所定時間で重みを付ける
  let n = 0;
  for (const e of employees) {
    if (e.affiliation === 'secondee') continue;
    n += e.employmentType === 'part' ? K().partWeight : 1;
  }
  return n;
}

/** その月に施行されているか */
export function isEffective(rule: LawRule, month: number): boolean {
  if (monthIndexOf(rule.effectiveFrom) > month) return false;
  if (rule.effectiveUntil && monthIndexOf(rule.effectiveUntil) <= month) return false;
  return true;
}

/** 義務が生じる条件を満たしているか */
export function isTriggered(rule: LawRule, state: CompanyState): boolean {
  switch (rule.trigger.type) {
    case 'firstEmployee':
      return state.employees.length >= 1;
    case 'overtime':
      return overtimeCap(state.policies.overtime) > 0;
    case 'headcount':
      return countHeadcount(state.employees, rule.trigger.count) >= rule.trigger.threshold;
  }
}

/** いま施行されている義務の対応状況 */
function activeCompliance(state: CompanyState) {
  return state.legal.compliance.filter((c) => {
    const rule = laws.find((r) => r.id === c.ruleId);
    return rule !== undefined && isEffective(rule, state.month);
  });
}

/** 対応したあと毎月かかる費用（対応済みと、自社で対応して不備が残ったものを含む） */
export function legalMonthlyCost(state: CompanyState): number {
  let total = 0;
  for (const c of activeCompliance(state)) {
    if (c.response === 'immediate' || c.response === 'outsource') {
      total += laws.find((r) => r.id === c.ruleId)?.monthlyCost.value ?? 0;
    }
  }
  return total;
}

/**
 * 1. 義務の発生（月のはじめに呼ぶ）。新しく生じた義務をまとめて1つの節目にする。
 * 自動の方針があればその場で対応が決まる。
 */
export function checkObligations(state: CompanyState, rng?: Rng): void {
  const fresh: string[] = [];
  for (const rule of laws) {
    if (!isEffective(rule, state.month)) continue;
    if (state.legal.compliance.some((c) => c.ruleId === rule.id)) continue;
    if (!isTriggered(rule, state)) continue;
    state.legal.compliance.push({
      ruleId: rule.id,
      triggeredMonth: state.month,
      status: 'pending',
      response: null,
      detected: false,
      violationMonths: 0,
    });
    state.legal.log.push({ month: state.month, ruleId: rule.id, kind: 'obligation', text: `${rule.name}の義務が生じた` });
    fresh.push(rule.id);
  }
  if (fresh.length > 0) {
    pushDecision(state, { kind: 'milestone', ruleIds: fresh, eventId: null, vars: { headcount: state.employees.length } }, rng);
  }
}

/** いま違反の状態にある義務（36協定は、その月に残業があったときだけ違反） */
export function activeViolations(state: CompanyState, overtimeHours: number): LawRule[] {
  const out: LawRule[] = [];
  for (const c of activeCompliance(state)) {
    if (c.status !== 'noncompliant') continue;
    const rule = laws.find((r) => r.id === c.ruleId);
    if (!rule) continue;
    if (rule.trigger.type === 'overtime' && overtimeHours <= 0) continue;
    out.push(rule);
  }
  return out;
}

export type ViolationContext = {
  rng: Rng;
  /** その月の、売上を生むフルタイム社員の残業時間 */
  overtimeHours: number;
  /** その月に退職した人 */
  resigned: readonly Departure[];
};

/** 2〜4. 違反の判定と発覚、未払い残業代、長時間労働（月の終わりに呼ぶ）。違反の数を返す */
export function checkViolations(state: CompanyState, ctx: ViolationContext): number {
  const k = K();
  const { rng } = ctx;

  // 特別条項の上限：月45時間を超えられるのは年度で6か月まで
  if (ctx.overtimeHours > k.limitHours) {
    state.legal.overtimeOver45Months.push(state.month);
    const fy = Math.floor(state.month / MONTHS_PER_YEAR);
    const thisYear = state.legal.overtimeOver45Months.filter((m) => Math.floor(m / MONTHS_PER_YEAR) === fy).length;
    if (thisYear > k.specialMaxMonths && !state.legal.overtimeCapExceeded) {
      state.legal.overtimeCapExceeded = true;
      state.legal.log.push({
        month: state.month,
        ruleId: 'agreement_36',
        kind: 'warning',
        text: '月45時間を超える残業が年6か月を超えた（36協定の特別条項の上限を超えている）',
      });
    }
  }
  if (state.month % MONTHS_PER_YEAR === 0) state.legal.overtimeCapExceeded = false;

  const violations = activeViolations(state, ctx.overtimeHours);
  const capViolation = state.legal.overtimeCapExceeded;
  for (const rule of violations) {
    const c = state.legal.compliance.find((x) => x.ruleId === rule.id);
    if (c) c.violationMonths += 1;
  }

  updateUnpaidOvertime(state, rng);
  detectViolations(state, ctx, violations, capViolation);
  disabilityReport(state, rng);
  overworkHealth(state, ctx);

  return violations.length + (capViolation ? 1 : 0) + (state.legal.unpaidOvertime.length > 0 ? 1 : 0);
}

/** 固定残業代の運用ミス：含めた時間を超えた分を払わず、未払いとしてためる */
function updateUnpaidOvertime(state: CompanyState, rng: Rng): void {
  const k = K();
  const legal = state.legal;
  if (state.policies.workHours !== 'fixed_overtime') {
    legal.fixedOvertimeRolled = false;
    legal.fixedOvertimeMisoperation = false;
  } else if (!legal.fixedOvertimeRolled) {
    legal.fixedOvertimeRolled = true;
    legal.fixedOvertimeMisoperation = rng.next() < k.misoperationP;
  }
  // 3年（時効）より前の分は消える
  legal.unpaidOvertime = legal.unpaidOvertime.filter((u) => state.month - u.month < k.statuteMonths);
  if (!legal.fixedOvertimeMisoperation) return;

  let unpaid = 0;
  const ids: string[] = [];
  for (const e of state.employees) {
    if (e.employmentType === 'part' || e.overtimeHours <= k.includedHours) continue;
    const owed = overtimePay(e, state.policies) - overtimePay({ ...e, overtimeHours: k.includedHours }, state.policies);
    if (owed > 0) {
      unpaid += owed;
      ids.push(e.id);
    }
  }
  if (unpaid <= 0) return;
  legal.unpaidOvertime.push({ month: state.month, amount: unpaid, employeeIds: ids });
  // 払わなかった分は手元に残る（記録も合わせて直す）
  state.cash += unpaid;
  const rec = state.history[state.history.length - 1];
  if (rec) {
    rec.labor.overtime -= unpaid;
    rec.labor.total -= unpaid;
    rec.operatingProfit += unpaid;
    rec.cash = state.cash;
  }
}

function hasPending(state: CompanyState, eventId: string): boolean {
  return state.pendingDecisions.some((d) => d.eventId === eventId);
}

/** 臨検・申告・請求による発覚 */
function detectViolations(
  state: CompanyState,
  ctx: ViolationContext,
  violations: LawRule[],
  capViolation: boolean,
): void {
  const k = K();
  const { rng } = ctx;
  // 乱数：臨検1回＋退職者1人につき2回（申告・請求）。違反の有無で乱数列がずれないよう、先に引く
  const inspectionRoll = rng.next();
  const complaintRolls = ctx.resigned.map(() => [rng.next(), rng.next()] as const);

  const pInspection = k.inspectionP * (1 + k.sizeFactor * Math.log10(Math.max(1, state.employees.length)));
  const inspected = inspectionRoll < pInspection;
  const complained = complaintRolls.some(([c]) => c < k.complaintP);

  if ((inspected || complained) && (violations.length > 0 || capViolation)) {
    // 臨検の対象になった違反ごとに、見つかるかを抽選する（申告のときは申告された内容なので必ず見つかる）
    const found = violations.filter((r) => complained || rng.next() < r.inspectionDetection.value);
    const byEvent = new Map<string, LawRule[]>();
    for (const r of found) {
      const ev = r.violationEvent ?? 'labor_inspection';
      byEvent.set(ev, [...(byEvent.get(ev) ?? []), r]);
    }
    const capFound = capViolation && (complained || inspected);
    if (capFound && !byEvent.has('labor_inspection')) byEvent.set('labor_inspection', []);
    for (const [eventId, rules] of byEvent) {
      if (hasPending(state, eventId)) continue;
      for (const r of rules) {
        const c = state.legal.compliance.find((x) => x.ruleId === r.id);
        if (c) c.detected = true;
      }
      const names = rules.map((r) => r.name);
      if (eventId === 'labor_inspection' && capFound) names.push('時間外労働の上限（特別条項で月45時間を超えられるのは年6か月まで）');
      for (const r of rules) {
        state.legal.log.push({ month: state.month, ruleId: r.id, kind: 'violation_detected', text: `${r.name}の違反が見つかった` });
      }
      pushDecision(state, {
        kind: 'event',
        eventId,
        ruleIds: rules.map((r) => r.id).concat(eventId === 'labor_inspection' && capFound ? ['agreement_36'] : []),
        vars: {
          how: complained ? '退職した社員の申告をきっかけに、労働基準監督署の臨検がありました' : '労働基準監督署の臨検がありました',
          violations: names.join('、'),
        },
      }, rng);
    }
  }

  // 未払い残業代の請求（退職者から）
  const total = state.legal.unpaidOvertime.reduce((s, u) => s + u.amount, 0);
  if (total > 0 && !hasPending(state, 'unpaid_overtime_claim')) {
    const i = complaintRolls.findIndex(([, claim]) => claim < k.claimP);
    const claimant = i >= 0 ? ctx.resigned[i] : undefined;
    if (claimant) {
      state.legal.log.push({
        month: state.month,
        ruleId: null,
        kind: 'unpaid_overtime',
        text: `${claimant.name}さんから未払い残業代の請求（約${Math.round(total / YEN_PER_MAN)}万円）`,
      });
      pushDecision(state, {
        kind: 'event',
        eventId: 'unpaid_overtime_claim',
        ruleIds: [],
        vars: { name: claimant.name, amount: Math.round(total / YEN_PER_MAN) },
      }, rng);
    }
  }
}

/** ロクイチ報告（毎年6月）：障害者雇用の不足は行政指導、100人超なら納付金 */
function disabilityReport(state: CompanyState, rng: Rng): void {
  const k = K();
  if (state.month % MONTHS_PER_YEAR !== k.reportMonth) return;
  for (const c of activeCompliance(state)) {
    const rule = laws.find((r) => r.id === c.ruleId);
    if (!rule?.requiredRate || c.status !== 'noncompliant') continue;
    const count = countHeadcount(state.employees, 'disability');
    const shortfall = Math.floor(count * rule.requiredRate.value);
    if (shortfall <= 0) continue;
    let levyText = '';
    if (count > k.levyHeadcount) {
      const levy = shortfall * k.levyPerPerson * MONTHS_PER_YEAR;
      addExtraordinaryCost(state, levy);
      levyText = `常用労働者が100人を超えているため、障害者雇用納付金 ${Math.round(levy / YEN_PER_MAN)}万円を納めました。`;
    }
    c.detected = true;
    state.legal.log.push({
      month: state.month,
      ruleId: rule.id,
      kind: 'violation_detected',
      text: `障害者雇用の不足 ${shortfall}人（${gameDate(state.month).year}年のロクイチ報告）`,
    });
    if (!hasPending(state, 'disability_guidance')) {
      pushDecision(state, { kind: 'event', eventId: 'disability_guidance', ruleIds: [rule.id], vars: { shortfall, levy: levyText } }, rng);
    }
  }
}

/** 長時間労働による健康被害（月45時間を超えた分に比例して起きやすくなる） */
function overworkHealth(state: CompanyState, ctx: ViolationContext): void {
  const k = K();
  if (ctx.overtimeHours <= k.limitHours) return;
  const healthRule = activeCompliance(state).find((c) => c.ruleId === 'health_management_50');
  const mult = healthRule && healthRule.status === 'noncompliant' ? k.healthNoDoctorMult : 1;
  const p = (k.healthAt80 * mult * (ctx.overtimeHours - k.limitHours)) / (k.specialCap - k.limitHours);
  const victims = state.employees.filter((e) => !e.leave && e.overtimeHours > k.limitHours && ctx.rng.next() < p);
  const victim = victims[0];
  if (!victim) return;
  // 働けなくなった人は私傷病で休職する（期間が終わると、復帰するか退職するかが決まる。leave.ts）
  startLeave(victim, 'sick', state.month);
  state.legal.log.push({
    month: state.month,
    ruleId: null,
    kind: 'health',
    text: `${victim.name}さんが長時間労働で体調を崩し、休職した（月${Math.round(ctx.overtimeHours)}時間）`,
  });
  pushDecision(state, {
    kind: 'event',
    eventId: 'overwork_health',
    ruleIds: [],
    vars: { name: victim.name, hours: Math.round(ctx.overtimeHours) },
    targetId: victim.id,
  }, ctx.rng);
}

/** 違反の解説（社史レポート用）：ルールごとの結果と本来どうすべきだったか */
export function violationLessons(state: CompanyState): { rule: LawRule; months: number }[] {
  return state.legal.compliance
    .filter((c) => c.violationMonths > 0)
    .map((c) => ({ rule: laws.find((r) => r.id === c.ruleId) as LawRule, months: c.violationMonths }));
}

