import { describe, expect, it } from 'vitest';
import { coef } from './coefficients';
import { generateCompany } from './generate';
import { isBusyMonth, overtimeCap, overtimeCeiling } from './performance';
import { runToEnd } from './tick';
import { MONTHS_PER_YEAR } from './types';

describe('残業の決め方（§14.5。ステップ18）', () => {
  it('ふだんは方針の上限の半分、繁忙の月だけ方針の上限まで', () => {
    const cap = overtimeCap('limit45');
    expect(overtimeCeiling({ cap, busy: false, over45MonthsThisYear: 0 })).toBe(cap * coef('overtime.normal_share'));
    expect(overtimeCeiling({ cap, busy: true, over45MonthsThisYear: 0 })).toBe(cap);
  });

  it('特別条項でも、その年度で45時間超えがもう年6か月に達していれば45時間まで', () => {
    const cap = overtimeCap('special');
    const limit = coef('law.overtime.limit_hours');
    const max = coef('law.overtime.special_max_months');
    expect(overtimeCeiling({ cap, busy: true, over45MonthsThisYear: max - 1 })).toBe(cap);
    expect(overtimeCeiling({ cap, busy: true, over45MonthsThisYear: max })).toBe(limit);
    // ふだん（半分）は45時間以下なので、そのまま
    expect(overtimeCeiling({ cap, busy: false, over45MonthsThisYear: max })).toBe(cap * coef('overtime.normal_share'));
  });

  it('繁忙：需要が直近の平均より大きく増えた月、または売れる上限（人手）が大きく減った月', () => {
    const recent = Array.from({ length: 6 }, () => ({ demand: 100, capacity: 80 }));
    expect(isBusyMonth(recent, 100, 80)).toBe(false);
    expect(isBusyMonth(recent, 100 * (1 + coef('overtime.surge_threshold')) + 1, 80)).toBe(true);
    expect(isBusyMonth(recent, 100, 80 * (1 - coef('overtime.capacity_drop_threshold')) - 1)).toBe(true);
    // 慢性的な人手不足（需要が上限よりずっと大きいが、変わっていない）は繁忙ではない
    expect(isBusyMonth(Array.from({ length: 6 }, () => ({ demand: 300, capacity: 80 })), 300, 80)).toBe(false);
    expect(isBusyMonth([], 500, 10)).toBe(false);
  });

  it('25年回すと、残業が方針の上限に張り付く月はわずか（繁忙の月だけ）', () => {
    const c = runToEnd(generateCompany({ seed: 6, industryId: 'trading', autoPlay: { legal: 'immediate' } }), 120);
    const months = c.history.filter((r) => overtimeCap(r.policies?.overtime ?? 'limit45') > 0);
    const atCap = months.filter((r) => r.overtimeHours >= overtimeCap(r.policies!.overtime) - 0.01);
    expect(atCap.length / months.length).toBeLessThan(0.25);
    for (const r of atCap) expect(r.busy).toBe(true);
  });
});

describe('ゲームの長さ（ステップ18）', () => {
  it('選んだ長さで終わる。省略すると係数台帳の長さ', () => {
    for (const years of [10, 15]) {
      const c = runToEnd(generateCompany({ seed: 7, industryId: 'saas', autoPlay: { legal: 'immediate' }, lengthYears: years }));
      if (c.status === 'timeout') expect(c.month).toBe(years * MONTHS_PER_YEAR);
      else expect(c.month).toBeLessThanOrEqual(years * MONTHS_PER_YEAR);
    }
    expect(generateCompany({ seed: 7 }).maxMonths).toBe(coef('end.max_months'));
  });
});
