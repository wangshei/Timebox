
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { InvitePage } from './components/InvitePage';
import { GcalCallbackPage } from './components/GcalCallbackPage';
import { DesktopPage } from './components/DesktopPage';
import { BookingPage } from './components/BookingPage';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';
import './styles/globals.css';
import { hydrateFromLocalStorage, startLocalStoragePersistence } from './store/useStore';

// Check if we're on the /desktop route
function isDesktopPage(): boolean {
  return window.location.pathname === '/desktop';
}

// Check if we're on the /invite/:token route
function getInviteToken(): string | null {
  const match = window.location.pathname.match(/^\/invite\/([a-f0-9]+)$/);
  return match ? match[1] : null;
}

// Check if we're on the /book/:slug route
function getBookingSlug(): string | null {
  const match = window.location.pathname.match(/^\/book\/([a-zA-Z0-9_-]+)$/);
  return match ? match[1] : null;
}

// Check if we're on the /gcal-callback route
function getGcalCode(): string | null {
  if (window.location.pathname !== '/gcal-callback') return null;
  const params = new URLSearchParams(window.location.search);
  return params.get('code');
}

const desktopPage = isDesktopPage();
const inviteToken = getInviteToken();
const bookingSlug = getBookingSlug();
const gcalCode = getGcalCode();

// Phase 2: local persistence bootstrap (runs once on startup in browser)
if (!inviteToken && !gcalCode && !desktopPage && typeof window !== 'undefined') {
  hydrateFromLocalStorage();
  startLocalStoragePersistence();
}

// For gcal callback, we still need localStorage hydrated so supabase auth works
if (gcalCode && typeof window !== 'undefined') {
  hydrateFromLocalStorage();
  startLocalStoragePersistence();
}

// Update canonical URL for the current page
(() => {
  const canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
  if (canonical) {
    const base = 'https://app.timeboxing.club';
    const path = window.location.pathname;
    // Only set canonical for indexable pages
    if (path === '/' || path === '/desktop') {
      canonical.href = `${base}${path}`;
    } else if (path.startsWith('/book/')) {
      canonical.href = `${base}${path}`;
    } else {
      // Non-indexable pages: remove canonical to avoid confusing crawlers
      canonical.remove();
    }
  }
})();

let content: React.ReactNode;
if (desktopPage) {
  content = <DesktopPage />;
} else if (bookingSlug) {
  content = <BookingPage slug={bookingSlug} />;
} else if (inviteToken) {
  content = <InvitePage token={inviteToken} />;
} else if (gcalCode) {
  content = <GcalCallbackPage code={gcalCode} />;
} else {
  content = <App />;
}

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    {content}
  </ErrorBoundary>
);
