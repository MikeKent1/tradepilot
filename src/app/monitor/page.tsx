'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { usePriceFeed } from '@/lib/hooks/use-price-feed';
import { useAlpacaExecutor } from '@/lib/hooks/use-alpaca-executor';
import { getRiskManager } from '@/lib/services/risk-manager';
import { cn } from '@/lib/utils';
import type { PortfolioRiskMetrics, CircuitBreakerState } from '@/types';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  TrendingUp,
  TrendingDown,
  Minus,
  Play,
  Pause,
  RefreshCw,
  Wifi,
  WifiOff,
  Zap,
  Server,
  DollarSign,
  BarChart3,
  ShoppingCart,
  Repeat,
  Shield,
  ShieldOff,
  Percent,
  GitBranch,
  Calculator,
  Layers,
} from 'lucide-react';

// ── Default symbols to watch ──────────────────────────────────────────
const DEFAULT_SYMBOLS = [
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA',
  'META', 'NVDA', 'JPM', 'V', 'SPY',
];

export default function MonitorPage() {
  const [symbolsInput, setSymbolsInput] = useState(DEFAULT_SYMBOLS.join(', '));
  const [intervalMs, setIntervalMs] = useState(30_000);
  const [provider, setProvider] = useState<'alpha-vantage' | 'finnhub'>('finnhub');

  const symbols = useMemo(() => {
    return symbolsInput
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
  }, [symbolsInput]);

  const {
    quotesList,
    isPolling,
    pollsCount,
    totalErrors,
    error,
    isRateLimited,
    wsStatus,
    wsSymbolCount,
    start,
    stop,
    pollNow,
    resetRateTracker,
  } = usePriceFeed({
    symbols,
    intervalMs,
    provider,
    autoStart: true,
    batchSize: 3,
    batchDelayMs: 2000,
  });

  const riskManager = getRiskManager();
  const riskConfig = riskManager.getConfig();

  // ── Alpaca + Advanced Risk (single hook call) ──────────
  const alpaca = useAlpacaExecutor();

  useEffect(() => {
    alpaca.checkConnection();
  }, [alpaca.checkConnection]);

  // ── Poll risk metrics periodically ──────────────────────
  const [riskMetrics, setRiskMetrics] = useState<PortfolioRiskMetrics | null>(null);
  const [circuitBreaker, setCircuitBreaker] = useState<CircuitBreakerState>(
    riskManager.getCircuitBreakerState(),
  );

  const refreshRiskMetrics = useCallback(() => {
    if (!alpaca.account) return;
    const rm = riskManager;
    const capital = Number(alpaca.account.equity);
    const positions =
      alpaca.positions
        ?.filter((p) => Number(p.qty) > 0)
        .map((p) => ({
          symbol: p.symbol,
          market_value: Number(p.market_value),
          unrealized_pnl: Number(p.unrealized_pl),
        })) ?? [];

    const metrics = rm.computePortfolioRiskMetrics({ capital, positions });
    setRiskMetrics(metrics);
    setCircuitBreaker(rm.getCircuitBreakerState());
  }, [alpaca.account, alpaca.positions, riskManager]);

  useEffect(() => {
    refreshRiskMetrics();
    const interval = setInterval(refreshRiskMetrics, 30_000);
    return () => clearInterval(interval);
  }, [refreshRiskMetrics]);

  const isFinnhub = provider === 'finnhub';

  const statusColor = isPolling
    ? 'text-emerald-400'
    : totalErrors > 0
      ? 'text-red-400'
      : 'text-zinc-500';

  const wsStatusColor =
    wsStatus === 'connected'
      ? 'text-emerald-400'
      : wsStatus === 'connecting' || wsStatus === 'reconnecting'
        ? 'text-amber-400'
        : 'text-zinc-500';

  const wsStatusLabel =
    wsStatus === 'connected'
      ? 'Connected'
      : wsStatus === 'connecting'
        ? 'Connecting…'
        : wsStatus === 'reconnecting'
          ? 'Reconnecting…'
          : 'Disconnected';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Live Monitoring Dashboard</h1>
        <p className="text-sm text-zinc-400 mt-1">
          Real-time price feed and risk management overview.
        </p>
      </div>

      {/* Controls */}
      <div className="glass-card p-4 space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          {/* Provider switcher */}
          <div className="w-48">
            <label className="text-xs font-medium text-zinc-400 block mb-1">
              Provider
            </label>
            <div className="flex rounded-lg overflow-hidden border border-card-border">
              <button
                onClick={() => setProvider('finnhub')}
                className={cn(
                  'flex-1 flex items-center justify-center gap-1 px-3 py-2 text-xs font-medium transition-colors cursor-pointer',
                  isFinnhub
                    ? 'bg-accent/20 text-accent'
                    : 'bg-card text-zinc-500 hover:text-zinc-300',
                )}
              >
                <Zap className="w-3 h-3" />
                Finnhub
              </button>
              <button
                onClick={() => setProvider('alpha-vantage')}
                className={cn(
                  'flex-1 flex items-center justify-center gap-1 px-3 py-2 text-xs font-medium transition-colors cursor-pointer',
                  !isFinnhub
                    ? 'bg-accent/20 text-accent'
                    : 'bg-card text-zinc-500 hover:text-zinc-300',
                )}
              >
                <RefreshCw className="w-3 h-3" />
                Alpha Vantage
              </button>
            </div>
          </div>

          {/* Symbols input */}
          <div className="flex-1 min-w-[200px]">
            <label className="text-xs font-medium text-zinc-400 block mb-1">
              Symbols (comma-separated)
            </label>
            <input
              type="text"
              value={symbolsInput}
              onChange={(e) => setSymbolsInput(e.target.value)}
              className="w-full bg-card border border-card-border rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-accent/50"
              placeholder="AAPL, MSFT, TSLA..."
            />
          </div>

          {/* Interval (Alpha Vantage only) */}
          {!isFinnhub && (
            <div className="w-32">
              <label className="text-xs font-medium text-zinc-400 block mb-1">
                Interval (ms)
              </label>
              <input
                type="number"
                value={intervalMs}
                min={5000}
                max={300000}
                step={5000}
                onChange={(e) => setIntervalMs(Number(e.target.value))}
                className="w-full bg-card border border-card-border rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-accent/50"
              />
            </div>
          )}

          {/* Buttons */}
          <div className="flex gap-2">
            {isPolling ? (
              <button
                onClick={stop}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-500/15 text-amber-400 text-sm font-medium hover:bg-amber-500/25 transition-colors cursor-pointer"
              >
                <Pause className="w-4 h-4" />
                Stop
              </button>
            ) : (
              <button
                onClick={start}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-500/15 text-emerald-400 text-sm font-medium hover:bg-emerald-500/25 transition-colors cursor-pointer"
              >
                <Play className="w-4 h-4" />
                Start
              </button>
            )}
            {!isFinnhub && (
              <>
                <button
                  onClick={pollNow}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-500/15 text-blue-400 text-sm font-medium hover:bg-blue-500/25 transition-colors cursor-pointer"
                >
                  <RefreshCw className="w-4 h-4" />
                  Poll Now
                </button>
                {isRateLimited && (
                  <button
                    onClick={resetRateTracker}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-500/15 text-red-400 text-sm font-medium hover:bg-red-500/25 transition-colors cursor-pointer"
                  >
                    <AlertTriangle className="w-4 h-4" />
                    Reset Rate Tracker
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Alpaca Connection Status */}
      <div className="glass-card p-4">
        <div className="flex items-center gap-3 mb-3">
          <Server className="w-4 h-4 text-accent" />
          <h2 className="text-sm font-semibold text-zinc-200">Alpaca Markets Connection</h2>
          <div className={`w-2 h-2 rounded-full ${alpaca.isConnected ? 'bg-emerald-400' : 'bg-red-400'}`} />
          <span className={`text-xs ${alpaca.isConnected ? 'text-emerald-400' : 'text-red-400'}`}>
            {alpaca.isConnected ? 'Connected' : 'Disconnected'}
          </span>
        </div>

        {alpaca.account ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
            <div className="bg-card/50 rounded-lg p-3 flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-emerald-400" />
              <div>
                <p className="text-[10px] text-zinc-500 uppercase">Cash</p>
                <p className="text-sm font-semibold text-emerald-400">
                  ${parseFloat(alpaca.account.cash).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </p>
              </div>
            </div>
            <div className="bg-card/50 rounded-lg p-3 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-blue-400" />
              <div>
                <p className="text-[10px] text-zinc-500 uppercase">Equity</p>
                <p className="text-sm font-semibold text-zinc-200">
                  ${parseFloat(alpaca.account.equity).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </p>
              </div>
            </div>
            <div className="bg-card/50 rounded-lg p-3 flex items-center gap-2">
              <ShoppingCart className="w-4 h-4 text-amber-400" />
              <div>
                <p className="text-[10px] text-zinc-500 uppercase">Buying Power</p>
                <p className="text-sm font-semibold text-zinc-200">
                  ${parseFloat(alpaca.account.buying_power).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </p>
              </div>
            </div>
            <div className="bg-card/50 rounded-lg p-3 flex items-center gap-2">
              <Repeat className="w-4 h-4 text-purple-400" />
              <div>
                <p className="text-[10px] text-zinc-500 uppercase">Status</p>
                <p className={`text-sm font-semibold ${
                  alpaca.account.status === 'ACTIVE' ? 'text-emerald-400' : 'text-zinc-400'
                }`}>
                  {alpaca.account.status ?? '—'}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-zinc-500 mb-3">
            {alpaca.isConnected
              ? 'Loading account details…'
              : 'Alpaca is not connected. Check your API keys in .env.local'}
          </p>
        )}

        <button
          onClick={alpaca.syncWithAlpaca}
          disabled={alpaca.isSyncing}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent/15 text-accent text-xs font-medium hover:bg-accent/25 disabled:opacity-50 transition-colors cursor-pointer"
        >
          <RefreshCw className={cn('w-3.5 h-3.5', alpaca.isSyncing && 'animate-spin')} />
          {alpaca.isSyncing ? 'Syncing…' : 'Sync with Alpaca'}
        </button>
      </div>

      {/* Status Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatusCard
          label="Feed Status"
          value={isPolling ? 'Running' : 'Stopped'}
          icon={<Activity className={cn('w-4 h-4', statusColor)} />}
          valueColor={statusColor}
        />
        {isFinnhub ? (
          <>
            <StatusCard
              label="WebSocket"
              value={wsStatusLabel}
              icon={
                wsStatus === 'connected' ? (
                  <Wifi className="w-4 h-4 text-emerald-400" />
                ) : (
                  <WifiOff className={cn('w-4 h-4', wsStatusColor)} />
                )
              }
              valueColor={wsStatusColor}
            />
            <StatusCard
              label="Subscribed Symbols"
              value={String(wsSymbolCount)}
              icon={<Zap className="w-4 h-4 text-amber-400" />}
            />
          </>
        ) : (
          <>
            <StatusCard
              label="Polls"
              value={String(pollsCount)}
              icon={<RefreshCw className="w-4 h-4 text-blue-400" />}
            />
            <StatusCard
              label="Interval"
              value={`${(intervalMs / 1000).toFixed(0)}s`}
              icon={<Clock className="w-4 h-4 text-zinc-400" />}
            />
          </>
        )}
        <StatusCard
          label="Errors"
          value={String(totalErrors)}
          icon={
            totalErrors > 0 ? (
              <XCircle className="w-4 h-4 text-red-400" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            )
          }
          valueColor={totalErrors > 0 ? 'text-red-400' : 'text-zinc-200'}
        />
      </div>

      {/* Live Error Banner */}
      {error && (
        <div className="glass-card p-3 border-red-500/30 bg-red-500/5 flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-red-400">Feed Error</p>
            <p className="text-xs text-red-300/70 mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {/* Price Feed Table */}
      <div className="glass-card overflow-hidden">
        <div className="px-4 py-3 border-b border-card-border">
          <h2 className="text-sm font-semibold text-zinc-200">
            Price Feed ({quotesList.length} symbols)
          </h2>
        </div>

        {quotesList.length === 0 ? (
          <div className="p-8 text-center text-zinc-500 text-sm">
            {isPolling
              ? 'Waiting for first quote...'
              : 'Price feed is stopped. Click "Start" to begin.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-card-border text-zinc-500 text-xs">
                  <th className="text-left px-4 py-2 font-medium">Symbol</th>
                  <th className="text-right px-4 py-2 font-medium">Price</th>
                  <th className="text-right px-4 py-2 font-medium">Change</th>
                  <th className="text-right px-4 py-2 font-medium">Change %</th>
                  <th className="text-right px-4 py-2 font-medium">Volume</th>
                  <th className="text-right px-4 py-2 font-medium">Updated</th>
                </tr>
              </thead>
              <tbody>
                {quotesList.map((q) => {
                  const isUp = (q.change ?? 0) >= 0;
                  const TrendIcon = isUp ? TrendingUp : TrendingDown;

                  return (
                    <tr
                      key={q.symbol}
                      className="border-b border-card-border/50 hover:bg-white/[0.02] transition-colors"
                    >
                      <td className="px-4 py-2.5 font-medium text-zinc-200">
                        {q.symbol}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-zinc-200">
                        ${q.price.toFixed(2)}
                      </td>
                      <td
                        className={cn(
                          'px-4 py-2.5 text-right font-mono',
                          isUp ? 'text-emerald-400' : 'text-red-400',
                        )}
                      >
                        <span className="inline-flex items-center gap-1">
                          <TrendIcon className="w-3 h-3" />
                          {q.change != null
                            ? `${isUp ? '+' : ''}${q.change.toFixed(2)}`
                            : '—'}
                        </span>
                      </td>
                      <td
                        className={cn(
                          'px-4 py-2.5 text-right font-mono',
                          isUp ? 'text-emerald-400' : 'text-red-400',
                        )}
                      >
                        {q.changePercent != null
                          ? `${isUp ? '+' : ''}${q.changePercent}%`
                          : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-zinc-400">
                        {q.volume?.toLocaleString() ?? '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right text-xs text-zinc-500">
                        {q.lastUpdated
                          ? new Date(q.lastUpdated).toLocaleTimeString()
                          : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Basic Risk Management Rules */}
      <div className="glass-card overflow-hidden">
        <div className="px-4 py-3 border-b border-card-border">
          <h2 className="text-sm font-semibold text-zinc-200">
            Risk Management Rules
          </h2>
        </div>
        <div className="p-4 grid grid-cols-2 md:grid-cols-3 gap-3">
          <RiskRuleCard
            label="Max Daily Loss"
            value={
              riskConfig.maxDailyLoss === Infinity
                ? 'Unlimited'
                : `$${riskConfig.maxDailyLoss.toLocaleString()}`
            }
            icon={<AlertTriangle className="w-3.5 h-3.5 text-amber-400" />}
          />
          <RiskRuleCard
            label="Max Positions"
            value={String(riskConfig.maxPositions)}
            icon={<Activity className="w-3.5 h-3.5 text-blue-400" />}
          />
          <RiskRuleCard
            label="Max Position Size"
            value={`${(riskConfig.maxPositionSize * 100).toFixed(0)}%`}
            icon={<TrendingUp className="w-3.5 h-3.5 text-emerald-400" />}
          />
          <RiskRuleCard
            label="Max Exposure"
            value={`${(riskConfig.maxExposure * 100).toFixed(0)}%`}
            icon={<TrendingUp className="w-3.5 h-3.5 text-emerald-400" />}
          />
          <RiskRuleCard
            label="Min Cash Buffer"
            value={`$${riskConfig.minCashBuffer.toLocaleString()}`}
            icon={<Minus className="w-3.5 h-3.5 text-zinc-400" />}
          />
          <RiskRuleCard
            label="Max Trades / Day"
            value={String(riskConfig.maxTradesPerDay)}
            icon={<Clock className="w-3.5 h-3.5 text-zinc-400" />}
          />
        </div>
      </div>

      {/* ── Advanced Risk: Circuit Breakers ───────────────── */}
      <div className="glass-card overflow-hidden">
        <div className="px-4 py-3 border-b border-card-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            {circuitBreaker.isTripped ? (
              <ShieldOff className="w-4 h-4 text-red-400" />
            ) : (
              <Shield className="w-4 h-4 text-emerald-400" />
            )}
            <h2 className="text-sm font-semibold text-zinc-200">
              Circuit Breakers
            </h2>
            <span
              className={cn(
                'text-xs font-mono px-2 py-0.5 rounded',
                circuitBreaker.isTripped
                  ? 'bg-red-500/10 text-red-400'
                  : 'bg-emerald-500/10 text-emerald-400',
              )}
            >
              {circuitBreaker.isTripped ? 'TRIPPED' : 'ACTIVE'}
            </span>
          </div>
          {circuitBreaker.isTripped && (
            <button
              onClick={() => {
                riskManager.resetCircuitBreaker();
                setCircuitBreaker(riskManager.getCircuitBreakerState());
              }}
              className="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium bg-amber-500/15 text-amber-400 hover:bg-amber-500/25 transition-colors cursor-pointer"
            >
              <RefreshCw className="w-3 h-3" />
              Reset Breaker
            </button>
          )}
        </div>

        {circuitBreaker.isTripped && circuitBreaker.reason ? (
          <div className="p-4 bg-red-500/5 border-b border-red-500/10">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-red-400">Circuit Breaker Tripped</p>
                <p className="text-xs text-red-300/70 mt-0.5">
                  Reason: {circuitBreaker.reason}
                </p>
                {circuitBreaker.trippedAt && (
                  <p className="text-xs text-zinc-500 mt-0.5">
                    Tripped at: {new Date(circuitBreaker.trippedAt).toLocaleString()}
                  </p>
                )}
                {circuitBreaker.resumeAt && (
                  <p className="text-xs text-zinc-500">
                    Resumes at: {new Date(circuitBreaker.resumeAt).toLocaleString()}
                    {' '}({circuitBreaker.cooldownMinutes} min cooldown)
                  </p>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="p-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <BreakerTriggerCard
                label="Daily Loss Limit"
                current={`$${riskConfig.maxDailyLoss === Infinity ? '∞' : riskConfig.maxDailyLoss.toLocaleString()}`}
              />
              <BreakerTriggerCard
                label="Weekly Loss Limit"
                current={`${(riskManager.getConfig().maxWeeklyLossPercent * 100).toFixed(0)}%`}
              />
              <BreakerTriggerCard
                label="Max Consecutive Losses"
                current={String(riskManager.getConfig().maxConsecutiveLosses)}
              />
              <BreakerTriggerCard
                label="VIX Spike Threshold"
                current={riskManager.getConfig().vixThreshold != null ? `${riskManager.getConfig().vixThreshold}` : 'Off'}
              />
            </div>
          </div>
        )}
      </div>

      {/* ── Advanced Risk: Portfolio Risk Metrics ──────────── */}
      <div className="glass-card overflow-hidden">
        <div className="px-4 py-3 border-b border-card-border">
          <div className="flex items-center gap-2">
            <Calculator className="w-4 h-4 text-accent" />
            <h2 className="text-sm font-semibold text-zinc-200">
              Portfolio Risk Metrics
            </h2>
          </div>
        </div>

        {riskMetrics ? (
          <div className="p-4 space-y-4">
            {/* VaR Section */}
            <div>
              <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-2">
                <Percent className="w-3 h-3 inline mr-1" />
                Value at Risk (VaR)
              </p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <RiskRuleCard
                  label="Daily VaR (95%)"
                  value={`$${riskMetrics.varDaily.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
                  icon={<TrendingDown className="w-3.5 h-3.5 text-red-400" />}
                />
                <RiskRuleCard
                  label="Confidence Level"
                  value={`${(riskMetrics.varConfidence * 100).toFixed(0)}%`}
                  icon={<Percent className="w-3.5 h-3.5 text-amber-400" />}
                />
                <RiskRuleCard
                  label="Weekly VaR (95%)"
                  value={`$${riskMetrics.varWeekly.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
                  icon={<TrendingDown className="w-3.5 h-3.5 text-red-400" />}
                />
              </div>
            </div>

            {/* Drawdown Section */}
            <div>
              <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-2">
                <GitBranch className="w-3 h-3 inline mr-1" />
                Portfolio Drawdown
              </p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <RiskRuleCard
                  label="Max Drawdown"
                  value={riskMetrics.maxDrawdown.toFixed(2) + '%'}
                  icon={<TrendingDown className="w-3.5 h-3.5 text-red-400" />}
                />
                <RiskRuleCard
                  label="Current Drawdown"
                  value={riskMetrics.currentDrawdown.toFixed(2) + '%'}
                  icon={<TrendingDown className="w-3.5 h-3.5 text-red-400" />}
                />
                <RiskRuleCard
                  label="Max Drawdown $"
                  value={`$${Math.abs(riskMetrics.maxDrawdownDollar).toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
                  icon={<AlertTriangle className="w-3.5 h-3.5 text-amber-400" />}
                />
                <RiskRuleCard
                  label="Drawdown Limit"
                  value={`${(riskManager.getConfig().portfolioMaxDrawdown * 100).toFixed(0)}%`}
                  icon={<Shield className="w-3.5 h-3.5 text-blue-400" />}
                />
              </div>
            </div>

            {/* Kelly Criterion Section */}
            <div>
              <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-2">
                <Calculator className="w-3 h-3 inline mr-1" />
                Kelly Criterion Position Sizing
              </p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <RiskRuleCard
                  label="Recommended Bet Size"
                  value={`${riskMetrics.kellyFraction.toFixed(2)}%`}
                  icon={<Percent className="w-3.5 h-3.5 text-emerald-400" />}
                />
                <RiskRuleCard
                  label="Strategy"
                  value={riskManager.getConfig().useKellyCriterion
                    ? (riskManager.getConfig().kellyFraction === 0.5 ? 'Half-Kelly' : `Kelly x${riskManager.getConfig().kellyFraction}`)
                    : 'Disabled'}
                  icon={<GitBranch className="w-3.5 h-3.5 text-blue-400" />}
                />
                <RiskRuleCard
                  label="Max Position Size"
                  value={`${(riskManager.getConfig().maxPositionSize * 100).toFixed(0)}%`}
                  icon={<TrendingUp className="w-3.5 h-3.5 text-amber-400" />}
                />
              </div>
            </div>

            {/* Correlation Section */}
            <div>
              <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-2">
                <Layers className="w-3 h-3 inline mr-1" />
                Correlation Overview
              </p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <RiskRuleCard
                  label="Correlated Pairs"
                  value={String(riskMetrics.correlatedPairs)}
                  icon={<Layers className="w-3.5 h-3.5 text-purple-400" />}
                />
                <RiskRuleCard
                  label="Positions Tracked"
                  value={String(riskMetrics.concentration.length)}
                  icon={<Activity className="w-3.5 h-3.5 text-blue-400" />}
                />
                <RiskRuleCard
                  label="Correlation Threshold"
                  value={riskManager.getConfig().maxCorrelation.toFixed(2)}
                  icon={<GitBranch className="w-3.5 h-3.5 text-zinc-400" />}
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="p-8 text-center text-zinc-500 text-sm">
            {alpaca.isConnected
              ? 'Loading risk metrics…'
              : 'Connect Alpaca to see portfolio risk metrics.'}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Helper components ─────────────────────────────────────────────────

function StatusCard({
  label,
  value,
  icon,
  valueColor = 'text-zinc-200',
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  valueColor?: string;
}) {
  return (
    <div className="glass-card p-3 flex items-center gap-3">
      <div className="shrink-0">{icon}</div>
      <div className="min-w-0">
        <p className="text-[11px] text-zinc-500 uppercase tracking-wide">
          {label}
        </p>
        <p className={cn('text-sm font-semibold truncate', valueColor)}>
          {value}
        </p>
      </div>
    </div>
  );
}

function RiskRuleCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="bg-card/50 border border-card-border rounded-lg p-3 flex items-center gap-3">
      <div className="shrink-0">{icon}</div>
      <div className="min-w-0">
        <p className="text-[11px] text-zinc-500">{label}</p>
        <p className="text-sm font-semibold text-zinc-200">{value}</p>
      </div>
    </div>
  );
}

function BreakerTriggerCard({
  label,
  current,
}: {
  label: string;
  current: string;
}) {
  return (
    <div className="bg-card/30 border border-card-border rounded-lg p-3">
      <p className="text-[11px] text-zinc-500">{label}</p>
      <p className="text-sm font-semibold text-zinc-200 mt-0.5">{current}</p>
    </div>
  );
}