'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState, useMemo, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useStrategyDetail } from '@/lib/hooks/use-strategy-detail';
import { useStrategiesData } from '@/lib/hooks/use-strategies-data';
import { formatCurrency, pnlColor } from '@/lib/utils';
import {
  ArrowLeft,
  Play,
  Pause,
  Archive,
  Activity,
  BarChart3,
  Target,
  TrendingUp,
  ArrowLeftRight,
  CandlestickChart,
  Layers,
  Trash2,
  Edit3,
  Save,
  X,
  Loader2,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import type { Strategy, Trade } from '@/types';

const typeIcons: Record<string, React.ReactNode> = {
  trend_following: <TrendingUp className="w-5 h-5" />,
  mean_reversion: <ArrowLeftRight className="w-5 h-5" />,
  breakout: <CandlestickChart className="w-5 h-5" />,
  scalping: <Layers className="w-5 h-5" />,
  custom: <Activity className="w-5 h-5" />,
};

const typeLabels: Record<string, string> = {
  trend_following: 'Trend Following',
  mean_reversion: 'Mean Reversion',
  breakout: 'Breakout',
  scalping: 'Scalping',
  custom: 'Custom',
};

const statusColors: Record<string, string> = {
  active: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  paused: 'bg-warning/10 text-warning border-warning/20',
  draft: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
  archived: 'bg-zinc-700/10 text-zinc-500 border-zinc-700/20',
};

// ─── Equity curve (pure SVG) ──────────────────────────────

interface EquityData {
  line: string;
  area: string;
  minVal: number;
  maxVal: number;
  margin: { top: number; bottom: number; left: number; right: number };
  yScale: (v: number) => number;
}

function EquityCurve({
  trades,
  width = 800,
  height = 240,
}: {
  trades: Trade[];
  width?: number;
  height?: number;
}) {
  const points: EquityData | null = useMemo(() => {
    // Build cumulative P&L series
    const sorted = [...trades]
      .filter((t) => t.pnl != null)
      .sort((a, b) => new Date(a.executed_at).getTime() - new Date(b.executed_at).getTime());

    if (!sorted.length) return null;

    let cum = 0;
    const series: { x: number; y: number }[] = [];

    sorted.forEach((t, i) => {
      cum += t.pnl ?? 0;
      series.push({ x: i, y: cum });
    });

    // Add start point
    series.unshift({ x: -0.5, y: 0 });

    const values = series.map((s) => s.y);
    let minVal = Math.min(0, ...values);
    let maxVal = Math.max(0, ...values);

    // Pad range
    const pad = (maxVal - minVal) * 0.1 || 10;
    minVal -= pad;
    maxVal += pad;

    const margin = { top: 8, bottom: 28, left: 60, right: 16 };
    const chartW = width - margin.left - margin.right;
    const chartH = height - margin.top - margin.bottom;

    const xScale = (i: number) => margin.left + ((i + 0.5) / (series.length - 1)) * chartW;
    const yScale = (v: number) => margin.top + ((maxVal - v) / (maxVal - minVal)) * chartH;

    const lineParts = series.map((p, i) => `${i === 0 ? 'M' : 'L'}${xScale(p.x)},${yScale(p.y)}`);
    const areaParts = [
      ...lineParts,
      `L${xScale(series[series.length - 1].x)},${yScale(minVal)}`,
      `L${xScale(series[0].x)},${yScale(minVal)}`,
      'Z',
    ];

    return {
      line: lineParts.join(' '),
      area: areaParts.join(' '),
      minVal,
      maxVal,
      margin,
      yScale,
    };
  }, [trades, width, height]);

  if (!points) {
    return (
      <div className="flex items-center justify-center text-sm text-zinc-500" style={{ height }}>
        No P&L data available yet
      </div>
    );
  }

  const { margin } = points;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} className="select-none">
      {/* Zero line */}
      <line
        x1={margin.left}
        x2={width - margin.right}
        y1={points.yScale(0)}
        y2={points.yScale(0)}
        stroke="#27273f"
        strokeDasharray="3 3"
      />

      {/* Area fill */}
      <path d={points.area} fill="url(#equityGrad)" opacity={0.3} />

      {/* Line */}
      <path d={points.line} fill="none" stroke="#6366f1" strokeWidth={2} strokeLinejoin="round" />

      {/* Y-axis labels */}
      {[points.minVal, 0, points.maxVal].map((v) => (
        <text
          key={`y-${v}`}
          x={margin.left - 6}
          y={points.yScale(v) + 4}
          textAnchor="end"
          fill="#6b6b80"
          fontSize="9"
        >
          {formatCurrency(v)}
        </text>
      ))}

      <defs>
        <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#6366f1" stopOpacity={0.6} />
          <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
        </linearGradient>
      </defs>
    </svg>
  );
}

