'use client';

import { useQuery } from '@tanstack/react-query';
import { useAppStore } from '@/stores/app-store';
import * as dataService from '@/lib/services/data-service';
import { useRealtime } from '@/lib/hooks/use-realtime';
import type { Trade } from '@/types';

export function useTrades(portfolioId: string | undefined) {
  const tradingMode = useAppStore((s) => s.tradingMode);

  // ── Real-time: trade changes ──────────────────────────
  useRealtime({
    table: 'trades',
    filter: portfolioId ? `portfolio_id=eq.${portfolioId}` : undefined,
    queryKeys: portfolioId ? [['trades', portfolioId, tradingMode]] : [],
    enabled: !!portfolioId,
  });

  return useQuery({
    queryKey: ['trades', portfolioId, tradingMode],
    queryFn: async (): Promise<Trade[]> => {
      if (!portfolioId) return [];
      return dataService.fetchTrades(portfolioId, tradingMode);
    },
    enabled: !!portfolioId,
  });
}
