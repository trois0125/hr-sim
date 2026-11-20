/**
 * 制度を変えた場合の試算（判断のモーダルの「予想される影響の方向」）。ステップ9。
 *
 * いまの会社をコピーし、変えた場合と変えない場合を、同じ乱数で決まった月数だけ先まで回して比べる。
 * イベントの乱数は月ごとに決まるので、2つの未来は同じ出来事に出会う（違いは制度による）。
 * 試算の中の判断は自動（法令はすぐ対応、イベントは傾向なし）で進める。元の状態は変えない
 */
import { coef } from './coefficients';
import { changePolicies, previewChange, type ChangeOptions } from './policyChange';
import { runToEnd } from './tick';
import type { CompanyState, MonthlyRecord, PolicySet } from './types';

export type ForecastResult = {
  months: number;
  /** 変えた場合 − 変えない場合（試算の期間の合計） */
  laborCost: number;
  /** 営業利益 − 臨時の支出 */
  netProfit: number;
  /** 納得感の平均の差（点） */
  engagement: number;
  /** 退職者の数の差 */
  resignations: number;
  /** 変えない場合の人件費の合計（差の大きさを見るため） */
  baseLaborCost: number;
  /** 給与や賞与が下がる人の数 */
  cuts: number;
};

function totals(records: readonly MonthlyRecord[]) {
  let labor = 0;
  let net = 0;
  let eng = 0;
  let resign = 0;
  for (const r of records) {
    labor += r.labor.total;
    net += r.operatingProfit - r.extraordinaryCost;
    eng += r.avgEngagement;
    resign += r.resignations;
  }
  return { labor, net, eng: records.length > 0 ? eng / records.length : 0, resign };
}

export function forecastChange(
  state: CompanyState,
  next: PolicySet,
  options: ChangeOptions = {},
  months = coef('ui.forecast_months'),
): ForecastResult {
  const base = structuredClone(state);
  base.autoPlay = { legal: 'immediate' };
  base.pendingDecisions = [];
  const start = base.history.length;
  const changed = changePolicies(base, next, options);
  const a = totals(runToEnd(base, months).history.slice(start));
  const b = totals(runToEnd(changed, months).history.slice(start));
  return {
    months,
    laborCost: b.labor - a.labor,
    netProfit: b.net - a.net,
    engagement: b.eng - a.eng,
    resignations: b.resign - a.resign,
    baseLaborCost: a.labor,
    cuts: previewChange(state, next).cuts.size,
  };
}
