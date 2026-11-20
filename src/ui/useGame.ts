import { useStore } from 'zustand';
import { gameStore, type GameStore } from '../store/game';

/** ストアの一部を読む（変わったときだけ描き直す） */
export function useGame<T>(selector: (s: GameStore) => T): T {
  return useStore(gameStore, selector);
}

export const actions = () => gameStore.getState();
