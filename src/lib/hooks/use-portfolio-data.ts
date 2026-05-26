'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth/auth-provider';
import { useAppStore } from '@/stores/app-store';
import * as dataService from '@/lib/services/data-service';
import { useToast } from '@/lib/hooks/use-toast';

export function usePortfolioData() {
  const { user } = useAuth();
  const tradingMode = useAppStore((s) => s.tradingMode);
  const queryClient = useQueryClient();
  const { addToast } = useToast();

  const portfolioQuery = useQuery({
    queryKey: ['portfolio', user?.id, tradingMode],
    queryFn: async () => {
      if (!user?.id) return null;
      let portfolio = await dataService.fetchPortfolio(user.id, tradingMode);
      // Auto-create portfolio if missing for this mode
      if (!portfolio) {
        portfolio = await dataService.createPortfolio(user.id, 'Default', tradingMode);
      }
      return portfolio;
    },
    enabled: !!user?.id,
  });

  const positionsQuery = useQuery({
    queryKey: ['positions', portfolioQuery.data?.id],
    queryFn: async () => {
      if (!portfolioQuery.data?.id) return [];
      return dataService.fetchPositions(portfolioQuery.data.id);
    },
    enabled: !!portfolioQuery.data?.id,
  });

  const executeTradeMutation = useMutation({
    mutationFn: async (trade: {
      symbol: string;
      name: string;
      type: 'buy' | 'sell';
      quantity: number;
      price: number;
    }) => {
      const portfolio = portfolioQuery.data;
      if (!portfolio) throw new Error('No portfolio found');

      const positions = positionsQuery.data ?? [];
      const total = trade.quantity * trade.price;
      const fee = total * 0.001;

      // ── Calculate P&L for sells ──────────────────────
      let pnl: number | undefined;
      let pnlPercent: number | undefined;
      const existingPos = positions.find(
        (p) => p.symbol.toUpperCase() === trade.symbol.toUpperCase(),
      );

      if (trade.type === 'sell' && existingPos && existingPos.quantity > 0) {
        const costBasis = existingPos.avg_price * Math.min(trade.quantity, existingPos.quantity);
        const proceeds = trade.price * Math.min(trade.quantity, existingPos.quantity);
        pnl = proceeds - costBasis;
        pnlPercent = costBasis > 0 ? (pnl / costBasis) * 100 : 0;
      }

      // ── 1. Insert trade record ───────────────────────
      await dataService.insertTrade(portfolio.id, {
        symbol: trade.symbol.toUpperCase(),
        name: trade.name || trade.symbol.toUpperCase(),
        type: trade.type,
        quantity: trade.quantity,
        price: trade.price,
        total,
        fee,
        pnl,
        pnl_percent: pnlPercent,
        executed_at: new Date().toISOString(),
      }, tradingMode);

      // ── 2. Upsert position ───────────────────────────
      if (trade.type === 'buy') {
        const oldQty = existingPos?.quantity ?? 0;
        const oldCost = existingPos ? existingPos.avg_price * existingPos.quantity : 0;
        const newQty = oldQty + trade.quantity;
        const newAvg = (oldCost + total) / newQty;

        await dataService.upsertPosition(portfolio.id, {
          id: existingPos?.id,
          symbol: trade.symbol.toUpperCase(),
          name: trade.name || trade.symbol.toUpperCase(),
          quantity: newQty,
          avg_price: newAvg,
          current_price: trade.price,
          market_value: newQty * trade.price,
          unrealized_pnl: (trade.price - newAvg) * newQty,
          unrealized_pnl_percent: ((trade.price - newAvg) / newAvg) * 100,
          realized_pnl: existingPos?.realized_pnl ?? 0,
        });
      } else if (existingPos) {
        const newQty = existingPos.quantity - trade.quantity;
        if (newQty <= 0) {
          await dataService.deletePosition(existingPos.id);
        } else {
          await dataService.upsertPosition(portfolio.id, {
            id: existingPos.id,
            symbol: existingPos.symbol,
            name: existingPos.name,
            quantity: newQty,
            avg_price: existingPos.avg_price,
            current_price: trade.price,
            market_value: newQty * trade.price,
            unrealized_pnl: (trade.price - existingPos.avg_price) * newQty,
            unrealized_pnl_percent:
              ((trade.price - existingPos.avg_price) / existingPos.avg_price) * 100,
            realized_pnl: existingPos.realized_pnl + (pnl ?? 0),
          });
        }
      }

      // ── 3. Update portfolio balance ──────────────────
      const cashDelta = trade.type === 'buy' ? -(total + fee) : total - fee;
      const newCash = portfolio.cash_balance + cashDelta;

      // Recalculate total position value from remaining positions
      const remainingPositions = trade.type === 'sell' && existingPos
        ? positions.filter((p) => p.id !== existingPos.id || existingPos.quantity - trade.quantity > 0)
        : positions;

      const posValue =
        trade.type === 'buy'
          ? existingPos
            ? positions.reduce((sum, p) => {
                if (p.id === existingPos.id) {
                  return sum + (existingPos.quantity + trade.quantity) * trade.price;
                }
                return sum + p.market_value;
              }, 0)
            : positions.reduce((sum, p) => sum + p.market_value, 0) + total
          : remainingPositions.reduce((sum, p) => {
              if (p.id === existingPos?.id) {
                return sum + Math.max(0, p.quantity - trade.quantity) * trade.price;
              }
              return sum + p.market_value;
            }, 0);

      const newTotalValue = newCash + posValue;
      const newTotalPnl = portfolio.total_pnl + (pnl ?? 0);
      const initialEquity = newTotalValue - newTotalPnl;
      const newTotalPnlPercent = initialEquity > 0 ? (newTotalPnl / initialEquity) * 100 : 0;

      await dataService.updatePortfolioBalance(portfolio.id, {
        cash_balance: newCash,
        total_value: newTotalValue,
        total_pnl: newTotalPnl,
        total_pnl_percent: newTotalPnlPercent,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portfolio', user?.id, tradingMode] });
      queryClient.invalidateQueries({ queryKey: ['positions', portfolioQuery.data?.id] });
      queryClient.invalidateQueries({ queryKey: ['trades', portfolioQuery.data?.id, tradingMode] });
      queryClient.invalidateQueries({ queryKey: ['analytics-trades', user?.id, tradingMode] });
      queryClient.invalidateQueries({ queryKey: ['strategy-trades'] });
      addToast('Trade executed successfully', 'success');
    },
    onError: (error: Error) => {
      addToast(error.message, 'error');
    },
  });

  return {
    portfolio: portfolioQuery.data ?? null,
    positions: positionsQuery.data ?? [],
    isLoading: portfolioQuery.isLoading || positionsQuery.isLoading,
    executeTrade: executeTradeMutation.mutate,
    isExecuting: executeTradeMutation.isPending,
    refetch: () => {
      portfolioQuery.refetch();
      positionsQuery.refetch();
    },
  };
}