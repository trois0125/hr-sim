/** 画面で遊ぶための機能（ステップ9）：毎年の見直し、問いかけ、従業員の声、影響の方向、制度変更の試算 */
import { describe, expect, it } from 'vitest';
import { coef } from './coefficients';
import { eventDefs } from './eventData';
import { addReflection, resolveEvent, resolveMilestone, resolveReorg, resolveReview } from './events';
import { forecastChange } from './forecast';
import { generateCompany } from './generate';
import { choiceImpacts } from './preview';
import { createRng } from './rng';
import { makeEmployee, staff } from './testHelpers';
import { isWaitingForDecision, runToEnd, tick } from './tick';
import type { CompanyState, Departure, EventDef } from './types';
import { everydayVoice, generateVoices, voiceData, voiceTopic } from './voices';

/** 画面で遊ぶ（判断待ちで止まる）会社を、指定の月まで進める。節目・イベントは最初の選択肢、見直しは変えずに進む */
function playUntil(month: number, seed = 3): CompanyState {
  let c = generateCompany({ seed, industryId: 'trading', autoPlay: null });
  while (c.month < month && c.status === 'running') {
    const d = c.pendingDecisions[0];
    if (d?.kind === 'review' && c.month === month) break;
    if (d) {
      c = structuredClone(c);
      if (d.kind === 'review') resolveReview(c, d.id);
      else if (d.kind === 'reorg') resolveReorg(c, d.id, null);
      else if (d.kind === 'milestone') resolveMilestone(c, d.id, 'immediate');
      else resolveEvent(c, d.id, 0);
      continue;
    }
    c = tick(c);
  }
  return c;
}

describe('毎年の制度の見直し', () => {
  it('画面で遊ぶときは、決算月ごとに見直しの判断待ちで止まる', () => {
    const c = playUntil(12);
    expect(c.month).toBe(12);
    expect(c.pendingDecisions.some((d) => d.kind === 'review')).toBe(true);
    expect(isWaitingForDecision(c)).toBe(true);
    expect(tick(c).month).toBe(12);
    const d = c.pendingDecisions.find((x) => x.kind === 'review');
    resolveReview(c, d?.id ?? '');
    expect(c.pendingDecisions.some((x) => x.kind === 'review')).toBe(false);
  });

  it('自動で進めるときは見直しで止まらない', () => {
    const end = runToEnd(generateCompany({ seed: 3, industryId: 'trading' }), 30);
    expect(end.month).toBe(30);
    expect(end.pendingDecisions.some((d) => d.kind === 'review')).toBe(false);
  });
});

describe('節目の問いかけ', () => {
  it('答えを月と一緒に記録する。空の答えは記録しない', () => {
    const c = generateCompany({ seed: 1, industryId: 'trading' });
    c.month = 7;
    addReflection(c, '  まずは人を辞めさせない会社にしたい ');
    addReflection(c, '   ');
    expect(c.reflections).toEqual([{ month: 7, text: 'まずは人を辞めさせない会社にしたい' }]);
  });
});

describe('従業員の声', () => {
  it('納得感が低い人は、いちばん足を引っ張っている要因について話す', () => {
    const e = makeEmployee('sales', {
      engagement: 20,
      overtimeHours: 70,
      values: { growth: 0.1, stability: 0.1, money: 0.1, balance: 0.7 },
      factorScores: { externalPay: 50, internalFairness: 50, evaluation: 50, workload: 5, growthOpportunity: 50, stability: 50 },
    });
    expect(voiceTopic(e)).toEqual({ tone: 'negative', factor: 'workload' });
    const v = everydayVoice(e, 3, createRng(1));
    expect(voiceData.negative.workload.map((t) => t.replace('{overtime}', '70'))).toContain(v.text);
  });

  it('納得感が高い人は前向きに、その間の人はとりとめのないことを話す', () => {
    const scores = { externalPay: 50, internalFairness: 50, evaluation: 50, workload: 50, growthOpportunity: 95, stability: 50 };
    const values = { growth: 0.7, stability: 0.1, money: 0.1, balance: 0.1 };
    expect(voiceTopic(makeEmployee('sales', { engagement: 80, factorScores: scores, values }))).toEqual({
      tone: 'positive',
      factor: 'growthOpportunity',
    });
    expect(voiceTopic(makeEmployee('sales', { engagement: 50, factorScores: scores, values })).tone).toBe('neutral');
  });

  it('毎月のふだんの声と、辞めた人のあいさつ（上限あり）、復帰した人の声を記録する', () => {
    const c = generateCompany({ seed: 1, industryId: 'trading' });
    c.employees = staff('sales', 5);
    const gone = (reason: Departure['reason']): Departure =>
      ({ employeeId: 'x', name: '退職者', role: 'sales', month: 0, kind: 'resignation', reason }) as Departure;
    const back = makeEmployee('sales');
    const out = generateVoices(c, createRng(2), {
      departures: [gone('pay'), gone('workload'), gone('family')],
      returned: [{ employee: back, kind: 'parental' }],
    });
    expect(out.filter((v) => v.kind === 'farewell')).toHaveLength(coef('voices.farewell_max'));
    expect(out.filter((v) => v.kind === 'return')).toHaveLength(1);
    expect(out.filter((v) => v.kind === 'voice')).toHaveLength(coef('voices.per_month'));
    expect(c.voices).toEqual(out);
    for (const v of out) expect(v.text).not.toMatch(/\{\w+\}/);
  });

  it('会社を回すと、毎月の声が記録される（同じシードなら同じ声）', () => {
    const a = runToEnd(generateCompany({ seed: 9, industryId: 'trading' }), 24);
    const b = runToEnd(generateCompany({ seed: 9, industryId: 'trading' }), 24);
    expect(a.voices.filter((v) => v.kind === 'voice').length).toBeGreaterThanOrEqual(24);
    expect(a.voices).toEqual(b.voices);
  });

  it('テンプレートはどの要因・理由・休職の種類にもある', () => {
    for (const pool of [...Object.values(voiceData.negative), ...Object.values(voiceData.positive)]) expect(pool.length).toBeGreaterThan(0);
    for (const pool of Object.values(voiceData.farewell)) expect(pool.length).toBeGreaterThan(0);
    for (const pool of Object.values(voiceData.return)) expect(pool.length).toBeGreaterThan(0);
  });
});

