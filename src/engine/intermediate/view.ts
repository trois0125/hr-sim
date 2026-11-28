/**
 * 中級の状態を、初級の画面で読める形（CompanyState）にする（DESIGN.md §15、ステップ22）。
 *
 * 初級のメイン画面・事業タブ・組織タブ・終了画面を使い回すため、層を「一人ひとり」に広げ、
 * 月の記録（monthly）を初級の history として渡す。中級で扱わない部分（組織・法令・施策など）は生成したときのまま。
 * 表示のためだけの形で、ここから中級の状態に戻すことはない。
 */
import type { CompanyState, Employee } from '../types';
import { MONTHS_PER_YEAR } from '../types';
import type { IntermediateState } from './types';

/** 層を一人ひとりに広げる（画面で選べるように、別々の番号を付ける） */
/** 層の名前の付け方（画面の文言は画面の側で決める。省略すると層のキー） */
export type LayerNamer = (rep: Employee) => string;

export function viewEmployees(state: Pick<IntermediateState, 'layers'>, namer?: LayerNamer): Employee[] {
  const out: Employee[] = [];
  for (const l of state.layers) {
    const name = namer ? namer(l.rep) : l.rep.name;
    for (let i = 0; i < l.headcount; i++) out.push({ ...l.rep, id: `${l.key}#${i}`, name });
  }
  return out;
}

export function toCompanyView(state: IntermediateState, namer?: LayerNamer): CompanyState {
  return {
    ...state.base,
    seed: state.seed,
    month: state.year * MONTHS_PER_YEAR,
    maxMonths: state.maxYears * MONTHS_PER_YEAR,
    status: state.status,
    profile: state.profile,
    policies: state.policies,
    cash: state.cash,
    negativeCashMonths: state.negativeCashMonths,
    employees: viewEmployees(state, namer),
    market: state.market,
    hiring: state.hiring,
    history: state.monthly,
    departures: state.departures,
    pendingDecisions: [],
    autoPlay: null,
  };
}
