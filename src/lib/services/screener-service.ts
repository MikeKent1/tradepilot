// ─── Market Screener Service ───────────────────────────────────────────
//
//  Technical indicator calculators + multi-symbol scanner.
//  Computes RSI, MACD, SMA, EMA, Bollinger Bands from CandlestickData[]
//  and returns BUY / SELL / NEUTRAL signals per symbol.
//
//  All calculations are pure — no network calls.

import type { CandlestickData } from '@/types';

// ─── Types ──────────────────────────────────────────────────

export type ScannerSignal = 'BUY' | 'SELL' | 'NEUTRAL';
export type ScannerConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export interface IndicatorResult {
  rsi: number;
  macd: { macdLine: number; signalLine: number; histogram: number };
  sma50: number;
  sma200: number | null;
  ema20: number;
  bollingerBands: { upper: number; middle: number; lower: number; width: number };
  atr: number;
}

export interface ScreenerResult {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  signals: {
    rsi: ScannerSignal;
    macd: ScannerSignal;
    sma: ScannerSignal;
    bollinger: ScannerSignal;
  };
  overallSignal: ScannerSignal;
  overallConfidence: ScannerConfidence;
  indicators: IndicatorResult;
  summary: string; // one-line description
}

// ─── Helpers ────────────────────────────────────────────────

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stdDev(values: number[], mean: number): number {
  if (values.length < 2) return 0;
  const squaredDiffs = values.map((v) => (v - mean) ** 2);
  return Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / (values.length - 1));
}

function sma(values: number[], period: number): number | null {
  if (values.length < period) return null;
  return avg(values.slice(-period));
}

function ema(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const k = 2 / (period + 1);
  let emaVal = avg(values.slice(0, period));
  for (let i = period; i < values.length; i++) {
    emaVal = values[i] * k + emaVal * (1 - k);
  }
  return emaVal;
}

function rsi(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;

  const changes: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    changes.push(closes[i] - closes[i - 1]);
  }

  const relevantChanges = changes.slice(-period);
  const gains = relevantChanges.filter((c) => c > 0);
  const losses = relevantChanges.filter((c) => c < 0).map((c) => -c);

  const avgGain = gains.length > 0 ? avg(gains) : 0;
  const avgLoss = losses.length > 0 ? avg(losses) : 0;

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function macd(
  closes: number[],
  fast = 12,
  slow = 26,
  signal = 9,
): { macdLine: number; signalLine: number; histogram: number } | null {
  const emaFast = ema(closes, fast);
  const emaSlow = ema(closes, slow);
  if (emaFast === null || emaSlow === null) return null;

  const macdLine = emaFast - emaSlow;

  // Compute signal line (EMA of MACD values)
  const macdValues: number[] = [];
  for (let i = slow; i <= closes.length; i++) {
    const ef = ema(closes.slice(0, i), fast);
    const es = ema(closes.slice(0, i), slow);
    if (ef !== null && es !== null) macdValues.push(ef - es);
  }

  const signalLine = ema(macdValues.length > signal ? macdValues : [...macdValues, macdLine], signal);
  if (signalLine === null) {
    return { macdLine, signalLine: macdLine, histogram: 0 };
  }

  return { macdLine, signalLine, histogram: macdLine - signalLine };
}

function bollingerBands(
  closes: number[],
  period = 20,
  multiplier = 2,
): { upper: number; middle: number; lower: number; width: number } {
  const middleSMA = sma(closes, period) ?? avg(closes.slice(-Math.min(closes.length, period)));
  const relevantCloses = closes.slice(-Math.min(closes.length, period));
  const sd = stdDev(relevantCloses, middleSMA) || 0;

  const upper = middleSMA + multiplier * sd;
  const lower = middleSMA - multiplier * sd;
  const width = ((upper - lower) / middleSMA) * 100;

  return { upper, middle: middleSMA, lower, width };
}

function atr(highs: number[], lows: number[], closes: number[], period = 14): number {
  if (highs.length < period + 1) return 0;

  const trueRanges: number[] = [];
  for (let i = 1; i < highs.length; i++) {
    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1]),
    );
    trueRanges.push(tr);
  }

  return avg(trueRanges.slice(-period));
}