describe('予想される影響の方向（イベントの選択肢）', () => {
  const choice = (id: string, i: number) => (eventDefs.find((e) => e.id === id) as EventDef).choices[i]!.effects;

  it('効果のデータから方向を読み取る', () => {
    // 給与で引き留める：人件費↑・本人の納得感↑
    expect(choiceImpacts(choice('ace_resignation', 0))).toEqual(
      expect.arrayContaining([{ key: 'laborCost', dir: 1 }, { key: 'target', dir: 1 }]),
    );
    // 送り出す：人が辞める
    expect(choiceImpacts(choice('ace_resignation', 2))).toContainEqual({ key: 'headcount', dir: -1 });
    // 希望退職：資金↓（退職金）・人が辞める・納得感↓・評判↓
    expect(choiceImpacts(choice('recession_response', 2))).toEqual(
      expect.arrayContaining([
        { key: 'cash', dir: -1 },
        { key: 'headcount', dir: -1 },
        { key: 'engagement', dir: -1 },
        { key: 'reputation', dir: -1 },
      ]),
    );
    // 採用を強める
    expect(choiceImpacts(choice('talent_shortage', 1))).toEqual([{ key: 'hiring', dir: 1 }]);
    // 法令の是正
    expect(choiceImpacts(choice('labor_inspection', 0))).toContainEqual({ key: 'compliance', dir: 1 });
  });

  it('何も起きない選択肢は空', () => {
    expect(choiceImpacts(choice('big_contract', 2))).toEqual([]);
  });

  it('連鎖する選択肢と法令上の問題がある選択肢には、手書きの補足がある', () => {
    for (const e of eventDefs) {
      for (const c of e.choices) {
        if (c.effects.followUp && c.effects.followUp.eventId !== 'alumni_referral') {
          expect(c.hint, `${e.id}: ${c.label}`).toBeTruthy();
        }
      }
    }
  });
});

describe('制度を変えた場合の試算', () => {
  const company = () => {
    const c = playUntil(36, 5);
    return c;
  };

  it('賞与をなくすと、人件費が下がり、納得感が下がる', () => {
    const c = company();
    const f = forecastChange(c, { ...c.policies, bonus: 'none' }, { method: 'consent' });
    expect(f.laborCost).toBeLessThan(0);
    expect(f.engagement).toBeLessThan(0);
    expect(f.cuts).toBeGreaterThan(0);
    expect(f.months).toBe(coef('ui.forecast_months'));
  });

  it('育成投資を増やすと、人件費が上がり、納得感が上がる', () => {
    const c = company();
    const f = forecastChange(c, { ...c.policies, training: '1' });
    expect(f.laborCost).toBeGreaterThan(0);
    expect(f.engagement).toBeGreaterThan(0);
  });

  it('同じ制度なら差は0で、元の状態は変わらない', () => {
    const c = company();
    const before = structuredClone(c);
    const f = forecastChange(c, c.policies);
    expect(f.laborCost).toBe(0);
    expect(f.engagement).toBe(0);
    expect(c).toEqual(before);
  });
});
