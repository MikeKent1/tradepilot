'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  fetchQuoteWithRetry,
  getRateLimitTracker,
  type LiveQuote,
} from '@/lib/services/alpha-vantage';
import {
  getFinnhubWS,
  type FinnhubQuote,
  type ConnectionStatus,
} from '@/lib/services/finnhub-ws';

// ════════════════════════════════════════════════════════════════════════
// usePriceFeed — Real-time price feed hook (multi-provider)
//
//  Supports two providers:
//    'alpha-vantage' — Polling via GLOBAL_QUOTE, rate-limit-aware
//    'finnhub'       — WebSocket streaming, real-time trades, no rate limits
//
//  The hook exposes the same PriceFeedResult interface regardless of
//  provider, making it a drop-in replacement.
//
//  Usage:
//    const { quotes, isPolling, error, start, stop } = usePriceFeed({
//      symbols: ['AAPL', 'TSLA'],
//      provider: 'finnhub',          // or 'alpha-vantage'
//      intervalMs: 30_000,           // only for alpha-vantage
//    });
// ════════════════════════════════════════════════════════════════════════

export interface PriceFeedOptions {
  symbols: string[];
  /**
   * Data provider to use.
   *  - 'alpha-vantage': batch polling (default, 5 calls/min free tier limit)
   *  - 'finnhub':       WebSocket streaming (real-time, no rate limits)
   */
  provider?: 'alpha-vantage' | 'finnhub';
  /** Polling interval in milliseconds (default: 60s). Only used by alpha-vantage. */
  intervalMs?: number;
  /** Auto-start polling on mount */
  autoStart?: boolean;
  /** Max concurrent in-flight requests (alpha-vantage only) */
  batchSize?: number;
  /** Delay between batches to avoid rate limits (alpha-vantage only) */
  batchDelayMs?: number;
  /**
   * Maximum retry attempts per quote fetch (alpha-vantage only).
   * When a fetch fails with a rate limit (HTTP 429 or AV Note),
   * the retry layer backs off exponentially before the next attempt.
   * Default: 3
   */
  maxRetries?: number;
}

export interface PriceFeedQuote {
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
  lastUpdated: string;
  fetchedAt: string;
  previousPrice?: number;
  changeFromLast?: number;
}

export interface PriceFeedResult {
  /** Map of symbol → latest quote */
  quotes: Map<string, PriceFeedQuote>;
  /** Get a quote by symbol */
  getQuote: (symbol: string) => PriceFeedQuote | undefined;
  /** All quotes as an array (sorted alphabetically) */
  quotesList: PriceFeedQuote[];
  /** Whether the feed is active (polling or connected) */
  isPolling: boolean;
  /** Number of successful polls (alpha-vantage only, 0 for finnhub) */
  pollsCount: number;
  /** Number of consecutive errors */
  errorCount: number;
  /** Latest error message */
  error: string | null;
  /** Total number of errors */
  totalErrors: number;
  /** Whether the rate-limit tracker is currently in backoff mode */
  isRateLimited: boolean;
  /** Number of consecutive rate-limit hits tracked by the global tracker */
  consecutiveRateLimitHits: number;
  /** WebSocket connection status (Finnhub only) */
  wsStatus: ConnectionStatus | null;
  /** Number of subscribed symbols via WebSocket */
  wsSymbolCount: number;
  /** Start (or restart) the feed */
  start: () => void;
  /** Stop the feed */
  stop: () => void;
  /** Force an immediate poll (alpha-vantage only) */
  pollNow: () => Promise<void>;
  /** Reset the global rate-limit tracker (alpha-vantage only) */
  resetRateTracker: () => void;
}

/**
 * Convert a FinnhubQuote (WebSocket trade) into a PriceFeedQuote
 * compatible with the common interface.
 */
function finnhubToPriceFeed(
  fq: FinnhubQuote,
  prevPrice?: number,
): PriceFeedQuote {
  const change = prevPrice != null ? fq.price - prevPrice : 0;
  const changePercent = prevPrice != null && prevPrice !== 0
    ? ((fq.price - prevPrice) / prevPrice) * 100
    : 0;

  return {
    symbol: fq.symbol,
    price: fq.price,
    open: fq.price,        // Finnhub trades don't include daily open
    high: fq.price,        // use current price as best-effort
    low: fq.price,
    volume: fq.volume,
    previousClose: prevPrice ?? fq.price,
    change,
    changePercent,
    latestTradingDay: new Date(fq.timestamp).toISOString().split('T')[0],
    lastUpdated: fq.fetchedAt,
    fetchedAt: fq.fetchedAt,
    previousPrice: prevPrice,
    changeFromLast: prevPrice != null
      ? parseFloat(((change / prevPrice) * 100).toFixed(3))
      : undefined,
  };
}

