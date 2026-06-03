'use client';

// ─── Live Strategy Trading Page ────────────────────────────────────────
//
//  Enables real-time paper trading using the LiveStrategyEngine.
//  Users can start/stop/pause the engine, view live signals,
//  open positions, and closed trades.
//
//  Auto mode: signals auto-execute via portfolio-store (saves to DB,
//  deducts cash, creates positions).
//  Manual mode: signals are logged; user approves each trade individually.
//


import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { fetchStrategy } from '@/lib/services/data-service';
import { LiveStrategyEngine } from '@/lib/services/live-strategy-engine';
import { usePortfolioStore } from '@/stores/portfolio-store';
import { useAlpacaExecutor } from '@/lib/hooks/use-alpaca-executor';
import {
  showSuccess,
  showError,
  showWarning,
  showInfo,
} from '@/stores/notification-store';
import type { Strategy, LiveSignal, LiveStrategyState } from '@/types';
import type { PaperPosition } from '@/lib/services/live-strategy-engine';
import type { SimulatedTrade } from '@/lib/services/strategy-engine';

type TradingMode = 'auto' | 'manual';

export default function LiveStrategyPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [strategy, setStrategy] = useState<Strategy | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Portfolio store (for auto-execute)
  const {
    portfolio,
    positions: portfolioPositions,
    initialize: initPortfolio,
    executeTrade,
  } = usePortfolioStore();
  // Track if portfolio has been initialized
  const [portfolioReady, setPortfolioReady] = useState(false);

  // Alpaca executor (routes trades to Alpaca + Supabase)
  const {
    isConnected: alpacaConnected,
    isExecuting: alpacaExecuting,
    isSyncing: alpacaSyncing,
    account: alpacaAccount,
    executeSignal: alpacaExecuteSignal,
    executeTrade: alpacaExecuteTrade,
    syncWithAlpaca,
    checkConnection: checkAlpacaConnection,
  } = useAlpacaExecutor();

  const engineRef = useRef<LiveStrategyEngine | null>(null);
  const [engineState, setEngineState] = useState<LiveStrategyState | null>(null);
  const [signals, setSignals] = useState<LiveSignal[]>([]);
  const [openPositions, setOpenPositions] = useState<PaperPosition[]>([]);
  const [closedTrades, setClosedTrades] = useState<SimulatedTrade[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [tradingMode, setTradingMode] = useState<TradingMode>('auto');
  const [executingSignalId, setExecutingSignalId] = useState<string | null>(null);

  const addLog = useCallback((msg: string) => {
    setLogs((prev) => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev.slice(0, 99)]);
  }, []);

  // ── Initialize portfolio store for paper trading ──────
  useEffect(() => {
    const userId = 'demo-user'; // TODO: replace with real auth user ID
    initPortfolio(userId, 'paper').then(() => setPortfolioReady(true));
  }, [initPortfolio]);

  // ── Check Alpaca connection on mount ─────────────────
  useEffect(() => {
    checkAlpacaConnection();
  }, [checkAlpacaConnection]);

  // Load strategy
  useEffect(() => {
    if (!id) return;
    fetchStrategy(id)
      .then((s) => {
        if (!s) {
          setError('Strategy not found');
        } else {
          setStrategy(s);
        }
      })
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  }, [id]);

  // ── Build the onAutoExecute callback (uses Alpaca + Supabase) ──
  const autoExecute = useCallback(
    async (signal: LiveSignal): Promise<string | null> => {
      if (!portfolioReady || !portfolio) {
        addLog('⚠️ Portfolio not ready — cannot auto-execute');
        return null;
      }
      try {
        // Execute through Alpaca (which also syncs to Supabase)
        const result = await alpacaExecuteSignal(signal);
        if (result.tradeId) {
          addLog(`✅ Auto-executed ${signal.type.toUpperCase()} ${signal.symbol} x${signal.quantity} @ $${signal.price.toFixed(2)}${result.alpacaOrderId ? ` [Alpaca #${result.alpacaOrderId}]` : ' [Local]'}`);
          return result.tradeId;
        }
        addLog(`⚠️ Auto-execute returned no trade ID for ${signal.symbol}`);
        return null;
      } catch (err) {
        addLog(`❌ Auto-execute failed: ${err}`);
        return null;
      }
    },
    [portfolioReady, portfolio, alpacaExecuteSignal, addLog],
  );

  // Wire up engine events when strategy is ready
  useEffect(() => {
    if (!strategy) return;

    const engine = new LiveStrategyEngine(strategy, {
      tickIntervalMs: 60_000, // 1 minute per tick
      capital: portfolio?.cash_balance ?? 100_000,
      onAutoExecute: tradingMode === 'auto' ? autoExecute : undefined,
    });
    engineRef.current = engine;

    engine.on('stateChange', (data) => {
      const state = data as LiveStrategyState;
      setEngineState({ ...state });
      addLog(`State: ${state.status}${state.error ? ` (${state.error})` : ''}`);

      if (state.status === 'running') {
        showInfo('Engine Started', `Watching ${state.symbolsWatching?.length ?? 0} symbols`);
      } else if (state.status === 'paused') {
        showWarning('Engine Paused', 'Live trading is paused');
      } else if (state.status === 'error') {
        showError('Engine Error', state.error ?? 'Unknown error');
      } else if (state.status === 'idle') {
        showInfo('Engine Stopped', 'Live trading has stopped');
      }
    });

    engine.on('signal', (data) => {
      const signal = data as LiveSignal;
      setSignals((prev) => [signal, ...prev]);
      addLog(
        `📡 SIGNAL: ${signal.type.toUpperCase()} ${signal.symbol} @ $${signal.price.toFixed(2)} x${signal.quantity} [${Math.round(signal.confidence * 100)}%] — ${signal.reason} ${signal.executed ? '✅' : '⏳'}`,
      );

      // ── Toast Notifications ──────────────────────────
      if (signal.status === 'rejected') {
        showWarning(
          `Signal Rejected: ${signal.symbol}`,
          signal.rejectedReason ?? 'Risk check failed',
        );
      } else if (signal.status === 'executed' && signal.executed) {
        showSuccess(
          `${signal.type.toUpperCase()} ${signal.symbol}`,
          `${signal.quantity} shares @ $${signal.price.toFixed(2)} — ${signal.reason}`,
        );
      } else if (signal.type === 'sell') {
        showWarning(
          `SELL Signal: ${signal.symbol}`,
          `${signal.quantity} shares @ $${signal.price.toFixed(2)} — ${signal.reason}`,
        );
      } else if (!signal.executed && tradingMode === 'manual') {
        showInfo(
          `BUY Signal: ${signal.symbol}`,
          `${signal.quantity} shares @ $${signal.price.toFixed(2)} — Awaiting approval`,
        );
      }
    });

    engine.on('tick', (data: unknown) => {
      const d = data as { timestamp: string };
      addLog(`✓ Tick completed at ${d.timestamp}`);
      // Refresh open positions & closed trades
      if (engineRef.current) {
        setOpenPositions(engineRef.current.getOpenPositions());
        setClosedTrades(engineRef.current.getClosedTrades());
      }
    });

    engine.on('error', (data: unknown) => {
      const d = data as { error: string };
      addLog(`❌ Error: ${d.error}`);
      showError('Engine Error', d.error);
    });

    engine.on('positionClosed', (data: unknown) => {
      const d = data as { symbol: string; reason: string; trade: SimulatedTrade };
      const pnl = d.trade.pnl ?? 0;
      const pnlPct = d.trade.pnlPercent ?? 0;
      addLog(
        `🔒 CLOSED: ${d.symbol} @ $${d.trade.exitPrice?.toFixed(2)} | PnL: $${pnl.toFixed(2)} (${pnlPct.toFixed(2)}%) — ${d.reason}`,
      );

      if (pnl > 0) {
        showSuccess(
          `Position Closed: ${d.symbol}`,
          `Profit $${pnl.toFixed(2)} (${pnlPct.toFixed(2)}%) — ${d.reason}`,
        );
      } else {
        showWarning(
          `Position Closed: ${d.symbol}`,
          `Loss $${pnl.toFixed(2)} (${pnlPct.toFixed(2)}%) — ${d.reason}`,
        );
      }

      if (engineRef.current) {
        setOpenPositions(engineRef.current.getOpenPositions());
        setClosedTrades(engineRef.current.getClosedTrades());
      }
    });

    return () => {
      engine.stop();
    };
  }, [strategy, addLog, tradingMode, autoExecute, portfolio]);

  // ── Controls ──────────────────────────────────────────

  const handleStart = () => {
    if (!engineRef.current) return;
    engineRef.current.start();
    addLog('▶️ Engine started');
  };

  const handlePause = () => {
    if (!engineRef.current) return;
    engineRef.current.pause();
    addLog('⏸️ Engine paused');
  };

  const handleResume = () => {
    if (!engineRef.current) return;
    engineRef.current.resume();
    addLog('▶️ Engine resumed');
  };

  const handleStop = () => {
    if (!engineRef.current) return;
    engineRef.current.stop();
    addLog('⏹️ Engine stopped');
  };

  const handleReset = () => {
    if (!engineRef.current) return;
    engineRef.current.reset();
    setSignals([]);
    setOpenPositions([]);
    setClosedTrades([]);
    setEngineState(engineRef.current.state);
    addLog('🔄 Engine reset');
  };

  const handleToggleMode = () => {
    const wasRunning = engineRef.current?.state.status === 'running';
    engineRef.current?.stop();
    const newMode: TradingMode = tradingMode === 'auto' ? 'manual' : 'auto';
    setTradingMode(newMode);
    addLog(`🔀 Mode switched to ${newMode.toUpperCase()}`);
    // Engine will be rebuilt by the useEffect reacting to tradingMode change
    // Auto-start if it was running
    if (wasRunning) {
      setTimeout(() => {
        engineRef.current?.start();
      }, 100);
    }
  };

  const handleManualExecute = async (signal: LiveSignal) => {
    if (executingSignalId || alpacaExecuting) return;
    setExecutingSignalId(signal.id);
    try {
      // Execute through Alpaca (which also syncs to Supabase)
      const result = await alpacaExecuteSignal(signal);
      if (result.tradeId) {
        signal.executed = true;
        signal.tradeId = result.tradeId;
        setSignals((prev) => prev.map((s) => (s.id === signal.id ? { ...signal } : s)));
        addLog(`✅ Manually executed ${signal.type.toUpperCase()} ${signal.symbol} x${signal.quantity} @ $${signal.price.toFixed(2)}${result.alpacaOrderId ? ` [Alpaca #${result.alpacaOrderId}]` : ' [Local]'}`);
      } else {
        addLog(`⚠️ Manual execute returned no trade ID for ${signal.symbol}`);
      }
    } catch (err) {
      addLog(`❌ Manual execute failed: ${err}`);
    } finally {
      setExecutingSignalId(null);
    }
  };

  const handleAlpacaSync = async () => {
    const ok = await syncWithAlpaca();
    addLog(ok ? '🔄 Synced with Alpaca' : '❌ Alpaca sync failed');
  };

  const handleAcknowledgeSignal = (signalId: string) => {
    setSignals((prev) => prev.map((s) => (s.id === signalId ? { ...s, acknowledged: true } : s)));
    addLog(`👁 Acknowledged signal ${signalId}`);
  };

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen"><p>Loading strategy...</p></div>;
  }
  if (error || !strategy) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <p className="text-red-500">{error ?? 'Strategy not found'}</p>
        <button onClick={() => router.push('/strategies')} className="text-sm text-blue-400 hover:underline">← Back to Strategies</button>
      </div>
    );
  }

  const isRunning = engineState?.status === 'running';
  const isPaused = engineState?.status === 'paused';
  const totalPnl = closedTrades.reduce((sum, t) => sum + (t.pnl ?? 0), 0);
  const winCount = closedTrades.filter((t) => (t.pnl ?? 0) > 0).length;
  const totalClosed = closedTrades.length;
  const pendingSignals = signals.filter((s) => !s.executed && s.type === 'buy');

  // ── Render ────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <button
            onClick={() => router.push(`/strategies/${id}`)}
            className="text-sm text-gray-400 hover:text-white mb-2 inline-block"
          >
            ← Back to Strategy
          </button>
          <h1 className="text-2xl font-bold">{strategy.name} — Live Trading</h1>
          <p className="text-sm text-gray-400">{strategy.description ?? strategy.config.type}</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Mode Toggle */}
          <button
            onClick={handleToggleMode}
            className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-colors ${
              tradingMode === 'auto'
                ? 'bg-blue-600/20 border-blue-500 text-blue-300'
                : 'bg-yellow-600/20 border-yellow-500 text-yellow-300'
            }`}
          >
            🤖 {tradingMode === 'auto' ? 'Auto Execute' : 'Manual Approval'}
          </button>
          {/* Status Badge */}
          <span
            className={`px-3 py-1 rounded-full text-sm font-semibold ${
              isRunning
                ? 'bg-green-600 text-white animate-pulse'
                : isPaused
                  ? 'bg-yellow-600 text-white'
                  : 'bg-gray-700 text-gray-300'
            }`}
          >
            {engineState?.status?.toUpperCase() ?? 'IDLE'}
          </span>
        </div>
      </div>

      {/* Alpaca Connection Status */}
      <div className="bg-gray-900 rounded-lg p-3 mb-4 flex items-center gap-3 text-sm">
        <div className={`w-2 h-2 rounded-full ${alpacaConnected ? 'bg-green-400' : 'bg-red-400'}`} />
        <span className="text-gray-300">
          Alpaca: {alpacaConnected ? 'Connected' : 'Disconnected'}
        </span>
        {alpacaAccount && (
          <>
            <span className="text-gray-500">|</span>
            <span className="text-gray-400">
              Cash: <span className="text-green-400">${parseFloat(alpacaAccount.cash).toFixed(2)}</span>
            </span>
            <span className="text-gray-400">
              Equity: <span className="text-white">${parseFloat(alpacaAccount.equity).toFixed(2)}</span>
            </span>
            <span className="text-gray-400">
              BP: <span className="text-white">${parseFloat(alpacaAccount.buying_power).toFixed(2)}</span>
            </span>
          </>
        )}
        <button
          onClick={handleAlpacaSync}
          disabled={alpacaSyncing}
          className="ml-auto px-3 py-1 bg-blue-600/30 hover:bg-blue-600/50 disabled:opacity-50 rounded text-xs font-semibold text-blue-300 transition-colors"
        >
          {alpacaSyncing ? 'Syncing...' : '🔄 Sync Now'}
        </button>
      </div>

      {/* Portfolio Info Bar */}
      {portfolio && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <div className="bg-gray-900 rounded-lg p-3">
            <p className="text-xs text-gray-400">Portfolio Cash</p>
            <p className="text-lg font-bold text-green-400">${portfolio.cash_balance.toFixed(2)}</p>
          </div>
          <div className="bg-gray-900 rounded-lg p-3">
            <p className="text-xs text-gray-400">Total Value</p>
            <p className="text-lg font-bold">${portfolio.total_value.toFixed(2)}</p>
          </div>
          <div className="bg-gray-900 rounded-lg p-3">
            <p className="text-xs text-gray-400">Total P&L</p>
            <p className={`text-lg font-bold ${(portfolio.total_pnl ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              ${(portfolio.total_pnl ?? 0).toFixed(2)}
            </p>
          </div>
          <div className="bg-gray-900 rounded-lg p-3">
            <p className="text-xs text-gray-400">Portfolio Positions</p>
            <p className="text-lg font-bold">{portfolioPositions.length}</p>
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-wrap gap-3 mb-6">
        {!isRunning && !isPaused && (
          <button onClick={handleStart} className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg font-semibold">
            ▶ Start
          </button>
        )}
        {isRunning && (
          <button onClick={handlePause} className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 rounded-lg font-semibold">
            ⏸ Pause
          </button>
        )}
        {isPaused && (
          <button onClick={handleResume} className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg font-semibold">
            ▶ Resume
          </button>
        )}
        {(isRunning || isPaused) && (
          <button onClick={handleStop} className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg font-semibold">
            ⏹ Stop
          </button>
        )}
        <button onClick={handleReset} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg font-semibold">
          🔄 Reset
        </button>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <div className="bg-gray-900 rounded-lg p-3">
          <p className="text-xs text-gray-400">Signals Today</p>
          <p className="text-xl font-bold">{engineState?.signalsToday ?? 0}</p>
        </div>
        <div className="bg-gray-900 rounded-lg p-3">
          <p className="text-xs text-gray-400">Open Positions</p>
          <p className="text-xl font-bold">{engineState?.openPositions ?? 0}</p>
        </div>
        <div className="bg-gray-900 rounded-lg p-3">
          <p className="text-xs text-gray-400">Pending Approval</p>
          <p className={`text-xl font-bold ${pendingSignals.length > 0 ? 'text-yellow-400' : ''}`}>
            {pendingSignals.length}
          </p>
        </div>
        <div className="bg-gray-900 rounded-lg p-3">
          <p className="text-xs text-gray-400">Win Rate</p>
          <p className="text-xl font-bold">{totalClosed > 0 ? Math.round((winCount / totalClosed) * 100) : 0}%</p>
        </div>
        <div className="bg-gray-900 rounded-lg p-3">
          <p className="text-xs text-gray-400">Session P&L</p>
          <p className={`text-xl font-bold ${totalPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            ${totalPnl.toFixed(2)}
          </p>
        </div>
      </div>

      {/* Last Signal */}
      {engineState?.lastSignal && (
        <div className="bg-gray-900 rounded-lg p-4 mb-6 border-l-4 border-blue-500">
          <p className="text-xs text-gray-400 uppercase">Last Signal</p>
          <div className="flex items-center gap-3 mt-1">
            <span
              className={`px-2 py-0.5 rounded text-xs font-bold ${
                engineState.lastSignal.type === 'buy' ? 'bg-green-700' : 'bg-red-700'
              }`}
            >
              {engineState.lastSignal.type.toUpperCase()}
            </span>
            <span className="font-bold text-lg">{engineState.lastSignal.symbol}</span>
            <span className="text-gray-300">@ ${engineState.lastSignal.price.toFixed(2)}</span>
            <span className="text-gray-500">x{engineState.lastSignal.quantity}</span>
            <span className="text-xs bg-gray-800 px-2 py-0.5 rounded">
              {Math.round(engineState.lastSignal.confidence * 100)}% confidence
            </span>
            {engineState.lastSignal.executed && (
              <span className="text-xs bg-green-800 px-2 py-0.5 rounded">Executed ✅</span>
            )}
          </div>
          <p className="text-sm text-gray-400 mt-1">{engineState.lastSignal.reason}</p>
        </div>
      )}

      {/* Pending Signals for Approval (Manual mode) */}
      {tradingMode === 'manual' && pendingSignals.length > 0 && (
        <div className="bg-yellow-900/30 rounded-lg p-4 mb-6 border border-yellow-700">
          <h3 className="text-sm font-semibold text-yellow-300 mb-3">
            ⏳ Pending Approval ({pendingSignals.length})
          </h3>
          <div className="flex flex-wrap gap-2">
            {pendingSignals.map((signal) => (
              <div
                key={signal.id}
                className="flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-2 text-sm"
              >
                <span className="text-green-400 font-bold">BUY {signal.symbol}</span>
                <span className="text-gray-300">x{signal.quantity} @ ${signal.price.toFixed(2)}</span>
                <span className="text-xs text-gray-500">[{Math.round(signal.confidence * 100)}%]</span>
                <button
                  onClick={() => handleManualExecute(signal)}
                  disabled={executingSignalId === signal.id}
                  className="ml-2 px-2 py-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded text-xs font-semibold"
                >
                  {executingSignalId === signal.id ? '...' : 'Execute'}
                </button>
                <button
                  onClick={() => handleAcknowledgeSignal(signal.id)}
                  className="px-2 py-1 bg-gray-600 hover:bg-gray-500 rounded text-xs"
                >
                  Dismiss
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Open Positions */}
        <div>
          <h2 className="text-lg font-semibold mb-3">Open Positions ({openPositions.length})</h2>
          <div className="bg-gray-900 rounded-lg overflow-hidden">
            {openPositions.length === 0 ? (
              <p className="p-4 text-sm text-gray-500">No open positions</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-400 border-b border-gray-800">
                    <th className="text-left p-2">Symbol</th>
                    <th className="text-right p-2">Entry</th>
                    <th className="text-right p-2">Qty</th>
                    <th className="text-right p-2">SL</th>
                    <th className="text-right p-2">TP</th>
                  </tr>
                </thead>
                <tbody>
                  {openPositions.map((pos, i) => (
                    <tr key={i} className="border-b border-gray-800/50">
                      <td className="p-2 font-semibold">{pos.symbol}</td>
                      <td className="p-2 text-right">${pos.entryPrice.toFixed(2)}</td>
                      <td className="p-2 text-right">{pos.quantity}</td>
                      <td className="p-2 text-right text-red-400">${pos.stopLossPrice.toFixed(2)}</td>
                      <td className="p-2 text-right text-green-400">${pos.takeProfitPrice.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Closed Trades */}
        <div>
          <h2 className="text-lg font-semibold mb-3">Closed Trades ({closedTrades.length})</h2>
          <div className="bg-gray-900 rounded-lg overflow-hidden max-h-64 overflow-y-auto">
            {closedTrades.length === 0 ? (
              <p className="p-4 text-sm text-gray-500">No closed trades yet</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-400 border-b border-gray-800">
                    <th className="text-left p-2">Entry</th>
                    <th className="text-right p-2">Exit</th>
                    <th className="text-right p-2">PnL</th>
                    <th className="text-left p-2">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {closedTrades.map((t, i) => (
                    <tr key={i} className="border-b border-gray-800/50">
                      <td className="p-2">${t.entryPrice.toFixed(2)}</td>
                      <td className="p-2 text-right">${(t.exitPrice ?? 0).toFixed(2)}</td>
                      <td className={`p-2 text-right ${(t.pnl ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        ${(t.pnl ?? 0).toFixed(2)} ({(t.pnlPercent ?? 0).toFixed(2)}%)
                      </td>
                      <td className="p-2 text-xs text-gray-400 max-w-[150px] truncate">{t.exitReason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Signal Log */}
      <div className="mt-6">
        <h2 className="text-lg font-semibold mb-3">Signal Log</h2>
        <div className="bg-gray-900 rounded-lg p-4 max-h-64 overflow-y-auto font-mono text-xs">
          {signals.length === 0 && logs.length === 0 ? (
            <p className="text-gray-500">No signals yet. Start the engine to begin.</p>
          ) : (
            signals.slice(0, 20).map((s) => (
              <div key={s.id} className="flex items-center gap-2 py-1 border-b border-gray-800/50">
                <span className={s.type === 'buy' ? 'text-green-400' : 'text-red-400'}>
                  {s.type.toUpperCase()}
                </span>
                <span className="font-bold">{s.symbol}</span>
                <span>@ ${s.price.toFixed(2)}</span>
                <span className="text-gray-500">x{s.quantity}</span>
                <span className="text-gray-600">[{Math.round(s.confidence * 100)}%]</span>
                {s.executed ? (
                  <span className="text-green-500">✓</span>
                ) : (
                  <span className="text-yellow-500">⏳</span>
                )}
            {tradingMode === 'manual' && !s.executed && s.type === 'buy' && (
                  <button
                    onClick={() => handleManualExecute(s)}
                    disabled={executingSignalId === s.id || alpacaExecuting}
                    className="ml-2 px-1.5 py-0.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded text-[10px] font-semibold"
                  >
                    {executingSignalId === s.id || alpacaExecuting ? '...' : 'EXEC'}
                  </button>
                )}
                <span className="text-gray-500 ml-auto">{new Date(s.timestamp).toLocaleTimeString()}</span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Activity Log */}
      <div className="mt-6">
        <h2 className="text-lg font-semibold mb-3">Activity Log</h2>
        <div className="bg-gray-900 rounded-lg p-4 max-h-48 overflow-y-auto font-mono text-xs">
          {logs.length === 0 ? (
            <p className="text-gray-500">Waiting for activity...</p>
          ) : (
            logs.map((entry, i) => (
              <div key={i} className="py-0.5 text-gray-400">
                {entry}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="mt-6 text-xs text-gray-500">
        Mode: {tradingMode === 'auto' ? '🤖 Auto Execute' : '👆 Manual Approval'}
        {' · '}Watching: {engineState?.symbolsWatching?.join(', ') ?? strategy.config.symbols.join(', ')}
        {' · '}Interval: {engineState ? Math.round(engineState.tickIntervalMs / 1000) : Math.round(60)}s
        {engineState?.nextTickAt && (
          <>
            {' · '}Next tick: {new Date(engineState.nextTickAt).toLocaleTimeString()}
          </>
        )}
      </div>
    </div>
  );
}