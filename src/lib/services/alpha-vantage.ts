// ─── Alpha Vantage Data Adapter ───────────────────────────────────────
//
//  Fetches daily OHLCV data from Alpha Vantage and normalises it
//  into the application’s CandlestickData format.
//

import type { CandlestickData } from '@/types';

const API_KEY = process.env.NEXT_PUBLIC_ALPHA_VANTAGE_API_KEY;
const BASE_URL = 'https://www.alphavantage.co/query';

export interface AlphaVantageError {
  error: string;
  detail?: string;
}

interface AlphaVantageDailyItem {
  '1. open': string;
  '2. high': string;
  '3. low': string;
  '4. close': string;
  '5. volume': string;
}

interface AlphaVantageResponse {
  'Time Series (Daily)': Record<string, AlphaVantageDailyItem>;
  'Error Message'?: string;
  Note?: string;
}

/**
 * Fetch daily candlestick data for a given symbol.
 * Returns up to `outputsize` bars (100 for compact, full for 20+ years).
 * Falls back with an error object if the API call fails.
 */
export async function fetchDailyCandles(
  symbol: string,
  outputsize: 'compact' | 'full' = 'compact',
): Promise<CandlestickData[] | AlphaVantageError> {
  if (!API_KEY) {
    return { error: 'Alpha Vantage API key not configured. Set NEXT_PUBLIC_ALPHA_VANTAGE_API_KEY in .env.local' };
  }

  const url = `${BASE_URL}?function=TIME_SERIES_DAILY&symbol=${encodeURIComponent(symbol)}&outputsize=${outputsize}&apikey=${API_KEY}`;

  let json: AlphaVantageResponse;
  try {
    const res = await fetch(url, { next: { revalidate: 300 } }); // ISR cache 5 min
    json = await res.json();
  } catch (err) {
    return { error: 'Network error fetching Alpha Vantage data', detail: String(err) };
  }

  // Handle API-level errors
  if (json['Error Message']) {
    return { error: json['Error Message'] };
  }

  // Rate limit note
  if (json.Note) {
    return { error: 'Alpha Vantage rate limit reached', detail: json.Note };
  }

  const timeSeries = json['Time Series (Daily)'];
  if (!timeSeries) {
    return { error: 'Unexpected Alpha Vantage response format', detail: JSON.stringify(Object.keys(json)) };
  }

  // Convert to CandlestickData[], sorted oldest → newest
  const candles: CandlestickData[] = Object.entries(timeSeries)
    .map(([date, item]) => ({
      time: date,
      open: parseFloat(item['1. open']),
      high: parseFloat(item['2. high']),
      low: parseFloat(item['3. low']),
      close: parseFloat(item['4. close']),
      volume: parseInt(item['5. volume'], 10),
    }))
    .sort((a, b) => a.time.localeCompare(b.time));

  return candles;
}

// ─── Live Quote ────────────────────────────────────────────────────────

interface AlphaVantageQuoteResponse {
  'Global Quote': {
    '01. symbol': string;
    '02. open': string;
    '03. high': string;
    '04. low': string;
    '05. price': string;
    '06. volume': string;
    '07. latest trading day': string;
    '08. previous close': string;
    '09. change': string;
    '10. change percent': string;
  };
  'Error Message'?: string;
  Note?: string;
}

export interface LiveQuote {
  symbol: string;
  price: number;
  open: number;
  high: number;
  low: number;
  volume: number;
  previousClose: number;
  change: number;
  changePercent: number;
  latestTradingDay: string;
  fetchedAt: string;
}

/**
 * Fetch a real-time quote for a single symbol.
 * Uses Alpha Vantage GLOBAL_QUOTE endpoint.
 * Rate limit: 5 calls/minute on free tier.
 */
