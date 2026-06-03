// ─── Strategy Execution Engine ──────────────────────────────────────────
//
//  Runs a StrategyConfig against historical CandlestickData to simulate
//  trades and return backtest results with full performance metrics.
//

import type {
  StrategyConfig,
  EntryRule,
  ExitRule,
  CandlestickData,
  IndicatorCrossParams,
  PriceLevelParams,
  ChartPatternParams,
  CustomRuleParams,
  TakeProfitParams,
  StopLossParams,
  TrailingStopParams,
  IndicatorSignalParams,
  TimeBasedParams,
  IndicatorType,
} from '@/types';

// ════════════════════════════════════════════════════════════════════════
// Public Types
// ════════════════════════════════════════════════════════════════════════

export interface SimulatedTrade {
  entryDate: string;
  entryPrice: number;
  exitDate: string;
  exitPrice: number;
  quantity: number;
  side: 'long' | 'short';
  pnl: number;
  pnlPercent: number;
  exitReason: string;
  barsHeld: number;
}

export interface BacktestResult {
  trades: SimulatedTrade[];
  metrics: BacktestMetrics;
  equityCurve: { date: string; equity: number }[];
}

export interface BacktestMetrics {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number; // 0-1
  totalPnl: number;
  totalPnlPercent: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  maxDrawdown: number; // negative percentage
  sharpeRatio: number;
  avgBarsHeld: number;
  bestTrade: { pnl: number; pnlPercent: number };
  worstTrade: { pnl: number; pnlPercent: number };
}

interface OpenPosition {
  entryIndex: number;
  entryDate: string;
  entryPrice: number;
  quantity: number;
  side: 'long';
  highestPrice: number; // for trailing stop
  lowestPrice: number;
}

// ════════════════════════════════════════════════════════════════════════
// Technical Indicator Calculators
// ════════════════════════════════════════════════════════════════════════

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
  // seed with SMA
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

  const rsiIndex = period; // first RSI value corresponds to index `period` in values
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

interface MACDResult {
  macdLine: (number | null)[];
  signalLine: (number | null)[];
  histogram: (number | null)[];
}

function macd(
  values: number[],
  fastPeriod = 12,
  slowPeriod = 26,
  signalPeriod = 9,
): MACDResult {
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
  // fix: signal shouldn't appear before macd line has enough data
  const histogram: (number | null)[] = new Array(values.length).fill(null);
  for (let i = 0; i < values.length; i++) {
    if (macdLine[i] != null && signalLine[i] != null) {
      histogram[i] = macdLine[i]! - signalLine[i]!;
    }
  }
  return { macdLine, signalLine, histogram };
}

interface BollingerResult {
  middle: (number | null)[];
  upper: (number | null)[];
  lower: (number | null)[];
}

