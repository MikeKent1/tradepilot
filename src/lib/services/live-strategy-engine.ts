// ─── Live Strategy Engine ───────────────────────────────────────────────
//
//  Runs a StrategyConfig in real-time against live market data from
//  Alpha Vantage. Evaluates entry/exit rules and generates buy/sell
//  signals for paper trading.
//
//  Usage:
//    const engine = new LiveStrategyEngine(strategy);
//    engine.on('signal', (signal) => { ... });
//    engine.start();
//

import type {
  StrategyConfig,
  Strategy,
  EntryRule,
  ExitRule,
  LiveSignal,
  LiveStrategyState,
  SignalType,
  SignalStatus,
  CandlestickData,
  IndicatorCrossParams,
  PriceLevelParams,
  StopLossParams,
  IndicatorType,
} from '@/types';
import { fetchQuoteWithRetry, type LiveQuote, type AlphaVantageError } from './alpha-vantage';
import type { SimulatedTrade, BacktestMetrics } from './strategy-engine';
import { RiskManager, type RiskTradeRequest } from './risk-manager';

// ════════════════════════════════════════════════════════════════════════
// Public Types
// ════════════════════════════════════════════════════════════════════════

export interface PortfolioSnapshot {
  capital: number;
  positions: Array<{
    symbol: string;
    quantity: number;
    avg_price: number;
    market_value: number;
    unrealized_pnl: number;
  }>;
  dailyPnl: number;
  tradesToday: number;
}

export interface LiveEngineOptions {
  /** Polling interval in milliseconds between tick evaluations */
  tickIntervalMs?: number;
  /** Maximum number of concurrent open positions */
  maxPositions?: number;
  /** Capital available for trading (for position sizing) */
  capital?: number;
  /** Risk per trade as percentage */
  riskPerTrade?: number;
  /** Minimum bars of historical data needed before first signal */
  minHistoryBars?: number;
  /**
   * RiskManager instance for pre-trade validation.
   * When provided, every BUY signal is validated through risk rules
   * before auto-execution. Rejected signals are marked with
   * status='rejected' and include the rejection reason.
   */
  riskManager?: RiskManager;
  /**
   * Callback that returns current portfolio snapshot for risk checks.
   * Required when `riskManager` is provided.
   */
  getPortfolioSnapshot?: () => PortfolioSnapshot;
  /**
   * If provided, called when a BUY signal passes risk validation. The
   * callback is responsible for executing the trade, updating portfolio
   * balance & positions, saving the signal to the database, etc.
   *
   * When NOT provided, the engine auto-opens internal paper positions
   * (legacy behaviour).
   *
   * Return the trade ID (or `null` on failure). The engine will mark the
   * signal as executed accordingly.
   */
  onAutoExecute?: (signal: LiveSignal) => Promise<string | null>;
  /**
   * Custom quote provider for fetching latest price data for a symbol.
   *
   * When provided, the engine calls this instead of `fetchQuoteWithRetry()`
   * (Alpha Vantage). This enables the engine to receive prices from any
   * source — e.g. a Finnhub WebSocket stream, a in-memory cache, etc.
   *
   * Must return an object with at least `price`, `volume`, and a
   * `fetchedAt` ISO timestamp. If the symbol is unavailable, return
   * `null` and the engine will skip that symbol for this tick.
   *
   * Example (Finnhub WebSocket):
   *   quoteProvider: (symbol) => {
   *     const q = finnhubWS.getQuote(symbol);
   *     return q ? { price: q.price, volume: q.volume, fetchedAt: q.fetchedAt } : null;
   *   }
   */
  quoteProvider?: (symbol: string) => {
    price: number;
    volume: number;
    fetchedAt: string;
    open?: number;
    high?: number;
    low?: number;
    previousClose?: number;
    change?: number;
    changePercent?: number;
    latestTradingDay?: string;
  } | null;
}

export interface PaperPosition {
  symbol: string;
  entryPrice: number;
  entryDate: string;
  quantity: number;
  highestPrice: number;
  lowestPrice: number;
  stopLossPrice: number;
  takeProfitPrice: number;
}

type EngineEvent = 'signal' | 'tick' | 'error' | 'stateChange' | 'positionClosed';
type EventCallback = (data: unknown) => void;

