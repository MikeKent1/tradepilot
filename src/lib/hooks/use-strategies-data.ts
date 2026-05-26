'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth/auth-provider';
import * as dataService from '@/lib/services/data-service';
import { useToast } from '@/lib/hooks/use-toast';
import type { Strategy } from '@/types';

export function useStrategiesData() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { addToast } = useToast();

  const strategiesQuery = useQuery({
    queryKey: ['strategies', user?.id],
    queryFn: async (): Promise<Strategy[]> => {
      if (!user?.id) return [];
      return dataService.fetchStrategies(user.id);
    },
    enabled: !!user?.id,
  });

  const upsertMutation = useMutation({
    mutationFn: async (strategy: Omit<Strategy, 'id' | 'user_id' | 'created_at' | 'updated_at'> & { id?: string }) => {
      if (!user?.id) throw new Error('Not authenticated');
      return dataService.upsertStrategy(user.id, strategy);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['strategies', user?.id] });
      addToast('Strategy saved', 'success');
    },
    onError: (error: Error) => {
      addToast(error.message, 'error');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return dataService.deleteStrategy(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['strategies', user?.id] });
      addToast('Strategy deleted', 'info');
    },
    onError: (error: Error) => {
      addToast(error.message, 'error');
    },
  });

  return {
    strategies: strategiesQuery.data ?? [],
    isLoading: strategiesQuery.isLoading,
    upsertStrategy: upsertMutation.mutate,
    deleteStrategy: deleteMutation.mutate,
    isSaving: upsertMutation.isPending,
    refetch: strategiesQuery.refetch,
  };
}