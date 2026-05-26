// ─── User & Auth ────────────────────────────────────────────
export interface User {
  id: string;
  email: string;
  name: string;
  avatar_url?: string;
  created_at: string;
}

// ─── Portfolio ──────────────────────────────────────────────
export interface Portfolio {
  id: string;
  user_id: string;
  name: string;
  cash_balance: number;
  total_value: number;
  total_pnl: number;
  total_pnl_percent: number;
  created_at: string;
  updated_at: string;
}

// ─── Position ───────────────────────────────────────────────
export interface Position {
  id: string;
  portfolio_id: string;
  symbol: string;
  name: string;
  quantity: number;
  avg_price: number;
  current_price: number;
  market_value: number;
  unrealized_pnl: number;
  unrealized_pnl_percent: number;
  realized_pnl: number;
  created_at: string;
  updated_at: string;
}

// ─── Trade ──────────────────────────────────────────────────
export interface Trade {
  id: string;
  portfolio_id: string;
  symbol: string;
  name: string;
  type: 'buy' | 'sell';
  quantity: number;
  price: number;
  total: number;
  fee: number;
  pnl?: number;
  pnl_percent?: number;
  strategy_id?: string;
  notes?: string;
  executed_at: string;
  created_at: string;
}

// ─── Watchlist ──────────────────────────────────────────────
export interface WatchlistItem {
  id: string;
  user_id: string;
  symbol: string;
  name: string;
  price: number;
  change: number;
  change_percent: number;
  volume?: string;
  added_at: string;
}

// ─── Strategy ───────────────────────────────────────────────
export interface StrategyPerformance {
  total_trades: number;
  win_rate: number;
  avg_pnl: number;
  total_pnl: number;
  total_pnl_percent: number;
  sharpe_ratio: number;
  max_drawdown: number;
}

export interface Strategy {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  type: string;
  status: 'draft' | 'active' | 'paused' | 'archived';
  config: Record<string, unknown>;
  performance: StrategyPerformance;
  created_at: string;
  updated_at: string;
}

// ─── Market Data ────────────────────────────────────────────
export interface MarketAsset {
  symbol: string;
  name: string;
  price: number;
  change: number;
  change_percent: number;
  volume: number;
  market_cap?: number;
  sector?: string;
}

export interface CandlestickData {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface OrderBook {
  bids: [number, number][];
  asks: [number, number][];
}

// ─── Trading Mode ───────────────────────────────────────────
export type TradingMode = 'paper' | 'live';

// ─── UI State ───────────────────────────────────────────────
export interface Notification {
  id: string;
  user_id?: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
}

export interface DashboardWidget {
  id: string;
  type:
    | 'portfolio_summary'
    | 'watchlist'
    | 'positions'
    | 'recent_trades'
    | 'performance_chart'
    | 'market_overview'
    | 'strategies'
    | 'notifications';
  position: { x: number; y: number; w: number; h: number };
  visible: boolean;
}