// ─── Technical Indicators (inlined for self-contained use) ──────────

function sma(values: number[], period: number): (number | null)[] {
  const result: (number | null)[] = new Array(values.length).fill(null);
  if (period <= 0 || values.length < period) return result;
  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i];
  result[period - 1] = sum / period;
  for (let i = period; i < values.length; i++) {
    sum += values[i] - values[i - period];
    result[i] = sum / period;
  }
  return result;
}

function ema(values: number[], period: number): (number | null)[] {
  const result: (number | null)[] = new Array(values.length).fill(null);
  if (period <= 0 || values.length < period) return result;
  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i];
  result[period - 1] = sum / period;
  const multiplier = 2 / (period + 1);
  for (let i = period; i < values.length; i++) {
    const prev = result[i - 1]!;
    result[i] = (values[i] - prev) * multiplier + prev;
  }
  return result;
}

function rsi(values: number[], period: number = 14): (number | null)[] {
  const result: (number | null)[] = new Array(values.length).fill(null);
  if (values.length < period + 1) return result;

  const gains: number[] = [];
  const losses: number[] = [];
  for (let i = 1; i < values.length; i++) {
    const delta = values[i] - values[i - 1];
    gains.push(delta > 0 ? delta : 0);
    losses.push(delta < 0 ? -delta : 0);
  }

  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 0; i < period; i++) {
    avgGain += gains[i];
    avgLoss += losses[i];
  }
  avgGain /= period;
  avgLoss /= period;

  const rsiIndex = period;
  if (avgLoss === 0) {
    result[rsiIndex] = 100;
  } else {
    const rs = avgGain / avgLoss;
    result[rsiIndex] = 100 - 100 / (1 + rs);
  }

  for (let i = period; i < gains.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
    if (avgLoss === 0) {
      result[i + 1] = 100;
    } else {
      const rs = avgGain / avgLoss;
      result[i + 1] = 100 - 100 / (1 + rs);
    }
  }
  return result;
}

function macd(
  values: number[],
  fastPeriod = 12,
  slowPeriod = 26,
  signalPeriod = 9,
): {
  macdLine: (number | null)[];
  signalLine: (number | null)[];
  histogram: (number | null)[];
} {
  const fastEma = ema(values, fastPeriod);
  const slowEma = ema(values, slowPeriod);
  const macdLine: (number | null)[] = new Array(values.length).fill(null);
  for (let i = 0; i < values.length; i++) {
    if (fastEma[i] != null && slowEma[i] != null) {
      macdLine[i] = fastEma[i]! - slowEma[i]!;
    }
  }
  const signalLine = ema(
    macdLine.map((v) => v ?? 0),
    signalPeriod,
  );
  const histogram: (number | null)[] = new Array(values.length).fill(null);
  for (let i = 0; i < values.length; i++) {
    if (macdLine[i] != null && signalLine[i] != null) {
      histogram[i] = macdLine[i]! - signalLine[i]!;
    }
  }
  return { macdLine, signalLine, histogram };
}

function bollinger(
  values: number[],
  period = 20,
  stdDevMultiplier = 2,
): {
  middle: (number | null)[];
  upper: (number | null)[];
  lower: (number | null)[];
} {
  const middle = sma(values, period);
  const upper: (number | null)[] = new Array(values.length).fill(null);
  const lower: (number | null)[] = new Array(values.length).fill(null);
  for (let i = period - 1; i < values.length; i++) {
    const slice = values.slice(i - period + 1, i + 1);
    const mean = middle[i]!;
    const variance = slice.reduce((sum, v) => sum + (v - mean) ** 2, 0) / period;
    const stdDev = Math.sqrt(variance);
    upper[i] = mean + stdDevMultiplier * stdDev;
    lower[i] = mean - stdDevMultiplier * stdDev;
  }
  return { middle, upper, lower };
}

// ════════════════════════════════════════════════════════════════════════
// Live Strategy Engine
// ════════════════════════════════════════════════════════════════════════

export class LiveStrategyEngine {
  // ── Public state ──────────────────────────────────────
  state: LiveStrategyState;
  config: StrategyConfig;
  strategyId: string;

