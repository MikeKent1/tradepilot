import { supabase } from '@/lib/supabase/client';
import type { Portfolio, Position, Trade, WatchlistItem, Strategy, TradingMode } from '@/types';

// ─── Portfolio ───────────────────────────────────────────
export async function fetchPortfolio(userId: string, mode: TradingMode = 'paper'): Promise<Portfolio | null> {
  const { data, error } = await supabase
    .from('portfolios')
    .select('*')
    .eq('user_id', userId)
    .eq('mode', mode)
    .single();
  if (error || !data) return null;
  return mapPortfolio(data);
}

export async function createPortfolio(
  userId: string,
  name: string,
  mode: TradingMode = 'paper',
): Promise<Portfolio | null> {
  const { data, error } = await supabase
    .from('portfolios')
    .insert({
      user_id: userId,
      name,
      mode,
      cash_balance: 100000.00,
      total_value: 100000.00,
      total_pnl: 0.00,
      total_pnl_percent: 0.00,
    })
    .select()
    .single();
  if (error) return null;
  return mapPortfolio(data);
}

export async function updatePortfolioBalance(
  portfolioId: string,
  updates: { cash_balance: number; total_value: number; total_pnl: number; total_pnl_percent: number },
) {
  return supabase
    .from('portfolios')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', portfolioId);
}

// ─── Positions ───────────────────────────────────────────
export async function fetchPositions(portfolioId: string): Promise<Position[]> {
  const { data, error } = await supabase
    .from('positions')
    .select('*')
    .eq('portfolio_id', portfolioId)
    .order('updated_at', { ascending: false });
  if (error) return [];
  return data.map(mapPosition);
}

export async function upsertPosition(
  portfolioId: string,
  position: Omit<Position, 'id' | 'portfolio_id' | 'created_at' | 'updated_at'> & { id?: string },
) {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('positions')
    .upsert(
      {
        id: position.id,
        portfolio_id: portfolioId,
        symbol: position.symbol,
        name: position.name,
        quantity: position.quantity,
        avg_price: position.avg_price,
        current_price: position.current_price,
        market_value: position.market_value,
        unrealized_pnl: position.unrealized_pnl,
        unrealized_pnl_percent: position.unrealized_pnl_percent,
        realized_pnl: position.realized_pnl,
        updated_at: now,
      },
      { onConflict: 'portfolio_id,symbol' },
    )
    .select()
    .single();
  if (error) return null;
  return mapPosition(data);
}

export async function deletePosition(id: string) {
  return supabase.from('positions').delete().eq('id', id);
}

// ─── Trades ──────────────────────────────────────────────
export async function fetchTrades(portfolioId: string, mode: TradingMode = 'paper'): Promise<Trade[]> {
  const { data, error } = await supabase
    .from('trades')
    .select('*')
    .eq('portfolio_id', portfolioId)
    .eq('mode', mode)
    .order('executed_at', { ascending: false });
  if (error) return [];
  return data.map(mapTrade);
}

export async function fetchTradesByStrategy(strategyId: string, mode: TradingMode = 'paper'): Promise<Trade[]> {
  const { data, error } = await supabase
    .from('trades')
    .select('*')
    .eq('strategy_id', strategyId)
    .eq('mode', mode)
    .order('executed_at', { ascending: false });
  if (error) return [];
  return data.map(mapTrade);
}

export async function insertTrade(
  portfolioId: string,
  trade: Omit<Trade, 'id' | 'portfolio_id' | 'created_at'>,
  mode: TradingMode = 'paper',
) {
  const { data, error } = await supabase
    .from('trades')
    .insert({
      portfolio_id: portfolioId,
      symbol: trade.symbol,
      name: trade.name,
      type: trade.type,
      quantity: trade.quantity,
      price: trade.price,
      total: trade.total,
      fee: trade.fee,
      pnl: trade.pnl ?? null,
      pnl_percent: trade.pnl_percent ?? null,
      strategy_id: trade.strategy_id ?? null,
      notes: trade.notes ?? null,
      executed_at: trade.executed_at,
      mode,
    })
    .select()
    .single();
  if (error) return null;
  return mapTrade(data);
}

// ─── Watchlist ───────────────────────────────────────────
export async function fetchWatchlist(userId: string): Promise<WatchlistItem[]> {
  const { data, error } = await supabase
    .from('watchlists')
    .select('*')
    .eq('user_id', userId)
    .order('added_at', { ascending: false });
  if (error) return [];
  return data.map(mapWatchlistItem);
}

export async function addToWatchlistDb(
  userId: string,
  item: Omit<WatchlistItem, 'id' | 'user_id' | 'added_at'>,
) {
  const { data, error } = await supabase
    .from('watchlists')
    .upsert(
      {
        user_id: userId,
        symbol: item.symbol,
        name: item.name,
        price: item.price,
        change: item.change,
        change_percent: item.change_percent,
      },
      { onConflict: 'user_id,symbol' },
    )
    .select()
    .single();
  if (error) return null;
  return mapWatchlistItem(data);
}

export async function removeFromWatchlistDb(id: string) {
  return supabase.from('watchlists').delete().eq('id', id);
}

// ─── Strategies ──────────────────────────────────────────
export async function fetchStrategies(userId: string): Promise<Strategy[]> {
  const { data, error } = await supabase
    .from('strategies')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) return [];
  return data.map(mapStrategy);
}

