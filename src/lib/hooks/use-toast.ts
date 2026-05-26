'use client';

import { useNotificationsData } from '@/lib/hooks/use-notifications-data';
import type { Notification } from '@/types';

export function useToast() {
  const { addNotification } = useNotificationsData();

  const addToast = (message: string, type: Notification['type'] = 'info', title?: string) => {
    addNotification({
      title: title ?? type.charAt(0).toUpperCase() + type.slice(1),
      message,
      type,
    });
  };

  return { addToast };
}