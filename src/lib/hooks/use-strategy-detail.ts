'use client';

import { useQuery } from '@tanstack/react-query';
import { useAppStore } from '@/stores/app-store';
import * as dataService from '@/lib/services/data-service';
import type { Strategy, Trade } from '@/types';

export function useStrategyDetail(strategyId: string | undefined) {
  const tradingMode = useAppStore((s) => s.tradingMode);

  const strategyQuery = useQuery({
    queryKey: ['strategy', strategyId],
    queryFn: async (): Promise<Strategy | null> => {
      if (!strategyId) return null;
      return dataService.fetchStrategy(strategyId);
    },
    enabled: !!strategyId,
  });

  const tradesQuery = useQuery({
    queryKey: ['strategy-trades', strategyId, tradingMode],
    queryFn: async (): Promise<Trade[]> => {
      if (!strategyId) return [];
      return dataService.fetchTradesByStrategy(strategyId, tradingMode);
    },
    enabled: !!strategyId,
  });

  return {
    strategy: strategyQuery.data ?? null,
    trades: tradesQuery.data ?? [],
    isLoading: strategyQuery.isLoading || tradesQuery.isLoading,
    isError: strategyQuery.isError || tradesQuery.isError,
    error: strategyQuery.error ?? tradesQuery.error,
    refetch: () => {
      strategyQuery.refetch();
      tradesQuery.refetch();
    },
  };
}