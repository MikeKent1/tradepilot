'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth/auth-provider';
import * as dataService from '@/lib/services/data-service';
import type { Notification } from '@/types';

export function useNotificationsData() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const notificationsQuery = useQuery({
    queryKey: ['notifications', user?.id],
    queryFn: async (): Promise<Notification[]> => {
      if (!user?.id) return [];
      return dataService.fetchNotifications(user.id);
    },
    enabled: !!user?.id,
    refetchInterval: 30_000, // poll every 30s
  });

  const markReadMutation = useMutation({
    mutationFn: async (id: string) => {
      await dataService.markNotificationReadDb(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications', user?.id] });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) return;
      await dataService.markAllNotificationsReadDb(user.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications', user?.id] });
    },
  });

  const addMutation = useMutation({
    mutationFn: async (notification: Omit<Notification, 'id' | 'user_id' | 'timestamp' | 'read'>) => {
      if (!user?.id) return null;
      return dataService.insertNotificationDb(user.id, notification);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications', user?.id] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await dataService.deleteNotificationDb(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications', user?.id] });
    },
  });

  const notifications = notificationsQuery.data ?? [];
  const unreadCount = notifications.filter((n) => !n.read).length;

  return {
    notifications,
    unreadCount,
    isLoading: notificationsQuery.isLoading,
    markAsRead: markReadMutation.mutate,
    markAllAsRead: markAllReadMutation.mutate,
    addNotification: addMutation.mutate,
    removeNotification: deleteMutation.mutate,
  };
}