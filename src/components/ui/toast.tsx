'use client';

import { useNotificationsData } from '@/lib/hooks/use-notifications-data';
import { cn } from '@/lib/utils';
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-react';
import { useEffect, useCallback, useRef } from 'react';

const iconMap = {
  success: CheckCircle,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

const colorMap = {
  success: 'border-emerald-500/50 bg-emerald-500/10',
  error: 'border-red-500/50 bg-red-500/10',
  warning: 'border-yellow-500/50 bg-yellow-500/10',
  info: 'border-blue-500/50 bg-blue-500/10',
};

const iconColorMap = {
  success: 'text-emerald-400',
  error: 'text-red-400',
  warning: 'text-yellow-400',
  info: 'text-blue-400',
};

export function ToastContainer() {
  const { notifications, markAsRead, removeNotification } = useNotificationsData();

  const unread = notifications.filter((n) => !n.read);

  // Auto-dismiss after 6 seconds
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const clearTimer = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  useEffect(() => {
    for (const n of unread) {
      if (!timersRef.current.has(n.id)) {
        const timer = setTimeout(() => {
          markAsRead(n.id);
          timersRef.current.delete(n.id);
        }, 6000);
        timersRef.current.set(n.id, timer);
      }
    }
    // Cleanup timers for notifications no longer in the list
    const currentIds = new Set(unread.map((n) => n.id));
    for (const [id, timer] of timersRef.current.entries()) {
      if (!currentIds.has(id)) {
        clearTimeout(timer);
        timersRef.current.delete(id);
      }
    }
  }, [unread, markAsRead]);

  const handleDismiss = useCallback(
    (id: string) => {
      clearTimer(id);
      removeNotification(id);
    },
    [clearTimer, removeNotification],
  );

  // Show only the 5 most recent unread notifications
  const visible = unread.slice(0, 5);

  if (visible.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2 w-80 pointer-events-none">
      {visible.map((notif) => {
        const Icon = iconMap[notif.type];
        return (
          <div
            key={notif.id}
            className={cn(
              'glass-card p-3 border animate-slide-in pointer-events-auto flex items-start gap-3',
              colorMap[notif.type],
            )}
          >
            <Icon className={cn('w-4 h-4 mt-0.5 shrink-0', iconColorMap[notif.type])} />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-zinc-200">{notif.title}</p>
              <p className="text-xs text-zinc-400 mt-0.5">{notif.message}</p>
            </div>
            <button
              onClick={() => handleDismiss(notif.id)}
              className="text-zinc-500 hover:text-zinc-300 shrink-0 cursor-pointer p-0.5 rounded hover:bg-white/5"
              aria-label="Dismiss"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}