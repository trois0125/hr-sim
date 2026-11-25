import { describe, expect, it } from 'vitest';
import { defaultPolicies } from '../engine/data';
import { generateCompany, setFoundingPolicies } from '../engine/generate';
import { runToEnd } from '../engine/tick';
import {
  BONUS_POLICIES,
  DIAGNOSIS_AXES,
  EVALUATION_SYSTEMS,
  GRADE_SYSTEMS,
  HIRING_POLICIES,
  PAY_POLICIES,
  TRAINING_INVESTMENTS,
  WORK_HOUR_SYSTEMS,
  WORK_STYLES,
  type CompanyState,
  type PolicySet,
} from '../engine/types';
import { computeDiagnosis, diagnosisData, eventPart, policyAxisScore, policyPart } from './diagnosis';
import { buildTimeline, LESSONS_MAX, pickLessons, pickVoices, runRival, VOICE_PERIOD_YEARS, yearlySeries } from './history';

/** 自動で最後まで回した会社 */
function played(seed = 11, policies: PolicySet = defaultPolicies): CompanyState {
  return runToEnd(setFoundingPolicies(generateCompany({ seed, industryId: 'trading' }), policies));
}

describe('人事スタイル診断のデータ', () => {
  it('16タイプすべてに名前・要約・強み・落とし穴がある', () => {
    const keys = Object.keys(diagnosisData.types);
    expect(keys).toHaveLength(16);
    for (const o of 'OS') for (const c of 'CA') for (const d of 'DG') for (const p of 'PR') {
      const t = diagnosisData.types[`${o}${c}${d}${p}`];
      expect(t?.name.length).toBeGreaterThan(2);
      expect(t?.strength.length).toBeGreaterThan(5);
      expect(t?.pitfall.length).toBeGreaterThan(5);
    }
  });

  it('点数を付けた制度は、そのカテゴリのすべての選択肢に点数がある', () => {
    const all: Partial<Record<keyof PolicySet, readonly string[]>> = {
      pay: PAY_POLICIES, bonus: BONUS_POLICIES, evaluation: EVALUATION_SYSTEMS, grade: GRADE_SYSTEMS,
      workHours: WORK_HOUR_SYSTEMS, workStyle: WORK_STYLES, hiring: HIRING_POLICIES, training: TRAINING_INVESTMENTS,
    };
    for (const table of Object.values(diagnosisData.policyScores)) {
      for (const [cat, scores] of Object.entries(table ?? {})) {
        for (const o of all[cat as keyof PolicySet] ?? []) expect(scores[o], `${cat}.${o}`).toBeDefined();
      }
    }
  });

  it('制度ごとの点数（例：成果連動の給与と個人成果連動の賞与は成果側、年功と一律の賞与は安定側）', () => {
    expect(policyAxisScore({ ...defaultPolicies, pay: 'performance', bonus: 'individual_linked' }, 'outcome')).toBeGreaterThan(0);
    expect(policyAxisScore({ ...defaultPolicies, pay: 'seniority', bonus: 'fixed_months' }, 'outcome')).toBeLessThan(0);
    expect(policyAxisScore({ ...defaultPolicies, workHours: 'flex', workStyle: 'remote' }, 'control')).toBeLessThan(0);
    expect(policyAxisScore({ ...defaultPolicies, hiring: 'new_grad', training: '1' }, 'develop')).toBeGreaterThan(0);
  });
});

describe('人事スタイル診断', () => {
  it('制度は選んでいた期間の長さで重み付けする', () => {
    const c = played(11);
    const perf = { ...defaultPolicies, pay: 'performance' as const, bonus: 'individual_linked' as const };
    const sen = { ...defaultPolicies, pay: 'seniority' as const, bonus: 'fixed_months' as const };
    // 4分の3の期間を成果寄り、残りを安定寄りにした会社
    c.history = c.history.map((r, i) => ({ ...r, policies: i < (c.history.length * 3) / 4 ? perf : sen }));
    const p = policyPart(c, 'outcome') ?? 0;
    const expected = ((policyAxisScore(perf, 'outcome') ?? 0) * 3 + (policyAxisScore(sen, 'outcome') ?? 0)) / 4;
    expect(p).toBeCloseTo(expected, 1);
  });

  it('先手⇄後手は法令の義務への対応（後回しが多いほど後手）', () => {
    const c = played(11);
    for (const x of c.legal.compliance) x.response = 'postpone';
    expect(policyPart(c, 'proactive')).toBe(-1);
    for (const x of c.legal.compliance) x.response = 'immediate';
    expect(policyPart(c, 'proactive')).toBe(1);
  });

  it('制度とイベントの判断を半々で合わせる', () => {
    const c = played(11);
    c.decisions = c.decisions.map((d) => ({ ...d, diagnosis: { develop: -1 } }));
    c.history = c.history.map((r) => ({ ...r, policies: { ...defaultPolicies, hiring: 'new_grad', training: '1' } }));
    const d = computeDiagnosis(c);
    expect(eventPart(c, 'develop')).toBe(-1);
    expect(d.axes.develop.policy).toBe(1);
    expect(d.axes.develop.score).toBeCloseTo(0);
    // イベントの判断がない軸は、制度だけで決まる
    c.decisions = [];
    expect(computeDiagnosis(c).axes.develop.score).toBe(1);
  });

  it('各軸の向きでタイプが決まる', () => {
    const c = played(11);
    c.decisions = [];
    c.history = c.history.map((r) => ({
      ...r,
      policies: { ...defaultPolicies, pay: 'performance', bonus: 'individual_linked', workHours: 'flex', workStyle: 'hybrid', hiring: 'mid_career', training: '0' },
    }));
    for (const x of c.legal.compliance) x.response = 'postpone';
    const d = computeDiagnosis(c);
    expect(d.key).toBe('OAGR');
    expect(d.type.name).toBe(diagnosisData.types.OAGR?.name);
    for (const a of DIAGNOSIS_AXES) expect(Math.abs(d.axes[a].score)).toBeLessThanOrEqual(1);
  });
});

