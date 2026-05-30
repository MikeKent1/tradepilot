'use client';

import { useState, useMemo, useCallback, useRef } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  useMarketData,
  useMultiMarketData,
  useIntradayData,
  useSymbolSearch,
} from '@/lib/hooks';
import { useWatchlistData } from '@/lib/hooks';
import { useToast } from '@/lib/hooks/use-toast';
import { mockWatchlist } from '@/lib/mock-data';
import { formatCurrency, formatPercent, formatLargeNumber, pnlColor } from '@/lib/utils';
import {
  TrendingUp,
  TrendingDown,
  Search,
  Star,
  AlertTriangle,
  Loader2,
  Wifi,
  WifiOff,
  BarChart3,
  X,
  ExternalLink,
} from 'lucide-react';
import type { WatchlistItem, CandlestickData } from '@/types';
import type { MarketDataResult, SymbolSearchResult } from '@/lib/hooks';

// ─── Timeframe types ───────────────────────────────────────

type Timeframe = '1D' | '1W' | '1M' | '3M' | '1Y';
const TIMEFRAMES: Timeframe[] = ['1D', '1W', '1M', '3M', '1Y'];

function filterByTimeframe(data: CandlestickData[], tf: Timeframe): CandlestickData[] {
  if (!data.length) return [];
  if (tf === '1D') return data.slice(-78); // ~6.5h of 5min bars

  const lastDate = new Date(data[data.length - 1].time);
  const cutoff = new Date(lastDate);

  switch (tf) {
    case '1W':
      cutoff.setDate(cutoff.getDate() - 7);
      break;
    case '1M':
      cutoff.setMonth(cutoff.getMonth() - 1);
      break;
    case '3M':
      cutoff.setMonth(cutoff.getMonth() - 3);
      break;
    case '1Y':
      cutoff.setFullYear(cutoff.getFullYear() - 1);
      break;
    default:
      return data;
  }

  return data.filter((d) => new Date(d.time) >= cutoff);
}

// ─── Candlestick chart (pure SVG) ──────────────────────────

