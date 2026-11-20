/** 手元資金の出入りの記録（臨時の支出と資金調達）。events.ts と organization.ts から使う */
import type { CompanyState } from './types';

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
