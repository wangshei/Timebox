
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { InvitePage } from './components/InvitePage';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';
import './styles/globals.css';
import { hydrateFromLocalStorage, startLocalStoragePersistence } from './store/useStore';

// Check if we're on the /invite/:token route
function getInviteToken(): string | null {
  const match = window.location.pathname.match(/^\/invite\/([a-f0-9]+)$/);
  return match ? match[1] : null;
}

const inviteToken = getInviteToken();

// Phase 2: local persistence bootstrap (runs once on startup in browser)
if (!inviteToken && typeof window !== 'undefined') {
  hydrateFromLocalStorage();
  startLocalStoragePersistence();
}

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    {inviteToken ? <InvitePage token={inviteToken} /> : <App />}
  </ErrorBoundary>
);
  