function CandlestickChart({
  data,
  width = 800,
  height = 380,
}: {
  data: CandlestickData[];
  width?: number;
  height?: number;
}) {
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    bar: CandlestickData;
  } | null>(null);
  const [crosshairX, setCrosshairX] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  if (!data.length) {
    return (
      <div className="flex items-center justify-center text-sm text-zinc-500" style={{ height }}>
        No chart data available
      </div>
    );
  }

  // Chart dimensions
  const margin = { top: 20, right: 20, bottom: 32, left: 60 };
  const chartW = width - margin.left - margin.right;
  const chartH = height - margin.top - margin.bottom;

  // Price range
  const prices = data.flatMap((d) => [d.high, d.low]);
  const minPrice = Math.min(...prices) * 0.998;
  const maxPrice = Math.max(...prices) * 1.002;
  const priceRange = maxPrice - minPrice || 1;

  // Scaling helpers
  const xScale = (i: number) => margin.left + (i / (data.length - 1 || 1)) * chartW;
  const yScale = (price: number) => margin.top + ((maxPrice - price) / priceRange) * chartH;

  // Candlestick width
  const barWidth = Math.max(1, Math.min(8, chartW / data.length / 1.6));
  const barHalf = barWidth / 2;

  // Y-axis ticks
  const yTicks = 6;
  const tickValues = Array.from({ length: yTicks }, (_, i) => {
    return minPrice + (priceRange / (yTicks - 1)) * i;
  });

  // X-axis labels (show ~5 evenly spaced)
  const xLabelCount = Math.min(5, data.length);
  const xLabelIndices = Array.from({ length: xLabelCount }, (_, i) =>
    Math.floor((i / (xLabelCount - 1 || 1)) * (data.length - 1)),
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!svgRef.current) return;
      const rect = svgRef.current.getBoundingClientRect();
      const mx = e.clientX - rect.left;

      // Find nearest bar
      const idx = Math.round(((mx - margin.left) / chartW) * (data.length - 1));
      const clamped = Math.max(0, Math.min(data.length - 1, idx));
      const bar = data[clamped];
      const cx = xScale(clamped);

      setCrosshairX(cx);
      setTooltip({
        x: cx > width / 2 ? cx - 140 : cx + 12,
        y: margin.top + 4,
        bar,
      });
    },
    [data, width, chartW, margin.left, margin.top],
  );

  const handleMouseLeave = () => {
    setTooltip(null);
    setCrosshairX(null);
  };

  return (
    <div className="relative" style={{ width: '100%', height }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height="100%"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        className="select-none"
      >
        {/* Grid lines */}
        {tickValues.map((price) => (
          <line
            key={price}
            x1={margin.left}
            x2={width - margin.right}
            y1={yScale(price)}
            y2={yScale(price)}
            stroke="#1e1e2e"
            strokeDasharray="3 3"
          />
        ))}

        {/* Y-axis labels */}
        {tickValues.map((price) => (
          <text
            key={`y-${price}`}
            x={margin.left - 8}
            y={yScale(price) + 4}
            textAnchor="end"
            fill="#6b6b80"
            fontSize="10"
          >
            {formatCurrency(price)}
          </text>
        ))}

        {/* X-axis labels */}
        {xLabelIndices.map((idx) => {
          const ts = data[idx].time;
          const d = new Date(ts.length <= 10 ? ts + 'T00:00:00' : ts);
          const label =
            ts.length <= 10
              ? `${d.getMonth() + 1}/${d.getDate()}`
              : `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
          return (
            <text
              key={`x-${idx}`}
              x={xScale(idx)}
              y={height - 6}
              textAnchor="middle"
              fill="#6b6b80"
              fontSize="10"
            >
              {label}
            </text>
          );
        })}

        {/* Candlesticks */}
        {data.map((bar, i) => {
          const x = xScale(i);
          const isUp = bar.close >= bar.open;
          const color = isUp ? '#22c55e' : '#ef4444';
          const bodyTop = yScale(Math.max(bar.open, bar.close));
          const bodyBot = yScale(Math.min(bar.open, bar.close));
          const bodyH = Math.max(1, bodyBot - bodyTop);

          return (
            <g key={bar.time}>
              {/* Wick */}
              <line
                x1={x}
                x2={x}
                y1={yScale(bar.high)}
                y2={yScale(bar.low)}
                stroke={color}
                strokeWidth={1}
              />
              {/* Body */}
              <rect
                x={x - barHalf}
                y={bodyTop}
                width={barWidth}
                height={bodyH}
                fill={color}
                rx={0.5}
              />
            </g>
          );
        })}

        {/* Crosshair */}
        {crosshairX !== null && (
          <line
            x1={crosshairX}
            x2={crosshairX}
            y1={margin.top}
            y2={height - margin.bottom}
            stroke="#6366f1"
            strokeWidth={1}
            strokeDasharray="4 2"
            opacity={0.7}
          />
        )}
      </svg>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="absolute bg-card border border-card-border rounded-lg px-3 py-2 text-xs shadow-xl z-10"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          <div className="text-zinc-400 mb-1">
            {new Date(
              tooltip.bar.time.length <= 10
                ? tooltip.bar.time + 'T00:00:00'
                : tooltip.bar.time,
            ).toLocaleString()}
          </div>
          <div className="space-y-0.5">
            <div className="flex justify-between gap-4">
              <span className="text-zinc-500">O</span>
              <span className="text-zinc-200 font-mono">{formatCurrency(tooltip.bar.open)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-zinc-500">H</span>
              <span className="text-zinc-200 font-mono">{formatCurrency(tooltip.bar.high)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-zinc-500">L</span>
              <span className="text-zinc-200 font-mono">{formatCurrency(tooltip.bar.low)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-zinc-500">C</span>
              <span className="text-zinc-200 font-mono">{formatCurrency(tooltip.bar.close)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────

function toWatchlistItem(
  data: MarketDataResult,
  index: number,
): WatchlistItem {
  return {
    id: `av-${data.symbol}-${index}`,
    user_id: 'user-001',
    symbol: data.symbol,
    name: data.name,
    price: data.price,
    change: data.change,
    change_percent: data.change_percent,
    added_at: new Date().toISOString(),
  } as WatchlistItem;
}

// ─── Page component ─────────────────────────────────────────

export default function MarketPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSymbol, setSelectedSymbol] = useState('AAPL');
  const [timeframe, setTimeframe] = useState<Timeframe>('1D');
  const [showSearch, setShowSearch] = useState(false);
  const { watchlist: dbWatchlist, addToWatchlist, removeFromWatchlist, isAdding } = useWatchlistData();
  const { addToast } = useToast();

  // Set of symbols in user's DB watchlist
  const watchlistSymbols = new Set(dbWatchlist.map((w) => w.symbol));

  // ── Data hooks ────────────────────────────────────────────
  const intradayQuery = useIntradayData(selectedSymbol);
  const dailyQuery = useMarketData(selectedSymbol);

  // Merge: use intraday for 1D, daily for others
  const selectedData: MarketDataResult | undefined = useMemo(() => {
    if (timeframe === '1D') return intradayQuery.data;
    return dailyQuery.data;
  }, [timeframe, intradayQuery.data, dailyQuery.data]);

  const selectedLoading = timeframe === '1D' ? intradayQuery.isLoading : dailyQuery.isLoading;
  const selectedError = timeframe === '1D' ? intradayQuery.isError : dailyQuery.isError;
  const selectedErrorObj = timeframe === '1D' ? intradayQuery.error : dailyQuery.error;

  // Symbol search
  const searchQueryData = useSymbolSearch(searchQuery);
  const searchResults: SymbolSearchResult[] = searchQueryData.data ?? [];

  // Multi-symbol watchlist quotes
  const symbols = useMemo(
    () => Array.from(new Set(['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA'])),
    [],
  );

  const {
    data: multiData,
    isLoading: multiLoading,
  } = useMultiMarketData(symbols);

  // ── Derived state ─────────────────────────────────────────
  const hasApiKey =
    !selectedErrorObj || selectedErrorObj.message !== 'NO_API_KEY';

  // Build watchlist: live data or mock fallback
  const watchlist: WatchlistItem[] = useMemo(() => {
    if (multiData) {
      return symbols
        .filter((sym) => multiData[sym])
        .map((sym, i) => toWatchlistItem(multiData[sym], i));
    }
    return mockWatchlist;
  }, [multiData, symbols]);

  // Filter watchlist by search (local)
  const filtered = watchlist.filter(
    (w) =>
      w.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
      w.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  // Filtered intraday data for chart
  const chartData: CandlestickData[] = useMemo(() => {
    if (selectedData?.intraday?.length) {
      return filterByTimeframe(selectedData.intraday, timeframe);
    }
    // Generate mock data
    const count = timeframe === '1D' ? 78 : timeframe === '1W' ? 7 : timeframe === '1M' ? 22 : timeframe === '3M' ? 66 : 252;
    const data: CandlestickData[] = [];
    let price = watchlist.find((w) => w.symbol === selectedSymbol)?.price ?? 180;
    const now = new Date();
    for (let i = count - 1; i >= 0; i--) {
      const time = new Date(
        timeframe === '1D'
          ? now.getTime() - i * 5 * 60_000
          : now.getTime() - i * 24 * 60 * 60_000,
      );
      const ts = timeframe === '1D'
        ? time.toISOString()
        : time.toISOString().slice(0, 10);
      const open = price;
      const volatility = price * 0.008;
      const close = open + (Math.random() - 0.48) * volatility * 2;
      const high = Math.max(open, close) + Math.random() * volatility;
      const low = Math.min(open, close) - Math.random() * volatility;
      price = close;
      data.push({
        time: ts,
        open: +open.toFixed(2),
        high: +high.toFixed(2),
        low: +low.toFixed(2),
        close: +close.toFixed(2),
        volume: Math.floor(Math.random() * 10000000),
      });
    }
    return data;
  }, [selectedData, timeframe, selectedSymbol, watchlist]);

  // Selected asset summary
  const selectedSummary = useMemo(() => {
    if (selectedData) {
      return {
        symbol: selectedData.symbol,
        name: selectedData.name,
        price: selectedData.price,
        change: selectedData.change,
        changePercent: selectedData.change_percent,
        open: selectedData.open,
        high: selectedData.high,
        low: selectedData.low,
        previousClose: selectedData.previousClose,
        volume: selectedData.volume,
        lastRefreshed: selectedData.lastRefreshed,
      };
    }
    const mock = mockWatchlist.find((w) => w.symbol === selectedSymbol);
    return mock
      ? {
          symbol: mock.symbol,
          name: mock.name,
          price: mock.price,
          change: mock.change,
          changePercent: mock.change_percent,
          open: mock.price - 1.5,
          high: mock.price + 0.8,
          low: mock.price - 2.1,
          previousClose: mock.price - mock.change,
          volume: 0,
          lastRefreshed: null,
        }
      : null;
  }, [selectedData, selectedSymbol]);

  const handleSymbolSelect = (sym: string) => {
    setSelectedSymbol(sym);
    setShowSearch(false);
    setSearchQuery('');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Market</h1>
          <p className="text-sm text-zinc-400 mt-0.5">Live charts & price data</p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-card border border-card-border text-xs">
          {hasApiKey ? (
            <>
              <Wifi className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-emerald-400">Live data</span>
            </>
          ) : (
            <>
              <WifiOff className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-amber-400">Simulated data</span>
            </>
          )}
        </div>
      </div>

      {/* No API key banner */}
      {!hasApiKey && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-sm text-amber-300">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>
            No Alpha Vantage API key configured. Showing simulated prices.
            Add your key in{' '}
            <a href="/settings" className="text-amber-200 underline">
              Settings
            </a>{' '}
            or set <code className="text-amber-200">NEXT_PUBLIC_ALPHA_VANTAGE_API_KEY</code>.
          </span>
        </div>
      )}

      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-3 w-4 h-4 text-zinc-500" />
        <input
          type="text"
          placeholder="Search any symbol (e.g. AAPL, TSLA, BTC)..."
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            if (e.target.value.trim().length >= 2) setShowSearch(true);
          }}
          onFocus={() => {
            if (searchQuery.trim().length >= 2) setShowSearch(true);
          }}
          className="w-full bg-card border border-card-border rounded-xl pl-10 pr-4 py-2.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-accent/50"
        />

        {/* Search dropdown */}
        {showSearch && searchQuery.trim().length >= 2 && (
          <div className="absolute top-full mt-1 left-0 right-0 bg-card border border-card-border rounded-xl shadow-xl z-20 max-h-64 overflow-y-auto">
            {searchQueryData.isLoading && (
              <div className="flex items-center gap-2 px-4 py-3 text-sm text-zinc-500">
                <Loader2 className="w-4 h-4 animate-spin" />
                Searching…
              </div>
            )}
            {searchQueryData.isError && (
              <div className="px-4 py-3 text-sm text-red-400">
                Search failed. Try again.
              </div>
            )}
            {searchResults.length > 0 && (
              <>
                {searchResults.slice(0, 10).map((r) => (
                  <button
                    key={r.symbol}
                    type="button"
                    onClick={() => handleSymbolSelect(r.symbol)}
                    className="w-full text-left px-4 py-2.5 hover:bg-card-hover transition-colors flex items-center justify-between"
                  >
                    <div>
                      <span className="text-sm font-medium text-zinc-200">{r.symbol}</span>
                      <span className="text-xs text-zinc-500 ml-2">{r.name}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-zinc-600">
                      <span>{r.type}</span>
                      <span>·</span>
                      <span>{r.region}</span>
                    </div>
                  </button>
                ))}
              </>
            )}
            {!searchQueryData.isLoading && searchResults.length === 0 && searchQuery.trim().length >= 2 && (
              <div className="px-4 py-3 text-sm text-zinc-500">
                {hasApiKey ? 'No results found.' : 'Search requires API key. Add one in Settings.'}
              </div>
            )}
          </div>
        )}

        {/* Click-out handler */}
        {showSearch && (
          <div
            className="fixed inset-0 z-10"
            onClick={() => setShowSearch(false)}
          />
        )}
      </div>

      {/* Selected asset detail */}
      {selectedSummary && (
        <Card>
          <CardContent className="!p-0">
            {/* Header row */}
            <div className="p-5 border-b border-card-border">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <div className="flex items-center gap-3">
                    <h2 className="text-xl font-bold text-white">
                      {selectedSummary.symbol}
                    </h2>
                    <span className="text-sm text-zinc-400">
                      {selectedSummary.name}
                    </span>
                    {(selectedSummary.changePercent ?? 0) >= 0 ? (
                      <TrendingUp className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <TrendingDown className="w-4 h-4 text-red-400" />
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-2xl font-bold text-white">
                      {formatCurrency(selectedSummary.price)}
                    </span>
                    <span className={`text-sm font-medium ${pnlColor(selectedSummary.change)}`}>
                      {formatCurrency(selectedSummary.change)} (
                      {formatPercent(selectedSummary.changePercent)})
                    </span>
                    {selectedSummary.lastRefreshed && (
                      <span className="text-xs text-zinc-600">
                        Updated:{' '}
                        {new Date(selectedSummary.lastRefreshed).toLocaleTimeString()}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="primary" size="sm">
                    Simulate Trade
                  </Button>
                  {watchlistSymbols.has(selectedSummary.symbol) ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        const item = dbWatchlist.find((w) => w.symbol === selectedSummary.symbol);
                        if (item) removeFromWatchlist(item.id);
                      }}
                    >
                      <Star className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400" />
                      Remove
                    </Button>
                  ) : (
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={isAdding}
                      onClick={() => {
                        const s = selectedSummary;
                        if (!s) return;
                        addToWatchlist({
                          symbol: s.symbol,
                          name: s.name,
                          price: s.price,
                          change: s.change,
                          change_percent: s.changePercent,
                        });
                      }}
                    >
                      <Star className="w-3.5 h-3.5" />
                      {isAdding ? 'Adding...' : 'Add to Watchlist'}
                    </Button>
                  )}
                </div>
              </div>
            </div>

            {/* Key stats */}
            <div className="px-5 py-3 border-b border-card-border grid grid-cols-2 sm:grid-cols-5 gap-3">
              {[
                { label: 'Open', value: formatCurrency(selectedSummary.open) },
                { label: 'High', value: formatCurrency(selectedSummary.high) },
                { label: 'Low', value: formatCurrency(selectedSummary.low) },
                { label: 'Prev Close', value: formatCurrency(selectedSummary.previousClose) },
                { label: 'Volume', value: formatLargeNumber(selectedSummary.volume) },
              ].map((stat) => (
                <div key={stat.label} className="text-center">
                  <p className="text-[10px] text-zinc-500 uppercase tracking-wider">{stat.label}</p>
                  <p className="text-xs font-mono text-zinc-200 mt-0.5">{stat.value}</p>
                </div>
              ))}
            </div>

            {/* Timeframe selector */}
            <div className="flex items-center gap-1 px-5 py-2 border-b border-card-border">
              {TIMEFRAMES.map((tf) => (
                <button
                  key={tf}
                  type="button"
                  onClick={() => setTimeframe(tf)}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                    timeframe === tf
                      ? 'bg-accent text-white'
                      : 'text-zinc-500 hover:text-zinc-300 hover:bg-card-hover'
                  }`}
                >
                  {tf}
                </button>
              ))}
            </div>

            {/* Chart area */}
            <div className="p-5">
              {selectedLoading && (
                <div className="flex items-center justify-center h-[380px] text-zinc-500 gap-2">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Loading live data…
                </div>
              )}

              {selectedError && hasApiKey && (
                <div className="flex items-center justify-center h-[380px] text-red-400 gap-2">
                  <AlertTriangle className="w-5 h-5" />
                  Failed to load data for {selectedSymbol}.
                </div>
              )}

              {((!selectedLoading && !selectedError) || !hasApiKey) && chartData.length > 0 && (
                <CandlestickChart data={chartData} width={800} height={380} />
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Asset table */}
      <Card>
        <CardHeader>
          <CardTitle>Watchlist</CardTitle>
          <span className="text-xs text-zinc-500">{watchlist.length} assets</span>
        </CardHeader>
        <CardContent>
          {multiLoading && watchlist.length === 0 && (
            <div className="flex items-center justify-center py-8 text-zinc-500 gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading market data…
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-card-border">
                  <th className="text-left py-3 px-2 text-xs text-zinc-500 font-medium" />
                  <th className="text-left py-3 px-2 text-xs text-zinc-500 font-medium">Symbol</th>
                  <th className="text-left py-3 px-2 text-xs text-zinc-500 font-medium">Name</th>
                  <th className="text-right py-3 px-2 text-xs text-zinc-500 font-medium">Price</th>
                  <th className="text-right py-3 px-2 text-xs text-zinc-500 font-medium">Change</th>
                  <th className="text-right py-3 px-2 text-xs text-zinc-500 font-medium">%</th>
                  <th className="text-right py-3 px-2 text-xs text-zinc-500 font-medium">Volume</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => (
                  <tr
                    key={item.id}
                    onClick={() => setSelectedSymbol(item.symbol)}
                    className={`border-b border-card-border/50 hover:bg-card-hover transition-colors cursor-pointer ${
                      selectedSymbol === item.symbol ? 'bg-accent/5' : ''
                    }`}
                  >
                    <td className="py-2 px-2">
                      {watchlistSymbols.has(item.symbol) ? (
                        <Star
                          className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400 cursor-pointer"
                          onClick={(e) => {
                            e.stopPropagation();
                            const wl = dbWatchlist.find((w) => w.symbol === item.symbol);
                            if (wl) removeFromWatchlist(wl.id);
                          }}
                        />
                      ) : (
                        <Star
                          className="w-3.5 h-3.5 text-zinc-600 hover:text-yellow-400 cursor-pointer"
                          onClick={(e) => {
                            e.stopPropagation();
                            addToWatchlist({
                              symbol: item.symbol,
                              name: item.name,
                              price: item.price,
                              change: item.change,
                              change_percent: item.change_percent,
                            });
                          }}
                        />
                      )}
                    </td>
                    <td className="py-2 px-2 font-medium text-zinc-200">{item.symbol}</td>
                    <td className="py-2 px-2 text-zinc-400 text-xs">{item.name}</td>
                    <td className="py-2 px-2 text-right text-zinc-200">{formatCurrency(item.price)}</td>
                    <td className={`py-2 px-2 text-right ${pnlColor(item.change)}`}>
                      {formatCurrency(item.change)}
                    </td>
                    <td className={`py-2 px-2 text-right font-medium ${pnlColor(item.change_percent)}`}>
                      {formatPercent(item.change_percent)}
                    </td>
                    <td className="py-2 px-2 text-right text-zinc-400 text-xs">—</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}