'use client';

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { useAnalyticsData } from '@/lib/hooks/use-analytics-data';
import { usePortfolioData } from '@/lib/hooks/use-portfolio-data';
import { mockTrades } from '@/lib/mock-data';
import { formatCurrency, formatPercent, pnlColor } from '@/lib/utils';
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

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#14b8a6'];

export default function AnalyticsPage() {
  const { data: analyticsData, isLoading } = useAnalyticsData();
  const { positions } = usePortfolioData();

  // Use real data from hook, fall back to mock trades for demo
  const trades = analyticsData?.trades?.length ? analyticsData.trades : mockTrades;
  const totalTrades = analyticsData?.totalTrades ?? trades.filter((t) => t.pnl != null).length;
  const winningTrades = analyticsData?.winningTrades ?? trades.filter((t) => (t.pnl ?? 0) > 0).length;
  const losingTrades = analyticsData?.losingTrades ?? trades.filter((t) => (t.pnl ?? 0) < 0).length;
  const winRate = analyticsData?.winRate ?? (totalTrades > 0 ? winningTrades / totalTrades : 0);
  const totalPnl = analyticsData?.totalPnl ?? trades.reduce((s, t) => s + (t.pnl ?? 0), 0);
  const avgWin = analyticsData?.avgWin ?? 0;
  const avgLoss = analyticsData?.avgLoss ?? 0;
  const largestWin = analyticsData?.largestWin ?? 0;
  const largestLoss = analyticsData?.largestLoss ?? 0;
  const profitFactor =
    analyticsData?.profitFactor ?? (avgLoss > 0 ? avgWin / avgLoss : 0);

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
      <div>
        <h1 className="text-2xl font-bold text-white">Analytics</h1>
        <p className="text-sm text-zinc-400 mt-0.5">
          Performance metrics and trade insights
        </p>
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

      {/* ─── Recent Trades Table ────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Trades</CardTitle>
          <p className="text-xs text-zinc-500">Last {Math.min(trades.length, 20)} trades</p>
        </CardHeader>
        <CardContent>
          {trades.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[10px] text-zinc-500 uppercase tracking-wider">
                    <th className="text-left py-2 pr-4">Date</th>
                    <th className="text-left py-2 pr-4">Symbol</th>
                    <th className="text-left py-2 pr-4">Type</th>
                    <th className="text-right py-2 pr-4">Qty</th>
                    <th className="text-right py-2 pr-4">Price</th>
                    <th className="text-right py-2">P&L</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-card-border">
                  {trades.slice(-20).reverse().map((trade) => {
                    const isProfit = (trade.pnl ?? 0) > 0;
                    const isLoss = (trade.pnl ?? 0) < 0;
                    return (
                      <tr key={trade.id} className="hover:bg-card-hover/50 transition-colors">
                        <td className="py-2.5 pr-4 text-xs text-zinc-400">
                          {new Date(trade.executed_at).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
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
                        <td className="py-2.5 text-right">
                          {trade.pnl != null ? (
                            <span
                              className={`text-xs font-semibold font-mono ${
                                isProfit ? 'text-emerald-400' : isLoss ? 'text-red-400' : 'text-zinc-400'
                              }`}
                            >
                              {isProfit ? '+' : ''}{formatCurrency(trade.pnl)}
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
            </div>
          ) : (
            <div className="py-12 text-center">
              <BarChart3 className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
              <p className="text-sm text-zinc-400">No trades recorded yet</p>
              <p className="text-xs text-zinc-500 mt-1">
                Start trading to see your analytics here.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}