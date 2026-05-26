import { create } from 'zustand';
import { Portfolio, Position, Trade } from '@/types';
import { mockPortfolio, mockPositions, mockTrades } from '@/lib/mock-data';
import { generateId } from '@/lib/utils';

interface PortfolioState {
  portfolio: Portfolio;
  positions: Position[];
  trades: Trade[];

  executeTrade: (trade: {
    symbol: string;
    name: string;
    type: 'buy' | 'sell';
    quantity: number;
    price: number;
    notes?: string;
  }) => void;

  removePosition: (id: string) => void;
  addToWatchlist: (symbol: string, name: string) => void;
}

export const usePortfolioStore = create<PortfolioState>((set, get) => ({
  portfolio: mockPortfolio,
  positions: mockPositions,
  trades: mockTrades,

  executeTrade: (trade) => {
    const { portfolio, positions } = get();
    const total = trade.quantity * trade.price;
    const fee = Math.max(1.50, total * 0.001);
    const now = new Date().toISOString();

    if (trade.type === 'buy') {
      const cost = total + fee;
      if (cost > portfolio.cash_balance) return;

      const existingPos = positions.find((p) => p.symbol === trade.symbol);

      let newPositions: Position[];
      if (existingPos) {
        const newQuantity = existingPos.quantity + trade.quantity;
        const newAvgPrice =
          (existingPos.avg_price * existingPos.quantity + total) / newQuantity;
        newPositions = positions.map((p) =>
          p.symbol === trade.symbol
            ? {
                ...p,
                quantity: newQuantity,
                avg_price: +newAvgPrice.toFixed(4),
                market_value: newQuantity * trade.price,
                updated_at: now,
              }
            : p,
        );
      } else {
        const newPos: Position = {
          id: generateId(),
          portfolio_id: portfolio.id,
          symbol: trade.symbol,
          name: trade.name,
          quantity: trade.quantity,
          avg_price: trade.price,
          current_price: trade.price,
          market_value: total,
          unrealized_pnl: 0,
          unrealized_pnl_percent: 0,
          realized_pnl: 0,
          created_at: now,
          updated_at: now,
        };
        newPositions = [...positions, newPos];
      }

      const newTrade: Trade = {
        id: generateId(),
        portfolio_id: portfolio.id,
        symbol: trade.symbol,
        name: trade.name,
        type: 'buy',
        quantity: trade.quantity,
        price: trade.price,
        total,
        fee,
        notes: trade.notes,
        executed_at: now,
        created_at: now,
      };

      set({
        portfolio: {
          ...portfolio,
          cash_balance: portfolio.cash_balance - cost,
          updated_at: now,
        },
        positions: newPositions,
        trades: [newTrade, ...get().trades],
      });
    } else {
      const existingPos = positions.find((p) => p.symbol === trade.symbol);
      if (!existingPos || existingPos.quantity < trade.quantity) return;

      const pnl =
        (trade.price - existingPos.avg_price) * trade.quantity - fee;
      const pnlPercent = ((trade.price - existingPos.avg_price) / existingPos.avg_price) * 100;

      let newPositions: Position[];
      if (existingPos.quantity === trade.quantity) {
        newPositions = positions.filter((p) => p.symbol !== trade.symbol);
      } else {
        newPositions = positions.map((p) =>
          p.symbol === trade.symbol
            ? {
                ...p,
                quantity: p.quantity - trade.quantity,
                realized_pnl: p.realized_pnl + pnl,
                market_value: (p.quantity - trade.quantity) * trade.price,
                updated_at: now,
              }
            : p,
        );
      }

      const revenue = total - fee;

      const newTrade: Trade = {
        id: generateId(),
        portfolio_id: portfolio.id,
        symbol: trade.symbol,
        name: trade.name,
        type: 'sell',
        quantity: trade.quantity,
        price: trade.price,
        total,
        fee,
        pnl: +pnl.toFixed(2),
        pnl_percent: +pnlPercent.toFixed(2),
        notes: trade.notes,
        executed_at: now,
        created_at: now,
      };

      set({
        portfolio: {
          ...portfolio,
          cash_balance: portfolio.cash_balance + revenue,
          updated_at: now,
        },
        positions: newPositions,
        trades: [newTrade, ...get().trades],
      });
    }
  },

  removePosition: (id) =>
    set((state) => ({
      positions: state.positions.filter((p) => p.id !== id),
    })),

  addToWatchlist: (symbol, name) => {
    // Handled via useWatchlistStore for deduplication
  },
}));