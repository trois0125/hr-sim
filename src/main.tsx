import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import { gameStore } from './store/game';
import './ui/styles.css';

// 開発中は、動作の確認のためにストアを触れるようにする
if (import.meta.env.DEV) (window as unknown as { __game: typeof gameStore }).__game = gameStore;

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