export async function fetchQuote(symbol: string): Promise<LiveQuote | AlphaVantageError> {
  if (!API_KEY) {
    return { error: 'Alpha Vantage API key not configured. Set NEXT_PUBLIC_ALPHA_VANTAGE_API_KEY in .env.local' };
  }

  const url = `${BASE_URL}?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(symbol)}&apikey=${API_KEY}`;

  let json: AlphaVantageQuoteResponse;
  try {
    const res = await fetch(url);
    json = await res.json();
  } catch (err) {
    return { error: 'Network error fetching Alpha Vantage quote', detail: String(err) };
  }

  if (json['Error Message']) {
    return { error: json['Error Message'] };
  }
  if (json.Note) {
    return { error: 'Alpha Vantage rate limit reached', detail: json.Note };
  }

  const q = json['Global Quote'];
  if (!q || !q['05. price']) {
    return { error: 'Unexpected quote response format', detail: JSON.stringify(Object.keys(json)) };
  }

  return {
    symbol: q['01. symbol'] ?? symbol,
    price: parseFloat(q['05. price']),
    open: parseFloat(q['02. open']),
    high: parseFloat(q['03. high']),
    low: parseFloat(q['04. low']),
    volume: parseInt(q['06. volume'], 10),
    previousClose: parseFloat(q['08. previous close']),
    change: parseFloat(q['09. change']),
    changePercent: parseFloat((q['10. change percent'] ?? '0%').replace('%', '')),
    latestTradingDay: q['07. latest trading day'] ?? '',
    fetchedAt: new Date().toISOString(),
  };
}

// ════════════════════════════════════════════════════════════════════════
// Rate-Limit Tracking & Retry with Exponential Backoff + Jitter
// ════════════════════════════════════════════════════════════════════════

const FREE_TIER_RATE_LIMIT = 5; // calls per minute
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute

const BASE_RETRY_DELAY_MS = 1_000; // 1 second base
const MAX_RETRIES = 3;
const RATE_LIMIT_BACKOFF_MULTIPLIER = 12_000; // 12 seconds base for rate-limit backoff

/**
 * Internal rate-limit tracker shared across all fetch calls.
 *
 * Tracks call timestamps to proactively delay when we're approaching
 * the Alpha Vantage free-tier limit of 5 requests/minute.
 */
export class RateLimitTracker {
  private callTimestamps: number[] = [];
  private consecutiveRateLimitHits = 0;

  /**
   * Called when we're about to make an API call.
   * Returns a promise that resolves when it's safe to proceed.
   */
  async throttle(): Promise<void> {
    this.pruneOldTimestamps();

    // If we've recently hit a rate limit, apply a backoff before any new call
    if (this.consecutiveRateLimitHits > 0) {
      const backoffMs = this.consecutiveRateLimitBackoffMs();
      if (backoffMs > 0) {
        await this.delay(backoffMs);
      }
    }

    // If we're at or approaching the rate limit, wait until a slot opens
    if (this.callTimestamps.length >= FREE_TIER_RATE_LIMIT) {
      const oldestCall = this.callTimestamps[0];
      const waitMs = oldestCall + RATE_LIMIT_WINDOW_MS - Date.now();
      if (waitMs > 0) {
        await this.delay(waitMs);
        this.pruneOldTimestamps();
      }
    }

    this.callTimestamps.push(Date.now());
  }

  /** Record a successful API call (resets backoff counters) */
  recordSuccess(): void {
    this.consecutiveRateLimitHits = Math.max(0, this.consecutiveRateLimitHits - 1);
  }

  /** Record a rate-limit hit (increases backoff) */
  recordRateLimitHit(): void {
    this.consecutiveRateLimitHits++;
    // Also remove the timestamp we just added in throttle() since it failed
    if (this.callTimestamps.length > 0) {
      this.callTimestamps.pop();
    }
  }

  getConsecutiveRateLimitHits(): number {
    return this.consecutiveRateLimitHits;
  }

  /** Reset all tracking state */
  reset(): void {
    this.callTimestamps = [];
    this.consecutiveRateLimitHits = 0;
  }

