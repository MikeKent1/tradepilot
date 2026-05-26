'use client';

import { useQuery } from '@tanstack/react-query';
import { useAppStore } from '@/stores/app-store';
import * as dataService from '@/lib/services/data-service';
import type { Trade } from '@/types';

export function useTrades(portfolioId: string | undefined) {
  const tradingMode = useAppStore((s) => s.tradingMode);

  return useQuery({
    queryKey: ['trades', portfolioId, tradingMode],
    queryFn: async (): Promise<Trade[]> => {
      if (!portfolioId) return [];
      return dataService.fetchTrades(portfolioId, tradingMode);
    },
    enabled: !!portfolioId,
  });
}
