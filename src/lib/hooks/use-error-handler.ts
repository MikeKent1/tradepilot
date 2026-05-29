'use client';

import { useCallback } from 'react';
import { useToast } from '@/lib/hooks/use-toast';
import { parseSupabaseError, AppError, isAuthError } from '@/lib/errors';
import { useAuth } from '@/lib/auth/auth-provider';

interface ErrorHandlerOptions {
  /** Custom error message to override the parsed one */
  message?: string;
  /** Context label for logging (e.g. 'fetchPortfolio', 'upsertStrategy') */
  context?: string;
  /** Called after the error is displayed */
  onError?: (err: AppError) => void;
  /** If true, auth errors will trigger signOut */
  signOutOnAuth?: boolean;
}

/**
 * Unified error handler hook.
 * Parses any thrown error into an AppError, shows a toast, and optionally triggers signOut.
 *
 * Usage:
 *   const handleError = useErrorHandler({ context: 'fetchPortfolio' });
 *   try { ... } catch (err) { handleError(err); }
 */
export function useErrorHandler(defaults?: ErrorHandlerOptions) {
  const { addToast } = useToast();
  const { signOut } = useAuth();

  const handleError = useCallback(
    (err: unknown, overrides?: ErrorHandlerOptions) => {
      const opts = { ...defaults, ...overrides };
      const appErr = parseSupabaseError(err);

      // Log to console with context for debugging
      if (process.env.NODE_ENV === 'development') {
        const ctx = opts.context ? `[${opts.context}]` : '';
        console.error(`${ctx} ${appErr.code}:`, appErr.message, appErr.originalError ?? '');
      }

      // Show toast notification
      addToast(opts.message ?? appErr.message, appErr.severity);

      // Auto sign-out on auth errors
      if ((opts.signOutOnAuth ?? true) && isAuthError(appErr)) {
        signOut();
      }

      // Optional callback
      opts.onError?.(appErr);
    },
    [addToast, signOut, defaults],
  );

  return handleError;
}