  // ── Private helpers ──────────────────────────────────

  private pruneOldTimestamps(): void {
    const cutoff = Date.now() - RATE_LIMIT_WINDOW_MS;
    this.callTimestamps = this.callTimestamps.filter((t) => t > cutoff);
  }

  private consecutiveRateLimitBackoffMs(): number {
    // Exponential backoff: 12s * 2^(hits-1), capped at ~4 minutes
    const exponent = Math.min(this.consecutiveRateLimitHits, 6);
    return RATE_LIMIT_BACKOFF_MULTIPLIER * Math.pow(2, exponent - 1);
  }

  private delay(ms: number): Promise<void> {
    // Add jitter: ±25% of the delay
    const jitter = (Math.random() * 0.5 - 0.25) * ms;
    const jitteredMs = Math.max(100, Math.round(ms + jitter));
    return new Promise((resolve) => setTimeout(resolve, jitteredMs));
  }
}

// Singleton instance
let globalRateTracker: RateLimitTracker | null = null;

export function getRateLimitTracker(): RateLimitTracker {
  if (!globalRateTracker) {
    globalRateTracker = new RateLimitTracker();
  }
  return globalRateTracker;
}

/**
 * Retry-enabled wrapper around fetchQuote().
 *
 * Features:
 * - Exponential backoff with jitter (1s → 2s → 4s base)
 * - Proactive rate-limit throttling via RateLimitTracker
 * - Stronger backoff on actual rate-limit responses (12s base)
 * - Up to `maxRetries` attempts before returning the error
 */
export async function fetchQuoteWithRetry(
  symbol: string,
  options: {
    maxRetries?: number;
    rateTracker?: RateLimitTracker;
  } = {},
): Promise<LiveQuote | AlphaVantageError> {
  const maxRetries = options.maxRetries ?? MAX_RETRIES;
  const rateTracker = options.rateTracker ?? getRateLimitTracker();

  let lastError: AlphaVantageError | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Proactive rate-limit throttling
      await rateTracker.throttle();

      const result = await fetchQuote(symbol);

      if ('error' in result) {
        const isRateLimit =
          result.error.includes('rate limit') ||
          result.detail?.includes('rate limit') ||
          result.detail?.includes('standard API rate limit') ||
          result.detail?.includes('Thank you for using Alpha Vantage');

        if (isRateLimit && attempt < maxRetries) {
          rateTracker.recordRateLimitHit();
          const backoffMs = computeRateLimitBackoff(attempt);
          await delayWithJitter(backoffMs);
          continue;
        }

        // Other errors or final attempt — return as-is
        lastError = result;
        if (attempt < maxRetries) {
          const backoffMs = computeRetryBackoff(attempt);
          await delayWithJitter(backoffMs);
          continue;
        }
        rateTracker.reset(); // hard reset on persistent failure
        return lastError;
      }

      // Success
      rateTracker.recordSuccess();
      return result;

    } catch (err) {
      lastError = { error: 'Unexpected error in retry loop', detail: String(err) };
      if (attempt < maxRetries) {
        const backoffMs = computeRetryBackoff(attempt);
        await delayWithJitter(backoffMs);
        continue;
      }
    }
  }

  rateTracker.reset();
  return lastError ?? { error: 'Max retries exhausted' };
}

// ── Math Helpers ──────────────────────────────────────────────────

function computeRetryBackoff(attempt: number): number {
  // 1s → 2s → 4s
  return BASE_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
}

function computeRateLimitBackoff(attempt: number): number {
  // 12s → 24s → 48s
  return RATE_LIMIT_BACKOFF_MULTIPLIER * Math.pow(2, attempt - 1);
}

function delayWithJitter(ms: number): Promise<void> {
  const jitter = (Math.random() * 0.5 - 0.25) * ms;
  const jitteredMs = Math.max(100, Math.round(ms + jitter));
  return new Promise((resolve) => setTimeout(resolve, jitteredMs));
}
