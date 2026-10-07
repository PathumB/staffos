import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { Toaster } from 'sonner';
import { createQueryClient } from './app/query-client';
import { router } from './app/router';
import { ThemeProvider, useTheme } from './app/theme';
import { AuthProvider } from './features/auth/AuthProvider';
import './index.css';

const queryClient = createQueryClient();

function ThemedToaster() {
  const { theme } = useTheme();
  return <Toaster theme={theme} position="top-right" closeButton />;
}

const root = document.getElementById('root');
if (!root) {
  throw new Error('Missing #root element');
}

createRoot(root).render(
  <StrictMode>
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <RouterProvider router={router} />
          <ThemedToaster />
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
);
