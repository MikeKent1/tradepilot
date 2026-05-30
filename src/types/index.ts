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
  mode: TradingMode;
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
  mode: TradingMode;
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

export type StrategyType = 'trend_following' | 'mean_reversion' | 'breakout' | 'scalping' | 'custom';
export type Timeframe = '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d' | '1w';
export type IndicatorType = 'rsi' | 'macd' | 'sma' | 'ema' | 'bollinger' | 'volume';

// ─── Entry Rule Params ─────────────────────────────────────
export interface IndicatorCrossParams {
  indicator: IndicatorType;
  condition: 'crosses_above' | 'crosses_below' | 'above' | 'below';
  threshold?: number;         // e.g. 30 for RSI, 0 for MACD signal line
  secondaryIndicator?: IndicatorType; // for MA crossovers (SMA 50 vs SMA 200)
  period?: number;            // e.g. 14 for RSI period
  secondaryPeriod?: number;
}

export interface PriceLevelParams {
  level: number;              // support/resistance price
  direction: 'breakout_above' | 'breakout_below' | 'bounce_at';
}

export interface ChartPatternParams {
  patternName: 'double_bottom' | 'double_top' | 'head_shoulders' | 'flag' | 'triangle' | 'wedge';
  confirmationBars?: number;
}

export interface CustomRuleParams {
  expression: string;         // free-form condition
  note?: string;
  [key: string]: unknown;
}

export interface EntryRule {
  type: 'indicator_cross' | 'price_level' | 'pattern' | 'custom';
  description: string;
  params:
    | IndicatorCrossParams
    | PriceLevelParams
    | ChartPatternParams
    | CustomRuleParams
    | Record<string, unknown>;
}

// ─── Exit Rule Params ──────────────────────────────────────
export interface TakeProfitParams {
  percent: number;            // e.g. 5 = 5% gain
  targetPrice?: number;       // absolute price target (overrides percent)
}

export interface StopLossParams {
  percent: number;            // e.g. 2 = -2% loss
  stopPrice?: number;         // absolute stop price
}

export interface TrailingStopParams {
  percent: number;            // trail distance, e.g. 3 = 3%
  activationPercent?: number; // % gain before trailing activates, e.g. 1.5
}

export interface IndicatorSignalParams {
  indicator: IndicatorType;
  condition: 'crosses_above' | 'crosses_below' | 'above' | 'below';
  threshold?: number;
  period?: number;
}

export interface TimeBasedParams {
  durationBars?: number;      // exit after N bars
  durationMinutes?: number;
  durationHours?: number;
  durationDays?: number;
  exitAtEndOfSession?: boolean;
}

export interface ExitRule {
  type: 'take_profit' | 'stop_loss' | 'trailing_stop' | 'indicator_signal' | 'time_based' | 'custom';
  description: string;
  params:
    | TakeProfitParams
    | StopLossParams
    | TrailingStopParams
    | IndicatorSignalParams
    | TimeBasedParams
    | Record<string, unknown>;
}

export interface StrategyConfig {
  type: StrategyType;
  timeframes: Timeframe[];
  symbols: string[];         // symbol tickers this strategy trades
  indicators: IndicatorType[];
  entryRules: EntryRule[];
  exitRules: ExitRule[];
  riskPerTrade: number;      // percentage, e.g. 1 = 1%
  maxPositions: number;
}

export interface Strategy {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  type: string;
  status: 'draft' | 'active' | 'paused' | 'archived';
  config: StrategyConfig;
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