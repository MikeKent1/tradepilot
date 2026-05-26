'use client';

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { usePortfolioData } from '@/lib/hooks/use-portfolio-data';
import { useWatchlistData } from '@/lib/hooks/use-watchlist-data';
import { useNotificationsData } from '@/lib/hooks/use-notifications-data';
import { useTrades } from '@/lib/hooks/use-trades';
import { generatePortfolioHistory } from '@/lib/mock-data';
import { formatCurrency, formatPercent, pnlColor, formatLargeNumber } from '@/lib/utils';
import { useState, useMemo } from 'react';
import Link from 'next/link';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
  Plus,
  X,
  Bell,
  Wallet,
  PieChart,
  Activity,
  Clock,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

export default function DashboardPage() {
  const { portfolio, positions } = usePortfolioData();
  const { watchlist } = useWatchlistData();
  const { data: trades = [] } = useTrades(portfolio?.id);
  const recentTrades = useMemo(() => trades.slice(0, 5), [trades]);

  const {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    removeNotification,
  } = useNotificationsData();

  const [notifOpen, setNotifOpen] = useState(false);

  const history = useMemo(() => generatePortfolioHistory(30), []);

  const totalMarketValue = positions.reduce((sum, p) => sum + p.market_value, 0);
  const totalUnrealizedPnl = positions.reduce((sum, p) => sum + p.unrealized_pnl, 0);
  const investedCapital =
    portfolio && portfolio.total_value > 0
      ? portfolio.total_value - portfolio.cash_balance
      : 1;
  const totalUnrealizedPnlPercent =
    investedCapital > 0 ? (totalUnrealizedPnl / investedCapital) * 100 : 0;

  const pendingNotifCount = unreadCount;

  const portfolioValue = portfolio?.total_value ?? 0;
  const portfolioPnl = portfolio?.total_pnl ?? 0;
  const portfolioPnlPercent = portfolio?.total_pnl_percent ?? 0;
  const cashBalance = portfolio?.cash_balance ?? 0;

  // Allocation data for breakdown
  const allocation = useMemo(() => {
    if (totalMarketValue === 0) return [];
    return positions
      .map((p) => ({
        symbol: p.symbol,
        value: p.market_value,
        percent: (p.market_value / totalMarketValue) * 100,
        pnl: p.unrealized_pnl_percent,
      }))
      .sort((a, b) => b.value - a.value);
  }, [positions, totalMarketValue]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-sm text-zinc-400 mt-0.5">Portfolio overview & recent activity</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setNotifOpen(!notifOpen)}
            className="relative p-2 rounded-lg bg-card border border-card-border hover:bg-card-hover transition-colors cursor-pointer"
          >
            <Bell className="w-4 h-4 text-zinc-400" />
            {pendingNotifCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-accent text-white text-[9px] rounded-full flex items-center justify-center font-bold">
                {pendingNotifCount}
              </span>
            )}
          </button>
          <Link href="/trades">
            <Button size="md">
              <Plus className="w-4 h-4" />
              New Trade
            </Button>
          </Link>
        </div>
      </div>

      {/* Notifications Popover */}
      {notifOpen && (
        <div className="absolute right-6 top-16 w-80 z-50 animate-fade-in">
          <Card className="!p-0 border-accent/20">
            <div className="flex items-center justify-between px-4 py-3 border-b border-card-border">
              <p className="text-sm font-semibold text-zinc-200">Notifications</p>
              <button
                onClick={() => markAllAsRead()}
                className="text-xs text-accent hover:text-accent-hover cursor-pointer"
              >
                Mark all read
              </button>
            </div>
            <div className="max-h-64 overflow-y-auto">
              {notifications.length === 0 ? (
                <p className="text-xs text-zinc-500 p-4 text-center">No notifications</p>
              ) : (
                notifications.slice(0, 8).map((n) => (
                  <div
                    key={n.id}
                    className={`flex items-start gap-2 px-4 py-2.5 border-b border-card-border/50 ${
                      !n.read ? 'bg-accent/5' : ''
                    }`}
                  >
                    <div
                      className="flex-1 min-w-0 cursor-pointer"
                      onClick={() => !n.read && markAsRead(n.id)}
                    >
                      <p className="text-xs font-medium text-zinc-300">{n.title}</p>
                      <p className="text-[11px] text-zinc-500 truncate">{n.message}</p>
                    </div>
                    <button
                      onClick={() => removeNotification(n.id)}
                      className="text-zinc-600 hover:text-zinc-400 shrink-0 cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Portfolio Value</CardTitle>
            <Wallet className="w-4 h-4 text-accent" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-white">{formatCurrency(portfolioValue)}</p>
            <p className={`text-sm mt-1 flex items-center gap-1 ${pnlColor(portfolioPnl)}`}>
              {portfolioPnl >= 0 ? (
                <ArrowUpRight className="w-3 h-3" />
              ) : (
                <ArrowDownRight className="w-3 h-3" />
              )}
              {formatCurrency(Math.abs(portfolioPnl))} ({formatPercent(portfolioPnlPercent)})
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cash Balance</CardTitle>
            <DollarSign className="w-4 h-4 text-emerald-400" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-white">{formatCurrency(cashBalance)}</p>
            <p className="text-xs text-zinc-500 mt-1">Available for trading</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Unrealized P&L</CardTitle>
            <Activity className="w-4 h-4 text-warning" />
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold ${pnlColor(totalUnrealizedPnl)}`}>
              {formatCurrency(totalUnrealizedPnl)}
            </p>
            <p className={`text-sm mt-1 ${pnlColor(totalUnrealizedPnl)}`}>
              {formatPercent(totalUnrealizedPnlPercent)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Positions</CardTitle>
            <PieChart className="w-4 h-4 text-info" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-white">{positions.length}</p>
            <p className="text-xs text-zinc-500 mt-1">Active positions</p>
          </CardContent>
        </Card>
      </div>

      {/* Chart + Allocation */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Portfolio Performance</CardTitle>
            <p className="text-xs text-zinc-500">Last 30 days (simulated)</p>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={history}>
                <defs>
                  <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: '#6b6b80' }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: '#6b6b80' }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                />
                <Tooltip
                  contentStyle={{
                    background: '#12121a',
                    border: '1px solid #1e1e2e',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                  labelStyle={{ color: '#a0a0b8' }}
                  formatter={(value: unknown) => [formatCurrency(value as number), 'Value']}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="#6366f1"
                  strokeWidth={2}
                  fill="url(#colorValue)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Allocation */}
        <Card>
          <CardHeader>
            <CardTitle>Allocation</CardTitle>
            <span className="text-xs text-zinc-500">
              {allocation.length > 0 ? `${allocation.length} holdings` : 'No positions'}
            </span>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-[280px] overflow-y-auto">
              {allocation.map((item) => (
                <div key={item.symbol} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-zinc-200">{item.symbol}</p>
                    <div className="text-right">
                      <p className="text-xs text-zinc-300">{formatCurrency(item.value)}</p>
                      <p
                        className={`text-[11px] ${
                          item.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'
                        }`}
                      >
                        {formatPercent(item.pnl)}
                      </p>
                    </div>
                  </div>
                  <div className="w-full h-1.5 bg-card-hover rounded-full overflow-hidden">
                    <div
                      className="h-full bg-accent rounded-full transition-all"
                      style={{ width: `${Math.max(2, item.percent)}%` }}
                    />
                  </div>
                </div>
              ))}
              {allocation.length === 0 && (
                <p className="text-center text-xs text-zinc-500 py-4">
                  No positions yet. Start trading!
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Trades + Watchlist */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recent Trades (from Supabase) */}
        <Card>
          <CardHeader>
            <CardTitle>
              <Clock className="w-4 h-4 inline mr-1.5" />
              Recent Trades
            </CardTitle>
            <Link
              href="/trades"
              className="text-xs text-accent hover:text-accent-hover transition-colors"
            >
              View All
            </Link>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {recentTrades.map((trade) => (
                <div
                  key={trade.id}
                  className="flex items-center justify-between p-2 rounded-lg hover:bg-card-hover transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-0.5 text-xs font-medium px-1.5 py-0.5 rounded-full ${
                        trade.type === 'buy'
                          ? 'bg-emerald-500/10 text-emerald-400'
                          : 'bg-red-500/10 text-red-400'
                      }`}
                    >
                      {trade.type === 'buy' ? (
                        <ArrowUpRight className="w-3 h-3" />
                      ) : (
                        <ArrowDownRight className="w-3 h-3" />
                      )}
                      {trade.type.toUpperCase()}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-zinc-200">{trade.symbol}</p>
                      <p className="text-[10px] text-zinc-500">
                        {trade.quantity} @ {formatCurrency(trade.price)}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-zinc-200">
                      {formatCurrency(trade.total)}
                    </p>
                    {trade.pnl !== undefined ? (
                      <p
                        className={`text-xs ${trade.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}
                      >
                        {formatCurrency(trade.pnl)}
                      </p>
                    ) : (
                      <p className="text-[10px] text-zinc-500">
                        {new Date(trade.executed_at).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                </div>
              ))}
              {recentTrades.length === 0 && (
                <p className="text-center text-xs text-zinc-500 py-4">
                  No trades yet.{' '}
                  <Link href="/trades" className="text-accent hover:text-accent-hover">
                    Make your first trade →
                  </Link>
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Watchlist */}
        <Card>
          <CardHeader>
            <CardTitle>Watchlist</CardTitle>
            <BarChart3 className="w-4 h-4 text-zinc-500" />
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {watchlist.length > 0 ? (
                watchlist.slice(0, 6).map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-2 rounded-lg hover:bg-card-hover transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      {item.change_percent > 0 ? (
                        <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <TrendingDown className="w-3.5 h-3.5 text-red-400" />
                      )}
                      <span className="text-xs font-medium text-zinc-200">{item.symbol}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-xs ${pnlColor(item.change)}`}>
                        {formatCurrency(item.change)}
                      </span>
                      <span className={`text-xs font-medium ${pnlColor(item.change_percent)}`}>
                        {formatPercent(item.change_percent)}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-center text-xs text-zinc-500 py-4">
                  Watchlist empty. Add symbols from the Market page.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}