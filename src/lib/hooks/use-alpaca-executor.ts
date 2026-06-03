'use client';

import { useCallback, useState, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth/auth-provider';
import { useAppStore } from '@/stores/app-store';
import { useToast } from '@/lib/hooks/use-toast';
import type { LiveSignal, CorrelationPair, PortfolioRiskMetrics, CircuitBreakerState } from '@/types';
import type { AlpacaAccount, AlpacaPosition } from '@/lib/services/alpaca-client';
import { getRiskManager, type RiskConfig } from '@/lib/services/risk-manager';

// ─── Return type ───────────────────────────────────────────────
export interface AlpacaExecutorState {
  /** Whether Alpaca keys are configured */
  isConfigured: boolean;
  /** Whether we're currently executing a trade */
  isExecuting: boolean;
  /** Whether we're currently syncing */
  isSyncing: boolean;
  /** Latest Alpaca account snapshot */
  account: AlpacaAccount | null;
  /** Latest Alpaca positions */
  positions: AlpacaPosition[] | null;
  /** Whether connected to broker (keys valid, account accessible) */
  isConnected: boolean;
  /** Last sync timestamp */
  lastSyncAt: string | null;
  /** Sync error if any */
  syncError: string | null;
}

export interface UseAlpacaExecutorReturn extends AlpacaExecutorState {
  /**
   * Execute a signal through Alpaca + Supabase.
   *
   * In live mode: places real order on Alpaca, then syncs to Supabase.
   * In paper mode: records only to Supabase (no broker).
   *
   * @returns trade ID if successful, null if failed
   */
  executeSignal: (signal: LiveSignal) => Promise<{ tradeId: string | null; alpacaOrderId: string | null }>;

  /**
   * Execute a direct trade (not signal-driven) through Alpaca + Supabase.
   * Used for manual trading from the portfolio page.
   */
  executeTrade: (params: {
    symbol: string;
    name: string;
    type: 'buy' | 'sell';
    quantity: number;
    price: number;
    strategyId?: string;
    reason?: string;
  }) => Promise<{ tradeId: string | null; alpacaOrderId: string | null }>;

  /**
   * Sync Alpaca positions & account with Supabase.
   * Call after order execution or periodically.
   */
  syncWithAlpaca: () => Promise<boolean>;

  /**
   * Check if Alpaca is reachable (account endpoint).
   */
  checkConnection: () => Promise<boolean>;

  /**
   * Clear execution/sync state.
   */
  reset: () => void;

  // ── Advanced Risk Management ──────────────────────────

  /** Current portfolio risk metrics snapshot */
  riskMetrics: PortfolioRiskMetrics | null;

  /** Current circuit breaker state */
  circuitBreaker: CircuitBreakerState;

  /**
   * Pre-flight risk check: returns whether a trade would be allowed
   * without actually executing it.
   */
  validateTradeRisk: (params: {
    symbol: string;
    quantity: number;
    price: number;
    type: 'buy' | 'sell';
  }) => { allowed: boolean; reason?: string; rule?: string };

  /** Update the risk configuration at runtime */
  updateRiskConfig: (config: Partial<RiskConfig>) => void;

  /** Reset the circuit breaker manually */
  resetCircuitBreaker: () => void;
}

/**
 * useAlpacaExecutor
 *
 * Bridge hook for executing trades via Alpaca (broker) + Supabase (DB).
 *
 * Modes:
 *  - 'paper': Uses Alpaca paper trading API + Supabase paper portfolio
 *  - 'live':  Uses Alpaca live trading API + Supabase live portfolio
 *
 * This is the primary interface for the LiveStrategyEngine and
 * any manual trading UI to route orders to the broker.
 *
 * Usage:
 *   const { executeSignal, syncWithAlpaca, isConnected, account } = useAlpacaExecutor();
 *
 *   // From a signal:
 *   const result = await executeSignal(signal);
 *
 *   // Periodic sync:
 *   await syncWithAlpaca();
 */
export function useAlpacaExecutor(): UseAlpacaExecutorReturn {
  const { user } = useAuth();
  const tradingMode = useAppStore((s) => s.tradingMode);
  const queryClient = useQueryClient();
  const { addToast } = useToast();

  const [isExecuting, setIsExecuting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [account, setAccount] = useState<AlpacaAccount | null>(null);
  const [positions, setPositions] = useState<AlpacaPosition[] | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  // ── Advanced Risk State ──────────────────────────────────
  const [riskMetrics, setRiskMetrics] = useState<PortfolioRiskMetrics | null>(null);
  const [circuitBreaker, setCircuitBreaker] = useState<CircuitBreakerState>({
    isTripped: false,
    reason: null,
    trippedAt: null,
    cooldownMinutes: 30,
    resumeAt: null,
  });

  // Check if Alpaca is configured by testing the account endpoint
  const isConfiguredRef = useRef(false);

  // ── Execute a signal through Alpaca ─────────────────────
  const executeSignal = useCallback(
    async (
      signal: LiveSignal,
    ): Promise<{ tradeId: string | null; alpacaOrderId: string | null }> => {
      if (!user?.id) {
        addToast('User not authenticated', 'error');
        return { tradeId: null, alpacaOrderId: null };
      }

      setIsExecuting(true);
      try {
        // ── Risk Validation: Block trade if risk rules are violated ──
        const rm = getRiskManager();
        const cbCheck = rm.checkCircuitBreaker();
        if (cbCheck) {
          addToast(cbCheck.reason ?? 'Circuit breaker active', 'error');
          return { tradeId: null, alpacaOrderId: null };
        }

        const riskCheck = rm.canTrade({
          symbol: signal.symbol,
          quantity: signal.quantity,
          price: signal.price,
          capital: account ? Number(account.equity) : 0,
          positions:
            positions
              ?.filter((p) => Number(p.qty) > 0)
              .map((p) => ({
                symbol: p.symbol,
                quantity: Number(p.qty),
                avg_price: Number(p.avg_entry_price),
                market_value: Number(p.market_value),
                unrealized_pnl: Number(p.unrealized_pl),
              })) ?? [],
        });

        if (!riskCheck.allowed) {
          addToast(
            riskCheck.reason ?? 'Trade blocked by risk manager',
            'error',
          );
          // Update circuit breaker state for UI
          setCircuitBreaker(rm.getCircuitBreakerState());
          return { tradeId: null, alpacaOrderId: null };
        }

        // ── Risk Passed → Execute ──────────────────────────
        const res = await fetch('/api/alpaca/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: user.id,
            symbol: signal.symbol,
            name: signal.symbol,
            type: signal.type,
            quantity: signal.quantity,
            price: signal.price,
            strategyId: signal.strategyId,
            reason: signal.reason,
            mode: tradingMode,
          }),
        });

        const json = await res.json();

        if (!json.success) {
          addToast(json.error ?? 'Execution failed', 'error');
          return { tradeId: null, alpacaOrderId: null };
        }

        const data = json.data as {
          trade: { id: string };
          alpacaOrder: { id: string } | null;
          alpacaError: string | null;
        };

        // Invalidate relevant queries
        queryClient.invalidateQueries({ queryKey: ['portfolio', user.id, tradingMode] });
        queryClient.invalidateQueries({ queryKey: ['positions'] });
        queryClient.invalidateQueries({ queryKey: ['trades'] });
        queryClient.invalidateQueries({ queryKey: ['transactions'] });
        queryClient.invalidateQueries({ queryKey: ['analytics-trades'] });
        queryClient.invalidateQueries({ queryKey: ['strategy-trades'] });

        if (data.alpacaError) {
          addToast(`Trade recorded locally, but Alpaca order failed: ${data.alpacaError}`, 'warning');
        } else {
          addToast(
            `${signal.type === 'buy' ? 'Bought' : 'Sold'} ${signal.symbol} x${signal.quantity} @ $${signal.price.toFixed(2)}`,
            'success',
          );
        }

        return {
          tradeId: data.trade?.id ?? null,
          alpacaOrderId: data.alpacaOrder?.id ?? null,
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Execution failed';
        addToast(msg, 'error');
        return { tradeId: null, alpacaOrderId: null };
      } finally {
        setIsExecuting(false);
      }
    },
    [user, tradingMode, queryClient, addToast, account, positions],
  );

  // ── Execute direct trade through Alpaca ─────────────────
  const executeTrade = useCallback(
    async (params: {
      symbol: string;
      name: string;
      type: 'buy' | 'sell';
      quantity: number;
      price: number;
      strategyId?: string;
      reason?: string;
    }): Promise<{ tradeId: string | null; alpacaOrderId: string | null }> => {
      if (!user?.id) {
        addToast('User not authenticated', 'error');
        return { tradeId: null, alpacaOrderId: null };
      }

      setIsExecuting(true);
      try {
        // ── Risk Validation: Block trade if risk rules are violated ──
        const rm = getRiskManager();
        const cbCheck = rm.checkCircuitBreaker();
        if (cbCheck) {
          addToast(cbCheck.reason ?? 'Circuit breaker active', 'error');
          return { tradeId: null, alpacaOrderId: null };
        }

        const riskCheck = rm.canTrade({
          symbol: params.symbol,
          quantity: params.quantity,
          price: params.price,
          capital: account ? Number(account.equity) : 0,
          positions:
            positions
              ?.filter((p) => Number(p.qty) > 0)
              .map((p) => ({
                symbol: p.symbol,
                quantity: Number(p.qty),
                avg_price: Number(p.avg_entry_price),
                market_value: Number(p.market_value),
                unrealized_pnl: Number(p.unrealized_pl),
              })) ?? [],
        });

        if (!riskCheck.allowed) {
          addToast(
            riskCheck.reason ?? 'Trade blocked by risk manager',
            'error',
          );
          setCircuitBreaker(rm.getCircuitBreakerState());
          return { tradeId: null, alpacaOrderId: null };
        }

        // ── Risk Passed → Execute ──────────────────────────
        const res = await fetch('/api/alpaca/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: user.id,
            ...params,
            mode: tradingMode,
          }),
        });

        const json = await res.json();

        if (!json.success) {
          addToast(json.error ?? 'Execution failed', 'error');
          return { tradeId: null, alpacaOrderId: null };
        }

        const data = json.data as {
          trade: { id: string };
          alpacaOrder: { id: string } | null;
          alpacaError: string | null;
        };

        // Invalidate relevant queries
        queryClient.invalidateQueries({ queryKey: ['portfolio', user.id, tradingMode] });
        queryClient.invalidateQueries({ queryKey: ['positions'] });
        queryClient.invalidateQueries({ queryKey: ['trades'] });
        queryClient.invalidateQueries({ queryKey: ['transactions'] });
        queryClient.invalidateQueries({ queryKey: ['analytics-trades'] });

        if (data.alpacaError) {
          addToast(`Trade recorded locally, but Alpaca order failed: ${data.alpacaError}`, 'warning');
        } else {
          addToast(
            `${params.type === 'buy' ? 'Bought' : 'Sold'} ${params.symbol} x${params.quantity} @ $${params.price.toFixed(2)}`,
            'success',
          );
        }

        return {
          tradeId: data.trade?.id ?? null,
          alpacaOrderId: data.alpacaOrder?.id ?? null,
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Execution failed';
        addToast(msg, 'error');
        return { tradeId: null, alpacaOrderId: null };
      } finally {
        setIsExecuting(false);
      }
    },
    [user, tradingMode, queryClient, addToast, account, positions],
  );

  // ── Sync with Alpaca ────────────────────────────────────
  const syncWithAlpaca = useCallback(async (): Promise<boolean> => {
    if (!user?.id) return false;

    setIsSyncing(true);
    setSyncError(null);
    try {
      const res = await fetch('/api/alpaca/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, mode: tradingMode }),
      });

      const json = await res.json();

      if (!json.success) {
        setSyncError(json.error ?? 'Sync failed');
        addToast(json.error ?? 'Sync failed', 'error');
        return false;
      }

      const data = json.data;
      setLastSyncAt(new Date().toISOString());
      isConfiguredRef.current = true;
      setIsConnected(true);

      // Update local account & positions from sync result
      if (data.account) {
        setAccount({
          id: data.account.id ?? '',
          account_number: data.account.account_number ?? '',
          status: data.account.status ?? 'ACTIVE',
          currency: 'USD',
          cash: String(data.account.cash ?? 0),
          portfolio_value: String(data.account.equity ?? 0),
          buying_power: String(data.account.buyingPower ?? 0),
          equity: String(data.account.equity ?? 0),
          last_equity: String(data.account.equity ?? 0),
          long_market_value: String(data.account.longMarketValue ?? 0),
          short_market_value: '0',
          initial_margin: '0',
          maintenance_margin: '0',
          daytrade_count: data.account.daytradeCount ?? 0,
          pattern_day_trader: false,
          trading_blocked: false,
          transfers_blocked: false,
          account_blocked: false,
          created_at: '',
        });
      }

      if (data.alpacaPositions) {
        setPositions(
          data.alpacaPositions.map((p: { symbol: string; qty: number; avgEntry: number; marketValue: number; unrealizedPl: number }) => ({
            asset_id: '',
            symbol: p.symbol,
            exchange: '',
            asset_class: 'us_equity',
            avg_entry_price: String(p.avgEntry),
            qty: String(p.qty),
            qty_available: String(p.qty),
            side: 'long' as const,
            market_value: String(p.marketValue),
            cost_basis: String(p.avgEntry * p.qty),
            unrealized_pl: String(p.unrealizedPl),
            unrealized_plpc: '0',
            unrealized_intraday_pl: String(p.unrealizedPl),
            unrealized_intraday_plpc: '0',
            current_price: String(p.marketValue / (p.qty || 1)),
            lastday_price: String(p.marketValue / (p.qty || 1)),
            change_today: '0',
            asset_marginable: true,
          })),
        );
      }

      // Invalidate portfolio queries so UI picks up synced data
      queryClient.invalidateQueries({ queryKey: ['portfolio', user.id, tradingMode] });
      queryClient.invalidateQueries({ queryKey: ['positions'] });

      return true;
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Sync failed';
      setSyncError(msg);
      addToast(msg, 'error');
      return false;
    } finally {
      setIsSyncing(false);
    }
  }, [user, tradingMode, queryClient, addToast]);

  // ── Check connection ────────────────────────────────────
  const checkConnection = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch('/api/alpaca/account');
      const json = await res.json();
      if (json.success) {
        isConfiguredRef.current = true;
        setIsConnected(true);
        setAccount(json.data);
        return true;
      }
      setIsConnected(false);
      return false;
    } catch {
      setIsConnected(false);
      return false;
    }
  }, []);

  // ── Advanced Risk ────────────────────────────────────────
  const validateTradeRisk = useCallback(
    (params: {
      symbol: string;
      quantity: number;
      price: number;
      type: 'buy' | 'sell';
    }): { allowed: boolean; reason?: string; rule?: string } => {
      const rm = getRiskManager();

      // Get current positions formatted for risk manager
      const openPositions =
        positions
          ?.filter((p) => Number(p.qty) > 0)
          .map((p) => ({
            symbol: p.symbol,
            quantity: Number(p.qty),
            avg_price: Number(p.avg_entry_price),
            market_value: Number(p.market_value),
            unrealized_pnl: Number(p.unrealized_pl),
          })) ?? [];

      const capital = account ? Number(account.equity) : 0;

      const result = rm.canTrade({
        symbol: params.symbol,
        quantity: params.quantity,
        price: params.price,
        capital,
        positions: openPositions,
      });

      // Update circuit breaker state after each check
      setCircuitBreaker(rm.getCircuitBreakerState());

      return result;
    },
    [account, positions],
  );

  const updateRiskConfig = useCallback((config: Partial<RiskConfig>) => {
    const rm = getRiskManager();
    rm.updateConfig(config);
  }, []);

  const resetCircuitBreaker = useCallback(() => {
    const rm = getRiskManager();
    rm.resetCircuitBreaker();
    setCircuitBreaker(rm.getCircuitBreakerState());
    addToast('Circuit breaker reset manually', 'info');
  }, [addToast]);

  // ── Compute risk snapshot on demand ─────────────────────
  const computeRiskSnapshot = useCallback(() => {
    const rm = getRiskManager();
    const openPositions =
      positions
        ?.filter((p) => Number(p.qty) > 0)
        .map((p) => ({
          symbol: p.symbol,
          quantity: Number(p.qty),
          avg_price: Number(p.avg_entry_price),
          market_value: Number(p.market_value),
          unrealized_pnl: Number(p.unrealized_pl),
        })) ?? [];

    const capital = account ? Number(account.equity) : 0;

    const metrics = rm.computePortfolioRiskMetrics({
      capital,
      positions: openPositions.map((p) => ({
        symbol: p.symbol,
        market_value: p.market_value,
        unrealized_pnl: p.unrealized_pnl,
      })),
    });

    setRiskMetrics(metrics);
    setCircuitBreaker(rm.getCircuitBreakerState());
  }, [account, positions]);

  // ── Reset ───────────────────────────────────────────────
  const reset = useCallback(() => {
    setIsExecuting(false);
    setIsSyncing(false);
    setAccount(null);
    setPositions(null);
    setIsConnected(false);
    setLastSyncAt(null);
    setSyncError(null);
  }, []);

  return {
    // State
    isConfigured: isConfiguredRef.current,
    isExecuting,
    isSyncing,
    account,
    positions,
    isConnected,
    lastSyncAt,
    syncError,
    // Actions
    executeSignal,
    executeTrade,
    syncWithAlpaca,
    checkConnection,
    reset,
    // Advanced Risk
    riskMetrics,
    circuitBreaker,
    validateTradeRisk,
    updateRiskConfig,
    resetCircuitBreaker,
  };
}