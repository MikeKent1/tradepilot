'use client';

import { QueryProvider } from '@/components/providers/query-provider';
import { AuthProvider } from '@/lib/auth/auth-provider';
import { Sidebar } from '@/components/layout/sidebar';
import { ToastContainer } from '@/components/ui/toast';
import { usePathname } from 'next/navigation';
function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isPublicPath = ['/login', '/signup'].includes(pathname);

  if (isPublicPath) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 min-w-0 p-6">
        {children}
      </main>
      <ToastContainer />
    </div>
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