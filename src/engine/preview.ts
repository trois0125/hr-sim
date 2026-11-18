/**
 * 判断のモーダルに出す「予想される影響の方向」（§10、初級のみ）。ステップ9。
 *
 * - イベントの選択肢：効果のデータ（events.json の effects）から、何がどちらに動くかを自動で読み取る。
 *   データから読み取れないこと（あとで起きうること、法令上の問題）は、選択肢の hint に手で書く
 * - 制度の見直し：いまの会社をコピーして、変えた場合と変えない場合を同じ乱数で先まで回して比べる（forecast.ts）
 */
import type { EventEffects } from './types';

/** 影響を受けるもの */
export const IMPACT_KEYS = [
  'cash', // 手元資金（臨時の支出・収入）
  'laborCost', // 人件費（給与・賞与の上げ下げ）
  'engagement', // 社員全体の納得感
  'target', // 対象者本人の納得感
  'headcount', // 人が辞める
  'leave', // 休職に入る
  'hiring', // 採用の強さ（人数と採用費）
  'reputation', // 採用での評判（求人の埋まりやすさ）
  'demand', // 需要
  'compliance', // 法令違反の解消
] as const;
export type ImpactKey = (typeof IMPACT_KEYS)[number];
export type Impact = { key: ImpactKey; dir: 1 | -1 };

const sign = (x: number): 0 | 1 | -1 => (x > 0 ? 1 : x < 0 ? -1 : 0);

/** 選択肢の効果から、影響の方向を読み取る（動かないものは入れない） */
export function choiceImpacts(effects: EventEffects): Impact[] {
  const groups = effects.groups ?? [];
  const t = effects.target;
  const severance = groups.some((g) => g.resign && g.severanceMonths);
  const dirs: Record<ImpactKey, number> = {
    cash:
      (effects.correct || effects.payUnpaidOvertime || severance ? -1 : 0) ||
      sign((effects.cash ?? 0) + (effects.cashPerEmployee ?? 0) + (effects.cashRevenueMonths ?? 0)),
    laborCost: sign(
      groups.reduce((s, g) => s + (g.salaryPct ?? 0) + (g.bonusPct ?? 0), 0) + (t?.salaryPct ?? 0),
    ),
    engagement: sign(
      (effects.engagementAll ?? 0) +
        (effects.engagementOthers ?? 0) +
        (effects.morale?.delta ?? 0) +
        groups.reduce((s, g) => s + (g.engagement ?? 0), 0),
    ),
    target: sign(t?.engagement ?? 0),
    headcount: t?.resign || groups.some((g) => g.resign) ? -1 : 0,
    leave: t?.leave ? 1 : 0,
    hiring: sign((effects.hiringIntensity?.mult ?? 1) - 1),
    reputation: sign((effects.hiringAttraction?.mult ?? 1) - 1),
    demand: sign((effects.demand?.mult ?? 1) * (effects.matureDemandMult ?? 1) - 1),
    compliance: effects.correct || effects.payUnpaidOvertime ? 1 : 0,
  };
  return IMPACT_KEYS.flatMap((key) => (dirs[key] === 0 ? [] : [{ key, dir: dirs[key] as 1 | -1 }]));
}
