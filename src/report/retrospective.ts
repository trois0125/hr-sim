/**
 * 社史レポートの「変更の振り返り」（DESIGN.md §14.7。ステップ20）。
 * 途中で変えた制度・打った施策・個別制度・組織改編について、前・直後・1年後の数字を今ある記録から組み立てる。
 * 文言は画面（src/ui/strings.ts）でつける。乱数は使わない。
 */
import { coef } from '../engine/coefficients';
import { eventDefs } from '../engine/eventData';
import type { ChangeMethod, CompanyState, OrgForm, PolicySet, ProgramId } from '../engine/types';
import { policiesAt } from './history';

// ---------------------------------------------------------------------------
// 変更の拾い出しとまとめ
// ---------------------------------------------------------------------------

export type ChangeItem =
  | { month: number; kind: 'policy'; changes: { category: keyof PolicySet; option: string }[]; method: ChangeMethod | null }
  | { month: number; kind: 'initiative'; eventId: string; choiceIndex: number }
  | { month: number; kind: 'program'; programId: ProgramId; action: 'install' | 'stop' }
  | { month: number; kind: 'reorg'; from: OrgForm; to: OrgForm };

export type ChangeGroup = { first: number; last: number; items: ChangeItem[] };

const KIND_ORDER: Record<ChangeItem['kind'], number> = { policy: 0, initiative: 1, program: 2, reorg: 3 };

/** 振り返りの対象の変更（月の順。同じ月は制度・施策・個別制度・組織改編の順）。創業時の制度は変更ではないので入らない */
export function collectChanges(state: CompanyState): ChangeItem[] {
  const out: ChangeItem[] = [];
  for (const c of state.policyChanges) {
    const after = policiesAt(state, c.month);
    out.push({
      month: c.month,
      kind: 'policy',
      changes: c.categories.map((category) => ({ category, option: after[category] })),
      method: c.method,
    });
  }
  for (const d of state.decisions) {
    if (eventDefs.find((e) => e.id === d.eventId)?.trigger.type !== 'initiative') continue;
    out.push({ month: d.month, kind: 'initiative', eventId: d.eventId, choiceIndex: d.choiceIndex });
  }
  for (const p of state.programLog) out.push({ month: p.month, kind: 'program', programId: p.id, action: p.action });
  for (const r of state.organization.log) out.push({ month: r.month, kind: 'reorg', from: r.from, to: r.to });
  return out
    .map((x, i) => ({ x, i }))
    .sort((a, b) => a.x.month - b.x.month || KIND_ORDER[a.x.kind] - KIND_ORDER[b.x.kind] || a.i - b.i)
    .map((y) => y.x);
}

/** 前の変更から間隔（係数台帳）以内の変更を、1つのまとまりにする */
export function groupChanges(items: readonly ChangeItem[]): ChangeGroup[] {
  const gap = coef('retrospective.group_gap_months');
  const out: ChangeGroup[] = [];
  for (const item of items) {
    const g = out[out.length - 1];
    if (g && item.month - g.last <= gap) {
      g.items.push(item);
      g.last = item.month;
    } else {
      out.push({ first: item.month, last: item.month, items: [item] });
    }
  }
  return out;
}
