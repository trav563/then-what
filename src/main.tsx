import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Only seed the local database in development mode (for admin preview)
if (import.meta.env.DEV) {
  const { initDB, sweepPuzzleLifecycle } = await import('./services/db');
  initDB();
  sweepPuzzleLifecycle();
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
