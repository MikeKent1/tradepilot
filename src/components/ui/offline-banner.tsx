'use client';

import { WifiOff } from 'lucide-react';

/**
 * Banner shown at the top of the screen when the browser is offline.
 */
export function OfflineBanner() {
  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-amber-500/90 backdrop-blur-sm text-amber-950 text-xs font-medium py-1.5 px-4 flex items-center justify-center gap-2 animate-slide-in">
      <WifiOff className="w-3.5 h-3.5" />
      <span>You are offline. Some features may be unavailable.</span>
    </div>
  );
}