// ─── Signal Interpreters ────────────────────────────────────

function interpretRsi(rsiVal: number): { signal: ScannerSignal; detail: string } {
  if (rsiVal <= 30) return { signal: 'BUY', detail: `RSI(${rsiVal.toFixed(1)}) — Oversold` };
  if (rsiVal >= 70) return { signal: 'SELL', detail: `RSI(${rsiVal.toFixed(1)}) — Overbought` };
  if (rsiVal >= 60) return { signal: 'BUY', detail: `RSI(${rsiVal.toFixed(1)}) — Uptrend momentum` };
  if (rsiVal <= 40) return { signal: 'SELL', detail: `RSI(${rsiVal.toFixed(1)}) — Downtrend momentum` };
  return { signal: 'NEUTRAL', detail: `RSI(${rsiVal.toFixed(1)}) — Neutral` };
}

function interpretMacd(
  macdResult: { macdLine: number; signalLine: number; histogram: number },
): { signal: ScannerSignal; detail: string } {
  const { macdLine, signalLine, histogram } = macdResult;
  const macdRounded = macdLine.toFixed(3);
  const histRounded = histogram.toFixed(3);

  if (histogram > 0.001 && macdLine > signalLine) {
    return { signal: 'BUY', detail: `MACD(${macdRounded}) — Bullish crossover, hist ${histRounded}` };
  }
  if (histogram < -0.001 && macdLine < signalLine) {
    return { signal: 'SELL', detail: `MACD(${macdRounded}) — Bearish crossover, hist ${histRounded}` };
  }
  if (macdLine > signalLine) {
    return { signal: 'BUY', detail: `MACD(${macdRounded}) — Above signal line` };
  }
  if (macdLine < signalLine) {
    return { signal: 'SELL', detail: `MACD(${macdRounded}) — Below signal line` };
  }
  return { signal: 'NEUTRAL', detail: `MACD(${macdRounded}) — Flat` };
}

function interpretSma(
  close: number,
  sma50: number,
  sma200: number | null,
): { signal: ScannerSignal; detail: string } {
  const priceAbove50 = close > sma50;
  let detail = `SMA50(${sma50.toFixed(2)})`;
  let signal: ScannerSignal = 'NEUTRAL';

  if (sma200 !== null) {
    detail += ` | SMA200(${sma200.toFixed(2)})`;
    const priceAbove200 = close > sma200;
    const goldenCross = sma50 > sma200;

    if (priceAbove50 && priceAbove200 && goldenCross) {
      signal = 'BUY';
      detail += ' — Golden cross, uptrend';
    } else if (!priceAbove50 && !priceAbove200 && !goldenCross) {
      signal = 'SELL';
      detail += ' — Death cross, downtrend';
    } else if (priceAbove50 && !priceAbove200) {
      signal = 'NEUTRAL';
      detail += ' — Mixed (price between SMAs)';
    } else {
      signal = close > sma50 ? 'BUY' : 'SELL';
      detail += ` — Price ${signal === 'BUY' ? 'above' : 'below'} SMA50`;
    }
  } else {
    signal = priceAbove50 ? 'BUY' : 'SELL';
    detail += ` — Price ${signal === 'BUY' ? 'above' : 'below'}`;
  }

  return { signal, detail };
}

function interpretBollinger(
  close: number,
  bb: { upper: number; middle: number; lower: number; width: number },
): { signal: ScannerSignal; detail: string } {
  const upperDist = ((bb.upper - close) / close) * 100;
  const lowerDist = ((close - bb.lower) / close) * 100;

  if (close <= bb.lower) {
    return { signal: 'BUY', detail: `Below lower band — Oversold, width ${bb.width.toFixed(1)}%` };
  }
  if (close >= bb.upper) {
    return { signal: 'SELL', detail: `Above upper band — Overbought, width ${bb.width.toFixed(1)}%` };
  }
  if (close > bb.middle) {
    return { signal: 'BUY', detail: `Above middle band — Bullish` };
  }
  return { signal: 'SELL', detail: `Below middle band — Bearish` };
}

// ─── Main Scanner ───────────────────────────────────────────