describe('年表', () => {
  it('創業・社員数の節目・法令の義務・制度変更・景気後退・終わりが月の順に並ぶ', () => {
    const c = played(11);
    c.market.recessionMonths.push(40);
    c.policyChanges.push({ month: 30, categories: ['training'], resistance: 4, method: null, transition: false, affected: 0, averageCutPct: 0 });
    const t = buildTimeline(c);
    expect(t[0]?.kind).toBe('founding');
    expect(t[t.length - 1]).toMatchObject({ kind: 'end', status: c.status });
    expect(t.some((e) => e.kind === 'headcount' && e.threshold === 10)).toBe(true);
    expect(t.some((e) => e.kind === 'obligation')).toBe(true);
    expect(t.some((e) => e.kind === 'recession' && e.month === 40)).toBe(true);
    const p = t.find((e) => e.kind === 'policy');
    expect(p && p.kind === 'policy' ? p.changes[0]?.category : null).toBe('training');
    for (let i = 1; i < t.length; i++) expect(t[i]!.month).toBeGreaterThanOrEqual(t[i - 1]!.month);
  });

  it('人のイベントは続きのイベントだけ載せ、市場のイベントは載せる', () => {
    const c = played(11);
    c.decisions = [
      { month: 5, eventId: 'parental_leave_female', choiceIndex: 0, targetId: null, axes: {}, diagnosis: {}, auto: true },
      { month: 6, eventId: 'harassment_escalation', choiceIndex: 0, targetId: null, axes: {}, diagnosis: {}, auto: true },
      { month: 7, eventId: 'client_bankruptcy', choiceIndex: 0, targetId: null, axes: {}, diagnosis: {}, auto: true },
    ];
    const ids = buildTimeline(c).flatMap((e) => (e.kind === 'event' ? [e.eventId] : []));
    expect(ids).toEqual(['harassment_escalation', 'client_bankruptcy']);
  });
});

describe('数字の推移', () => {
  it('年ごとに売上・利益・人件費率・社員数・離職率・納得感をまとめる', () => {
    const c = played(11);
    const s = yearlySeries(c.history);
    expect(s).toHaveLength(Math.ceil(c.history.length / 12));
    const y1 = s[0]!;
    const rows = c.history.slice(0, 12);
    expect(y1.revenue).toBeCloseTo(rows.reduce((a, r) => a + r.revenue, 0));
    expect(y1.headcount).toBe(rows[11]!.headcount);
    expect(y1.laborCostRatio).toBeGreaterThan(0);
  });
});

describe('同期創業の他社', () => {
  it('同じ会社（同じシード）を、標準の制度で最後まで回す', () => {
    const c = played(11, { ...defaultPolicies, training: '1', overtime: 'none' });
    const r = runRival(c);
    expect(r.profile).toEqual(c.profile);
    expect(r.history[0]?.policies).toEqual(defaultPolicies);
    expect(r.status).not.toBe('running');
    expect(runRival(c).history.map((x) => x.headcount)).toEqual(r.history.map((x) => x.headcount));
  });
});

describe('従業員の声', () => {
  it('5年ごとに、不満・前向き・退職のあいさつを1つずつまで選ぶ', () => {
    const c = played(11);
    const periods = pickVoices(c);
    expect(periods.length).toBeGreaterThan(0);
    expect(periods.length).toBeLessThanOrEqual(Math.ceil(c.month / (VOICE_PERIOD_YEARS * 12)));
    for (const p of periods) {
      expect(p.voices.length).toBeLessThanOrEqual(3);
      for (const v of p.voices) {
        expect(v.month).toBeGreaterThanOrEqual((p.fromYear - 1) * 12);
        expect(v.month).toBeLessThan((p.fromYear - 1 + VOICE_PERIOD_YEARS) * 12);
      }
      expect(new Set(p.voices.map((v) => `${v.kind}:${v.tone}`)).size).toBe(p.voices.length);
    }
  });
});

describe('法令と出来事の学び', () => {
  it('主な判断を最大5つ、月の順に挙げる。学びの一言がある', () => {
    const c = played(11);
    const t = pickLessons(c);
    expect(t.length).toBeGreaterThanOrEqual(1);
    expect(t.length).toBeLessThanOrEqual(LESSONS_MAX);
    for (let i = 1; i < t.length; i++) expect(t[i]!.month).toBeGreaterThanOrEqual(t[i - 1]!.month);
    for (const p of t) expect(p.lesson.length).toBeGreaterThan(5);
  });

  it('法令を長く後回しにした義務は優先して挙がる。制度の変更は挙がらない（変更の振り返りで扱う）', () => {
    const c = played(11);
    const first = c.legal.compliance[0]!;
    first.violationMonths = 24;
    c.policyChanges.push({ month: 30, categories: ['pay'], resistance: 4, method: 'rules', transition: false, affected: 3, averageCutPct: 5 });
    const t = pickLessons(c);
    expect(t.some((p) => p.kind === 'law' && p.ruleId === first.ruleId)).toBe(true);
    expect(t.every((p) => p.kind === 'law' || p.kind === 'event')).toBe(true);
  });

  it('法令は2つまでにして、出来事での判断も入れる', () => {
    const c = played(11);
    for (const x of c.legal.compliance) x.violationMonths = 30;
    const t = pickLessons(c);
    expect(t.filter((p) => p.kind === 'law').length).toBeLessThanOrEqual(2);
    expect(t.some((p) => p.kind === 'event')).toBe(true);
  });
});

