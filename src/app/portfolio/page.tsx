'use client';

import { useState, useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { usePortfolioData } from '@/lib/hooks/use-portfolio-data';
import { useTrades } from '@/lib/hooks/use-trades';
import { formatCurrency, formatPercent, pnlColor } from '@/lib/utils';
import { generatePortfolioHistory } from '@/lib/mock-data';
import Link from 'next/link';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import {
  Plus,
  ArrowUpRight,
  ArrowDownRight,
  TrendingUp,
  TrendingDown,
  Wallet,
  DollarSign,
  BarChart3,
  PieChart as PieChartIcon,
  Activity,
  Target,
} from 'lucide-react';

// ─── Constants ──────────────────────────────────────────

const COLORS = [
  '#6366f1', // indigo
  '#10b981', // emerald
  '#f59e0b', // amber
  '#3b82f6', // blue
  '#ef4444', // red
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#14b8a6', // teal
  '#f97316', // orange
  '#06b6d4', // cyan
];

type SortField =
  | 'symbol'
  | 'quantity'
  | 'avg_price'
  | 'current_price'
  | 'market_value'
  | 'unrealized_pnl'
  | 'unrealized_pnl_percent';
type SortDir = 'asc' | 'desc';

// ─── Page component ─────────────────────────────────────

export default function PortfolioPage() {
  const { portfolio, positions } = usePortfolioData();
  const { data: trades = [] } = useTrades(portfolio?.id);

  const [sortField, setSortField] = useState<SortField>('market_value');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  // ── Derived Metrics ────────────────────────────────────
  const portfolioValue = portfolio?.total_value ?? 0;
  const portfolioPnl = portfolio?.total_pnl ?? 0;
  const portfolioPnlPercent = portfolio?.total_pnl_percent ?? 0;
  const cashBalance = portfolio?.cash_balance ?? 0;
  const totalMarketValue = positions.reduce((sum, p) => sum + p.market_value, 0);
  const totalUnrealizedPnl = positions.reduce((sum, p) => sum + p.unrealized_pnl, 0);
  const totalRealizedPnl = positions.reduce((sum, p) => sum + p.realized_pnl, 0);
  const investedCapital = totalMarketValue;
  const totalUnrealizedPnlPercent =
    investedCapital > 0 ? (totalUnrealizedPnl / investedCapital) * 100 : 0;

  // Total P&L (realized + unrealized)
  const combinedPnl = totalRealizedPnl + totalUnrealizedPnl;
  const combinedPnlPercent =
    investedCapital + totalRealizedPnl > 0
      ? (combinedPnl / (investedCapital + totalRealizedPnl)) * 100
      : 0;

  // Recent trades P&L summary
  const recentTradesPnl = useMemo(
    () => trades.filter((t) => t.pnl !== undefined).reduce((sum, t) => sum + (t.pnl ?? 0), 0),
    [trades],
  );

  const winRate = useMemo(() => {
    const pnlTrades = trades.filter((t) => t.pnl !== undefined);
    if (pnlTrades.length === 0) return 0;
    const wins = pnlTrades.filter((t) => (t.pnl ?? 0) > 0).length;
    return (wins / pnlTrades.length) * 100;
  }, [trades]);

  // ── Pie data ───────────────────────────────────────────
  const pieData = useMemo(() => {
    const data = positions.map((p, i) => ({
      name: p.symbol,
      value: p.market_value,
      pnl: p.unrealized_pnl,
      pnlPercent: p.unrealized_pnl_percent,
      color: COLORS[i % COLORS.length],
    }));
    // Add cash as a slice
    if (cashBalance > 0) {
      data.push({
        name: 'Cash',
        value: cashBalance,
        pnl: 0,
        pnlPercent: 0,
        color: '#6b7280',
      });
    }
    return data;
  }, [positions, cashBalance]);

  const totalPie = pieData.reduce((sum, s) => sum + s.value, 0) || 1;

  // ── Sorted positions ───────────────────────────────────
  const sortedPositions = useMemo(() => {
    return [...positions].sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];
      const mul = sortDir === 'asc' ? 1 : -1;
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return aVal.localeCompare(bVal) * mul;
      }
      return ((aVal as number) - (bVal as number)) * mul;
    });
  }, [positions, sortField, sortDir]);

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  }

  function sortIcon(field: SortField) {
    if (sortField !== field) return null;
    return sortDir === 'asc' ? ' ▲' : ' ▼';
  }

  // ── History chart ──────────────────────────────────────
  const history = useMemo(() => generatePortfolioHistory(30), []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Portfolio</h1>
          <p className="text-sm text-zinc-400 mt-0.5">
            Full breakdown of holdings & performance
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/trades">
            <Button variant="primary">
              <Plus className="w-4 h-4" />
              New Trade
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats Grid - Row 1 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Portfolio Value</CardTitle>
            <Wallet className="w-4 h-4 text-accent" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-white">
              {formatCurrency(portfolioValue)}
            </p>
            <p
              className={`text-sm mt-1 flex items-center gap-1 ${pnlColor(portfolioPnl)}`}
            >
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
            <p className="text-xs text-zinc-500 mt-1">
              {totalPie > 0
                ? `${((cashBalance / totalPie) * 100).toFixed(1)}% of portfolio`
                : 'Available for trading'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Invested</CardTitle>
            <BarChart3 className="w-4 h-4 text-warning" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-white">
              {formatCurrency(totalMarketValue)}
            </p>
            <p className="text-xs text-zinc-500 mt-1">{positions.length} active positions</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Win Rate</CardTitle>
            <Target className="w-4 h-4 text-info" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-white">
              {trades.filter((t) => t.pnl !== undefined).length > 0
                ? `${winRate.toFixed(1)}%`
                : '—'}
            </p>
            <p className="text-xs text-zinc-500 mt-1">
              {trades.filter((t) => t.pnl !== undefined).length} closed trades
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Stats Grid - Row 2 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Unrealized P&L</CardTitle>
            <Activity className="w-4 h-4 text-warning" />
          </CardHeader>
          <CardContent>
            <p
              className={`text-2xl font-bold ${pnlColor(totalUnrealizedPnl)}`}
            >
              {formatCurrency(totalUnrealizedPnl)}
            </p>
            <p className={`text-sm mt-1 ${pnlColor(totalUnrealizedPnl)}`}>
              {formatPercent(totalUnrealizedPnlPercent)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Realized P&L</CardTitle>
            {totalRealizedPnl >= 0 ? (
              <ArrowUpRight className="w-4 h-4 text-emerald-400" />
            ) : (
              <ArrowDownRight className="w-4 h-4 text-red-400" />
            )}
          </CardHeader>
          <CardContent>
            <p
              className={`text-2xl font-bold ${pnlColor(totalRealizedPnl)}`}
            >
              {formatCurrency(totalRealizedPnl)}
            </p>
            <p className="text-xs text-zinc-500 mt-1">From closed positions</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Combined P&L</CardTitle>
            {combinedPnl >= 0 ? (
              <TrendingUp className="w-4 h-4 text-emerald-400" />
            ) : (
              <TrendingDown className="w-4 h-4 text-red-400" />
            )}
          </CardHeader>
          <CardContent>
            <p
              className={`text-2xl font-bold ${pnlColor(combinedPnl)}`}
            >
              {formatCurrency(combinedPnl)}
            </p>
            <p className={`text-sm mt-1 ${pnlColor(combinedPnl)}`}>
              {formatPercent(combinedPnlPercent)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Chart + Allocation */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Performance Over Time</CardTitle>
            <p className="text-xs text-zinc-500">Last 30 days (simulated)</p>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={320}>
              <AreaChart data={history}>
                <defs>
                  <linearGradient id="colorPortfolio" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.35} />
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
                  formatter={(value: unknown) => [
                    formatCurrency(value as number),
                    'Value',
                  ]}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="#6366f1"
                  strokeWidth={2}
                  fill="url(#colorPortfolio)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Allocation Donut + Legend */}
        <Card>
          <CardHeader>
            <CardTitle>Allocation</CardTitle>
            <span className="text-xs text-zinc-500">
              {positions.length} holdings + cash
            </span>
          </CardHeader>
          <CardContent>
            {pieData.length > 1 ? (
              <>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={85}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {pieData.map((entry, idx) => (
                        <Cell key={`cell-${idx}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        background: '#12121a',
                        border: '1px solid #1e1e2e',
                        borderRadius: '8px',
                        fontSize: '12px',
                      }}
                      formatter={(value: unknown, _: unknown, props: unknown) => {
                        const percent = ((value as number) / totalPie) * 100;
                        return [
                          `${formatCurrency(value as number)} (${percent.toFixed(1)}%)`,
                          (props as { payload?: { name?: string } })?.payload?.name ?? '',
                        ];
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>

                {/* Legend with P&L */}
                <div className="space-y-1.5 mt-2 max-h-[140px] overflow-y-auto">
                  {pieData.map((slice, idx) => (
                    <div
                      key={slice.name}
                      className="flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-1.5">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: slice.color }}
                        />
                        <span className="text-zinc-300 font-medium">
                          {slice.name}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-zinc-400">
                          {((slice.value / totalPie) * 100).toFixed(1)}%
                        </span>
                        {slice.pnlPercent !== 0 && (
                          <span
                            className={`ml-1.5 ${
                              slice.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'
                            }`}
                          >
                            {formatPercent(slice.pnlPercent)}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <PieChartIcon className="w-10 h-10 text-zinc-600 mb-2" />
                <p className="text-xs text-zinc-500">
                  No positions yet.
                  <br />
                  <Link
                    href="/trades"
                    className="text-accent hover:text-accent-hover"
                  >
                    Start trading →
                  </Link>
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Positions Table */}
      <Card>
        <CardHeader>
          <CardTitle>
            <PieChartIcon className="w-4 h-4 inline mr-1.5" />
            Positions
          </CardTitle>
          <span className="text-xs text-zinc-500">
            {positions.length} position{positions.length !== 1 ? 's' : ''} ·{' '}
            {formatCurrency(totalMarketValue)} total
          </span>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-card-border">
                  <th
                    className="text-left py-3 px-3 text-xs text-zinc-500 font-medium cursor-pointer hover:text-zinc-300 select-none"
                    onClick={() => toggleSort('symbol')}
                  >
                    Symbol{sortIcon('symbol')}
                  </th>
                  <th
                    className="text-right py-3 px-3 text-xs text-zinc-500 font-medium cursor-pointer hover:text-zinc-300 select-none"
                    onClick={() => toggleSort('quantity')}
                  >
                    Shares{sortIcon('quantity')}
                  </th>
                  <th
                    className="text-right py-3 px-3 text-xs text-zinc-500 font-medium cursor-pointer hover:text-zinc-300 select-none"
                    onClick={() => toggleSort('avg_price')}
                  >
                    Avg Price{sortIcon('avg_price')}
                  </th>
                  <th
                    className="text-right py-3 px-3 text-xs text-zinc-500 font-medium cursor-pointer hover:text-zinc-300 select-none"
                    onClick={() => toggleSort('current_price')}
                  >
                    Current{sortIcon('current_price')}
                  </th>
                  <th
                    className="text-right py-3 px-3 text-xs text-zinc-500 font-medium cursor-pointer hover:text-zinc-300 select-none"
                    onClick={() => toggleSort('market_value')}
                  >
                    Mkt Value{sortIcon('market_value')}
                  </th>
                  <th
                    className="text-right py-3 px-3 text-xs text-zinc-500 font-medium cursor-pointer hover:text-zinc-300 select-none"
                    onClick={() => toggleSort('unrealized_pnl')}
                  >
                    P&L{sortIcon('unrealized_pnl')}
                  </th>
                  <th
                    className="text-right py-3 px-3 text-xs text-zinc-500 font-medium cursor-pointer hover:text-zinc-300 select-none"
                    onClick={() => toggleSort('unrealized_pnl_percent')}
                  >
                    %{sortIcon('unrealized_pnl_percent')}
                  </th>
                  <th className="text-right py-3 px-3 text-xs text-zinc-500 font-medium">
                    % of Port
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedPositions.map((pos) => {
                  const pctOfPortfolio =
                    portfolioValue > 0
                      ? (pos.market_value / portfolioValue) * 100
                      : 0;
                  return (
                    <tr
                      key={pos.id}
                      className="border-b border-card-border/50 hover:bg-card-hover transition-colors"
                    >
                      <td className="py-3 px-3">
                        <span className="font-medium text-zinc-200">
                          {pos.symbol}
                        </span>
                        <p className="text-[10px] text-zinc-500">{pos.name}</p>
                      </td>
                      <td className="py-3 px-3 text-right text-zinc-300 font-mono">
                        {pos.quantity.toLocaleString()}
                      </td>
                      <td className="py-3 px-3 text-right text-zinc-300 font-mono">
                        {formatCurrency(pos.avg_price)}
                      </td>
                      <td className="py-3 px-3 text-right text-zinc-300 font-mono">
                        {formatCurrency(pos.current_price)}
                      </td>
                      <td className="py-3 px-3 text-right text-zinc-200 font-mono font-medium">
                        {formatCurrency(pos.market_value)}
                      </td>
                      <td
                        className={`py-3 px-3 text-right font-mono ${pnlColor(pos.unrealized_pnl)}`}
                      >
                        {pos.unrealized_pnl >= 0 ? '+' : ''}
                        {formatCurrency(pos.unrealized_pnl)}
                      </td>
                      <td
                        className={`py-3 px-3 text-right font-mono ${pnlColor(pos.unrealized_pnl_percent)}`}
                      >
                        {pos.unrealized_pnl_percent >= 0 ? '+' : ''}
                        {formatPercent(pos.unrealized_pnl_percent)}
                      </td>
                      <td className="py-3 px-3 text-right text-zinc-500 font-mono text-xs">
                        {pctOfPortfolio.toFixed(1)}%
                      </td>
                    </tr>
                  );
                })}
                {positions.length === 0 && (
                  <tr>
                    <td
                      colSpan={8}
                      className="py-12 text-center text-zinc-500 text-sm"
                    >
                      <PieChartIcon className="w-8 h-8 mx-auto mb-2 opacity-40" />
                      <p>No positions yet.</p>
                      <p className="text-xs mt-0.5">
                        <Link
                          href="/trades"
                          className="text-accent hover:text-accent-hover"
                        >
                          Make your first trade →
                        </Link>
                      </p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}