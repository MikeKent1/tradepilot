'use client';

import { QueryProvider } from '@/components/providers/query-provider';
import { AuthProvider } from '@/lib/auth/auth-provider';
import { Sidebar } from '@/components/layout/sidebar';
import { ToastContainer } from '@/components/ui/toast';
import { ErrorBoundary } from '@/components/error-boundary';
import { useQueryErrorHandler } from '@/lib/hooks/use-query-error-handler';
import { useOnlineStatus } from '@/lib/hooks/use-online-status';
import { usePathname } from 'next/navigation';
import { OfflineBanner } from '@/components/ui/offline-banner';

function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isPublicPath = ['/login', '/signup'].includes(pathname);

  // Global error handler for React Query mutations
  useQueryErrorHandler();

  // Offline detection
  const online = useOnlineStatus();

  if (isPublicPath) {
    return (
      <ErrorBoundary>
        {children}
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <div className="flex min-h-screen">
        {!online && <OfflineBanner />}
        <Sidebar />
        <main className="flex-1 min-w-0 p-6">
          {children}
        </main>
        <ToastContainer />
      </div>
    </ErrorBoundary>
  );
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <QueryProvider>
      <AuthProvider>
        <AppLayout>{children}</AppLayout>
      </AuthProvider>
    </QueryProvider>
  );
}