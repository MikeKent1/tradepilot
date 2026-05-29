'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/lib/hooks/use-toast';
import { useAuth } from '@/lib/auth/auth-provider';
import { parseSupabaseError, isAuthError } from '@/lib/errors';

/**
 * Subscribes to all React Query query/mutation failures
 * and shows a toast notification for each error.
 *
 * Place this once inside AppLayout (inside AuthProvider + QueryClientProvider).
 */
export function useQueryErrorHandler() {
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const { signOut } = useAuth();

  useEffect(() => {
    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      // Handle failed queries
      if (event.type === 'observerResultsUpdated') {
        const query = event.query;
        if (query.state.status === 'error' && query.state.error) {
          handleQueryError(query.state.error);
        }
      }

      // Handle failed mutations via the MutationCache
    });

    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryClient, addToast, signOut]);

  useEffect(() => {
    const unsubscribe = queryClient.getMutationCache().subscribe((event) => {
      if (
        event.type === 'updated' &&
        event.mutation?.state?.status === 'error' &&
        event.mutation.state.error
      ) {
        handleMutationError(event.mutation.state.error);
      }
    });

    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryClient, addToast, signOut]);

  function handleQueryError(error: unknown) {
    // Skip update-type errors like "observerResultsUpdated" without change
    // The error is already handled by the component's `error` state
    // We only log to console here, individual components handle their own UI
  }

  function handleMutationError(error: unknown) {
    const appErr = parseSupabaseError(error);

    if (process.env.NODE_ENV === 'development') {
      console.error('[Mutation Error]', appErr.code, appErr.message, appErr.originalError ?? '');
    }

    addToast(appErr.message, appErr.severity, appErr.code);

    if (isAuthError(appErr)) {
      signOut();
    }
  }
}