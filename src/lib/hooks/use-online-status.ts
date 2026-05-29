'use client';

import { useState, useEffect } from 'react';

/**
 * Tracks browser online/offline status.
 * Returns `true` when the browser has network connectivity.
 */
export function useOnlineStatus(): boolean {
  // Always start as true for SSR/hydration consistency.
  // The real value is set in useEffect on the client.
  const [online, setOnline] = useState(true);

  useEffect(() => {
    // Set the real initial value on mount
    setOnline(navigator.onLine);

    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return online;
}