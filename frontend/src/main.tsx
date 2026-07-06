import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { initSentry, Sentry } from './sentry';
import App from './App';
import { registerSW } from './registerSW';
import './index.css';
import './i18n';

// Sentry init must happen BEFORE any React tree is mounted so its error
// boundary + performance instrumentation attach cleanly.
initSentry();

// ── React Query client ────────────────────────────────────────────────────────
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: (failureCount, error: any) => {
        // Don't retry on 4xx errors
        if (error?.response?.status >= 400 && error?.response?.status < 500) {
          return false;
        }
        return failureCount < 2;
      },
    },
  },
});

// ── PWA Service Worker ────────────────────────────────────────────────────────
registerSW();

// ── Render ────────────────────────────────────────────────────────────────────
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Sentry.ErrorBoundary
      fallback={
        <div
          style={{
            padding: '2rem',
            textAlign: 'center',
            fontFamily: 'sans-serif',
          }}
        >
          <h1>Une erreur inattendue est survenue</h1>
          <p>L'incident a été signalé. Rechargez la page pour réessayer.</p>
          <button onClick={() => window.location.reload()}>Recharger</button>
        </div>
      }
    >
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    </Sentry.ErrorBoundary>
  </React.StrictMode>,
);