function bollinger(
  values: number[],
  period = 20,
  stdDevMultiplier = 2,
): BollingerResult {
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

// ─── Get indicator value for a specific type ─────────────────────────

interface IndicatorValues {
  sma_fast?: (number | null)[];
  sma_slow?: (number | null)[];
  ema_fast?: (number | null)[];
  ema_slow?: (number | null)[];
  rsi?: (number | null)[];
  macd?: MACDResult;
  bollinger?: BollingerResult;
  volumeSma?: (number | null)[];
}

function getIndicatorValues(
  closes: number[],
  highs: number[],
  lows: number[],
  volumes: number[],
  needed: Set<IndicatorType>,
): IndicatorValues {
  const result: IndicatorValues = {};

  if (needed.has('sma')) {
    result.sma_fast = sma(closes, 50);
    result.sma_slow = sma(closes, 200);
  }
  if (needed.has('ema')) {
    result.ema_fast = ema(closes, 20);
    result.ema_slow = ema(closes, 50);
  }
  if (needed.has('rsi')) {
    result.rsi = rsi(closes, 14);
  }
  if (needed.has('macd')) {
    result.macd = macd(closes);
  }
  if (needed.has('bollinger')) {
    result.bollinger = bollinger(closes);
  }
  if (needed.has('volume')) {
    result.volumeSma = sma(volumes, 20);
  }

  return result;
}

// ════════════════════════════════════════════════════════════════════════
// Rule Evaluators
// ════════════════════════════════════════════════════════════════════════

function crossesAbove(prev: number | null, curr: number | null, threshold: number): boolean {
  return prev != null && curr != null && prev <= threshold && curr > threshold;
}

function crossesBelow(prev: number | null, curr: number | null, threshold: number): boolean {
  return prev != null && curr != null && prev >= threshold && curr < threshold;
}

function evaluateEntryRule(
  rule: EntryRule,
  index: number,
  bars: CandlestickData[],
  closes: number[],
  volumes: number[],
  ind: IndicatorValues,
  openPositionsCount: number,
): boolean {
  const prev = index > 0 ? index - 1 : index;

  switch (rule.type) {
    case 'indicator_cross': {
      const p = rule.params as IndicatorCrossParams;
      const period = p.period ?? 14;

      if (p.indicator === 'rsi') {
        const rsiVals =
          p.period && p.period !== 14 ? rsi(closes, p.period) : ind.rsi;
        if (!rsiVals) return false;
        const currRsi = rsiVals[index];
        const prevRsi = rsiVals[prev];
        const thresh = p.threshold ?? 30;

        if (p.condition === 'crosses_above') return crossesAbove(prevRsi, currRsi, thresh);
        if (p.condition === 'crosses_below') return crossesBelow(prevRsi, currRsi, thresh);
        if (p.condition === 'below') return currRsi != null && currRsi < thresh;
        if (p.condition === 'above') return currRsi != null && currRsi > thresh;
        return false;
      }

      if (p.indicator === 'sma') {
        const fastPer = p.period ?? 50;
        const slowPer = p.secondaryPeriod ?? 200;
        const fast = sma(closes, fastPer);
        const slow = sma(closes, slowPer);
        const currF = fast[index];
        const currS = slow[index];
        const prevF = fast[prev];
        const prevS = slow[prev];

        if (currF == null || currS == null) return false;

        if (p.condition === 'crosses_above') {
          return prevF != null && prevS != null && prevF <= prevS && currF > currS;
        }
        if (p.condition === 'crosses_below') {
          return prevF != null && prevS != null && prevF >= prevS && currF < currS;
        }
        if (p.condition === 'above') return currF > currS;
        if (p.condition === 'below') return currF < currS;
        return false;
      }

      if (p.indicator === 'ema') {
        const fastPer = p.period ?? 20;
        const slowPer = p.secondaryPeriod ?? 50;
        const fast = ema(closes, fastPer);
        const slow = ema(closes, slowPer);
        const currF = fast[index];
        const currS = slow[index];
        const prevF = fast[prev];
        const prevS = slow[prev];

        if (currF == null || currS == null) return false;

        if (p.condition === 'crosses_above') {
          return prevF != null && prevS != null && prevF <= prevS && currF > currS;
        }
        if (p.condition === 'crosses_below') {
          return prevF != null && prevS != null && prevF >= prevS && currF < currS;
        }
        if (p.condition === 'above') return currF > currS;
        if (p.condition === 'below') return currF < currS;
        return false;
      }

      if (p.indicator === 'macd') {
        const macdData = ind.macd;
        if (!macdData) return false;
        const currMacd = macdData.macdLine[index];
        const currSignal = macdData.signalLine[index];
        const prevMacd = macdData.macdLine[prev];
        const prevSignal = macdData.signalLine[prev];

        if (currMacd == null || currSignal == null) return false;

        if (p.condition === 'crosses_above') {
          return prevMacd != null && prevSignal != null && prevMacd <= prevSignal && currMacd > currSignal;
        }
        if (p.condition === 'crosses_below') {
          return prevMacd != null && prevSignal != null && prevMacd >= prevSignal && currMacd < currSignal;
        }
        if (p.condition === 'above') return currMacd > currSignal;
        if (p.condition === 'below') return currMacd < currSignal;
        return false;
      }

      if (p.indicator === 'volume') {
        const volSma = ind.volumeSma;
        if (!volSma) return false;
        const currVol = volumes[index];
        const currVolSma = volSma[index];
        const thresh = p.threshold ?? 1.5; // volume spike multiplier

        if (currVolSma == null) return false;

        if (p.condition === 'above') return currVol > currVolSma * thresh;
        if (p.condition === 'crosses_above') {
          const prevVol = volumes[prev];
          const prevVolSma = volSma[prev];
          return (
            prevVolSma != null &&
            prevVol <= prevVolSma * thresh &&
            currVol > currVolSma * thresh
          );
        }
        return false;
      }

      return false;
    }

    case 'price_level': {
      const p = rule.params as PriceLevelParams;
      const bar = bars[index];
      const prevBar = bars[prev];

      if (p.direction === 'breakout_above') {
        // if level is 0, use highest high of last 20 bars as resistance
        let level = p.level;
        if (level === 0) {
          const lookback = Math.min(20, index);
          const slice = bars.slice(Math.max(0, index - lookback), index);
          level = Math.max(...slice.map((b) => b.high));
        }
        return prevBar.high <= level && bar.close > level;
      }

      if (p.direction === 'breakout_below') {
        let level = p.level;
        if (level === 0) {
          const lookback = Math.min(20, index);
          const slice = bars.slice(Math.max(0, index - lookback), index);
          level = Math.min(...slice.map((b) => b.low));
        }
        return prevBar.low >= level && bar.close < level;
      }

      if (p.direction === 'bounce_at') {
        // bounce off support: price approaches level then reverses up
        const level = p.level;
        const touchedSupport = bar.low <= level * 1.01 && bar.low >= level * 0.99;
        const closesAbove = bar.close > bar.open;
        return touchedSupport && closesAbove;
      }

      return false;
    }

    case 'pattern': {
      // Simplified pattern detection — just checks basic structure
      const p = rule.params as ChartPatternParams;
      if (index < 5) return false; // need at least a few bars

      if (p.patternName === 'double_bottom') {
        // rough: two lows within 3% of each other 2-8 bars apart
        return detectDoubleBottom(bars, index, p.confirmationBars ?? 2);
      }
      if (p.patternName === 'double_top') {
        return detectDoubleTop(bars, index, p.confirmationBars ?? 2);
      }
      // other patterns: placeholder — not fully implemented
      return false;
    }

    case 'custom': {
      // Can't evaluate custom expressions in runtime safely
      // Return false — custom rules need to be evaluated externally
      return false;
    }

    default:
      return false;
  }
}

function detectDoubleBottom(bars: CandlestickData[], index: number, confirmBars: number): boolean {
  // Find two distinct lows in the last 15 bars before index
  const lookback = Math.min(15, index);
  const start = Math.max(0, index - lookback);
  const slice = bars.slice(start, index + 1);

  const lows = slice.map((b, i) => ({ low: b.low, idx: i }));
  // find 2 lowest points separated by at least 2 bars
  const sorted = [...lows].sort((a, b) => a.low - b.low);
  const first = sorted[0];
  const second = sorted.find((l) => Math.abs(l.idx - first.idx) >= 2);
  if (!second) return false;

  // lows must be within 3% of each other
  const diff = Math.abs(first.low - second.low) / first.low;
  if (diff > 0.03) return false;

  // middle high should be at least 1.5% above the lows
  const midStart = Math.min(first.idx, second.idx);
  const midEnd = Math.max(first.idx, second.idx);
  const midSlice = slice.slice(midStart, midEnd + 1);
  const midHigh = Math.max(...midSlice.map((b) => b.high));
  const avgLow = (first.low + second.low) / 2;

  if ((midHigh - avgLow) / avgLow < 0.015) return false;

  // current bar should be breaking above midHigh (confirmation)
  return bars[index].close > midHigh;
}

function detectDoubleTop(bars: CandlestickData[], index: number, confirmBars: number): boolean {
  const lookback = Math.min(15, index);
  const start = Math.max(0, index - lookback);
  const slice = bars.slice(start, index + 1);

  const highs = slice.map((b, i) => ({ high: b.high, idx: i }));
  const sorted = [...highs].sort((a, b) => b.high - a.high);
  const first = sorted[0];
  const second = sorted.find((h) => Math.abs(h.idx - first.idx) >= 2);
  if (!second) return false;

  const diff = Math.abs(first.high - second.high) / first.high;
  if (diff > 0.03) return false;

  const midStart = Math.min(first.idx, second.idx);
  const midEnd = Math.max(first.idx, second.idx);
  const midSlice = slice.slice(midStart, midEnd + 1);
  const midLow = Math.min(...midSlice.map((b) => b.low));
  const avgHigh = (first.high + second.high) / 2;

  if ((avgHigh - midLow) / avgHigh < 0.015) return false;

  return bars[index].close < midLow;
}

// ════════════════════════════════════════════════════════════════════════
// Exit Rule Evaluator — returns reason string or null
// ════════════════════════════════════════════════════════════════════════

function evaluateExitRule(
  rule: ExitRule,
  index: number,
  bar: CandlestickData,
  position: OpenPosition,
  closes: number[],
  ind: IndicatorValues,
): string | null {
  switch (rule.type) {
    case 'take_profit': {
      const p = rule.params as TakeProfitParams;
      const targetPrice = p.targetPrice ?? position.entryPrice * (1 + p.percent / 100);
      if (bar.high >= targetPrice) return `Take profit +${p.percent}%`;
      return null;
    }

    case 'stop_loss': {
      const p = rule.params as StopLossParams;
      const stopPrice = p.stopPrice ?? position.entryPrice * (1 - p.percent / 100);
      if (bar.low <= stopPrice) return `Stop loss -${p.percent}%`;
      return null;
    }

    case 'trailing_stop': {
      const p = rule.params as TrailingStopParams;
      const activation = p.activationPercent ?? 0;
      const trailDist = p.percent;

      position.highestPrice = Math.max(position.highestPrice, bar.high);
      const gainFromEntry = (position.highestPrice - position.entryPrice) / position.entryPrice * 100;

      if (gainFromEntry >= activation) {
        const stopLevel = position.highestPrice * (1 - trailDist / 100);
        if (bar.low <= stopLevel) {
          return `Trailing stop -${trailDist}% (from $${position.highestPrice.toFixed(2)})`;
        }
      }
      return null;
    }

    case 'indicator_signal': {
      const p = rule.params as IndicatorSignalParams;
      const prev = index > 0 ? index - 1 : index;

      if (p.indicator === 'rsi') {
        const rsiVals =
          p.period && p.period !== 14 ? rsi(closes, p.period) : ind.rsi;
        if (!rsiVals) return null;
        const currRsi = rsiVals[index];
        const prevRsi = rsiVals[prev];
        const thresh = p.threshold ?? 70;

        if (p.condition === 'crosses_above' && crossesAbove(prevRsi, currRsi, thresh))
          return `RSI crossed above ${thresh}`;
        if (p.condition === 'crosses_below' && crossesBelow(prevRsi, currRsi, thresh))
          return `RSI crossed below ${thresh}`;
        if (p.condition === 'above' && currRsi != null && currRsi > thresh)
          return `RSI above ${thresh}`;
        if (p.condition === 'below' && currRsi != null && currRsi < thresh)
          return `RSI below ${thresh}`;
      }

      if (p.indicator === 'sma') {
        const period = p.period ?? 50;
        const smaVals = sma(closes, period);
        const currSma = smaVals[index];
        const prevSma = smaVals[prev];
        const price = bar.close;

        if (currSma == null) return null;
        if (p.condition === 'crosses_below' && prevSma != null && price < currSma && index > 0 && closes[prev] >= prevSma)
          return `Price crossed below SMA ${period}`;
        if (p.condition === 'below' && price < currSma)
          return `Price below SMA ${period}`;
      }

      if (p.indicator === 'macd' && ind.macd) {
        const macdData = ind.macd;
        const currM = macdData.macdLine[index];
        const currS = macdData.signalLine[index];
        const prevM = macdData.macdLine[prev];
        const prevS = macdData.signalLine[prev];

        if (currM == null || currS == null) return null;

        if (p.condition === 'crosses_below' && prevM != null && prevS != null && prevM >= prevS && currM < currS)
          return 'MACD crossed below signal';
        if (p.condition === 'below' && currM < currS)
          return 'MACD below signal';
      }

      return null;
    }

    case 'time_based': {
      const p = rule.params as TimeBasedParams;
      const barsHeld = index - position.entryIndex;

      if (p.durationBars && barsHeld >= p.durationBars)
        return `Held ${p.durationBars} bars`;
      if (p.durationDays) {
        const entryDate = new Date(position.entryDate);
        const currentDate = new Date(bar.time);
        const daysDiff = (currentDate.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24);
        if (daysDiff >= p.durationDays) return `Held ${p.durationDays} days`;
      }
      if (p.exitAtEndOfSession) {
        // check if this is the last bar of the dataset
        // handled outside this function (end-of-data check)
      }
      return null;
    }

    case 'custom':
      return null;

    default:
      return null;
  }
}

// ════════════════════════════════════════════════════════════════════════
// Main Engine
// ════════════════════════════════════════════════════════════════════════

export function runBacktest(
  config: StrategyConfig,
  candleData: CandlestickData[],
  initialCapital: number = 100_000,
): BacktestResult {
  // ── Sanity checks ──────────────────────────────────────────
  if (!candleData.length || !config.symbols.length || !config.entryRules.length) {
    return {
      trades: [],
      metrics: emptyMetrics(),
      equityCurve: [],
    };
  }

  // ── Prepare arrays ─────────────────────────────────────────
  const bars = candleData;
  const closes = bars.map((b) => b.close);
  const highs = bars.map((b) => b.high);
  const lows = bars.map((b) => b.low);
  const volumes = bars.map((b) => b.volume);

  // ── Gather needed indicators ───────────────────────────────
  const needed = new Set<IndicatorType>();
  for (const rule of [...config.entryRules, ...config.exitRules]) {
    if ('indicator' in rule.params) {
      needed.add((rule.params as IndicatorCrossParams).indicator);
    }
    if ('secondaryIndicator' in rule.params) {
      const si = (rule.params as IndicatorCrossParams).secondaryIndicator;
      if (si) needed.add(si);
    }
  }
  const ind = getIndicatorValues(closes, highs, lows, volumes, needed);

  // ── Simulation state ───────────────────────────────────────
  const maxPositions = config.maxPositions || 5;
  const riskPerTrade = config.riskPerTrade || 2; // 2% of capital per trade
  let cash = initialCapital;
  const openPositions: OpenPosition[] = [];
  const allTrades: SimulatedTrade[] = [];
  const equityCurve: { date: string; equity: number }[] = [];

  // Minimum bars needed for indicators to warm up
  const MIN_LOOKBACK = Math.max(
    config.indicators.includes('sma') ? 200 : 0,
    config.indicators.includes('ema') ? 50 : 0,
    config.indicators.includes('rsi') ? 15 : 0,
    config.indicators.includes('macd') ? 35 : 0,
    config.indicators.includes('bollinger') ? 20 : 0,
    config.indicators.includes('volume') ? 20 : 0,
    20, // absolute minimum
  );

  for (let i = MIN_LOOKBACK; i < bars.length; i++) {
    const bar = bars[i];

    // ── 1. Check exit rules for all open positions ──────────
    const closedThisBar: number[] = [];
    for (let p = 0; p < openPositions.length; p++) {
      const pos = openPositions[p];

      // Update trailing highs/lows
      pos.highestPrice = Math.max(pos.highestPrice, bar.high);
      pos.lowestPrice = Math.min(pos.lowestPrice, bar.low);

      let exitReason: string | null = null;

      for (const rule of config.exitRules) {
        exitReason = evaluateExitRule(rule, i, bar, pos, closes, ind);
        if (exitReason) break;
      }

      // End-of-data forced close
      if (!exitReason && i === bars.length - 1) {
        exitReason = 'End of data';
      }

      if (exitReason) {
        const exitPrice = bar.close;
        const pnl = (exitPrice - pos.entryPrice) * pos.quantity;
        const pnlPercent = (exitPrice - pos.entryPrice) / pos.entryPrice * 100;

        allTrades.push({
          entryDate: pos.entryDate,
          entryPrice: pos.entryPrice,
          exitDate: bar.time,
          exitPrice,
          quantity: pos.quantity,
          side: 'long',
          pnl: Math.round(pnl * 100) / 100,
          pnlPercent: Math.round(pnlPercent * 100) / 100,
          exitReason,
          barsHeld: i - pos.entryIndex,
        });

        cash += pos.quantity * exitPrice; // return capital + pnl
        closedThisBar.push(p);
      }
    }
    // Remove closed positions (reverse to keep indices valid)
    for (let j = closedThisBar.length - 1; j >= 0; j--) {
      openPositions.splice(closedThisBar[j], 1);
    }

    // ── 2. Check entry rules ─────────────────────────────────
    if (openPositions.length < maxPositions) {
      for (const rule of config.entryRules) {
        if (openPositions.length >= maxPositions) break;

        const entry = evaluateEntryRule(rule, i, bars, closes, volumes, ind, openPositions.length);
        if (!entry) continue;

        // Calculate position size
        const riskAmount = initialCapital * (riskPerTrade / 100);
        const entryPrice = bar.close;

        // Estimate stop loss distance (use first stop-loss rule, or default 2%)
        const slRule = config.exitRules.find((r) => r.type === 'stop_loss');
        const slPercent = slRule ? (slRule.params as StopLossParams).percent : 2;
        const stopDistance = entryPrice * (slPercent / 100);

        // Position sizing: riskAmount / stopDistance
        let quantity = Math.floor(riskAmount / stopDistance);
        if (quantity <= 0) quantity = 1;

        const cost = quantity * entryPrice;
        if (cost > cash) {
          quantity = Math.floor(cash / entryPrice);
          if (quantity <= 0) continue;
        }

        cash -= quantity * entryPrice;

        openPositions.push({
          entryIndex: i,
          entryDate: bar.time,
          entryPrice,
          quantity,
          side: 'long',
          highestPrice: bar.high,
          lowestPrice: bar.low,
        });

        // Only enter one position per bar
        break;
      }
    }

    // ── 3. Record equity curve ──────────────────────────────
    const unrealizedValue = openPositions.reduce(
      (sum, p) => sum + p.quantity * bar.close,
      0,
    );
    equityCurve.push({
      date: bar.time,
      equity: Math.round((cash + unrealizedValue) * 100) / 100,
    });
  }

  // ── Calculate metrics ──────────────────────────────────────
  const metrics = computeMetrics(allTrades, initialCapital);

  return { trades: allTrades, metrics, equityCurve };
}

// ════════════════════════════════════════════════════════════════════════
// Performance Metrics
// ════════════════════════════════════════════════════════════════════════

function emptyMetrics(): BacktestMetrics {
  return {
    totalTrades: 0,
    winningTrades: 0,
    losingTrades: 0,
    winRate: 0,
    totalPnl: 0,
    totalPnlPercent: 0,
    avgWin: 0,
    avgLoss: 0,
    profitFactor: 0,
    maxDrawdown: 0,
    sharpeRatio: 0,
    avgBarsHeld: 0,
    bestTrade: { pnl: 0, pnlPercent: 0 },
    worstTrade: { pnl: 0, pnlPercent: 0 },
  };
}

function computeMetrics(trades: SimulatedTrade[], initialCapital: number): BacktestMetrics {
  if (!trades.length) return emptyMetrics();

  const winners = trades.filter((t) => t.pnl > 0);
  const losers = trades.filter((t) => t.pnl < 0);

  const totalPnl = trades.reduce((sum, t) => sum + t.pnl, 0);
  const totalPnlPercent = (totalPnl / initialCapital) * 100;
  const winRate = trades.length > 0 ? winners.length / trades.length : 0;

  const avgWin = winners.length > 0 ? winners.reduce((s, t) => s + t.pnl, 0) / winners.length : 0;
  const avgLoss = losers.length > 0 ? losers.reduce((s, t) => s + t.pnl, 0) / losers.length : 0;

  const grossProfit = winners.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(losers.reduce((s, t) => s + t.pnl, 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;

  // Max drawdown from cumulative P&L
  let peak = initialCapital;
  let cumEquity = initialCapital;
  let maxDD = 0;
  for (const t of trades) {
    cumEquity += t.pnl;
    if (cumEquity > peak) peak = cumEquity;
    const dd = (peak - cumEquity) / peak * 100;
    if (dd > maxDD) maxDD = dd;
  }

  // Sharpe ratio (simplified — using trade-level returns)
  const tradeReturns = trades.map((t) => t.pnlPercent);
  const avgReturn = tradeReturns.reduce((s, r) => s + r, 0) / tradeReturns.length;
  const variance =
    tradeReturns.reduce((s, r) => s + (r - avgReturn) ** 2, 0) / tradeReturns.length;
  const stdDev = Math.sqrt(variance);
  const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(trades.length) : 0;

  const avgBarsHeld = trades.reduce((s, t) => s + t.barsHeld, 0) / trades.length;

  const bestTrade = trades.reduce(
    (best, t) => (t.pnl > best.pnl ? t : best),
    trades[0],
  );
  const worstTrade = trades.reduce(
    (worst, t) => (t.pnl < worst.pnl ? t : worst),
    trades[0],
  );

  return {
    totalTrades: trades.length,
    winningTrades: winners.length,
    losingTrades: losers.length,
    winRate: Math.round(winRate * 1000) / 1000,
    totalPnl: Math.round(totalPnl * 100) / 100,
    totalPnlPercent: Math.round(totalPnlPercent * 100) / 100,
    avgWin: Math.round(avgWin * 100) / 100,
    avgLoss: Math.round(avgLoss * 100) / 100,
    profitFactor: Math.round(profitFactor * 100) / 100,
    maxDrawdown: Math.round(maxDD * 100) / 100,
    sharpeRatio: Math.round(sharpeRatio * 100) / 100,
    avgBarsHeld: Math.round(avgBarsHeld * 10) / 10,
    bestTrade: {
      pnl: Math.round(bestTrade.pnl * 100) / 100,
      pnlPercent: Math.round(bestTrade.pnlPercent * 100) / 100,
    },
    worstTrade: {
      pnl: Math.round(worstTrade.pnl * 100) / 100,
      pnlPercent: Math.round(worstTrade.pnlPercent * 100) / 100,
    },
  };
}

// ════════════════════════════════════════════════════════════════════════
// Convenience: batch run against all symbols in config
// ════════════════════════════════════════════════════════════════════════

export function runMultiSymbolBacktest(
  config: StrategyConfig,
  symbolDataMap: Record<string, CandlestickData[]>,
  initialCapital: number = 100_000,
): { symbol: string; result: BacktestResult }[] {
  return config.symbols
    .filter((sym) => symbolDataMap[sym]?.length > 0)
    .map((sym) => ({
      symbol: sym,
      result: runBacktest(config, symbolDataMap[sym], initialCapital),
    }));
}