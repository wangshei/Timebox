
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';
import './styles/globals.css';
import { hydrateFromLocalStorage, startLocalStoragePersistence } from './store/useStore';

// Phase 2: local persistence bootstrap (runs once on startup in browser)
if (typeof window !== 'undefined') {
  hydrateFromLocalStorage();
  startLocalStoragePersistence();
}

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
  