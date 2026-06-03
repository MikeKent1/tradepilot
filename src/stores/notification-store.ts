'use client';

import { create } from 'zustand';

// ════════════════════════════════════════════════════════════════════════
// Toast Notification Store
//
//  Global toast notification system. Components call showNotification()
//  to display non-blocking toasts. The ToastProvider component renders
//  them in the bottom-right corner of the viewport.
//
//  Types mirror the Notification interface from types/index.ts.
// ════════════════════════════════════════════════════════════════════════

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message: string;
  timestamp: string;
  durationMs?: number; // auto-dismiss after this many ms (default: 5000)
}

interface NotificationStore {
  toasts: Toast[];
  showNotification: (toast: Omit<Toast, 'id' | 'timestamp'>) => string;
  dismissNotification: (id: string) => void;
  dismissAll: () => void;
}

let toastCounter = 0;

export const useNotificationStore = create<NotificationStore>((set, get) => ({
  toasts: [],

  showNotification: (toast) => {
    const id = `toast-${++toastCounter}-${Date.now()}`;
    const duration = toast.durationMs ?? 5000;

    const newToast: Toast = {
      ...toast,
      id,
      timestamp: new Date().toISOString(),
    };

    set((s) => ({ toasts: [...s.toasts, newToast] }));

    // Auto-dismiss
    if (duration > 0) {
      setTimeout(() => {
        get().dismissNotification(id);
      }, duration);
    }

    return id;
  },

  dismissNotification: (id) => {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },

  dismissAll: () => {
    set({ toasts: [] });
  },
}));

// ── Convenience helpers ──────────────────────────────────────────────

export function showSuccess(title: string, message = '') {
  return useNotificationStore.getState().showNotification({
    type: 'success',
    title,
    message,
  });
}

export function showError(title: string, message = '') {
  return useNotificationStore.getState().showNotification({
    type: 'error',
    title,
    message,
  });
}

export function showWarning(title: string, message = '') {
  return useNotificationStore.getState().showNotification({
    type: 'warning',
    title,
    message,
  });
}

export function showInfo(title: string, message = '') {
  return useNotificationStore.getState().showNotification({
    type: 'info',
    title,
    message,
  });
}