  // ── Internal state ────────────────────────────────────
  private opts: Omit<Required<LiveEngineOptions>, 'onAutoExecute' | 'riskManager' | 'getPortfolioSnapshot' | 'quoteProvider'>;
  private onAutoExecute: LiveEngineOptions['onAutoExecute'];
  private riskManager: RiskManager | null;
  private getPortfolioSnapshot: (() => PortfolioSnapshot) | null;
  private quoteProvider: LiveEngineOptions['quoteProvider'];
  private symbolHistory: Map<string, { price: number; volume: number; time: string }[]>;
  private openPositions: Map<string, PaperPosition[]>;
  private tickTimer: ReturnType<typeof setInterval> | null;
  private listeners: Map<EngineEvent, EventCallback[]>;
  private signalCount: number;
  private closedPositions: SimulatedTrade[];

  constructor(strategy: Strategy, options: LiveEngineOptions = {}) {
    this.strategyId = strategy.id;
    this.config = strategy.config;

    this.onAutoExecute = options.onAutoExecute;
    this.riskManager = options.riskManager ?? null;
    this.getPortfolioSnapshot = options.getPortfolioSnapshot ?? null;
    this.quoteProvider = options.quoteProvider;

    this.opts = {
      tickIntervalMs: options.tickIntervalMs ?? 60_000, // default: 1 minute
      maxPositions: options.maxPositions ?? strategy.config.maxPositions ?? 5,
      capital: options.capital ?? 100_000,
      riskPerTrade: options.riskPerTrade ?? strategy.config.riskPerTrade ?? 2,
      minHistoryBars: options.minHistoryBars ?? 26, // need at least 26 for MACD slow EMA
    };

    this.symbolHistory = new Map();
    this.openPositions = new Map();
    this.tickTimer = null;
    this.listeners = new Map();
    this.signalCount = 0;
    this.closedPositions = [];

    // Initialize history entries for each symbol
    for (const sym of this.config.symbols) {
      this.symbolHistory.set(sym, []);
      this.openPositions.set(sym, []);
    }

    this.state = {
      strategyId: strategy.id,
      status: 'idle',
      lastTickAt: null,
      nextTickAt: null,
      tickIntervalMs: this.opts.tickIntervalMs,
      error: null,
      openPositions: 0,
      signalsToday: 0,
      lastSignal: null,
      symbolsWatching: [...this.config.symbols],
    };
  }

  // ── Event system ──────────────────────────────────────

  on(event: EngineEvent, callback: EventCallback): () => void {
    const list = this.listeners.get(event) ?? [];
    list.push(callback);
    this.listeners.set(event, list);
    return () => this.off(event, callback);
  }

  off(event: EngineEvent, callback: EventCallback): void {
    const list = this.listeners.get(event) ?? [];
    this.listeners.set(
      event,
      list.filter((cb) => cb !== callback),
    );
  }

  private emit(event: EngineEvent, data: unknown): void {
    const list = this.listeners.get(event) ?? [];
    for (const cb of list) cb(data);
  }

  private setStatus(status: LiveStrategyState['status'], error?: string): void {
    const prev = this.state.status;
    this.state.status = status;
    this.state.error = error ?? null;
    if (prev !== status) {
      this.emit('stateChange', this.state);
    }
  }

  // ── Start / Stop / Pause ──────────────────────────────

  async start(): Promise<void> {
    if (this.state.status === 'running') return;

    this.setStatus('running');
    // Fetch initial quotes to warm up history
    await this.tick();

    this.tickTimer = setInterval(() => {
      this.tick();
    }, this.opts.tickIntervalMs);

    this.state.nextTickAt = new Date(Date.now() + this.opts.tickIntervalMs).toISOString();
    this.emit('stateChange', this.state);
  }

  stop(): void {
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
    this.setStatus('idle');
    this.state.nextTickAt = null;
    this.emit('stateChange', this.state);
  }

  pause(): void {
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
    this.setStatus('paused');
    this.state.nextTickAt = null;
    this.emit('stateChange', this.state);
  }

  resume(): void {
    if (this.state.status !== 'paused') return;
    this.start();
  }

