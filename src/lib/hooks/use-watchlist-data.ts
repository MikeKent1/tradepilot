'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth/auth-provider';
import * as dataService from '@/lib/services/data-service';
import { useToast } from '@/lib/hooks/use-toast';
import { useRealtime } from '@/lib/hooks/use-realtime';
import type { WatchlistItem } from '@/types';

export function useWatchlistData() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { addToast } = useToast();

  const watchlistQuery = useQuery({
    queryKey: ['watchlist', user?.id],
    queryFn: async (): Promise<WatchlistItem[]> => {
      if (!user?.id) return [];
      return dataService.fetchWatchlist(user.id);
    },
    enabled: !!user?.id,
  });

  // ── Real-time: watchlist changes ──────────────────────
  useRealtime({
    table: 'watchlists',
    filter: user?.id ? `user_id=eq.${user.id}` : undefined,
    queryKeys: user?.id ? [['watchlist', user.id]] : [],
    enabled: !!user?.id,
  });

  const addMutation = useMutation({
    mutationFn: async (item: { symbol: string; name: string; price: number; change: number; change_percent: number }) => {
      if (!user?.id) throw new Error('Not authenticated');
      return dataService.addToWatchlistDb(user.id, item);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['watchlist', user?.id] });
      addToast('Added to watchlist', 'success');
    },
    onError: (error: Error) => {
      addToast(error.message, 'error');
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (id: string) => {
      return dataService.removeFromWatchlistDb(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['watchlist', user?.id] });
      addToast('Removed from watchlist', 'info');
    },
    onError: (error: Error) => {
      addToast(error.message, 'error');
    },
  });

  return {
    watchlist: watchlistQuery.data ?? [],
    isLoading: watchlistQuery.isLoading,
    addToWatchlist: addMutation.mutate,
    removeFromWatchlist: removeMutation.mutate,
    isAdding: addMutation.isPending,
    refetch: watchlistQuery.refetch,
  };
}