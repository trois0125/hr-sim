import { describe, expect, it } from 'vitest';
import { eventDefs, localizeEvent } from './eventData';

/** ステップ19で足したイベント（労務・法令5、もめごと5、うれしい出来事5） */
const ADDED = {
  legal: ['paid_leave_5days', 'side_job_request', 'part_pay_gap_explanation', 'whistleblowing', 'resignation_agency'],
  conflict: ['young_promotion', 'expense_fraud', 'union_formation', 'veteran_motivation', 'team_mass_exit'],
  positive: ['employee_award', 'kaizen_proposal', 'media_interview', 'record_profit', 'certification_support'],
};

describe('イベントを増やす（§14.6。ステップ19）', () => {
  it('15個そろっていて、どれも毎月の抽選で起きる', () => {
    const all = Object.values(ADDED).flat();
    expect(all).toHaveLength(15);
    for (const id of all) {
      const e = eventDefs.find((x) => x.id === id);
      expect(e, id).toBeDefined();
      expect(e!.trigger.type, id).toBe('random');
    }
    expect(eventDefs.filter((e) => e.trigger.type === 'random').length).toBeGreaterThanOrEqual(45);
  });

  it('労務・法令のイベントは、学びの一言で根拠の法令に触れる（退職代行は民法）', () => {
    for (const id of ADDED.legal) {
      const e = eventDefs.find((x) => x.id === id)!;
      const text = e.choices.map((c) => c.lesson ?? '').join('');
      expect(text, id).toMatch(/法|第\d+条/);
    }
  });

  it('うれしい出来事には、本人や社員の納得感が上がる選択肢がある', () => {
    for (const id of ADDED.positive) {
      const e = eventDefs.find((x) => x.id === id)!;
      const up = e.choices.some(
        (c) => (c.effects.target?.engagement ?? 0) > 0 || (c.effects.engagementAll ?? 0) > 0 || (c.effects.hiringAttraction?.mult ?? 1) > 1,
      );
      expect(up, id).toBe(true);
    }
  });

  it('業種ごとの言い換えがある（飲食の内部通報は店舗の話になる）', () => {
    const e = localizeEvent(eventDefs.find((x) => x.id === 'whistleblowing')!, 'restaurant');
    expect(e.body).toContain('店舗');
  });
});