interface ScanOptions {
  period?: number; // number of bars to use for indicators (default: 250)
  rsiPeriod?: number;
  macdFast?: number;
  macdSlow?: number;
  macdSignal?: number;
  bbPeriod?: number;
  sma50Period?: number;
  sma200Period?: number;
}

export function scanSymbol(
  data: CandlestickData[],
  symbol: string,
  previousClose?: number,
  options: ScanOptions = {},
): ScreenerResult | null {
  if (data.length < 50) return null; // Not enough data

  const {
    period = Math.min(250, data.length),
    rsiPeriod = 14,
    macdFast = 12,
    macdSlow = 26,
    macdSignal = 9,
    bbPeriod = 20,
    sma50Period = 50,
    sma200Period = 200,
  } = options;

  const relevantData = data.slice(-period);
  const closes = relevantData.map((d) => d.close);
  const highs = relevantData.map((d) => d.high);
  const lows = relevantData.map((d) => d.low);

  const currentClose = closes[closes.length - 1];
  const currentVolume = relevantData[relevantData.length - 1].volume ?? 0;

  const prevCloseVal = previousClose ?? closes[closes.length - 2] ?? currentClose;
  const change = currentClose - prevCloseVal;
  const changePercent = prevCloseVal !== 0 ? (change / prevCloseVal) * 100 : 0;

  // Compute indicators
  const rsiVal = rsi(closes, rsiPeriod);
  const macdResult = macd(closes, macdFast, macdSlow, macdSignal);
  const sma50Val = sma(closes, sma50Period) ?? avg(closes.slice(-sma50Period));
  const sma200Val = sma(closes, sma200Period);
  const ema20Val = ema(closes, 20) ?? avg(closes.slice(-20));
  const bb = bollingerBands(closes, bbPeriod);
  const atrVal = atr(highs, lows, closes);

  if (!macdResult) return null;

  const indicators: IndicatorResult = {
    rsi: rsiVal,
    macd: macdResult,
    sma50: sma50Val,
    sma200: sma200Val,
    ema20: ema20Val,
    bollingerBands: bb,
    atr: atrVal,
  };

  // Interpret signals
  const rsiInterp = interpretRsi(rsiVal);
  const macdInterp = interpretMacd(macdResult);
  const smaInterp = interpretSma(currentClose, sma50Val, sma200Val);
  const bbInterp = interpretBollinger(currentClose, bb);

  const signals = {
    rsi: rsiInterp.signal,
    macd: macdInterp.signal,
    sma: smaInterp.signal,
    bollinger: bbInterp.signal,
  };

  // Determine overall signal
  const signalValues = [signals.rsi, signals.macd, signals.sma, signals.bollinger];
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
  } else if (buyCount >= 2 && sellCount === 0) {
    overallSignal = 'BUY';
    overallConfidence = 'LOW';
  } else if (sellCount >= 2 && buyCount === 0) {
    overallSignal = 'SELL';
    overallConfidence = 'LOW';
  } else {
    overallSignal = 'NEUTRAL';
    overallConfidence = 'LOW';
  }

  // Build one-line summary
  const summaryParts = [rsiInterp.detail, macdInterp.detail, smaInterp.detail, bbInterp.detail];
  const summary = summaryParts.join(' | ');

  return {
    symbol,
    price: currentClose,
    change,
    changePercent,
    volume: currentVolume,
    signals,
    overallSignal,
    overallConfidence,
    indicators,
    summary,
  };
}

export function scanSymbols(
  dataMap: Record<string, CandlestickData[]>,
  options?: ScanOptions,
): ScreenerResult[] {
  const results: ScreenerResult[] = [];

  for (const [symbol, data] of Object.entries(dataMap)) {
    const result = scanSymbol(data, symbol, undefined, options);
    if (result) results.push(result);
  }

  // Sort: BUY first, then NEUTRAL, then SELL
  const rank = (s: ScreenerResult) => (s.overallSignal === 'BUY' ? 0 : s.overallSignal === 'NEUTRAL' ? 1 : 2);
  results.sort((a, b) => rank(a) - rank(b) || b.indicators.rsi - a.indicators.rsi);

  return results;
}