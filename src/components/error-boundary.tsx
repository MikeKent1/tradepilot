'use client';

import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { AppError, parseSupabaseError } from '@/lib/errors';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  /** Custom fallback UI. Receives the parsed error and a reset callback. */
  fallback?: (error: AppError, reset: () => void) => React.ReactNode;
  /** Called when an error is caught */
  onError?: (error: AppError) => void;
}

interface ErrorBoundaryState {
  error: AppError | null;
}

/**
 * React Error Boundary that catches rendering errors in the component tree.
 * Parses any thrown error into an AppError and shows a user-friendly fallback UI.
 *
 * Usage:
 *   <ErrorBoundary fallback={(err, reset) => <div>{err.message} <button onClick={reset}>Retry</button></div>}>
 *     <RiskyComponent />
 *   </ErrorBoundary>
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error: parseSupabaseError(error) };
  }

  componentDidCatch(error: Error, _info: React.ErrorInfo) {
    const appErr = parseSupabaseError(error);
    if (process.env.NODE_ENV === 'development') {
      console.error('[ErrorBoundary]', appErr.code, appErr.message, error);
    }
    this.props.onError?.(appErr);
  }

  handleReset = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.handleReset);
      }

      // Default fallback UI
      return (
        <div className="flex items-center justify-center min-h-[400px] p-8">
          <div className="glass-card p-8 max-w-md w-full text-center space-y-4">
            <div className="mx-auto w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-red-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-zinc-200">Something went wrong</h2>
              <p className="text-sm text-zinc-400 mt-2">{this.state.error.message}</p>
            </div>
            <button
              onClick={this.handleReset}
              className="btn-primary inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium"
            >
              <RefreshCw className="w-4 h-4" />
              Try Again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Functional wrapper for ErrorBoundary with default fallback.
 * Use this as a simpler alternative to the class component.
 */
export function ErrorBoundaryWrapper({
  children,
  context = 'component',
  onError,
}: {
  children: React.ReactNode;
  context?: string;
  onError?: (error: AppError) => void;
}) {
  return (
    <ErrorBoundary
      onError={onError}
      fallback={(err, reset) => (
        <div className="flex items-center justify-center min-h-[400px] p-8">
          <div className="glass-card p-8 max-w-md w-full text-center space-y-4">
            <div className="mx-auto w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-red-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-zinc-200">Error loading {context}</h2>
              <p className="text-sm text-zinc-400 mt-2">{err.message}</p>
            </div>
            <button
              onClick={reset}
              className="btn-primary inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium"
            >
              <RefreshCw className="w-4 h-4" />
              Try Again
            </button>
          </div>
        </div>
      )}
    >
      {children}
    </ErrorBoundary>
  );
}