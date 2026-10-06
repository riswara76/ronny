import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from './app/App';
import { AuthProvider } from './app/auth';
import { ToastProvider } from './components/toast';
import { AppError } from './lib/errors';
import './styles.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Business errors (P0001) are answers, not glitches: don't retry them.
      retry: (count, error) => !(error instanceof AppError && error.code !== 'NETWORK' && error.code !== 'UNKNOWN') && count < 2,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      networkMode: 'online',
    },
    mutations: { retry: false, networkMode: 'online' },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
