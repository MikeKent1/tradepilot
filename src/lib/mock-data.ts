import { Portfolio, Position, Trade, WatchlistItem, MarketAsset, Strategy, Notification, CandlestickData } from '@/types';

// ─── Fake Portfolio ────────────────────────────────────────
export const mockPortfolio: Portfolio = {
  id: 'pf-001',
  user_id: 'user-001',
  name: 'Default Portfolio',
  mode: 'paper',
  cash_balance: 52450.75,
  total_value: 152450.75,
  total_pnl: 12450.75,
  total_pnl_percent: 8.89,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

// ─── Fake Positions ────────────────────────────────────────
export const mockPositions: Position[] = [
  {
    id: 'pos-001',
    portfolio_id: 'pf-001',
    symbol: 'AAPL',
    name: 'Apple Inc.',
    quantity: 50,
    avg_price: 175.20,
    current_price: 192.58,
    market_value: 9629.00,
    unrealized_pnl: 869.00,
    unrealized_pnl_percent: 9.92,
    realized_pnl: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'pos-002',
    portfolio_id: 'pf-001',
    symbol: 'MSFT',
    name: 'Microsoft Corp.',
    quantity: 20,
    avg_price: 380.50,
    current_price: 425.22,
    market_value: 8504.40,
    unrealized_pnl: 894.40,
    unrealized_pnl_percent: 11.75,
    realized_pnl: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'pos-003',
    portfolio_id: 'pf-001',
    symbol: 'GOOGL',
    name: 'Alphabet Inc.',
    quantity: 30,
    avg_price: 140.75,
    current_price: 178.34,
    market_value: 5350.20,
    unrealized_pnl: 1127.70,
    unrealized_pnl_percent: 26.70,
    realized_pnl: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'pos-004',
    portfolio_id: 'pf-001',
    symbol: 'NVDA',
    name: 'NVIDIA Corp.',
    quantity: 10,
    avg_price: 820.00,
    current_price: 947.89,
    market_value: 9478.90,
    unrealized_pnl: 1278.90,
    unrealized_pnl_percent: 15.60,
    realized_pnl: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'pos-005',
    portfolio_id: 'pf-001',
    symbol: 'TSLA',
    name: 'Tesla Inc.',
    quantity: 40,
    avg_price: 195.30,
    current_price: 183.45,
    market_value: 7338.00,
    unrealized_pnl: -474.00,
    unrealized_pnl_percent: -6.07,
    realized_pnl: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

// ─── Fake Trades ───────────────────────────────────────────
export const mockTrades: Trade[] = [
  {
    id: 'trd-001',
    portfolio_id: 'pf-001',
    symbol: 'AAPL',
    name: 'Apple Inc.',
    type: 'buy',
    quantity: 50,
    price: 175.20,
    total: 8760.00,
    fee: 1.50,
    mode: 'paper',
    executed_at: new Date(Date.now() - 7 * 86400000).toISOString(),
    created_at: new Date(Date.now() - 7 * 86400000).toISOString(),
  },
  {
    id: 'trd-002',
    portfolio_id: 'pf-001',
    symbol: 'MSFT',
    name: 'Microsoft Corp.',
    type: 'buy',
    quantity: 20,
    price: 380.50,
    total: 7610.00,
    fee: 1.50,
    mode: 'paper',
    executed_at: new Date(Date.now() - 5 * 86400000).toISOString(),
    created_at: new Date(Date.now() - 5 * 86400000).toISOString(),
  },
  {
    id: 'trd-003',
    portfolio_id: 'pf-001',
    symbol: 'GOOGL',
    name: 'Alphabet Inc.',
    type: 'buy',
    quantity: 30,
    price: 140.75,
    total: 4222.50,
    fee: 1.50,
    mode: 'paper',
    executed_at: new Date(Date.now() - 3 * 86400000).toISOString(),
    created_at: new Date(Date.now() - 3 * 86400000).toISOString(),
  },
  {
    id: 'trd-004',
    portfolio_id: 'pf-001',
    symbol: 'NVDA',
    name: 'NVIDIA Corp.',
    type: 'buy',
    quantity: 10,
    price: 820.00,
    total: 8200.00,
    fee: 1.50,
    mode: 'paper',
    executed_at: new Date(Date.now() - 2 * 86400000).toISOString(),
    created_at: new Date(Date.now() - 2 * 86400000).toISOString(),
  },
  {
    id: 'trd-005',
    portfolio_id: 'pf-001',
    symbol: 'TSLA',
    name: 'Tesla Inc.',
    type: 'buy',
    quantity: 40,
    price: 195.30,
    total: 7812.00,
    fee: 1.50,
    mode: 'paper',
    executed_at: new Date(Date.now() - 86400000).toISOString(),
    created_at: new Date(Date.now() - 86400000).toISOString(),
  },
  {
    id: 'trd-006',
    portfolio_id: 'pf-001',
    symbol: 'TSLA',
    name: 'Tesla Inc.',
    type: 'sell',
    quantity: 10,
    price: 210.00,
    total: 2100.00,
    fee: 1.50,
    mode: 'paper',
    pnl: 147.00,
    pnl_percent: 7.53,
    executed_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  },
];

// ─── Fake Watchlist ────────────────────────────────────────
export const mockWatchlist: WatchlistItem[] = [
  { id: 'wl-001', user_id: 'user-001', symbol: 'AMZN', name: 'Amazon.com Inc.', price: 185.67, change: 2.34, change_percent: 1.28, added_at: new Date().toISOString() },
  { id: 'wl-002', user_id: 'user-001', symbol: 'META', name: 'Meta Platforms Inc.', price: 504.22, change: 8.95, change_percent: 1.81, added_at: new Date().toISOString() },
  { id: 'wl-003', user_id: 'user-001', symbol: 'AMD', name: 'Advanced Micro Devices', price: 162.33, change: -2.45, change_percent: -1.49, added_at: new Date().toISOString() },
  { id: 'wl-004', user_id: 'user-001', symbol: 'JPM', name: 'JPMorgan Chase & Co.', price: 200.15, change: 0.85, change_percent: 0.43, added_at: new Date().toISOString() },
  { id: 'wl-005', user_id: 'user-001', symbol: 'V', name: 'Visa Inc.', price: 275.90, change: -1.20, change_percent: -0.43, added_at: new Date().toISOString() },
  { id: 'wl-006', user_id: 'user-001', symbol: 'NFLX', name: 'Netflix Inc.', price: 628.44, change: 12.30, change_percent: 2.00, added_at: new Date().toISOString() },
];

// ─── Fake Market Assets ────────────────────────────────────
export const mockMarketAssets: MarketAsset[] = [
  { symbol: 'AAPL', name: 'Apple Inc.', price: 192.58, change: 3.42, change_percent: 1.81, volume: 52437890, market_cap: 2950000000000, sector: 'Technology' },
  { symbol: 'MSFT', name: 'Microsoft Corp.', price: 425.22, change: 5.30, change_percent: 1.26, volume: 22156780, market_cap: 3150000000000, sector: 'Technology' },
  { symbol: 'GOOGL', name: 'Alphabet Inc.', price: 178.34, change: 2.15, change_percent: 1.22, volume: 18765430, market_cap: 2200000000000, sector: 'Technology' },
  { symbol: 'AMZN', name: 'Amazon.com Inc.', price: 185.67, change: 2.34, change_percent: 1.28, volume: 34567210, market_cap: 1930000000000, sector: 'Consumer Cyclical' },
  { symbol: 'NVDA', name: 'NVIDIA Corp.', price: 947.89, change: 28.45, change_percent: 3.09, volume: 45678900, market_cap: 2330000000000, sector: 'Technology' },
  { symbol: 'META', name: 'Meta Platforms Inc.', price: 504.22, change: 8.95, change_percent: 1.81, volume: 12345670, market_cap: 1280000000000, sector: 'Technology' },
  { symbol: 'TSLA', name: 'Tesla Inc.', price: 183.45, change: -3.20, change_percent: -1.72, volume: 87654320, market_cap: 584000000000, sector: 'Consumer Cyclical' },
  { symbol: 'AMD', name: 'Advanced Micro Devices', price: 162.33, change: -2.45, change_percent: -1.49, volume: 45678910, market_cap: 262000000000, sector: 'Technology' },
  { symbol: 'JPM', name: 'JPMorgan Chase & Co.', price: 200.15, change: 0.85, change_percent: 0.43, volume: 9876540, market_cap: 575000000000, sector: 'Financial' },
  { symbol: 'V', name: 'Visa Inc.', price: 275.90, change: -1.20, change_percent: -0.43, volume: 7654320, market_cap: 564000000000, sector: 'Financial' },
  { symbol: 'NFLX', name: 'Netflix Inc.', price: 628.44, change: 12.30, change_percent: 2.00, volume: 5432100, market_cap: 272000000000, sector: 'Communication' },
  { symbol: 'DIS', name: 'Walt Disney Co.', price: 105.67, change: 0.55, change_percent: 0.52, volume: 12345600, market_cap: 193000000000, sector: 'Communication' },
];

// ─── Fake Strategies ───────────────────────────────────────
export const mockStrategies: Strategy[] = [
  {
    id: 'str-001',
    user_id: 'user-001',
    name: 'Moving Average Crossover',
    description: 'Buy when 50-day MA crosses above 200-day MA, sell when crosses below.',
    type: 'technical',
    status: 'active',
    config: { fast_period: 50, slow_period: 200 },
    performance: {
      total_trades: 24,
      win_rate: 0.625,
      avg_pnl: 145.50,
      total_pnl: 3492.00,
      total_pnl_percent: 8.5,
      sharpe_ratio: 1.42,
      max_drawdown: -5.2,
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'str-002',
    user_id: 'user-001',
    name: 'RSI Mean Reversion',
    description: 'Buy when RSI oversold (<30), sell when overbought (>70)',
    type: 'technical',
    status: 'active',
    config: { rsi_period: 14, oversold: 30, overbought: 70 },
    performance: {
      total_trades: 18,
      win_rate: 0.555,
      avg_pnl: 97.20,
      total_pnl: 1749.60,
      total_pnl_percent: 6.2,
      sharpe_ratio: 0.98,
      max_drawdown: -8.1,
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'str-003',
    user_id: 'user-001',
    name: 'Breakout Momentum',
    description: 'Buy on breakout above resistance with high volume confirmation',
    type: 'quant',
    status: 'draft',
    config: { volume_threshold: 2.0, lookback_days: 20 },
    performance: {
      total_trades: 0,
      win_rate: 0,
      avg_pnl: 0,
      total_pnl: 0,
      total_pnl_percent: 0,
      sharpe_ratio: 0,
      max_drawdown: 0,
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

// ─── Fake Notifications ────────────────────────────────────
export const mockNotifications: Notification[] = [
  { id: 'not-001', type: 'success', title: 'Trade Executed', message: 'Buy 50 shares of AAPL at $175.20 executed successfully.', timestamp: new Date().toISOString(), read: false },
  { id: 'not-002', type: 'warning', title: 'Margin Warning', message: 'Your margin usage has exceeded 70%. Consider reducing positions.', timestamp: new Date(Date.now() - 3600000).toISOString(), read: false },
  { id: 'not-003', type: 'info', title: 'Strategy Updated', message: 'Moving Average Crossover strategy parameters have been updated.', timestamp: new Date(Date.now() - 7200000).toISOString(), read: true },
  { id: 'not-004', type: 'success', title: 'Dividend Received', message: 'AAPL dividend of $0.25/share ($12.50 total) has been credited.', timestamp: new Date(Date.now() - 86400000).toISOString(), read: true },
  { id: 'not-005', type: 'error', title: 'Order Failed', message: 'Sell order for TSLA at $220.00 failed: insufficient volume.', timestamp: new Date(Date.now() - 172800000).toISOString(), read: true },
];

// ─── Chart Helpers ─────────────────────────────────────────
export function generatePortfolioHistory(days = 30) {
  const data: { date: string; value: number }[] = [];
  let value = 135000;
  for (let i = days; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    value += (Math.random() - 0.45) * 2000;
    data.push({ date: date.toISOString().split('T')[0], value: Math.round(value * 100) / 100 });
  }
  return data;
}

export function generateCandlestickData(symbol: string, days = 90): CandlestickData[] {
  const data: CandlestickData[] = [];
  let price = symbol === 'NVDA' ? 900 : symbol === 'AAPL' ? 180 : 200;

  for (let i = days; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const volatility = price * 0.025;
    const open = price + (Math.random() - 0.5) * volatility;
    const close = open + (Math.random() - 0.5) * volatility;
    const high = Math.max(open, close) + Math.random() * volatility * 0.5;
    const low = Math.min(open, close) - Math.random() * volatility * 0.5;
    const volume = Math.floor(Math.random() * 5000000 + 1000000);
    data.push({
      time: date.toISOString().split('T')[0],
      open: Math.round(open * 100) / 100,
      high: Math.round(high * 100) / 100,
      low: Math.round(low * 100) / 100,
      close: Math.round(close * 100) / 100,
      volume,
    });
    price = close;
  }
  return data;
}