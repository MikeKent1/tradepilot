import { create } from 'zustand';
import { Portfolio, Position, Trade, TradingMode } from '@/types';
import * as dataService from '@/lib/services/data-service';

interface PortfolioState {
  // ── Data ──────────────────────────────────────────────────
  portfolio: Portfolio | null;
  positions: Position[];
  trades: Trade[];

  // ── Status ────────────────────────────────────────────────
  isLoading: boolean;
  error: string | null;

  // ── Config ────────────────────────────────────────────────
  userId: string | null;
  tradingMode: TradingMode;

  // ── Actions ───────────────────────────────────────────────
  /** Call once when user logs in to bootstrap store from Supabase */
  initialize: (userId: string, mode?: TradingMode) => Promise<void>;
  /** Execute a buy/sell trade, persisting to Supabase */
  executeTrade: (trade: {
    symbol: string;
    name: string;
    type: 'buy' | 'sell';
    quantity: number;
    price: number;
    notes?: string;
    strategyId?: string;
  }) => Promise<void>;
  /** Remove a position from the store (does not delete from DB — handled by sells) */
  removePosition: (id: string) => void;
  /** Refresh all data from Supabase */
  refresh: () => Promise<void>;
  /** Switch trading mode (paper/live) and reload */
  setTradingMode: (mode: TradingMode) => void;
  addToWatchlist: (symbol: string, name: string) => void;
}