  async tick(): Promise<void> {
    if (this.state.status !== 'running') return;

    this.state.lastTickAt = new Date().toISOString();
    this.state.nextTickAt = new Date(Date.now() + this.opts.tickIntervalMs).toISOString();

    try {
      for (const symbol of this.config.symbols) {
        await this.evaluateSymbol(symbol);
      }
    } catch (err) {
      this.setStatus('error', String(err));
      this.emit('error', { error: String(err) });
      return;
    }

    this.emit('tick', { timestamp: this.state.lastTickAt, state: this.state });
  }

  // ── Symbol Evaluation ─────────────────────────────────

  private async evaluateSymbol(symbol: string): Promise<void> {
    let liveQuote: LiveQuote;

    if (this.quoteProvider) {
      const q = this.quoteProvider(symbol);
      if (!q) return; // symbol not available, skip
      liveQuote = {
        symbol,
        price: q.price,
        open: q.open ?? q.price,
        high: q.high ?? q.price,
        low: q.low ?? q.price,
        volume: q.volume,
        previousClose: q.previousClose ?? q.price,
        change: q.change ?? 0,
        changePercent: q.changePercent ?? 0,
        latestTradingDay: q.latestTradingDay ?? new Date().toISOString().split('T')[0],
        fetchedAt: q.fetchedAt,
      };
    } else {
      const quote = await fetchQuoteWithRetry(symbol);

      if ('error' in quote) {
        this.emit('error', { symbol, error: (quote as AlphaVantageError).error });
        return;
      }

      liveQuote = quote as LiveQuote;
    }

    // Append to history
    const history = this.symbolHistory.get(symbol)!;
    history.push({
      price: liveQuote.price,
      volume: liveQuote.volume,
      time: liveQuote.fetchedAt,
    });

    // Keep only enough history for indicators
    const maxHistory = Math.max(this.opts.minHistoryBars, 300);
    if (history.length > maxHistory) {
      history.splice(0, history.length - maxHistory);
    }

    // Need minimum bars before generating signals
    if (history.length < this.opts.minHistoryBars) return;

    const prices = history.map((h) => h.price);
    const volumes = history.map((h) => h.volume);

    // Build a minimal CandlestickData-like structure for rule evaluation
    const currentIdx = history.length - 1;
    const prevIdx = currentIdx - 1;

    // Check exit rules first (for open positions on this symbol)
    const positions = this.openPositions.get(symbol) ?? [];
    const closedIndices: number[] = [];

    for (let p = 0; p < positions.length; p++) {
      const pos = positions[p];
      pos.highestPrice = Math.max(pos.highestPrice, liveQuote.price);
      pos.lowestPrice = Math.min(pos.lowestPrice, liveQuote.price);

      const exitReason = this.evaluateExitRules(pos, liveQuote, prices, currentIdx);
      if (exitReason) {
        const pnl = (liveQuote.price - pos.entryPrice) * pos.quantity;
        const pnlPercent = (liveQuote.price - pos.entryPrice) / pos.entryPrice * 100;

        const trade: SimulatedTrade = {
          entryDate: pos.entryDate,
          entryPrice: pos.entryPrice,
          exitDate: liveQuote.fetchedAt,
          exitPrice: liveQuote.price,
          quantity: pos.quantity,
          side: 'long',
          pnl: Math.round(pnl * 100) / 100,
          pnlPercent: Math.round(pnlPercent * 100) / 100,
          exitReason,
          barsHeld: -1, // live mode doesn't track bars held the same way
        };
        this.closedPositions.push(trade);

        this.emit('positionClosed', { symbol, trade, reason: exitReason });
        closedIndices.push(p);
      }
    }

    // Remove closed positions (reverse to keep indices valid)
    for (let j = closedIndices.length - 1; j >= 0; j--) {
      positions.splice(closedIndices[j], 1);
    }
    this.syncOpenPositionsCount();

    // Check entry rules
    const allPositions = this.countAllOpenPositions();
    if (allPositions < this.opts.maxPositions) {
      const entrySignal = this.evaluateEntryRules(
        liveQuote,
        prices,
        volumes,
        currentIdx,
        prevIdx,
        symbol,
        allPositions,
      );
      if (entrySignal) {
        this.signalCount++;
        const signal: LiveSignal = {
          id: `${this.strategyId}-${symbol}-${Date.now()}-${this.signalCount}`,
          strategyId: this.strategyId,
          symbol,
          type: entrySignal.type,
          price: liveQuote.price,
          quantity: entrySignal.quantity,
          confidence: entrySignal.confidence,
          reason: entrySignal.reason,
          timestamp: liveQuote.fetchedAt,
          acknowledged: false,
          executed: false,
        };

        this.state.lastSignal = signal;
        this.state.signalsToday = this.signalCount;

        // ── Risk Validation & Auto-Execute ────────────────
        if (entrySignal.type === 'buy') {
          let riskRejected = false;

          if (this.riskManager && this.getPortfolioSnapshot) {
            const snapshot = this.getPortfolioSnapshot();
            const riskReq: RiskTradeRequest = {
              symbol,
              quantity: signal.quantity,
              price: signal.price,
              capital: snapshot.capital,
              positions: snapshot.positions,
              dailyPnl: snapshot.dailyPnl,
              tradesToday: snapshot.tradesToday,
            };
            const riskResult = this.riskManager.canTrade(riskReq);
            if (!riskResult.allowed) {
              signal.status = 'rejected';
              signal.rejectedReason = `${riskResult.rule}: ${riskResult.reason}`;
              riskRejected = true;
            }
          }

          if (!riskRejected && this.onAutoExecute) {
            // Delegate execution to the consumer (e.g. portfolio store)
            const tradeId = await this.onAutoExecute(signal);
            if (tradeId) {
              signal.status = 'executed';
              signal.executed = true;
              signal.tradeId = tradeId;
            }
          } else if (!riskRejected) {
            // Legacy: place internal paper position
            positions.push({
              symbol,
              entryPrice: liveQuote.price,
              entryDate: liveQuote.fetchedAt,
              quantity: entrySignal.quantity,
              highestPrice: liveQuote.high,
              lowestPrice: liveQuote.low,
              stopLossPrice: this.getStopLossPrice(liveQuote.price),
              takeProfitPrice: this.getTakeProfitPrice(liveQuote.price),
            });
            signal.status = 'executed';
            signal.executed = true;
            signal.tradeId = `paper-${signal.id}`;
            this.syncOpenPositionsCount();
          }
        }

        this.emit('signal', signal);
      }
    }
  }

