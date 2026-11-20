/** イベントデータ（events.json）を型付きで読む */
import eventsJson from '../data/events.json';
import type { EventDef, IndustryId } from './types';

export const eventDefs = eventsJson as EventDef[];

/**
 * 業種に合わせた文にしたイベント（タイトル・本文・選択肢の名前と学びと補足）。
 * 画面・フィード・社史など、イベントの文を見せるところはすべてこれを通す
 */
export function localizeEvent(event: EventDef, industryId: IndustryId): EventDef {
  const t = event.textByIndustry?.[industryId];
  if (!t) return event;
  return {
    ...event,
    title: t.title ?? event.title,
    body: t.body ?? event.body,
    choices: event.choices.map((c, i) => {
      const o = t.choices?.[i];
      return o ? { ...c, label: o.label ?? c.label, lesson: o.lesson ?? c.lesson, hint: o.hint ?? c.hint } : c;
    }),
  };
}
