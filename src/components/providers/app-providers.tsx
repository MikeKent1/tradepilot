'use client';

import { QueryProvider } from '@/components/providers/query-provider';
import { ThemeProvider } from '@/components/providers/theme-provider';
import { AuthProvider } from '@/lib/auth/auth-provider';
import { Sidebar } from '@/components/layout/sidebar';
import { ToastContainer } from '@/components/ui/toast';
import { ToastNotifications } from '@/components/ui/toast-notifications';
import { ErrorBoundary } from '@/components/error-boundary';
import { useQueryErrorHandler } from '@/lib/hooks/use-query-error-handler';
import { useOnlineStatus } from '@/lib/hooks/use-online-status';
import { usePathname } from 'next/navigation';
import { OfflineBanner } from '@/components/ui/offline-banner';
import { useGlobalShortcuts } from '@/lib/hooks/use-keyboard-shortcuts';
import { KeyboardShortcutsModal } from '@/components/ui/keyboard-shortcuts-modal';
import { useAppStore } from '@/stores/app-store';
import { Menu } from 'lucide-react';

function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isPublicPath = ['/login', '/signup'].includes(pathname);

  // Global error handler for React Query mutations
  useQueryErrorHandler();

  // Offline detection
  const online = useOnlineStatus();

  // Keyboard shortcuts
  useGlobalShortcuts();

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
        {/* Mobile hamburger */}
        <button
          className="fixed top-3 left-3 z-30 p-2 rounded-lg bg-card border border-card-border text-muted-foreground hover:text-foreground lg:hidden"
          onClick={() => useAppStore.getState().setMobileSidebarOpen(true)}
          aria-label="Open menu"
        >
          <Menu className="w-5 h-5" />
        </button>
        <Sidebar />
        <main className="flex-1 min-w-0 p-4 lg:p-6 pt-14 lg:pt-6">
          {children}
        </main>
        <ToastContainer />
        <ToastNotifications />
        <KeyboardShortcutsModal />
      </div>
    </ErrorBoundary>
  );
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <QueryProvider>
      <ThemeProvider>
        <AuthProvider>
          <AppLayout>{children}</AppLayout>
        </AuthProvider>
      </ThemeProvider>
    </QueryProvider>
  );
}