  // ── Rule Evaluation ────────────────────────────────────

  private evaluateEntryRules(
    quote: LiveQuote,
    prices: number[],
    volumes: number[],
    currentIdx: number,
    prevIdx: number,
    symbol: string,
    currentPositions: number,
  ): { type: SignalType; quantity: number; confidence: number; reason: string } | null {
    let bestConfidence = 0;
    let bestReason = '';
    let matched = false;

    for (const rule of this.config.entryRules) {
      const result = this.evaluateSingleEntryRule(rule, quote, prices, volumes, currentIdx, prevIdx);
      if (result.matched && result.confidence > bestConfidence) {
        bestConfidence = result.confidence;
        bestReason = result.reason;
        matched = true;
      }
    }

    if (!matched) return null;

    // Position sizing
    const riskAmount = this.opts.capital * (this.opts.riskPerTrade / 100);
    const stopDistance = quote.price * (this.getStopLossPercent() / 100);
    let quantity = Math.floor(riskAmount / stopDistance);
    if (quantity <= 0) quantity = 1;

    return {
      type: 'buy',
      quantity,
      confidence: bestConfidence,
      reason: bestReason,
    };
  }

  private evaluateSingleEntryRule(
    rule: EntryRule,
    quote: LiveQuote,
    prices: number[],
    volumes: number[],
    currentIdx: number,
    prevIdx: number,
  ): { matched: boolean; confidence: number; reason: string } {
    switch (rule.type) {
      case 'indicator_cross': {
        const p = rule.params as IndicatorCrossParams;

        if (p.indicator === 'rsi') {
          const rsiVals = rsi(prices, p.period ?? 14);
          const currRsi = rsiVals[currentIdx];
          const prevRsi = rsiVals[prevIdx];
          const threshold = p.threshold ?? 30;

          if (p.condition === 'crosses_above' && prevRsi != null && currRsi != null && prevRsi <= threshold && currRsi > threshold) {
            return { matched: true, confidence: 0.7, reason: `${rule.description}: RSI crossed above ${threshold}` };
          }
          if (p.condition === 'crosses_below' && prevRsi != null && currRsi != null && prevRsi >= threshold && currRsi < threshold) {
            return { matched: true, confidence: 0.7, reason: `${rule.description}: RSI crossed below ${threshold}` };
          }
          if (p.condition === 'above' && currRsi != null && currRsi > threshold) {
            return { matched: true, confidence: 0.5, reason: `${rule.description}: RSI above ${threshold}` };
          }
          if (p.condition === 'below' && currRsi != null && currRsi < threshold) {
            return { matched: true, confidence: 0.6, reason: `${rule.description}: RSI below ${threshold} (oversold)` };
          }
        }

        if (p.indicator === 'sma') {
          const fastPer = p.period ?? 50;
          const slowPer = p.secondaryPeriod ?? 200;
          const fast = sma(prices, fastPer);
          const slow = sma(prices, slowPer);
          const currF = fast[currentIdx];
          const currS = slow[currentIdx];
          const prevF = fast[prevIdx];
          const prevS = slow[prevIdx];

          if (currF == null || currS == null) break;

          if (p.condition === 'crosses_above' && prevF != null && prevS != null && prevF <= prevS && currF > currS) {
            return { matched: true, confidence: 0.8, reason: `${rule.description}: SMA${fastPer} crossed above SMA${slowPer}` };
          }
          if (p.condition === 'crosses_below' && prevF != null && prevS != null && prevF >= prevS && currF < currS) {
            return { matched: true, confidence: 0.8, reason: `${rule.description}: SMA${fastPer} crossed below SMA${slowPer}` };
          }
          if (p.condition === 'above' && currF > currS) {
            return { matched: true, confidence: 0.4, reason: `${rule.description}: SMA${fastPer} above SMA${slowPer}` };
          }
          if (p.condition === 'below' && currF < currS) {
            return { matched: true, confidence: 0.4, reason: `${rule.description}: SMA${fastPer} below SMA${slowPer}` };
          }
        }

        if (p.indicator === 'ema') {
          const fastPer = p.period ?? 20;
          const slowPer = p.secondaryPeriod ?? 50;
          const fast = ema(prices, fastPer);
          const slow = ema(prices, slowPer);
          const currF = fast[currentIdx];
          const currS = slow[currentIdx];
          const prevF = fast[prevIdx];
          const prevS = slow[prevIdx];

          if (currF == null || currS == null) break;

          if (p.condition === 'crosses_above' && prevF != null && prevS != null && prevF <= prevS && currF > currS) {
            return { matched: true, confidence: 0.75, reason: `${rule.description}: EMA${fastPer} crossed above EMA${slowPer}` };
          }
          if (p.condition === 'crosses_below' && prevF != null && prevS != null && prevF >= prevS && currF < currS) {
            return { matched: true, confidence: 0.75, reason: `${rule.description}: EMA${fastPer} crossed below EMA${slowPer}` };
          }
          if (p.condition === 'above' && currF > currS) {
            return { matched: true, confidence: 0.4, reason: `${rule.description}: EMA${fastPer} above EMA${slowPer}` };
          }
          if (p.condition === 'below' && currF < currS) {
            return { matched: true, confidence: 0.4, reason: `${rule.description}: EMA${fastPer} below EMA${slowPer}` };
          }
        }

        if (p.indicator === 'macd') {
          const m = macd(prices);
          const currMacd = m.macdLine[currentIdx];
          const currSignal = m.signalLine[currentIdx];
          const prevMacd = m.macdLine[prevIdx];
          const prevSignal = m.signalLine[prevIdx];

          if (currMacd == null || currSignal == null) break;

          if (p.condition === 'crosses_above' && prevMacd != null && prevSignal != null && prevMacd <= prevSignal && currMacd > currSignal) {
            return { matched: true, confidence: 0.85, reason: `${rule.description}: MACD crossed above signal` };
          }
          if (p.condition === 'crosses_below' && prevMacd != null && prevSignal != null && prevMacd >= prevSignal && currMacd < currSignal) {
            return { matched: true, confidence: 0.85, reason: `${rule.description}: MACD crossed below signal` };
          }
          if (p.condition === 'above' && currMacd > currSignal) {
            return { matched: true, confidence: 0.45, reason: `${rule.description}: MACD above signal` };
          }
          if (p.condition === 'below' && currMacd < currSignal) {
            return { matched: true, confidence: 0.45, reason: `${rule.description}: MACD below signal` };
          }
        }

        if (p.indicator === 'volume') {
          const volSma = sma(volumes, 20);
          const currVol = volumes[currentIdx];
          const currVolSma = volSma[currentIdx];
          const threshold = p.threshold ?? 1.5;

          if (currVolSma == null) break;

          if (p.condition === 'above' && currVol > currVolSma * threshold) {
            return { matched: true, confidence: 0.5, reason: `${rule.description}: Volume ${threshold}x above average` };
          }
        }

        break;
      }

      case 'price_level': {
        const p = rule.params as PriceLevelParams;
        const level = p.level;
        const price = quote.price;
        const prevPrice = prices[prevIdx] ?? price;

        if (p.direction === 'breakout_above') {
          const effectiveLevel = level === 0 ? Math.max(...prices.slice(-20)) : level;
          if (prevPrice <= effectiveLevel && price > effectiveLevel) {
            return { matched: true, confidence: 0.65, reason: `${rule.description}: Breakout above $${effectiveLevel.toFixed(2)}` };
          }
        }

        if (p.direction === 'breakout_below') {
          const effectiveLevel = level === 0 ? Math.min(...prices.slice(-20)) : level;
          if (prevPrice >= effectiveLevel && price < effectiveLevel) {
            return { matched: true, confidence: 0.65, reason: `${rule.description}: Breakdown below $${effectiveLevel.toFixed(2)}` };
          }
        }

        if (p.direction === 'bounce_at') {
          const touchedSupport = quote.low <= level * 1.01 && quote.low >= level * 0.99;
          if (touchedSupport && price > quote.open) {
            return { matched: true, confidence: 0.55, reason: `${rule.description}: Bounce at $${level.toFixed(2)}` };
          }
        }

        break;
      }

      case 'pattern': {
        // Pattern detection needs multiple bars — simplified for live mode
        // Just check recent bollinger band touches as pattern proxy
        if (prices.length < 20) break;
        const bb = bollinger(prices);
        const currLower = bb.lower[currentIdx];
        const prevLower = bb.lower[prevIdx];
        const currUpper = bb.upper[currentIdx];

        if (currLower != null && prevLower != null && quote.price <= currLower * 1.01 && quote.price > prevLower) {
          return { matched: true, confidence: 0.5, reason: `${rule.description}: Near lower Bollinger band` };
        }
        if (currUpper != null && quote.price >= currUpper * 0.99) {
          return { matched: true, confidence: 0.5, reason: `${rule.description}: Near upper Bollinger band` };
        }
        break;
      }

      case 'custom': {
        // Custom rules can't be evaluated generically
        break;
      }
    }

    return { matched: false, confidence: 0, reason: '' };
  }

