'use client';

import { useState, useMemo, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/lib/hooks/use-toast';
import { useMultiMarketData } from '@/lib/hooks';
import {
  scanSymbols,
  type ScreenerResult,
  type ScannerSignal,
  type ScannerConfidence,
} from '@/lib/services/screener-service';
import type { CandlestickData } from '@/types';
import {
  Search,
  Loader2,
  TrendingUp,
  TrendingDown,
  Minus,
  Filter,
  ArrowUpDown,
  BarChart3,
  Zap,
  AlertTriangle,
  Wifi,
  WifiOff,
  Eye,
} from 'lucide-react';

// ─── Default symbols to scan ────────────────────────────────

const DEFAULT_SYMBOLS = [
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA',
  'AMD', 'INTC', 'NFLX', 'DIS', 'BA', 'JPM', 'V', 'WMT',
  'JNJ', 'PG', 'MA', 'HD', 'BAC', 'XOM', 'CVX', 'PFE',
  'CSCO', 'ADBE', 'CRM', 'PYPL', 'NKE', 'SBUX', 'COIN',
];

// ─── Helpers ────────────────────────────────────────────────

function formatCurrency(val: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
}

function formatLargeNumber(val: number): string {
  if (val >= 1e9) return `${(val / 1e9).toFixed(1)}B`;
  if (val >= 1e6) return `${(val / 1e6).toFixed(1)}M`;
  if (val >= 1e3) return `${(val / 1e3).toFixed(1)}K`;
  return val.toFixed(0);
}

function signalColor(signal: ScannerSignal): string {
  switch (signal) {
    case 'BUY':
      return 'text-emerald-400 bg-emerald-400/10 border-emerald-400/30';
    case 'SELL':
      return 'text-red-400 bg-red-400/10 border-red-400/30';
    default:
      return 'text-zinc-400 bg-zinc-400/10 border-zinc-400/30';
  }
}

function signalIcon(signal: ScannerSignal) {
  switch (signal) {
    case 'BUY':
      return <TrendingUp className="w-3.5 h-3.5" />;
    case 'SELL':
      return <TrendingDown className="w-3.5 h-3.5" />;
    default:
      return <Minus className="w-3.5 h-3.5" />;
  }
}

function confidenceStars(confidence: ScannerConfidence): string {
  switch (confidence) {
    case 'HIGH':
      return '⭐⭐⭐';
    case 'MEDIUM':
      return '⭐⭐';
    default:
      return '⭐';
  }
}

// ─── Page Component ─────────────────────────────────────────

type SortField = 'symbol' | 'price' | 'rsi' | 'macd' | 'signal';
type SortDir = 'asc' | 'desc';
type SignalFilter = 'ALL' | 'BUY' | 'SELL' | 'NEUTRAL';

const SORT_OPTIONS: { field: SortField; label: string }[] = [
  { field: 'signal', label: 'Signal' },
  { field: 'symbol', label: 'Symbol' },
  { field: 'price', label: 'Price' },
  { field: 'rsi', label: 'RSI' },
  { field: 'macd', label: 'MACD' },
];

export default function ScreenerPage() {
  const [symbols, setSymbols] = useState<string[]>(DEFAULT_SYMBOLS);
  const [customSymbol, setCustomSymbol] = useState('');
  const [sortField, setSortField] = useState<SortField>('signal');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [filterSignal, setFilterSignal] = useState<SignalFilter>('ALL');
  const [expandedSymbol, setExpandedSymbol] = useState<string | null>(null);
  const { addToast } = useToast();

  // Fetch daily data for all symbols
  const {
    data: multiData,
    isLoading,
    isError,
  } = useMultiMarketData(symbols);

  const hasApiKey = !isError;

  // ── Scan logic ────────────────────────────────────────────

  const scanResults: ScreenerResult[] = useMemo(() => {
    if (!multiData) return [];

    const dataMap: Record<string, CandlestickData[]> = {};
    for (const [sym, marketData] of Object.entries(multiData)) {
      if (marketData?.intraday?.length) {
        // Use daily-resampled data — we need daily candles for indicators
        // Alpha Vantage intraday is 5min bars, we need to downsample
        const dailyBars = resampleToDaily(marketData.intraday);
        if (dailyBars.length >= 50) {
          dataMap[sym] = dailyBars;
        }
      }
    }

    if (Object.keys(dataMap).length === 0) return [];
    return scanSymbols(dataMap);
  }, [multiData]);

  // If no API data, generate mock results
  const displayResults = useMemo(() => {
    if (scanResults.length > 0) return scanResults;
    return generateMockResults();
  }, [scanResults]);

  // Filter & sort
  const filteredResults = useMemo(() => {
    let results = [...displayResults];

    if (filterSignal !== 'ALL') {
      results = results.filter((r) => r.overallSignal === filterSignal);
    }

    results.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'symbol':
          cmp = a.symbol.localeCompare(b.symbol);
          break;
        case 'price':
          cmp = a.price - b.price;
          break;
        case 'rsi':
          cmp = a.indicators.rsi - b.indicators.rsi;
          break;
        case 'macd':
          cmp = a.indicators.macd.histogram - b.indicators.macd.histogram;
          break;
        case 'signal': {
          const rank = (s: ScannerSignal) => (s === 'BUY' ? 0 : s === 'NEUTRAL' ? 1 : 2);
          cmp = rank(a.overallSignal) - rank(b.overallSignal);
          break;
        }
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return results;
  }, [displayResults, filterSignal, sortField, sortDir]);

  const handleAddSymbol = useCallback(() => {
    const sym = customSymbol.trim().toUpperCase();
    if (!sym) return;
    if (symbols.includes(sym)) {
      addToast(`${sym} is already being scanned.`, 'info', 'Already in list');
      return;
    }
    setSymbols((prev) => [...prev, sym]);
    setCustomSymbol('');
  }, [customSymbol, symbols, addToast]);

  const handleRemoveSymbol = useCallback(
    (sym: string) => {
      setSymbols((prev) => prev.filter((s) => s !== sym));
    },
    [],
  );

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir(field === 'signal' ? 'asc' : 'desc');
    }
  };

  const stats = useMemo(() => {
    const buy = filteredResults.filter((r) => r.overallSignal === 'BUY').length;
    const sell = filteredResults.filter((r) => r.overallSignal === 'SELL').length;
    const neutral = filteredResults.filter((r) => r.overallSignal === 'NEUTRAL').length;
    return { buy, sell, neutral, total: filteredResults.length };
  }, [filteredResults]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Market Screener</h1>
          <p className="text-sm text-zinc-400 mt-0.5">
            Technical scanner — RSI, MACD, SMA50/200, Bollinger Bands
          </p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-card border border-card-border text-xs">
          {hasApiKey ? (
            <>
              <Wifi className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-emerald-400">Live scan</span>
            </>
          ) : (
            <>
              <WifiOff className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-amber-400">Demo mode</span>
            </>
          )}
        </div>
      </div>

      {/* No API key banner */}
      {!hasApiKey && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-sm text-amber-300">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>
            No Alpha Vantage API key configured. Showing simulated scan results.
            Add your key in Settings or set{' '}
            <code className="text-amber-200">NEXT_PUBLIC_ALPHA_VANTAGE_API_KEY</code>.
          </span>
        </div>
      )}

      {/* Controls bar */}
      <Card>
        <CardContent className="!p-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Add symbol input */}
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Add symbol..."
                value={customSymbol}
                onChange={(e) => setCustomSymbol(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddSymbol();
                }}
                className="w-32 bg-card-hover border border-card-border rounded-lg px-3 py-1.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-accent/50"
              />
              <Button variant="secondary" size="sm" onClick={handleAddSymbol}>
                Add
              </Button>
            </div>

            <div className="w-px h-6 bg-card-border" />

            {/* Signal filter */}
            <div className="flex items-center gap-1">
              <Filter className="w-3.5 h-3.5 text-zinc-500" />
              {(['ALL', 'BUY', 'SELL', 'NEUTRAL'] as SignalFilter[]).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilterSignal(f)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                    filterSignal === f
                      ? 'bg-accent text-white'
                      : 'text-zinc-500 hover:text-zinc-300 hover:bg-card-hover'
                  }`}
                >
                  {f === 'ALL' ? 'All' : f}
                </button>
              ))}
            </div>

            <div className="w-px h-6 bg-card-border" />

            {/* Sort */}
            <div className="flex items-center gap-1">
              <ArrowUpDown className="w-3.5 h-3.5 text-zinc-500" />
              {SORT_OPTIONS.map((opt) => (
                <button
                  key={opt.field}
                  type="button"
                  onClick={() => toggleSort(opt.field)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                    sortField === opt.field
                      ? 'bg-accent text-white'
                      : 'text-zinc-500 hover:text-zinc-300 hover:bg-card-hover'
                  }`}
                >
                  {opt.label}
                  {sortField === opt.field && (
                    <span className="ml-0.5">{sortDir === 'asc' ? '↑' : '↓'}</span>
                  )}
                </button>
              ))}
            </div>

            {/* Stats */}
            <div className="ml-auto flex items-center gap-3 text-xs text-zinc-500">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                {stats.buy} BUY
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-red-400" />
                {stats.sell} SELL
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-zinc-500" />
                {stats.neutral} NEUTRAL
              </span>
            </div>
          </div>

          {/* Active symbols chips */}
          <div className="flex flex-wrap items-center gap-1.5 mt-3 pt-3 border-t border-card-border">
            <span className="text-xs text-zinc-600 mr-1">Scanning {symbols.length} symbols:</span>
            {symbols.map((sym) => (
              <span
                key={sym}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-card-hover border border-card-border text-xs text-zinc-300"
              >
                {sym}
                <button
                  type="button"
                  onClick={() => handleRemoveSymbol(sym)}
                  className="text-zinc-600 hover:text-zinc-300 transition-colors"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center justify-center py-16 text-zinc-500 gap-3">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span>Scanning {symbols.length} symbols…</span>
        </div>
      )}

      {/* Results table */}
      {!isLoading && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Scan Results</CardTitle>
              <span className="text-xs text-zinc-500">
                {filteredResults.length} results
              </span>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-card-border">
                    <th className="text-left py-3 px-3 text-xs text-zinc-500 font-medium">Symbol</th>
                    <th className="text-right py-3 px-3 text-xs text-zinc-500 font-medium">Price</th>
                    <th className="text-right py-3 px-3 text-xs text-zinc-500 font-medium">Change</th>
                    <th className="text-center py-3 px-2 text-xs text-zinc-500 font-medium">Signal</th>
                    <th className="text-center py-3 px-2 text-xs text-zinc-500 font-medium">
                      Confidence
                    </th>
                    <th className="text-center py-3 px-2 text-xs text-zinc-500 font-medium">RSI</th>
                    <th className="text-center py-3 px-2 text-xs text-zinc-500 font-medium">MACD</th>
                    <th className="text-center py-3 px-2 text-xs text-zinc-500 font-medium">SMA50</th>
                    <th className="text-center py-3 px-2 text-xs text-zinc-500 font-medium">BB</th>
                    <th className="text-center py-3 px-2 text-xs text-zinc-500 font-medium">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredResults.map((result) => {
                    const isExpanded = expandedSymbol === result.symbol;
                    const changeStr =
                      result.change >= 0
                        ? `+${result.change.toFixed(2)}`
                        : result.change.toFixed(2);
                    const changePctStr =
                      result.changePercent >= 0
                        ? `+${result.changePercent.toFixed(2)}%`
                        : `${result.changePercent.toFixed(2)}%`;
                    const changeColor =
                      result.change >= 0 ? 'text-emerald-400' : 'text-red-400';

                    return (
                      <tr key={result.symbol} className="border-b border-card-border/50 group">
                        <td className="py-2.5 px-3 font-medium text-zinc-200">
                          {result.symbol}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-zinc-200">
                          {formatCurrency(result.price)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-xs">
                          <span className={changeColor}>{changeStr}</span>
                          <span className={changeColor}> ({changePctStr})</span>
                        </td>
                        <td className="py-2.5 px-2 text-center">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${signalColor(result.overallSignal)}`}
                          >
                            {signalIcon(result.overallSignal)}
                            {result.overallSignal}
                          </span>
                        </td>
                        <td className="py-2.5 px-2 text-center text-xs text-zinc-400">
                          {confidenceStars(result.overallConfidence)}
                        </td>
                        <td className="py-2.5 px-2 text-center">
                          <span
                            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-mono border ${signalColor(result.signals.rsi)}`}
                          >
                            {result.indicators.rsi.toFixed(0)}
                          </span>
                        </td>
                        <td className="py-2.5 px-2 text-center">
                          <span
                            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-mono border ${signalColor(result.signals.macd)}`}
                          >
                            {result.indicators.macd.histogram >= 0 ? '+' : ''}
                            {result.indicators.macd.histogram.toFixed(3)}
                          </span>
                        </td>
                        <td className="py-2.5 px-2 text-center">
                          <span
                            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-mono border ${signalColor(result.signals.sma)}`}
                          >
                            {result.price > result.indicators.sma50 ? '↑' : '↓'}
                          </span>
                        </td>
                        <td className="py-2.5 px-2 text-center">
                          <span
                            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-mono border ${signalColor(result.signals.bollinger)}`}
                          >
                            {result.price <= result.indicators.bollingerBands.lower
                              ? 'Low'
                              : result.price >= result.indicators.bollingerBands.upper
                                ? 'High'
                                : result.price > result.indicators.bollingerBands.middle
                                  ? 'Mid↑'
                                  : 'Mid↓'}
                          </span>
                        </td>
                        <td className="py-2.5 px-2 text-center">
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedSymbol(isExpanded ? null : result.symbol)
                            }
                            className="p-1 rounded-md text-zinc-600 hover:text-accent hover:bg-card-hover transition-colors"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Expanded detail panels */}
      {expandedSymbol && (() => {
        const result = filteredResults.find((r) => r.symbol === expandedSymbol);
        if (!result) return null;

        return (
          <>
            {filteredResults
              .filter((r) => r.symbol === expandedSymbol)
              .map((r) => (
                <Card key={`detail-${r.symbol}`}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle>{r.symbol} — Technical Detail</CardTitle>
                      <button
                        type="button"
                        onClick={() => setExpandedSymbol(null)}
                        className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                      >
                        Close
                      </button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {/* Summary */}
                    <div className="mb-4 px-4 py-3 rounded-xl bg-card-hover border border-card-border">
                      <p className="text-sm text-zinc-300">{r.summary}</p>
                    </div>

                    {/* Indicator grid */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                      {/* RSI */}
                      <div className="p-4 rounded-xl bg-card-hover border border-card-border">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs text-zinc-500 font-medium">RSI (14)</span>
                          <span
                            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono border ${signalColor(r.signals.rsi)}`}
                          >
                            {r.signals.rsi}
                          </span>
                        </div>
                        <p className="text-2xl font-bold font-mono text-zinc-100">
                          {r.indicators.rsi.toFixed(1)}
                        </p>
                        <div className="mt-2 w-full h-1.5 rounded-full bg-zinc-700 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${r.indicators.rsi >= 70 ? 'bg-red-400' : r.indicators.rsi <= 30 ? 'bg-emerald-400' : r.indicators.rsi >= 50 ? 'bg-blue-400' : 'bg-amber-400'}`}
                            style={{ width: `${r.indicators.rsi}%` }}
                          />
                        </div>
                        <div className="flex justify-between mt-1 text-[10px] text-zinc-600">
                          <span>0</span>
                          <span>30</span>
                          <span>50</span>
                          <span>70</span>
                          <span>100</span>
                        </div>
                      </div>

                      {/* MACD */}
                      <div className="p-4 rounded-xl bg-card-hover border border-card-border">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs text-zinc-500 font-medium">
                            MACD (12,26,9)
                          </span>
                          <span
                            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono border ${signalColor(r.signals.macd)}`}
                          >
                            {r.signals.macd}
                          </span>
                        </div>
                        <div className="space-y-1 font-mono text-sm">
                          <div className="flex justify-between">
                            <span className="text-zinc-500">Line:</span>
                            <span className="text-zinc-200">
                              {r.indicators.macd.macdLine.toFixed(3)}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-zinc-500">Signal:</span>
                            <span className="text-zinc-200">
                              {r.indicators.macd.signalLine.toFixed(3)}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-zinc-500">Histogram:</span>
                            <span
                              className={
                                r.indicators.macd.histogram >= 0
                                  ? 'text-emerald-400'
                                  : 'text-red-400'
                              }
                            >
                              {r.indicators.macd.histogram >= 0 ? '+' : ''}
                              {r.indicators.macd.histogram.toFixed(3)}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* SMAs */}
                      <div className="p-4 rounded-xl bg-card-hover border border-card-border">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs text-zinc-500 font-medium">Moving Averages</span>
                          <span
                            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono border ${signalColor(r.signals.sma)}`}
                          >
                            {r.signals.sma}
                          </span>
                        </div>
                        <div className="space-y-1 font-mono text-sm">
                          <div className="flex justify-between">
                            <span className="text-zinc-500">Price:</span>
                            <span className="text-zinc-200">{formatCurrency(r.price)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-zinc-500">SMA 50:</span>
                            <span className="text-zinc-200">
                              {formatCurrency(r.indicators.sma50)}
                            </span>
                          </div>
                          {r.indicators.sma200 !== null && (
                            <div className="flex justify-between">
                              <span className="text-zinc-500">SMA 200:</span>
                              <span className="text-zinc-200">
                                {formatCurrency(r.indicators.sma200)}
                              </span>
                            </div>
                          )}
                          <div className="flex justify-between">
                            <span className="text-zinc-500">EMA 20:</span>
                            <span className="text-zinc-200">
                              {formatCurrency(r.indicators.ema20)}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Bollinger Bands */}
                      <div className="p-4 rounded-xl bg-card-hover border border-card-border">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs text-zinc-500 font-medium">
                            Bollinger Bands (20,2)
                          </span>
                          <span
                            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono border ${signalColor(r.signals.bollinger)}`}
                          >
                            {r.signals.bollinger}
                          </span>
                        </div>
                        <div className="space-y-1 font-mono text-sm">
                          <div className="flex justify-between">
                            <span className="text-zinc-500">Upper:</span>
                            <span className="text-red-400">
                              {formatCurrency(r.indicators.bollingerBands.upper)}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-zinc-500">Middle:</span>
                            <span className="text-zinc-200">
                              {formatCurrency(r.indicators.bollingerBands.middle)}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-zinc-500">Lower:</span>
                            <span className="text-emerald-400">
                              {formatCurrency(r.indicators.bollingerBands.lower)}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-zinc-500">Width:</span>
                            <span className="text-zinc-300">
                              {r.indicators.bollingerBands.width.toFixed(1)}%
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-zinc-500">ATR:</span>
                            <span className="text-zinc-300">
                              {r.indicators.atr.toFixed(2)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
          </>
        );
      })()}
    </div>
  );
}

// ─── Mock data generator (for demo mode) ─────────────────────

function generateMockResults(): ScreenerResult[] {
  const symbols = DEFAULT_SYMBOLS.slice(0, 15);
  const basePrices: Record<string, number> = {
    AAPL: 192, MSFT: 425, GOOGL: 178, AMZN: 220, NVDA: 1100, META: 480, TSLA: 175,
    AMD: 145, INTC: 30, NFLX: 680, DIS: 102, BA: 175, JPM: 198, V: 275, WMT: 68,
  };

  return symbols.map((sym) => {
    const price = basePrices[sym] ?? 100 + Math.random() * 300;
    const change = (Math.random() - 0.5) * price * 0.03;
    const changePct = (change / price) * 100;
    const rsiVal = Math.round(25 + Math.random() * 55);
    const macdHist = (Math.random() - 0.5) * 2;
    const sma50 = price * (1 + (Math.random() - 0.55) * 0.04);
    const sma200 = price * (1 + (Math.random() - 0.52) * 0.08);
    const bbMiddle = price * (1 + (Math.random() - 0.5) * 0.01);
    const bbWidth = 2 + Math.random() * 6;

    let rsiSignal: ScannerSignal = 'NEUTRAL';
    if (rsiVal <= 30) rsiSignal = 'BUY';
    else if (rsiVal >= 70) rsiSignal = 'SELL';
    else if (rsiVal >= 55) rsiSignal = 'BUY';
    else if (rsiVal <= 45) rsiSignal = 'SELL';

    let macdSignal: ScannerSignal = macdHist > 0 ? 'BUY' : macdHist < -0.3 ? 'SELL' : 'NEUTRAL';
    let smaSignal: ScannerSignal = price > sma50 ? 'BUY' : 'SELL';
    let bbSignal: ScannerSignal = 'NEUTRAL';
    const bbLower = bbMiddle * (1 - bbWidth / 200);
    const bbUpper = bbMiddle * (1 + bbWidth / 200);
    if (price <= bbLower) bbSignal = 'BUY';
    else if (price >= bbUpper) bbSignal = 'SELL';
    else if (price > bbMiddle) bbSignal = 'BUY';
    else bbSignal = 'SELL';

    const signalValues = [rsiSignal, macdSignal, smaSignal, bbSignal];
    const buyCount = signalValues.filter((s) => s === 'BUY').length;
    const sellCount = signalValues.filter((s) => s === 'SELL').length;

    let overallSignal: ScannerSignal;
    let overallConfidence: ScannerConfidence;
    if (buyCount >= 3) {
      overallSignal = 'BUY';
      overallConfidence = buyCount === 4 ? 'HIGH' : 'MEDIUM';
    } else if (sellCount >= 3) {
      overallSignal = 'SELL';
      overallConfidence = sellCount === 4 ? 'HIGH' : 'MEDIUM';
    } else {
      overallSignal = 'NEUTRAL';
      overallConfidence = 'LOW';
    }

    return {
      symbol: sym,
      price,
      change,
      changePercent: changePct,
      volume: Math.floor(Math.random() * 50000000),
      signals: { rsi: rsiSignal, macd: macdSignal, sma: smaSignal, bollinger: bbSignal },
      overallSignal,
      overallConfidence,
      indicators: {
        rsi: rsiVal,
        macd: { macdLine: macdHist, signalLine: macdHist * 0.3, histogram: macdHist },
        sma50,
        sma200,
        ema20: price * (1 + (Math.random() - 0.5) * 0.02),
        bollingerBands: { upper: bbUpper, middle: bbMiddle, lower: bbLower, width: bbWidth },
        atr: price * 0.015,
      },
      summary: `RSI(${rsiVal}) — ${rsiSignal} | MACD(${macdHist.toFixed(3)}) — ${macdSignal} | SMA50 — ${smaSignal} | Bollinger — ${bbSignal}`,
    };
  });
}

// ─── Downsampling helper ─────────────────────────────────────

function resampleToDaily(intraday: CandlestickData[]): CandlestickData[] {
  if (intraday.length === 0) return [];

  // Group by date
  const dailyMap = new Map<
    string,
    { open: number; high: number; low: number; close: number; volume: number }
  >();

  for (const bar of intraday) {
    const date = bar.time.slice(0, 10); // "YYYY-MM-DD"
    const existing = dailyMap.get(date);

    if (!existing) {
      dailyMap.set(date, {
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: bar.volume,
      });
    } else {
      existing.high = Math.max(existing.high, bar.high);
      existing.low = Math.min(existing.low, bar.low);
      existing.close = bar.close;
      existing.volume += bar.volume ?? 0;
    }
  }

  const result: CandlestickData[] = [];
  for (const [date, ohlcv] of dailyMap) {
    result.push({
      time: date,
      open: +ohlcv.open.toFixed(2),
      high: +ohlcv.high.toFixed(2),
      low: +ohlcv.low.toFixed(2),
      close: +ohlcv.close.toFixed(2),
      volume: ohlcv.volume,
    });
  }

  return result.sort((a, b) => a.time.localeCompare(b.time));
}