// ─── Config editor (collapsible JSON) ─────────────────────

function ConfigPanel({ config }: { config: Record<string, unknown> }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="space-y-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
      >
        {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        {expanded ? 'Hide' : 'Show'} Configuration
      </button>
      {expanded && (
        <pre className="p-3 rounded-lg bg-card border border-card-border text-xs text-zinc-300 overflow-x-auto font-mono whitespace-pre-wrap">
          {JSON.stringify(config, null, 2)}
        </pre>
      )}
    </div>
  );
}

// ─── Trades table ─────────────────────────────────────────

function TradesTable({ trades }: { trades: Trade[] }) {
  if (!trades.length) {
    return (
      <div className="flex items-center justify-center py-8 text-sm text-zinc-500">
        No trades executed with this strategy yet.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-card-border">
            <th className="text-left py-2.5 px-2 text-xs text-zinc-500 font-medium">Date</th>
            <th className="text-left py-2.5 px-2 text-xs text-zinc-500 font-medium">Symbol</th>
            <th className="text-left py-2.5 px-2 text-xs text-zinc-500 font-medium">Type</th>
            <th className="text-right py-2.5 px-2 text-xs text-zinc-500 font-medium">Quantity</th>
            <th className="text-right py-2.5 px-2 text-xs text-zinc-500 font-medium">Price</th>
            <th className="text-right py-2.5 px-2 text-xs text-zinc-500 font-medium">Total</th>
            <th className="text-right py-2.5 px-2 text-xs text-zinc-500 font-medium">P&L</th>
          </tr>
        </thead>
        <tbody>
          {trades.slice(0, 50).map((trade) => (
            <tr key={trade.id} className="border-b border-card-border/50 hover:bg-card-hover transition-colors">
              <td className="py-2 px-2 text-xs text-zinc-400 whitespace-nowrap">
                {new Date(trade.executed_at).toLocaleDateString()}
              </td>
              <td className="py-2 px-2 text-xs font-medium text-zinc-200">{trade.symbol}</td>
              <td className="py-2 px-2">
                <span
                  className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                    trade.type === 'buy'
                      ? 'text-emerald-400 bg-emerald-500/10'
                      : 'text-red-400 bg-red-500/10'
                  }`}
                >
                  {trade.type.toUpperCase()}
                </span>
              </td>
              <td className="py-2 px-2 text-right text-xs text-zinc-300">{trade.quantity}</td>
              <td className="py-2 px-2 text-right text-xs text-zinc-300 font-mono">
                {formatCurrency(trade.price)}
              </td>
              <td className="py-2 px-2 text-right text-xs text-zinc-300 font-mono">
                {formatCurrency(trade.total)}
              </td>
              <td
                className={`py-2 px-2 text-right text-xs font-mono ${pnlColor(trade.pnl ?? 0)}`}
              >
                {trade.pnl != null ? formatCurrency(trade.pnl) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {trades.length > 50 && (
        <p className="text-xs text-zinc-500 mt-2 text-center">
          Showing 50 of {trades.length} trades
        </p>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────

export default function StrategyDetailPage() {
  const params = useParams();
  const router = useRouter();
  const strategyId = params?.id as string | undefined;

  const { strategy, trades, isLoading, isError, error } = useStrategyDetail(strategyId);
  const { upsertStrategy, deleteStrategy, isSaving } = useStrategiesData();

  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');

  const handleEdit = useCallback(() => {
    if (strategy) {
      setEditName(strategy.name);
      setEditDesc(strategy.description ?? '');
      setEditing(true);
    }
  }, [strategy]);

  const handleSaveEdit = useCallback(() => {
    if (!strategy || !editName.trim()) return;
    upsertStrategy({
      ...strategy,
      name: editName.trim(),
      description: editDesc.trim(),
    });
    setEditing(false);
  }, [strategy, editName, editDesc, upsertStrategy]);

  const handleStatusChange = useCallback(
    (status: Strategy['status']) => {
      if (!strategy) return;
      upsertStrategy({ ...strategy, status });
    },
    [strategy, upsertStrategy],
  );

  const handleDelete = useCallback(() => {
    if (!strategy) return;
    if (window.confirm(`Delete strategy "${strategy.name}"? This cannot be undone.`)) {
      deleteStrategy(strategy.id);
      router.push('/strategies');
    }
  }, [strategy, deleteStrategy, router]);

  // Derived stats
  const stats = useMemo(() => {
    const tradesWithPnl = trades.filter((t) => t.pnl != null);
    const wins = tradesWithPnl.filter((t) => (t.pnl ?? 0) > 0).length;
    const totalPnl = tradesWithPnl.reduce((sum, t) => sum + (t.pnl ?? 0), 0);
    const avgPnl = tradesWithPnl.length > 0 ? totalPnl / tradesWithPnl.length : 0;
    const winRate = tradesWithPnl.length > 0 ? wins / tradesWithPnl.length : 0;

    // Compute drawdown from equity curve
    let peak = 0;
    let maxDrawdown = 0;
    let cum = 0;
    const sorted = [...tradesWithPnl].sort(
      (a, b) => new Date(a.executed_at).getTime() - new Date(b.executed_at).getTime(),
    );
    for (const t of sorted) {
      cum += t.pnl ?? 0;
      if (cum > peak) peak = cum;
      const dd = peak - cum;
      if (dd > maxDrawdown) maxDrawdown = dd;
    }

    return { totalPnl, avgPnl, winRate, maxDrawdown, tradesWithPnl };
  }, [trades]);

  // ── Loading state ──────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] gap-2 text-zinc-500">
        <Loader2 className="w-5 h-5 animate-spin" />
        Loading strategy…
      </div>
    );
  }

  // ── Error / not found state ────────────────────────────
  if (isError || !strategy) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => router.push('/strategies')}
          className="flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-200 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Strategies
        </button>
        <Card>
          <CardContent>
            <div className="py-12 text-center">
              <AlertTriangle className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
              <h3 className="text-lg font-semibold text-zinc-300 mb-1">Strategy Not Found</h3>
              <p className="text-sm text-zinc-500">
                {error?.message ?? 'This strategy may have been deleted or does not exist.'}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Main content ───────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Back + Header */}
      <div className="flex items-start justify-between">
        <div>
          <button
            onClick={() => router.push('/strategies')}
            className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-200 mb-3 cursor-pointer transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Strategies
          </button>
          <div className="flex items-center gap-3 mb-1">
            {editing ? (
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="bg-card border border-card-border rounded-lg px-3 py-1.5 text-xl font-bold text-white w-80 focus:outline-none focus:border-accent/50"
              />
            ) : (
              <h1 className="text-2xl font-bold text-white">{strategy.name}</h1>
            )}
            <span
              className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border ${statusColors[strategy.status]}`}
            >
              {strategy.status.toUpperCase()}
            </span>
          </div>
          {editing ? (
            <textarea
              value={editDesc}
              onChange={(e) => setEditDesc(e.target.value)}
              className="bg-card border border-card-border rounded-lg px-3 py-1.5 text-sm text-zinc-200 w-full max-w-xl mt-2 resize-none focus:outline-none focus:border-accent/50"
              rows={2}
            />
          ) : (
            <p className="text-sm text-zinc-400 mt-1">
              {strategy.description || 'No description provided'}
            </p>
          )}
          <div className="flex items-center gap-2 mt-2 text-xs text-zinc-500">
            <span className="flex items-center gap-1">
              {typeIcons[strategy.type] ?? <Activity className="w-3.5 h-3.5" />}
              {typeLabels[strategy.type] ?? strategy.type}
            </span>
            <span>·</span>
            <span>Created {new Date(strategy.created_at).toLocaleDateString()}</span>
            <span>·</span>
            <span>Updated {new Date(strategy.updated_at).toLocaleDateString()}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {editing ? (
            <>
              <Button variant="secondary" size="sm" onClick={() => setEditing(false)}>
                <X className="w-3.5 h-3.5" /> Cancel
              </Button>
              <Button size="sm" onClick={handleSaveEdit} disabled={isSaving || !editName.trim()}>
                <Save className="w-3.5 h-3.5" /> {isSaving ? 'Saving...' : 'Save'}
              </Button>
            </>
          ) : (
            <>
              <Button variant="secondary" size="sm" onClick={handleEdit}>
                <Edit3 className="w-3.5 h-3.5" /> Edit
              </Button>
              {strategy.status !== 'active' && strategy.status !== 'archived' && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleStatusChange('active')}
                  disabled={isSaving}
                >
                  <Play className="w-3.5 h-3.5 text-emerald-400" /> Activate
                </Button>
              )}
              {strategy.status === 'active' && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleStatusChange('paused')}
                  disabled={isSaving}
                >
                  <Pause className="w-3.5 h-3.5 text-warning" /> Pause
                </Button>
              )}
              {strategy.status !== 'archived' && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleStatusChange('archived')}
                  disabled={isSaving}
                >
                  <Archive className="w-3.5 h-3.5" /> Archive
                </Button>
              )}
              <Button variant="danger" size="sm" onClick={handleDelete}>
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Performance Metrics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card>
          <CardContent className="!p-4">
            <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Total P&L</p>
            <p className={`text-xl font-bold mt-1 ${pnlColor(stats.totalPnl)}`}>
              {formatCurrency(stats.totalPnl)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="!p-4">
            <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Win Rate</p>
            <p className="text-xl font-bold text-zinc-200 mt-1">
              {(stats.winRate * 100).toFixed(1)}%
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="!p-4">
            <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Total Trades</p>
            <p className="text-xl font-bold text-zinc-200 mt-1">{stats.tradesWithPnl.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="!p-4">
            <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Avg P&L/Trade</p>
            <p className={`text-xl font-bold mt-1 ${pnlColor(stats.avgPnl)}`}>
              {formatCurrency(stats.avgPnl)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="!p-4">
            <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Max Drawdown</p>
            <p className="text-xl font-bold text-red-400 mt-1">
              {formatCurrency(stats.maxDrawdown)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Equity Curve */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-accent" />
            Equity Curve
          </CardTitle>
        </CardHeader>
        <CardContent>
          <EquityCurve trades={trades} />
        </CardContent>
      </Card>

      {/* Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-accent" />
            Configuration
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ConfigPanel config={strategy.config} />
        </CardContent>
      </Card>

      {/* Recent Trades */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Target className="w-4 h-4 text-accent" />
              Recent Trades
            </CardTitle>
            <span className="text-xs text-zinc-500">{trades.length} trades</span>
          </div>
        </CardHeader>
        <CardContent>
          <TradesTable trades={trades} />
        </CardContent>
      </Card>
    </div>
  );
}