  private evaluateExitRules(
    position: PaperPosition,
    quote: LiveQuote,
    prices: number[],
    currentIdx: number,
  ): string | null {
    for (const rule of this.config.exitRules) {
      const reason = this.evaluateSingleExitRule(rule, position, quote, prices, currentIdx);
      if (reason) return reason;
    }
    return null;
  }

  private evaluateSingleExitRule(
    rule: ExitRule,
    position: PaperPosition,
    quote: LiveQuote,
    prices: number[],
    currentIdx: number,
  ): string | null {
    switch (rule.type) {
      case 'take_profit': {
        const percent = (rule.params as { percent: number }).percent;
        const target = position.entryPrice * (1 + percent / 100);
        if (quote.high >= target) return `Take profit +${percent}% at $${target.toFixed(2)}`;
        return null;
      }

      case 'stop_loss': {
        const percent = (rule.params as { percent: number }).percent;
        const stop = position.entryPrice * (1 - percent / 100);
        if (quote.low <= stop) return `Stop loss -${percent}% at $${stop.toFixed(2)}`;
        return null;
      }

      case 'trailing_stop': {
        const p = rule.params as { percent: number; activationPercent?: number };
        const activation = p.activationPercent ?? 0;
        const trailDist = p.percent;
        const gainPercent = (position.highestPrice - position.entryPrice) / position.entryPrice * 100;

        if (gainPercent >= activation) {
          const stopLevel = position.highestPrice * (1 - trailDist / 100);
          if (quote.low <= stopLevel) {
            return `Trailing stop -${trailDist}% (from $${position.highestPrice.toFixed(2)})`;
          }
        }
        return null;
      }

      case 'indicator_signal': {
        const p = rule.params as { indicator: IndicatorType; condition: string; threshold?: number; period?: number };
        if (p.indicator === 'rsi') {
          const rsiVals = rsi(prices, p.period ?? 14);
          const currRsi = rsiVals[currentIdx];
          const threshold = p.threshold ?? 70;

          if (p.condition === 'crosses_above' && currRsi != null && currRsi > threshold) {
            return `RSI crossed above ${threshold}`;
          }
          if (p.condition === 'above' && currRsi != null && currRsi > threshold) {
            return `RSI above ${threshold}`;
          }
          if (p.condition === 'crosses_below' && currRsi != null && currRsi < threshold) {
            return `RSI crossed below ${threshold}`;
          }
          if (p.condition === 'below' && currRsi != null && currRsi < threshold) {
            return `RSI below ${threshold}`;
          }
        }

        if (p.indicator === 'sma') {
          const smaVals = sma(prices, p.period ?? 50);
          const currSma = smaVals[currentIdx];
          if (currSma != null && quote.price < currSma && p.condition === 'crosses_below') {
            return `Price crossed below SMA${p.period ?? 50}`;
          }
        }

        if (p.indicator === 'macd') {
          const m = macd(prices);
          const currMacd = m.macdLine[currentIdx];
          const currSignal = m.signalLine[currentIdx];
          if (currMacd != null && currSignal != null && currMacd < currSignal && p.condition === 'crosses_below') {
            return 'MACD crossed below signal';
          }
        }

        return null;
      }

      case 'time_based': {
        const p = rule.params as { durationBars?: number; durationMinutes?: number; durationHours?: number; durationDays?: number };
        if (p.durationMinutes) {
          const elapsed = Date.now() - new Date(position.entryDate).getTime();
          if (elapsed >= p.durationMinutes * 60_000) return `Held ${p.durationMinutes} minutes`;
        }
        if (p.durationHours) {
          const elapsed = Date.now() - new Date(position.entryDate).getTime();
          if (elapsed >= p.durationHours * 3_600_000) return `Held ${p.durationHours} hours`;
        }
        return null;
      }
    }

    return null;
  }

