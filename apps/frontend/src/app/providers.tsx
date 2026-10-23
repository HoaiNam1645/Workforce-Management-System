'use client';

import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { AuthProvider } from '@/components/auth/auth-provider';
import { ToastViewport } from '@/components/ui/toast-viewport';
import { GlobalActivityIndicator } from '@/components/ui/global-activity-indicator';
import { showToast } from '@/lib/toast';
import { ApiError } from '@/lib/api-client';

type MutationFeedbackMeta = { successMessage?: string | false; errorMessage?: string | false };

export function Providers({ children }: Readonly<{ children: React.ReactNode }>) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        mutationCache: new MutationCache({
          onSuccess: (_data, _variables, _context, mutation) => {
            const meta = mutation.options.meta as MutationFeedbackMeta | undefined;
            if (meta?.successMessage === false) return;
            showToast({ title: meta?.successMessage || 'Cập nhật thành công', description: 'Dữ liệu mới đã được ghi nhận.', tone: 'success' });
          },
          onError: (error, _variables, _context, mutation) => {
            const meta = mutation.options.meta as MutationFeedbackMeta | undefined;
            if (meta?.errorMessage === false) return;
            showToast({ title: meta?.errorMessage || 'Không thể thực hiện thao tác', description: error instanceof Error ? error.message : 'Vui lòng thử lại.', tone: 'error', duration: 6000 });
          },
        }),
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            staleTime: 30_000,
            retry: (failureCount, error) => {
              // Retrying validation, permission, or missing-configuration errors
              // only delays the actionable message shown to the user.
              if (error instanceof ApiError && error.status < 500) return false;
              return failureCount < 2;
            },
          },
        },
      }),
  );

  return <QueryClientProvider client={queryClient}><AuthProvider>{children}<GlobalActivityIndicator /><ToastViewport /></AuthProvider></QueryClientProvider>;
}
