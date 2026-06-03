'use client';

import { useNotificationStore, type Toast } from '@/stores/notification-store';
import { cn } from '@/lib/utils';
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-react';

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

function ToastItem({ toast }: { toast: Toast }) {
  const dismiss = useNotificationStore((s) => s.dismissNotification);
  const Icon = iconMap[toast.type];

  return (
    <div
      className={cn(
        'glass-card p-3 border animate-slide-in pointer-events-auto flex items-start gap-3',
        colorMap[toast.type],
      )}
      role="alert"
    >
      <Icon className={cn('w-4 h-4 mt-0.5 shrink-0', iconColorMap[toast.type])} />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-zinc-200">{toast.title}</p>
        {toast.message && <p className="text-xs text-zinc-400 mt-0.5">{toast.message}</p>}
      </div>
      <button
        onClick={() => dismiss(toast.id)}
        className="text-zinc-500 hover:text-zinc-300 shrink-0 cursor-pointer p-0.5 rounded hover:bg-white/5"
        aria-label="Dismiss"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

export function ToastNotifications() {
  const toasts = useNotificationStore((s) => s.toasts);

  // Show only the 5 most recent
  const visible = toasts.slice(-5);

  if (visible.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[100] space-y-2 w-80 pointer-events-none">
      {visible.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>
  );
}