export async function fetchStrategy(id: string): Promise<Strategy | null> {
  const { data, error } = await supabase
    .from('strategies')
    .select('*')
    .eq('id', id)
    .single();
  if (error || !data) return null;
  return mapStrategy(data);
}

export async function upsertStrategy(
  userId: string,
  strategy: Omit<Strategy, 'id' | 'user_id' | 'created_at' | 'updated_at'> & { id?: string },
) {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('strategies')
    .upsert({
      id: strategy.id,
      user_id: userId,
      name: strategy.name,
      description: strategy.description ?? null,
      type: strategy.type,
      status: strategy.status,
      config: strategy.config ?? {},
      total_trades: strategy.performance.total_trades,
      win_rate: strategy.performance.win_rate,
      avg_pnl: strategy.performance.avg_pnl,
      total_pnl: strategy.performance.total_pnl,
      total_pnl_percent: strategy.performance.total_pnl_percent,
      sharpe_ratio: strategy.performance.sharpe_ratio,
      max_drawdown: strategy.performance.max_drawdown,
      updated_at: now,
    })
    .select()
    .single();
  if (error) return null;
  return mapStrategy(data);
}

export async function deleteStrategy(id: string) {
  return supabase.from('strategies').delete().eq('id', id);
}

// ─── Notifications ───────────────────────────────────────
import type { Notification } from '@/types';

export async function fetchNotifications(userId: string): Promise<Notification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) return [];
  return data.map(mapNotification);
}

export async function insertNotificationDb(
  userId: string,
  notification: Omit<Notification, 'id' | 'user_id' | 'timestamp' | 'read'>,
) {
  const { data, error } = await supabase
    .from('notifications')
    .insert({
      user_id: userId,
      type: notification.type,
      title: notification.title,
      message: notification.message,
    })
    .select()
    .single();
  if (error) return null;
  return mapNotification(data);
}

export async function markNotificationReadDb(id: string) {
  return supabase.from('notifications').update({ read: true }).eq('id', id);
}

export async function markAllNotificationsReadDb(userId: string) {
  return supabase.from('notifications').update({ read: true }).eq('user_id', userId).eq('read', false);
}

export async function deleteNotificationDb(id: string) {
  return supabase.from('notifications').delete().eq('id', id);
}

// ─── Mapping helpers ─────────────────────────────────────
function mapPortfolio(row: Record<string, unknown>): Portfolio {
  return {
    id: row.id as string,
    user_id: row.user_id as string,
    name: row.name as string,
    cash_balance: Number(row.cash_balance),
    total_value: Number(row.total_value),
    total_pnl: Number(row.total_pnl),
    total_pnl_percent: Number(row.total_pnl_percent),
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

function mapPosition(row: Record<string, unknown>): Position {
  return {
    id: row.id as string,
    portfolio_id: row.portfolio_id as string,
    symbol: row.symbol as string,
    name: row.name as string,
    quantity: Number(row.quantity),
    avg_price: Number(row.avg_price),
    current_price: Number(row.current_price),
    market_value: Number(row.market_value),
    unrealized_pnl: Number(row.unrealized_pnl),
    unrealized_pnl_percent: Number(row.unrealized_pnl_percent),
    realized_pnl: Number(row.realized_pnl),
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

function mapTrade(row: Record<string, unknown>): Trade {
  return {
    id: row.id as string,
    portfolio_id: row.portfolio_id as string,
    symbol: row.symbol as string,
    name: row.name as string,
    type: row.type as 'buy' | 'sell',
    quantity: Number(row.quantity),
    price: Number(row.price),
    total: Number(row.total),
    fee: Number(row.fee),
    pnl: row.pnl != null ? Number(row.pnl) : undefined,
    pnl_percent: row.pnl_percent != null ? Number(row.pnl_percent) : undefined,
    strategy_id: row.strategy_id as string | undefined,
    notes: row.notes as string | undefined,
    executed_at: row.executed_at as string,
    created_at: row.created_at as string,
  };
}

function mapWatchlistItem(row: Record<string, unknown>): WatchlistItem {
  return {
    id: row.id as string,
    user_id: row.user_id as string,
    symbol: row.symbol as string,
    name: row.name as string,
    price: Number(row.price),
    change: Number(row.change),
    change_percent: Number(row.change_percent),
    added_at: row.added_at as string,
  };
}

function mapStrategy(row: Record<string, unknown>): Strategy {
  return {
    id: row.id as string,
    user_id: row.user_id as string,
    name: row.name as string,
    description: row.description as string | undefined,
    type: row.type as string,
    status: row.status as 'draft' | 'active' | 'paused' | 'archived',
    config: row.config as Record<string, unknown>,
    performance: {
      total_trades: Number(row.total_trades ?? 0),
      win_rate: Number(row.win_rate ?? 0),
      avg_pnl: Number(row.avg_pnl ?? 0),
      total_pnl: Number(row.total_pnl ?? 0),
      total_pnl_percent: Number(row.total_pnl_percent ?? 0),
      sharpe_ratio: Number(row.sharpe_ratio ?? 0),
      max_drawdown: Number(row.max_drawdown ?? 0),
    },
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

function mapNotification(row: Record<string, unknown>): Notification {
  return {
    id: row.id as string,
    user_id: row.user_id as string,
    type: row.type as 'success' | 'error' | 'warning' | 'info',
    title: row.title as string,
    message: row.message as string,
    timestamp: row.created_at as string,
    read: Boolean(row.read),
  };
}