  // ── Helpers ────────────────────────────────────────────

  private getStopLossPercent(): number {
    const slRule = this.config.exitRules.find((r) => r.type === 'stop_loss');
    return slRule ? (slRule.params as StopLossParams).percent : 2;
  }

  private getStopLossPrice(entryPrice: number): number {
    return entryPrice * (1 - this.getStopLossPercent() / 100);
  }

  private getTakeProfitPrice(entryPrice: number): number {
    const tpRule = this.config.exitRules.find((r) => r.type === 'take_profit');
    const percent = tpRule ? (tpRule.params as { percent: number }).percent : 5;
    return entryPrice * (1 + percent / 100);
  }

  private countAllOpenPositions(): number {
    let total = 0;
    for (const positions of this.openPositions.values()) {
      total += positions.length;
    }
    return total;
  }

  private syncOpenPositionsCount(): void {
    this.state.openPositions = this.countAllOpenPositions();
  }

  // ── Public Helpers ─────────────────────────────────────

  getOpenPositions(): PaperPosition[] {
    const all: PaperPosition[] = [];
    for (const positions of this.openPositions.values()) {
      all.push(...positions);
    }
    return all;
  }

  getClosedTrades(): SimulatedTrade[] {
    return [...this.closedPositions];
  }

  getHistory(symbol: string): { price: number; volume: number; time: string }[] {
    return this.symbolHistory.get(symbol) ?? [];
  }

  reset(): void {
    this.stop();
    this.symbolHistory.clear();
    this.openPositions.clear();
    this.closedPositions = [];
    this.signalCount = 0;

    for (const sym of this.config.symbols) {
      this.symbolHistory.set(sym, []);
      this.openPositions.set(sym, []);
    }

    this.state = {
      ...this.state,
      status: 'idle',
      lastTickAt: null,
      nextTickAt: null,
      error: null,
      openPositions: 0,
      signalsToday: 0,
      lastSignal: null,
    };
  }
}