'use client';

// ── Error severity levels ────────────────────────────────
export type ErrorSeverity = 'error' | 'warning' | 'info';

// ── Error codes ──────────────────────────────────────────
export type ErrorCode =
  | 'NETWORK_ERROR'
  | 'AUTH_ERROR'
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'PERMISSION_DENIED'
  | 'RATE_LIMITED'
  | 'SERVER_ERROR'
  | 'UNKNOWN_ERROR';

// ── AppError class ───────────────────────────────────────
export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly severity: ErrorSeverity;
  public readonly retryable: boolean;
  public readonly originalError?: unknown;

  constructor(opts: {
    message: string;
    code?: ErrorCode;
    severity?: ErrorSeverity;
    retryable?: boolean;
    originalError?: unknown;
  }) {
    super(opts.message);
    this.name = 'AppError';
    this.code = opts.code ?? 'UNKNOWN_ERROR';
    this.severity = opts.severity ?? 'error';
    this.retryable = opts.retryable ?? false;
    this.originalError = opts.originalError;
  }
}

// ── Error parsing utilities ──────────────────────────────

interface SupabaseErrorLike {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
  status?: number;
}

function isSupabaseError(err: unknown): err is SupabaseErrorLike {
  if (!err || typeof err !== 'object') return false;
  const obj = err as Record<string, unknown>;
  return 'code' in obj || 'details' in obj || 'hint' in obj;
}

export function parseSupabaseError(err: unknown): AppError {
  if (err instanceof AppError) return err;

  if (err instanceof Error) {
    // Network / fetch errors
    if (
      err.message.includes('fetch') ||
      err.message.includes('network') ||
      err.message.includes('Failed to fetch') ||
      err.message.includes('NetworkError') ||
      err.message.includes('ECONNREFUSED') ||
      err.message.includes('ENOTFOUND')
    ) {
      return new AppError({
        message: 'Network error. Please check your connection and try again.',
        code: 'NETWORK_ERROR',
        severity: 'error',
        retryable: true,
        originalError: err,
      });
    }

    // Timeout
    if (err.message.includes('timeout') || err.message.includes('timed out')) {
      return new AppError({
        message: 'Request timed out. Please try again.',
        code: 'NETWORK_ERROR',
        severity: 'error',
        retryable: true,
        originalError: err,
      });
    }
  }

  if (isSupabaseError(err)) {
    const status = err.status ?? 0;
    const code = err.code ?? '';

    // Auth errors (401)
    if (status === 401 || code === 'PGRST301' || code === '401') {
      return new AppError({
        message: 'Session expired. Please log in again.',
        code: 'AUTH_ERROR',
        severity: 'error',
        retryable: false,
        originalError: err,
      });
    }

    // Permission denied (403)
    if (status === 403 || code === '42501') {
      return new AppError({
        message: 'You do not have permission to perform this action.',
        code: 'PERMISSION_DENIED',
        severity: 'error',
        retryable: false,
        originalError: err,
      });
    }

    // Not found (404 / 406)
    if (status === 404 || status === 406 || code === 'PGRST116') {
      return new AppError({
        message: 'The requested resource was not found.',
        code: 'NOT_FOUND',
        severity: 'warning',
        retryable: false,
        originalError: err,
      });
    }

    // Rate limited (429)
    if (status === 429) {
      return new AppError({
        message: 'Too many requests. Please wait a moment and try again.',
        code: 'RATE_LIMITED',
        severity: 'warning',
        retryable: true,
        originalError: err,
      });
    }

    // Validation / constraint errors
    if (
      code === '23505' ||
      code === '23503' ||
      code === '23502' ||
      code === '22P02'
    ) {
      return new AppError({
        message: err.message || 'Invalid data. Please check your input.',
        code: 'VALIDATION_ERROR',
        severity: 'warning',
        retryable: false,
        originalError: err,
      });
    }

    // Server errors (500+)
    if (status >= 500) {
      return new AppError({
        message: 'Server error. Please try again later.',
        code: 'SERVER_ERROR',
        severity: 'error',
        retryable: true,
        originalError: err,
      });
    }
  }

  // Fallback for unknown errors
  const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
  return new AppError({
    message,
    code: 'UNKNOWN_ERROR',
    severity: 'error',
    retryable: true,
    originalError: err,
  });
}

// ── Error type guards ────────────────────────────────────

export function isRetryableError(err: unknown): boolean {
  const appErr = err instanceof AppError ? err : parseSupabaseError(err);
  return appErr.retryable;
}

export function isAuthError(err: unknown): boolean {
  const appErr = err instanceof AppError ? err : parseSupabaseError(err);
  return appErr.code === 'AUTH_ERROR';
}

export function isNetworkError(err: unknown): boolean {
  const appErr = err instanceof AppError ? err : parseSupabaseError(err);
  return appErr.code === 'NETWORK_ERROR';
}