export const usePortfolioStore = create<PortfolioState>((set, get) => ({
  portfolio: null,
  positions: [],
  trades: [],
  isLoading: false,
  error: null,
  userId: null,
  tradingMode: 'paper',

  // ── Initialize ────────────────────────────────────────────
  initialize: async (userId: string, mode: TradingMode = 'paper') => {
    set({ isLoading: true, error: null, userId, tradingMode: mode });

    try {
      // Fetch or auto-create portfolio
      let portfolio = await dataService.fetchPortfolio(userId, mode);
      if (!portfolio) {
        portfolio = await dataService.createPortfolio(userId, 'Default', mode);
      }
      if (!portfolio) {
        set({ isLoading: false, error: 'Failed to create portfolio' });
        return;
      }

      // Fetch positions & trades in parallel
      const [positions, trades] = await Promise.all([
        dataService.fetchPositions(portfolio.id),
        dataService.fetchTrades(portfolio.id, mode),
      ]);

      set({ portfolio, positions, trades, isLoading: false });
    } catch (err) {
      set({
        isLoading: false,
        error: err instanceof Error ? err.message : 'Failed to initialize portfolio',
      });
    }
  },

  // ── Execute Trade ─────────────────────────────────────────
  executeTrade: async (trade) => {
    const state = get();
    const { portfolio, positions, userId, tradingMode } = state;

    if (!portfolio || !userId) {
      set({ error: 'Portfolio not initialized. Call initialize() first.' });
      return;
    }

    const total = trade.quantity * trade.price;
    const fee = Math.max(1.5, total * 0.001);

    // Pre-flight cash check for buys
    if (trade.type === 'buy') {
      const cost = total + fee;
      if (cost > portfolio.cash_balance) {
        set({ error: 'Insufficient cash balance' });
        return;
      }
    }

    // Pre-flight position check for sells
    if (trade.type === 'sell') {
      const existingPos = positions.find(
        (p) => p.symbol.toUpperCase() === trade.symbol.toUpperCase(),
      );
      if (!existingPos || existingPos.quantity < trade.quantity) {
        set({ error: 'Insufficient position quantity for sell' });
        return;
      }
    }

    try {
      // Calculate P&L for sells
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

      // 1. Insert trade record into Supabase
      const savedTrade = await dataService.insertTrade(
        portfolio.id,
        {
          symbol: trade.symbol.toUpperCase(),
          name: trade.name || trade.symbol.toUpperCase(),
          type: trade.type,
          quantity: trade.quantity,
          price: trade.price,
          total,
          fee,
          pnl,
          pnl_percent: pnlPercent,
          strategy_id: trade.strategyId,
          notes: trade.notes,
          executed_at: new Date().toISOString(),
        },
        tradingMode,
      );

      // 2. Upsert position in Supabase
      if (trade.type === 'buy') {
        const oldQty = existingPos?.quantity ?? 0;
        const oldCost = existingPos ? existingPos.avg_price * existingPos.quantity : 0;
        const newQty = oldQty + trade.quantity;
        const newAvg = (oldCost + total) / newQty;

        const updatedPos = await dataService.upsertPosition(portfolio.id, {
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

        // Optimistically update local state
        const newPositions = existingPos
          ? positions.map((p) =>
              p.id === existingPos.id && updatedPos
                ? updatedPos
                : p,
            )
          : updatedPos
            ? [...positions, updatedPos]
            : positions;

        // 3. Update portfolio balance
        const newCash = portfolio.cash_balance - (total + fee);
        const posValue = newPositions.reduce((sum, p) => sum + p.market_value, 0);
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

        set({
          portfolio: {
            ...portfolio,
            cash_balance: newCash,
            total_value: newTotalValue,
            total_pnl: newTotalPnl,
            total_pnl_percent: newTotalPnlPercent,
            updated_at: new Date().toISOString(),
          },
          positions: newPositions,
          trades: savedTrade
            ? [savedTrade, ...get().trades]
            : get().trades,
          error: null,
        });
      } else {
        // SELL
        if (!existingPos) return; // Should never happen after pre-flight check

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

        // Optimistically update local state
        const newPositions =
          newQty <= 0
            ? positions.filter((p) => p.id !== existingPos.id)
            : positions.map((p) =>
                p.id === existingPos.id
                  ? {
                      ...p,
                      quantity: newQty,
                      realized_pnl: p.realized_pnl + (pnl ?? 0),
                      market_value: newQty * trade.price,
                      updated_at: new Date().toISOString(),
                    }
                  : p,
              );

        const revenue = total - fee;
        const newCash = portfolio.cash_balance + revenue;
        const posValue = newPositions.reduce((sum, p) => sum + p.market_value, 0);
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

        set({
          portfolio: {
            ...portfolio,
            cash_balance: newCash,
            total_value: newTotalValue,
            total_pnl: newTotalPnl,
            total_pnl_percent: newTotalPnlPercent,
            updated_at: new Date().toISOString(),
          },
          positions: newPositions,
          trades: savedTrade
            ? [savedTrade, ...get().trades]
            : get().trades,
          error: null,
        });
      }
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Trade execution failed',
      });
    }
  },

  // ── Remove Position (client-side only) ────────────────────
  removePosition: (id) =>
    set((state) => ({
      positions: state.positions.filter((p) => p.id !== id),
    })),

  // ── Refresh ───────────────────────────────────────────────
  refresh: async () => {
    const { portfolio, userId, tradingMode } = get();
    if (!portfolio?.id || !userId) return;

    set({ isLoading: true, error: null });

    try {
      const [freshPortfolio, freshPositions, freshTrades] = await Promise.all([
        dataService.fetchPortfolio(userId, tradingMode),
        dataService.fetchPositions(portfolio.id),
        dataService.fetchTrades(portfolio.id, tradingMode),
      ]);

      set({
        portfolio: freshPortfolio,
        positions: freshPositions,
        trades: freshTrades,
        isLoading: false,
      });
    } catch (err) {
      set({
        isLoading: false,
        error: err instanceof Error ? err.message : 'Refresh failed',
      });
    }
  },

  // ── Set Trading Mode ──────────────────────────────────────
  setTradingMode: (mode: TradingMode) => {
    const { userId } = get();
    set({ tradingMode: mode, portfolio: null, positions: [], trades: [] });
    if (userId) {
      get().initialize(userId, mode);
    }
  },

  // ── Watchlist (handled by dedicated store) ────────────────
  addToWatchlist: () => {
    // Managed via useWatchlistStore for deduplication
  },
}));