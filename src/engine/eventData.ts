/** イベントデータ（events.json）を型付きで読む */
import eventsJson from '../data/events.json';
import type { EventDef } from './types';

export const eventDefs = eventsJson as EventDef[];