/**
 * Convert a LiveQuote (Alpha Vantage) into a PriceFeedQuote
 * compatible with the common interface.
 */
function avQuoteToPriceFeed(
  q: LiveQuote,
  prevPrice?: number,
): PriceFeedQuote {
  return {
    ...q,
    lastUpdated: q.fetchedAt,
    previousPrice: prevPrice,
    changeFromLast:
      prevPrice != null
        ? parseFloat(
            (((q.price - prevPrice) / prevPrice) * 100).toFixed(3),
          )
        : undefined,
  };
}

// ════════════════════════════════════════════════════════════════════════
// Hook
// ════════════════════════════════════════════════════════════════════════

export function usePriceFeed(options: PriceFeedOptions): PriceFeedResult {
  const {
    symbols,
    provider = 'alpha-vantage',
    intervalMs = 60_000,
    autoStart = true,
    batchSize = 3,
    batchDelayMs = 2_000,
    maxRetries = 3,
  } = options;

  const [quotesMap, setQuotesMap] = useState<Map<string, PriceFeedQuote>>(
    new Map(),
  );
  const [isPolling, setIsPolling] = useState(false);
  const [pollsCount, setPollsCount] = useState(0);
  const [errorCount, setErrorCount] = useState(0);
  const [totalErrors, setTotalErrors] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isRateLimited, setIsRateLimited] = useState(false);
  const [consecutiveRateLimitHits, setConsecutiveRateLimitHits] = useState(0);
  const [wsStatus, setWsStatus] = useState<ConnectionStatus | null>(null);
  const [wsSymbolCount, setWsSymbolCount] = useState(0);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const symbolsRef = useRef(symbols);
  symbolsRef.current = symbols;

  // Keep a ref to the previous quotes for change tracking
  const prevQuotesRef = useRef<Map<string, number>>(new Map());

  // Shared rate-limit tracker (singleton)
  const rateTracker = getRateLimitTracker();

  // ── Alpha Vantage: fetch helpers ────────────────────────

  const fetchBatch = useCallback(
    async (batch: string[]): Promise<LiveQuote[]> => {
      const results = await Promise.allSettled(
        batch.map((sym) =>
          fetchQuoteWithRetry(sym, { maxRetries, rateTracker }),
        ),
      );

      const quotes: LiveQuote[] = [];
      let hasRateLimit = false;

      for (const r of results) {
        if (r.status === 'fulfilled' && !('error' in r.value)) {
          quotes.push(r.value as LiveQuote);
        } else if (r.status === 'fulfilled' && 'error' in r.value) {
          const err = r.value as { error: string; detail?: string };
          if (
            err.error.includes('rate limit') ||
            err.detail?.includes('rate limit')
          ) {
            hasRateLimit = true;
          }
        }
      }

      const hits = rateTracker.getConsecutiveRateLimitHits();
      setConsecutiveRateLimitHits(hits);
      setIsRateLimited(hits > 0 || hasRateLimit);

      return quotes;
    },
    [maxRetries, rateTracker],
  );

  const doPoll = useCallback(async () => {
    const currentSymbols = symbolsRef.current;
    if (currentSymbols.length === 0) return;

    try {
      const allQuotes: LiveQuote[] = [];

      for (let i = 0; i < currentSymbols.length; i += batchSize) {
        const batch = currentSymbols.slice(i, i + batchSize);
        const batchQuotes = await fetchBatch(batch);
        allQuotes.push(...batchQuotes);

        if (i + batchSize < currentSymbols.length) {
          await new Promise((resolve) => setTimeout(resolve, batchDelayMs));
        }
      }

      if (allQuotes.length > 0) {
        setQuotesMap((prev) => {
          const next = new Map(prev);
          const prevSnapshot = prevQuotesRef.current;

          for (const q of allQuotes) {
            const previousPrice = prevSnapshot.get(q.symbol);
            const feedQuote = avQuoteToPriceFeed(q, previousPrice);
            next.set(q.symbol, feedQuote);
            prevSnapshot.set(q.symbol, q.price);
          }

          return next;
        });

        setPollsCount((c) => c + 1);
        setErrorCount(0);
        setError(null);
        setIsRateLimited(false);
      } else {
        setErrorCount((c) => c + 1);
        setTotalErrors((c) => c + 1);
      }
    } catch (err) {
      const msg = String(err);
      setError(msg);
      setErrorCount((c) => c + 1);
      setTotalErrors((c) => c + 1);
    }
  }, [fetchBatch, batchSize, batchDelayMs]);

  const startAV = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setIsPolling(true);
    doPoll();
    intervalRef.current = setInterval(doPoll, intervalMs);
  }, [doPoll, intervalMs]);

  const stopAV = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsPolling(false);
  }, []);

  const resetRateTracker = useCallback(() => {
    rateTracker.reset();
    setIsRateLimited(false);
    setConsecutiveRateLimitHits(0);
  }, [rateTracker]);

  // ── Finnhub: WebSocket integration ──────────────────────

  const wsRef = useRef<ReturnType<typeof getFinnhubWS> | null>(null);

  const startFinnhub = useCallback(() => {
    let ws: ReturnType<typeof getFinnhubWS>;
    try {
      ws = getFinnhubWS();
    } catch (err) {
      setError(String(err));
      return;
    }
    wsRef.current = ws;

    setIsPolling(true);

    // Subscribe to all symbols
    ws.subscribeMany(symbolsRef.current);
    setWsSymbolCount(ws.symbolCount);
    setWsStatus(ws.status);

    // Listen for price updates
    const unsubPrice = ws.onPrice((sym, price, volume, timestamp) => {
      setQuotesMap((prev) => {
        const next = new Map(prev);
        const prevSnapshot = prevQuotesRef.current;
        const previousPrice = prevSnapshot.get(sym);

        const fq: FinnhubQuote = {
          symbol: sym,
          price,
          volume,
          timestamp,
          fetchedAt: new Date().toISOString(),
        };

        next.set(sym, finnhubToPriceFeed(fq, previousPrice));
        prevSnapshot.set(sym, price);
        return next;
      });
    });

    // Connection change listener
    const unsubConn = ws.onConnectionChange(() => {
      setWsStatus(ws.status);
      setWsSymbolCount(ws.symbolCount);
      if (ws.status === 'connected') {
        setError(null);
        setErrorCount(0);
      }
    });

    // Error listener
    const unsubErr = ws.onError((msg) => {
      setError(msg);
      setErrorCount((c) => c + 1);
      setTotalErrors((c) => c + 1);
    });

    // Store cleanup functions
    wsRef.current = ws;
    (wsRef as unknown as Record<string, unknown>)._unsubPrice = unsubPrice;
    (wsRef as unknown as Record<string, unknown>)._unsubConn = unsubConn;
    (wsRef as unknown as Record<string, unknown>)._unsubErr = unsubErr;
  }, []);

  const stopFinnhub = useCallback(() => {
    const ws = wsRef.current;
    if (!ws) return;

    // Unsubscribe from all symbols
    for (const sym of symbolsRef.current) {
      ws.unsubscribe(sym);
    }

    // Remove listeners
    const unsubPrice = (wsRef as unknown as Record<string, unknown>)._unsubPrice as (() => void) | undefined;
    const unsubConn = (wsRef as unknown as Record<string, unknown>)._unsubConn as (() => void) | undefined;
    const unsubErr = (wsRef as unknown as Record<string, unknown>)._unsubErr as (() => void) | undefined;

    unsubPrice?.();
    unsubConn?.();
    unsubErr?.();

    setIsPolling(false);
    setWsStatus('disconnected');
    setWsSymbolCount(0);
  }, []);

  // ── Unified start/stop ──────────────────────────────────

  const activeProviderRef = useRef(provider);
  activeProviderRef.current = provider;

  const start = useCallback(() => {
    if (activeProviderRef.current === 'finnhub') {
      startFinnhub();
    } else {
      startAV();
    }
  }, [startAV, startFinnhub]);

  const stop = useCallback(() => {
    if (activeProviderRef.current === 'finnhub') {
      stopFinnhub();
    } else {
      stopAV();
    }
  }, [stopAV, stopFinnhub]);

  // Auto-start on mount or when provider/symbols change
  useEffect(() => {
    if (autoStart) {
      start();
    }
    return () => stop();
  }, [autoStart, provider]); // eslint-disable-line react-hooks/exhaustive-deps

  // Restart if symbols change
  useEffect(() => {
    if (isPolling) {
      start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbols.join(',')]);

  // ── Helpers ─────────────────────────────────────────────

  const getQuote = useCallback(
    (symbol: string) => quotesMap.get(symbol),
    [quotesMap],
  );

  const quotesList = Array.from(quotesMap.values()).sort((a, b) =>
    a.symbol.localeCompare(b.symbol),
  );

  return {
    quotes: quotesMap,
    getQuote,
    quotesList,
    isPolling,
    pollsCount: provider === 'alpha-vantage' ? pollsCount : 0,
    errorCount,
    error,
    totalErrors,
    isRateLimited,
    consecutiveRateLimitHits,
    wsStatus: provider === 'finnhub' ? wsStatus : null,
    wsSymbolCount,
    start,
    stop,
    pollNow: provider === 'alpha-vantage' ? doPoll : async () => {},
    resetRateTracker,
  };
}