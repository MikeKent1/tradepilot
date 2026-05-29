'use client';

import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth/auth-provider';
import { useAppStore } from '@/stores/app-store';
import * as dataService from '@/lib/services/data-service';
import { useRealtime } from '@/lib/hooks/use-realtime';
import type { Trade } from '@/types';

export interface AnalyticsData {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  totalPnl: number;
  totalPnlPercent: number;
  avgWin: number;
  avgLoss: number;
  largestWin: number;
  largestLoss: number;
  profitFactor: number;
  trades: Trade[];
  pnlBySymbol: { symbol: string; name: string; pnl: number; trades: number }[];
  monthlyPnl: { month: string; pnl: number; trades: number; winRate: number }[];
  equityCurve: { date: string; value: number; pnl: number }[];
  winLossByDay: { date: string; wins: number; losses: number }[];
}

function groupByMonth(trades: Trade[]): Map<string, Trade[]> {
  const map = new Map<string, Trade[]>();
  for (const t of trades) {
    const month = t.executed_at.substring(0, 7);
    const arr = map.get(month) || [];
    arr.push(t);
    map.set(month, arr);
  }
  return map;
}

function groupBySymbol(trades: Trade[]): Map<string, { name: string; pnl: number; count: number }> {
  const map = new Map<string, { name: string; pnl: number; count: number }>();
  for (const t of trades) {
    const existing = map.get(t.symbol) || { name: t.name, pnl: 0, count: 0 };
    existing.pnl += t.pnl ?? 0;
    existing.count += 1;
    map.set(t.symbol, existing);
  }
  return map;
}

export function useAnalyticsData() {
  const { user } = useAuth();
  const tradingMode = useAppStore((s) => s.tradingMode);

  // Fetch portfolio (for starting value in equity curve)
  const portfolioQuery = useQuery({
    queryKey: ['portfolio', user?.id, tradingMode],
    queryFn: () => {
      if (!user?.id) return null;
      return dataService.fetchPortfolio(user.id, tradingMode);
    },
    enabled: !!user?.id,
  });

  // Fetch all trades (via data-service, then reverse for ascending order)
  // ── Real-time: portfolio changes ──────────────────────
  useRealtime({
    table: 'portfolios',
    filter: user?.id ? `user_id=eq.${user.id}` : undefined,
    queryKeys: user?.id ? [['portfolio', user.id, tradingMode]] : [],
    enabled: !!user?.id,
  });

  const tradesQuery = useQuery({
    queryKey: ['analytics-trades', user?.id, tradingMode],
    queryFn: async (): Promise<Trade[]> => {
      if (!user?.id) return [];

      const portfolio = await dataService.fetchPortfolio(user.id, tradingMode);
      if (!portfolio) return [];

      // data-service returns newest-first; equity curve needs oldest-first
      const trades = await dataService.fetchTrades(portfolio.id, tradingMode);
      return trades.reverse();
    },
    enabled: !!user?.id,
  });

  // ── Real-time: trade changes for analytics ────────────
  const portfolioId = portfolioQuery.data?.id;
  const realtimeKeys: string[][] = [];
  if (user?.id) {
    realtimeKeys.push(['analytics-trades', user.id, tradingMode]);
    realtimeKeys.push(['portfolio', user.id, tradingMode]);
  }
  useRealtime({
    table: 'trades',
    filter: portfolioId ? `portfolio_id=eq.${portfolioId}` : undefined,
    queryKeys: realtimeKeys,
    enabled: !!portfolioId,
  });

  const trades = tradesQuery.data || [];
  const portfolio = portfolioQuery.data;

  // Compute analytics
  const data: AnalyticsData = (() => {
    const closedTrades = trades.filter((t) => t.pnl != null);
    const winningTrades = closedTrades.filter((t) => (t.pnl ?? 0) > 0);
    const losingTrades = closedTrades.filter((t) => (t.pnl ?? 0) < 0);

    const totalPnl = closedTrades.reduce((s, t) => s + (t.pnl ?? 0), 0);
    const winAmounts = winningTrades.map((t) => t.pnl ?? 0).filter((p) => p > 0);
    const lossAmounts = losingTrades.map((t) => t.pnl ?? 0).filter((p) => p < 0);

    const avgWin = winAmounts.length > 0 ? winAmounts.reduce((s, v) => s + v, 0) / winAmounts.length : 0;
    const avgLoss = lossAmounts.length > 0 ? Math.abs(lossAmounts.reduce((s, v) => s + v, 0) / lossAmounts.length) : 0;
    const totalWinAmount = winAmounts.reduce((s, v) => s + v, 0);
    const totalLossAmount = Math.abs(lossAmounts.reduce((s, v) => s + v, 0));
    const profitFactor = totalLossAmount > 0 ? totalWinAmount / totalLossAmount : totalWinAmount > 0 ? Infinity : 0;

    // P&L by symbol
    const symbolMap = groupBySymbol(closedTrades);
    const pnlBySymbol = Array.from(symbolMap.entries())
      .map(([symbol, info]) => ({
        symbol,
        name: info.name,
        pnl: info.pnl,
        trades: info.count,
      }))
      .sort((a, b) => b.pnl - a.pnl);

    // Monthly P&L
    const monthMap = groupByMonth(closedTrades);
    const monthlyPnl = Array.from(monthMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, monthTrades]) => {
        const pnl = monthTrades.reduce((s, t) => s + (t.pnl ?? 0), 0);
        const wins = monthTrades.filter((t) => (t.pnl ?? 0) > 0).length;
        const wr = monthTrades.length > 0 ? wins / monthTrades.length : 0;
        return {
          month,
          pnl,
          trades: monthTrades.length,
          winRate: Math.round(wr * 100),
        };
      });

    // Equity curve (cumulative P&L over time)
    let runningPnl = 0;
    const baseValue = portfolio?.total_value ? portfolio.total_value - totalPnl : 100000;
    const equityCurve = trades
      .filter((t) => t.pnl != null)
      .map((t) => {
        runningPnl += t.pnl ?? 0;
        return {
          date: t.executed_at.substring(0, 10),
          value: baseValue + runningPnl,
          pnl: runningPnl,
        };
      });

    // Win/Loss by day
    const dayMap = new Map<string, { wins: number; losses: number }>();
    for (const t of closedTrades) {
      const day = t.executed_at.substring(0, 10);
      const entry = dayMap.get(day) || { wins: 0, losses: 0 };
      if ((t.pnl ?? 0) > 0) entry.wins += 1;
      else entry.losses += 1;
      dayMap.set(day, entry);
    }
    const winLossByDay = Array.from(dayMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, info]) => ({ date, ...info }));

    return {
      totalTrades: closedTrades.length,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      winRate: closedTrades.length > 0 ? winningTrades.length / closedTrades.length : 0,
      totalPnl,
      totalPnlPercent: portfolio?.total_pnl_percent ?? 0,
      avgWin,
      avgLoss,
      largestWin: winAmounts.length > 0 ? Math.max(...winAmounts) : 0,
      largestLoss: lossAmounts.length > 0 ? Math.min(...lossAmounts) : 0,
      profitFactor,
      trades: closedTrades,
      pnlBySymbol,
      monthlyPnl,
      equityCurve,
      winLossByDay,
    };
  })();

  return {
    data,
    trades: closedTradesResult(),
    isLoading: tradesQuery.isLoading || portfolioQuery.isLoading,
  };

  function closedTradesResult() {
    return trades.filter((t) => t.pnl != null);
  }
}