'use client';

import { useState, useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { useAnalyticsData, type AnalyticsData } from '@/lib/hooks/use-analytics-data';
import { usePortfolioData } from '@/lib/hooks/use-portfolio-data';
import { useStrategiesData } from '@/lib/hooks/use-strategies-data';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth/auth-provider';
import { useAppStore } from '@/stores/app-store';
import * as dataService from '@/lib/services/data-service';
import { mockTrades } from '@/lib/mock-data';
import { formatCurrency, formatPercent, pnlColor } from '@/lib/utils';
import type { Trade, Strategy } from '@/types';
import {
  TrendingUp,
  TrendingDown,
  Target,
  Shield,
  Activity,
  DollarSign,
  BarChart3,
  PieChart,
  Award,
  AlertTriangle,
  Search,
  Filter,
  X,
  Calendar,
  Lightbulb,
  Download,
  Loader2,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Cell,
  PieChart as RePieChart,
  Pie,
} from 'recharts';
import { downloadAnalyticsPdf } from '@/lib/services/pdf-export';

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#14b8a6'];

export default function AnalyticsPage() {
  const [journalTab, setJournalTab] = useState<'all' | 'wins' | 'losses'>('all');
  const [journalSymbol, setJournalSymbol] = useState('');
  const [journalStrategy, setJournalStrategy] = useState('');
  const [journalDateFrom, setJournalDateFrom] = useState('');
  const [journalDateTo, setJournalDateTo] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const { data: analyticsData, isLoading } = useAnalyticsData();
  const { positions } = usePortfolioData();
  const { user } = useAuth();
  const tradingMode = useAppStore((s) => s.tradingMode);

  // Fetch strategies for strategy-performance view
  const { strategies: strategiesData = [] } = useStrategiesData();

  // ── Fetch trades from data-service for full journal ──
  const tradesQuery = useQuery({
    queryKey: ['analytics-journal-trades', user?.id, tradingMode],
    queryFn: async (): Promise<Trade[]> => {
      if (!user?.id) return [];
      const portfolio = await dataService.fetchPortfolio(user.id, tradingMode);
      if (!portfolio) return [];
      return dataService.fetchTrades(portfolio.id, tradingMode);
    },
    enabled: !!user?.id,
  });
  const allTrades = tradesQuery.data ?? [];

  // Use real data from hook, fall back to mock trades for demo
  const trades = analyticsData?.trades?.length ? analyticsData.trades : mockTrades;
  const totalTrades = analyticsData?.totalTrades ?? trades.filter((t: Trade) => t.pnl != null).length;
  const winningTrades = analyticsData?.winningTrades ?? trades.filter((t: Trade) => (t.pnl ?? 0) > 0).length;
  const losingTrades = analyticsData?.losingTrades ?? trades.filter((t: Trade) => (t.pnl ?? 0) < 0).length;
  const winRate = analyticsData?.winRate ?? (totalTrades > 0 ? winningTrades / totalTrades : 0);
  const totalPnl = analyticsData?.totalPnl ?? trades.reduce((s: number, t: Trade) => s + (t.pnl ?? 0), 0);
  const avgWin = analyticsData?.avgWin ?? 0;
  const avgLoss = analyticsData?.avgLoss ?? 0;
  const largestWin = analyticsData?.largestWin ?? 0;
  const largestLoss = analyticsData?.largestLoss ?? 0;
  const profitFactor =
    analyticsData?.profitFactor ?? (avgLoss > 0 ? Math.abs(avgWin / avgLoss) : 0);

  // P&L by symbol for pie chart
  const symbolPnl = analyticsData?.pnlBySymbol?.length
    ? analyticsData.pnlBySymbol.map((s) => ({ name: s.symbol, value: s.pnl > 0 ? s.pnl : 0, pnl: s.pnl }))
    : [];

  // Equity curve
  const equityCurve = analyticsData?.equityCurve?.length
    ? analyticsData.equityCurve
    : trades
        .filter((t) => t.pnl != null)
        .map((t, i, arr) => {
          const cumulative = arr.slice(0, i + 1).reduce((s, x) => s + (x.pnl ?? 0), 0);
          return {
            date: t.executed_at.substring(0, 10),
            value: 100000 + cumulative,
            pnl: cumulative,
          };
        });

  // Monthly P&L
  const monthlyPnl = analyticsData?.monthlyPnl?.length
    ? analyticsData.monthlyPnl
    : [];

  // Win/Loss distribution for pie
  const winLossPie = [
    { name: 'Wins', value: winningTrades, color: '#10b981' },
    { name: 'Losses', value: losingTrades, color: '#ef4444' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Analytics</h1>
          <p className="text-sm text-zinc-400 mt-0.5">
            Performance metrics and trade insights
          </p>
        </div>
        <button
          onClick={() => {
            if (!analyticsData) return;
            downloadAnalyticsPdf(analyticsData);
          }}
          disabled={!analyticsData}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary hover:bg-primary/90 text-white text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          {!analyticsData ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Download className="w-4 h-4" />
          )}
          Export PDF
        </button>
      </div>

      {/* ─── KPI Row ──────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card>
          <CardContent className="!p-4">
            <div className="flex items-center gap-2 mb-1">
              <Activity className="w-3.5 h-3.5 text-accent" />
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider">
                Total P&L
              </p>
            </div>
            <p className={`text-xl font-bold ${pnlColor(totalPnl)}`}>
              {formatCurrency(totalPnl)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="!p-4">
            <div className="flex items-center gap-2 mb-1">
              <Target className="w-3.5 h-3.5 text-emerald-400" />
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider">
                Win Rate
              </p>
            </div>
            <p className="text-xl font-bold text-white">
              {totalTrades > 0 ? (winRate * 100).toFixed(1) : '0'}%
            </p>
            <p className="text-[10px] text-zinc-500">
              {winningTrades}W / {losingTrades}L
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="!p-4">
            <div className="flex items-center gap-2 mb-1">
              <BarChart3 className="w-3.5 h-3.5 text-info" />
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider">
                Profit Factor
              </p>
            </div>
            <p className="text-xl font-bold text-white">
              {profitFactor === Infinity ? '∞' : profitFactor.toFixed(2)}x
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="!p-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider">
                Avg Win
              </p>
            </div>
            <p className="text-xl font-bold text-emerald-400">
              {formatCurrency(avgWin)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="!p-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingDown className="w-3.5 h-3.5 text-red-400" />
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider">
                Avg Loss
              </p>
            </div>
            <p className="text-xl font-bold text-red-400">
              {formatCurrency(avgLoss)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="!p-4">
            <div className="flex items-center gap-2 mb-1">
              <Shield className="w-3.5 h-3.5 text-warning" />
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider">
                Total Trades
              </p>
            </div>
            <p className="text-xl font-bold text-white">{totalTrades}</p>
          </CardContent>
        </Card>
      </div>

      {/* ─── Charts Row 1: Equity Curve + Win/Loss Pie ────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Equity Curve */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Equity Curve</CardTitle>
            <p className="text-xs text-zinc-500">Cumulative P&L over time</p>
          </CardHeader>
          <CardContent>
            {equityCurve.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={equityCurve}>
                  <defs>
                    <linearGradient id="colorEquity" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorPnl" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
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
                    formatter={(value: unknown, _name: unknown) => [
                      formatCurrency(value as number),
                      'Portfolio Value',
                    ]}
                  />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="#6366f1"
                    strokeWidth={2}
                    fill="url(#colorEquity)"
                    name="value"
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="py-16 text-center">
                <BarChart3 className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
                <p className="text-sm text-zinc-500">No trade data yet</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Win/Loss Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Win / Loss Ratio</CardTitle>
          </CardHeader>
          <CardContent>
            {totalTrades > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={200}>
                  <RePieChart>
                    <Pie
                      data={winLossPie}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {winLossPie.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={entry.color}
                          stroke="transparent"
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        background: '#12121a',
                        border: '1px solid #1e1e2e',
                        borderRadius: '8px',
                        fontSize: '12px',
                      }}
                    />
                  </RePieChart>
                </ResponsiveContainer>
                <div className="flex justify-center gap-6 mt-2">
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-sm bg-emerald-500" />
                    <span className="text-xs text-zinc-400">
                      Wins ({winningTrades})
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-sm bg-red-500" />
                    <span className="text-xs text-zinc-400">
                      Losses ({losingTrades})
                    </span>
                  </div>
                </div>
              </>
            ) : (
              <div className="py-16 text-center">
                <PieChart className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
                <p className="text-sm text-zinc-500">No trades yet</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ─── Charts Row 2: Monthly P&L + P&L by Symbol ────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Monthly P&L */}
        <Card>
          <CardHeader>
            <CardTitle>Monthly P&L</CardTitle>
          </CardHeader>
          <CardContent>
            {monthlyPnl.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={monthlyPnl}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 10, fill: '#6b6b80' }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: '#6b6b80' }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `$${v}`}
                  />
                  <Tooltip
                    contentStyle={{
                      background: '#12121a',
                      border: '1px solid #1e1e2e',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                    formatter={(value: unknown) => [
                      formatCurrency(value as number),
                      'P&L',
                    ]}
                  />
                  <Bar dataKey="pnl" radius={[4, 4, 0, 0]}>
                    {monthlyPnl.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={entry.pnl >= 0 ? '#10b981' : '#ef4444'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="py-16 text-center">
                <BarChart3 className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
                <p className="text-sm text-zinc-500">No monthly data</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* P&L by Symbol */}
        <Card>
          <CardHeader>
            <CardTitle>P&L by Symbol</CardTitle>
          </CardHeader>
          <CardContent>
            {symbolPnl.length > 0 ? (
              <div className="space-y-3 max-h-[260px] overflow-y-auto">
                {symbolPnl.map((item) => (
                  <div key={item.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-2 h-2 rounded-full ${item.pnl >= 0 ? 'bg-emerald-500' : 'bg-red-500'}`}
                      />
                      <span className="text-sm font-medium text-zinc-200">
                        {item.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-4">
                      {/* Bar */}
                      <div className="w-24 h-1.5 bg-card rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${item.pnl >= 0 ? 'bg-emerald-500' : 'bg-red-500'}`}
                          style={{
                            width: `${Math.min(Math.abs(item.pnl) / (symbolPnl.reduce((max, s) => Math.max(max, Math.abs(s.pnl)), 1)) * 100, 100)}%`,
                          }}
                        />
                      </div>
                      <span
                        className={`text-sm font-mono font-medium w-20 text-right ${pnlColor(item.pnl)}`}
                      >
                        {formatCurrency(item.pnl)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-16 text-center">
                <DollarSign className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
                <p className="text-sm text-zinc-500">No symbol data</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ─── Extreme Trades ────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>
              <Award className="w-4 h-4 inline mr-1.5 text-emerald-400" />
              Best Trade
            </CardTitle>
          </CardHeader>
          <CardContent>
            {largestWin > 0 ? (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold text-emerald-400">
                    {formatCurrency(largestWin)}
                  </p>
                  <p className="text-xs text-zinc-500 mt-0.5">Largest winning trade</p>
                </div>
                <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center">
                  <TrendingUp className="w-6 h-6 text-emerald-400" />
                </div>
              </div>
            ) : (
              <p className="text-sm text-zinc-500 py-4">No winning trades yet</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              <AlertTriangle className="w-4 h-4 inline mr-1.5 text-red-400" />
              Worst Trade
            </CardTitle>
          </CardHeader>
          <CardContent>
            {largestLoss < 0 ? (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold text-red-400">
                    {formatCurrency(largestLoss)}
                  </p>
                  <p className="text-xs text-zinc-500 mt-0.5">Largest losing trade</p>
                </div>
                <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center">
                  <TrendingDown className="w-6 h-6 text-red-400" />
                </div>
              </div>
            ) : (
              <p className="text-sm text-zinc-500 py-4">No losing trades yet</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ─── Daily P&L Summary ─────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>
            <Calendar className="w-4 h-4 inline mr-1.5" />
            Daily P&L Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-4">
            {(() => {
              const now = new Date();
              const todayStr = now.toISOString().substring(0, 10);
              const weekAgo = new Date(now.getTime() - 7 * 86400000).toISOString().substring(0, 10);
              const monthAgo = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().substring(0, 10);
              const yearAgo = new Date(now.getFullYear(), 0, 1).toISOString().substring(0, 10);

              const todayPnl = trades.filter((t) => t.executed_at.substring(0, 10) >= todayStr).reduce((s, t) => s + (t.pnl ?? 0), 0);
              const weekPnl = trades.filter((t) => t.executed_at.substring(0, 10) >= weekAgo).reduce((s, t) => s + (t.pnl ?? 0), 0);
              const monthPnl = trades.filter((t) => t.executed_at.substring(0, 10) >= monthAgo).reduce((s, t) => s + (t.pnl ?? 0), 0);
              const yearPnl = trades.filter((t) => t.executed_at.substring(0, 10) >= yearAgo).reduce((s, t) => s + (t.pnl ?? 0), 0);

              const periods = [
                { label: 'Today', pnl: todayPnl },
                { label: 'This Week', pnl: weekPnl },
                { label: 'This Month', pnl: monthPnl },
                { label: 'This Year', pnl: yearPnl },
              ];

              return periods.map((p) => (
                <div key={p.label} className="bg-card-hover rounded-lg p-3 border border-card-border">
                  <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">{p.label}</p>
                  <p className={`text-lg font-bold ${pnlColor(p.pnl)}`}>
                    {formatCurrency(p.pnl)}
                  </p>
                </div>
              ));
            })()}
          </div>
        </CardContent>
      </Card>

      {/* ─── Strategy Performance ──────────────────────────────── */}
      {strategiesData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>
              <Lightbulb className="w-4 h-4 inline mr-1.5 text-accent" />
              Strategy Performance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {strategiesData.map((strategy) => {
                const stratTrades = trades.filter((t) => t.strategy_id === strategy.id);
                const stratPnl = stratTrades.reduce((s, t) => s + (t.pnl ?? 0), 0);
                const stratWins = stratTrades.filter((t) => (t.pnl ?? 0) > 0).length;
                const stratWinRate = stratTrades.length > 0 ? (stratWins / stratTrades.length) * 100 : 0;
                return (
                  <div
                    key={strategy.id}
                    className="bg-card-hover rounded-lg p-4 border border-card-border hover:border-primary/30 transition-colors"
                  >
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Activity className="w-4 h-4 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-zinc-100">{strategy.name}</p>
                        <p className="text-[10px] text-zinc-500">
                          {stratTrades.length} trades
                        </p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] text-zinc-500">P&L</span>
                        <span className={`text-sm font-mono font-semibold ${pnlColor(stratPnl)}`}>
                          {formatCurrency(stratPnl)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] text-zinc-500">Win Rate</span>
                        <span className="text-sm font-mono text-zinc-200">{stratWinRate.toFixed(0)}%</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] text-zinc-500">Status</span>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                            strategy.status === 'active'
                              ? 'bg-emerald-500/10 text-emerald-400'
                              : strategy.status === 'paused'
                                ? 'bg-amber-500/10 text-amber-400'
                                : 'bg-zinc-500/10 text-zinc-400'
                          }`}
                        >
                          {strategy.status?.toUpperCase() ?? 'DRAFT'}
                        </span>
                      </div>
                    </div>
                    {/* Mini P&L bar */}
                    <div className="mt-3 h-1 bg-card rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${stratPnl >= 0 ? 'bg-emerald-500' : 'bg-red-500'}`}
                        style={{
                          width: `${Math.min(Math.abs(stratPnl) / (Math.abs(totalPnl) || 1) * 100, 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── Trade Journal ─────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <CardTitle>Trade Journal</CardTitle>
              <p className="text-xs text-zinc-500">{allTrades.length} total trades</p>
            </div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-card-border text-zinc-400 hover:text-zinc-200 hover:border-zinc-600 transition-colors cursor-pointer"
            >
              <Filter className="w-3.5 h-3.5" />
              Filters
              {(journalSymbol || journalStrategy || journalDateFrom || journalDateTo) && (
                <span className="w-1.5 h-1.5 rounded-full bg-primary" />
              )}
            </button>
          </div>
        </CardHeader>
        <CardContent>
          {/* ── Filter bar ── */}
          <div className={`space-y-3 overflow-hidden transition-all duration-300 ${showFilters ? 'max-h-96 mb-4' : 'max-h-0'}`}>
            <div className="flex flex-wrap gap-3">
              <div className="flex-1 min-w-[140px]">
                <label className="text-[10px] text-zinc-500 block mb-1">Symbol</label>
                <div className="relative">
                  <Search className="w-3 h-3 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-600" />
                  <input
                    type="text"
                    value={journalSymbol}
                    onChange={(e) => setJournalSymbol(e.target.value.toUpperCase())}
                    placeholder="e.g. AAPL"
                    className="w-full bg-card-hover border border-card-border rounded-lg pl-7 pr-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-primary/50"
                  />
                </div>
              </div>
              <div className="flex-1 min-w-[140px]">
                <label className="text-[10px] text-zinc-500 block mb-1">Date From</label>
                <input
                  type="date"
                  value={journalDateFrom}
                  onChange={(e) => setJournalDateFrom(e.target.value)}
                  className="w-full bg-card-hover border border-card-border rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-primary/50"
                />
              </div>
              <div className="flex-1 min-w-[140px]">
                <label className="text-[10px] text-zinc-500 block mb-1">Date To</label>
                <input
                  type="date"
                  value={journalDateTo}
                  onChange={(e) => setJournalDateTo(e.target.value)}
                  className="w-full bg-card-hover border border-card-border rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-primary/50"
                />
              </div>
            </div>
          </div>

          {/* ── Tab bar ── */}
          <div className="flex gap-1 mb-4">
            {(['all', 'wins', 'losses'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setJournalTab(tab)}
                className={`px-3 py-1.5 text-xs rounded-md font-medium transition-colors cursor-pointer ${
                  journalTab === tab
                    ? 'bg-primary/15 text-primary border border-primary/30'
                    : 'text-zinc-400 hover:text-zinc-200 border border-transparent'
                }`}
              >
                {tab === 'all' ? 'All' : tab === 'wins' ? 'Wins' : 'Losses'}
              </button>
            ))}
            {/* Clear filters button */}
            <button
              onClick={() => {
                setJournalSymbol('');
                setJournalDateFrom('');
                setJournalDateTo('');
                setJournalTab('all');
              }}
              className="px-2 py-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer ml-auto"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* ── Journal table ── */}
          {(() => {
            const filtered = allTrades.filter((t) => {
              if (journalTab === 'wins' && (t.pnl ?? 0) <= 0) return false;
              if (journalTab === 'losses' && (t.pnl ?? 0) >= 0) return false;
              if (journalSymbol && !t.symbol.toUpperCase().includes(journalSymbol.toUpperCase())) return false;
              if (journalDateFrom && t.executed_at.substring(0, 10) < journalDateFrom) return false;
              if (journalDateTo && t.executed_at.substring(0, 10) > journalDateTo) return false;
              return true;
            });

            if (filtered.length === 0) {
              return (
                <div className="py-12 text-center">
                  <Search className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
                  <p className="text-sm text-zinc-400">No trades match your filters</p>
                  <p className="text-xs text-zinc-500 mt-1">Try adjusting your filter criteria.</p>
                </div>
              );
            }

            return (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[10px] text-zinc-500 uppercase tracking-wider border-b border-card-border">
                      <th className="text-left py-2 pr-4">Date</th>
                      <th className="text-left py-2 pr-4">Symbol</th>
                      <th className="text-left py-2 pr-4">Type</th>
                      <th className="text-right py-2 pr-4">Qty</th>
                      <th className="text-right py-2 pr-4">Price</th>
                      <th className="text-right py-2 pr-4">Fee</th>
                      <th className="text-right py-2">P&L</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-card-border">
                    {filtered.slice(0, 100).map((trade) => {
                      const isProfit = (trade.pnl ?? 0) > 0;
                      const isLoss = (trade.pnl ?? 0) < 0;
                      return (
                        <tr key={trade.id} className="hover:bg-card-hover/50 transition-colors">
                          <td className="py-2.5 pr-4 text-xs text-zinc-400 whitespace-nowrap">
                            {new Date(trade.executed_at).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })}
                          </td>
                          <td className="py-2.5 pr-4">
                            <span className="text-zinc-200 font-medium">{trade.symbol}</span>
                            <span className="text-[10px] text-zinc-500 ml-1.5">{trade.name}</span>
                          </td>
                          <td className="py-2.5 pr-4">
                            <span
                              className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                trade.type === 'buy'
                                  ? 'bg-emerald-500/10 text-emerald-400'
                                  : 'bg-red-500/10 text-red-400'
                              }`}
                            >
                              {trade.type.toUpperCase()}
                            </span>
                          </td>
                          <td className="py-2.5 pr-4 text-right text-xs text-zinc-300">
                            {trade.quantity}
                          </td>
                          <td className="py-2.5 pr-4 text-right text-xs text-zinc-300 font-mono">
                            {formatCurrency(trade.price)}
                          </td>
                          <td className="py-2.5 pr-4 text-right text-xs text-zinc-500 font-mono">
                            {formatCurrency(trade.fee ?? 0)}
                          </td>
                          <td className="py-2.5 text-right">
                            {trade.pnl != null ? (
                              <span
                                className={`text-xs font-semibold font-mono ${
                                  isProfit ? 'text-emerald-400' : isLoss ? 'text-red-400' : 'text-zinc-400'
                                }`}
                              >
                                {isProfit ? '+' : ''}
                                {formatCurrency(trade.pnl)}
                              </span>
                            ) : (
                              <span className="text-xs text-zinc-500">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {filtered.length > 100 && (
                  <p className="text-[10px] text-zinc-600 mt-2 text-center">
                    Showing first 100 of {filtered.length} matching trades
                  </p>
                )}
              </div>
            );
          })()}
        </CardContent>
      </Card>
    </div>
  );
}