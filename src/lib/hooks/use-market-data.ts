'use client';

import { useQuery } from '@tanstack/react-query';
import { useState, useEffect, useRef } from 'react';
import type { CandlestickData } from '@/types';

// ─── Types ─────────────────────────────────────────────────

export interface MarketDataResult {
  symbol: string;
  name: string;
  price: number;
  change: number;
  change_percent: number;
  open: number;
  high: number;
  low: number;
  previousClose: number;
  volume: number;
  intraday: CandlestickData[];
  lastRefreshed: string | null;
}

interface AlphaVantageDailyEntry {
  '1. open': string;
  '2. high': string;
  '3. low': string;
  '4. close': string;
  '5. volume': string;
}

interface AlphaVantageIntradayEntry {
  '1. open': string;
  '2. high': string;
  '3. low': string;
  '4. close': string;
  '5. volume': string;
}

interface AlphaVantageDailyResponse {
  'Meta Data'?: {
    '2. Symbol': string;
    '3. Last Refreshed': string;
  };
  'Time Series (Daily)'?: Record<string, AlphaVantageDailyEntry>;
  Note?: string;
  'Error Message'?: string;
  Information?: string;
}

interface AlphaVantageIntradayResponse {
  'Meta Data'?: {
    '2. Symbol': string;
    '3. Last Refreshed': string;
  };
  'Time Series (5min)'?: Record<string, AlphaVantageIntradayEntry>;
  Note?: string;
  'Error Message'?: string;
  Information?: string;
}

interface AlphaVantageQuoteEntry {
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
}

interface AlphaVantageQuoteResponse {
  'Global Quote'?: AlphaVantageQuoteEntry;
  Note?: string;
  'Error Message'?: string;
  Information?: string;
}

export interface SymbolSearchResult {
  symbol: string;
  name: string;
  type: string;
  region: string;
  currency: string;
}

interface AlphaVantageSearchEntry {
  '1. symbol': string;
  '2. name': string;
  '3. type': string;
  '4. region': string;
  '8. currency': string;
}

interface AlphaVantageSearchResponse {
  bestMatches?: AlphaVantageSearchEntry[];
  Note?: string;
  'Error Message'?: string;
  Information?: string;
}

// ─── API key helper (env → localStorage fallback) ───────────

function getApiKey(): string | null {
  const envKey = process.env.NEXT_PUBLIC_ALPHA_VANTAGE_API_KEY ?? '';
  if (envKey && envKey.length > 0) return envKey;

  if (typeof window !== 'undefined') {
    try {
      const lsKey = localStorage.getItem('tradepilot:alphaVantageKey');
      if (lsKey) {
        const parsed = JSON.parse(lsKey) as string;
        if (parsed && parsed.length > 0) return parsed;
      }
    } catch {
      /* ignore */
    }
  }

  return null;
}

// ─── Build Alpha Vantage URL ─────────────────────────────────

function buildUrl(func: string, symbol: string, key: string, extra: Record<string, string> = {}): string {
  const params = new URLSearchParams({ function: func, symbol, apikey: key });
  Object.entries(extra).forEach(([k, v]) => params.append(k, v));
  return `https://www.alphavantage.co/query?${params.toString()}`;
}

// ─── Fetcher: TIME_SERIES_INTRADAY (5min) for 1D charts ────

async function fetchIntraday(symbol: string): Promise<MarketDataResult> {
  const key = getApiKey();
  if (!key) throw new Error('NO_API_KEY');

  const url = buildUrl('TIME_SERIES_INTRADAY', symbol, key, { interval: '5min', outputsize: 'full' });

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Alpha Vantage responded with status ${res.status}`);

  const json: AlphaVantageIntradayResponse = await res.json();

  if (json.Note) throw new Error(`API rate limit: ${json.Note}`);
  if (json['Error Message']) throw new Error(`API error: ${json['Error Message']}`);
  if (json.Information) throw new Error(`API info: ${json.Information}`);

  const timeSeries = json['Time Series (5min)'];
  if (!timeSeries) throw new Error(`No intraday data returned for ${symbol}`);

  const timestamps = Object.keys(timeSeries).sort((a, b) => a.localeCompare(b)); // oldest → newest
  const latestTs = timestamps[timestamps.length - 1];
  const latest = timeSeries[latestTs];
  const latestClose = Number(latest['4. close']);
  const latestOpen = Number(latest['1. open']);
  const latestHigh = Number(latest['2. high']);
  const latestLow = Number(latest['3. low']);

  const firstTs = timestamps[0];
  const previousClose = Number(timeSeries[firstTs]['4. close']);
  const change = latestClose - previousClose;
  const changePercent = previousClose !== 0 ? (change / previousClose) * 100 : 0;

  const intraday: CandlestickData[] = timestamps.map((ts) => {
    const bar = timeSeries[ts];
    return {
      time: ts,
      open: Number(bar['1. open']),
      high: Number(bar['2. high']),
      low: Number(bar['3. low']),
      close: Number(bar['4. close']),
      volume: Number(bar['5. volume']),
    };
  });

  return {
    symbol: json['Meta Data']?.['2. Symbol'] ?? symbol,
    name: symbol,
    price: latestClose,
    change,
    change_percent: changePercent,
    open: latestOpen,
    high: latestHigh,
    low: latestLow,
    previousClose,
    volume: Number(latest['5. volume']),
    intraday,
    lastRefreshed: json['Meta Data']?.['3. Last Refreshed'] ?? latestTs,
  };
}

// ─── Fetcher: TIME_SERIES_DAILY for longer timeframes ───────

async function fetchMarketData(symbol: string): Promise<MarketDataResult> {
  const key = getApiKey();
  if (!key) throw new Error('NO_API_KEY');

  const url = buildUrl('TIME_SERIES_DAILY', symbol, key, { outputsize: 'compact' });

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Alpha Vantage responded with status ${res.status}`);

  const json: AlphaVantageDailyResponse = await res.json();

  if (json.Note) throw new Error(`API rate limit: ${json.Note}`);
  if (json['Error Message']) throw new Error(`API error: ${json['Error Message']}`);
  if (json.Information) throw new Error(`API info: ${json.Information}`);

  const timeSeries = json['Time Series (Daily)'];
  if (!timeSeries) throw new Error(`No daily data returned for ${symbol}`);

  const timestamps = Object.keys(timeSeries).sort((a, b) => b.localeCompare(a)); // newest → oldest
  const latestTimestamp = timestamps[0];
  const latest = timeSeries[latestTimestamp];
  const latestClose = Number(latest['4. close']);
  const latestOpen = Number(latest['1. open']);
  const latestHigh = Number(latest['2. high']);
  const latestLow = Number(latest['3. low']);

  const secondTimestamp = timestamps.length > 1 ? timestamps[1] : latestTimestamp;
  const previousClose = Number(timeSeries[secondTimestamp]['4. close']);
  const change = latestClose - previousClose;
  const changePercent = previousClose !== 0 ? (change / previousClose) * 100 : 0;

  const intraday: CandlestickData[] = timestamps.reverse().map((ts) => {
    const bar = timeSeries[ts];
    return {
      time: ts,
      open: Number(bar['1. open']),
      high: Number(bar['2. high']),
      low: Number(bar['3. low']),
      close: Number(bar['4. close']),
      volume: Number(bar['5. volume']),
    };
  });

  // Aggregate daily into weekly
  const weekly: CandlestickData[] = [];
  let weekBars: CandlestickData[] = [];
  timestamps.forEach((ts) => {
    const bar = timeSeries[ts];
    weekBars.push({
      time: ts,
      open: Number(bar['1. open']),
      high: Number(bar['2. high']),
      low: Number(bar['3. low']),
      close: Number(bar['4. close']),
      volume: Number(bar['5. volume']),
    });
    const d = new Date(ts + 'T00:00:00');
    if (d.getDay() === 5 || weekBars.length >= 5) { // Friday or enough days
      if (weekBars.length > 0) {
        weekly.push({
          time: weekBars[weekBars.length - 1].time,
          open: weekBars[0].open,
          high: Math.max(...weekBars.map((b) => b.high)),
          low: Math.min(...weekBars.map((b) => b.low)),
          close: weekBars[weekBars.length - 1].close,
          volume: weekBars.reduce((s, b) => s + b.volume, 0),
        });
        weekBars = [];
      }
    }
  });
  if (weekBars.length > 0) {
    weekly.push({
      time: weekBars[weekBars.length - 1].time,
      open: weekBars[0].open,
      high: Math.max(...weekBars.map((b) => b.high)),
      low: Math.min(...weekBars.map((b) => b.low)),
      close: weekBars[weekBars.length - 1].close,
      volume: weekBars.reduce((s, b) => s + b.volume, 0),
    });
  }

  return {
    symbol: json['Meta Data']?.['2. Symbol'] ?? symbol,
    name: symbol,
    price: latestClose,
    change,
    change_percent: changePercent,
    open: latestOpen,
    high: latestHigh,
    low: latestLow,
    previousClose,
    volume: Number(latest['5. volume']),
    intraday,
    lastRefreshed: json['Meta Data']?.['3. Last Refreshed'] ?? latestTimestamp,
  };
}

// ─── Quote-only fetcher (GLOBAL_QUOTE – free tier) ─────────

async function fetchQuote(symbol: string): Promise<MarketDataResult | null> {
  const key = getApiKey();
  if (!key) throw new Error('NO_API_KEY');

  const url = buildUrl('GLOBAL_QUOTE', symbol, key);
  const res = await fetch(url);

  if (!res.ok) throw new Error(`Alpha Vantage responded with status ${res.status}`);

  const json: AlphaVantageQuoteResponse = await res.json();

  if (json.Note) throw new Error(`API rate limit: ${json.Note}`);
  if (json['Error Message']) throw new Error(`API error: ${json['Error Message']}`);
  if (json.Information) throw new Error(`API info: ${json.Information}`);

  const quote = json['Global Quote'];
  if (!quote) return null;

  return {
    symbol: quote['01. symbol'] ?? symbol,
    name: symbol,
    price: Number(quote['05. price']),
    change: Number(quote['09. change']),
    change_percent: parseFloat((quote['10. change percent'] ?? '0%').replace('%', '')),
    open: Number(quote['02. open']),
    high: Number(quote['03. high']),
    low: Number(quote['04. low']),
    previousClose: Number(quote['08. previous close']),
    volume: Number(quote['06. volume']),
    intraday: [],
    lastRefreshed: quote['07. latest trading day'] ?? null,
  };
}

// ─── Symbol search ─────────────────────────────────────────

async function fetchSymbolSearch(keywords: string): Promise<SymbolSearchResult[]> {
  const key = getApiKey();
  if (!key) throw new Error('NO_API_KEY');

  const params = new URLSearchParams({
    function: 'SYMBOL_SEARCH',
    keywords,
    apikey: key,
  });
  const url = `https://www.alphavantage.co/query?${params.toString()}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Alpha Vantage responded with status ${res.status}`);

  const json: AlphaVantageSearchResponse = await res.json();

  if (json.Note) throw new Error(`API rate limit: ${json.Note}`);
  if (json['Error Message']) throw new Error(`API error: ${json['Error Message']}`);
  if (json.Information) throw new Error(`API info: ${json.Information}`);

  if (!json.bestMatches) return [];

  return json.bestMatches.map((m) => ({
    symbol: m['1. symbol'],
    name: m['2. name'],
    type: m['3. type'],
    region: m['4. region'],
    currency: m['8. currency'],
  }));
}

// ─── Helpers ────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Default symbols ────────────────────────────────────────

const DEFAULT_SYMBOLS = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA'];

// ─── Hooks ──────────────────────────────────────────────────

/**
 * Fetch intraday (5min) data — best for 1D timeframe.
 */
export function useIntradayData(symbol: string) {
  const [warned, setWarned] = useState(false);

  useEffect(() => {
    if (!getApiKey() && !warned) {
      console.warn('[Strategy Lab] No Alpha Vantage API key found.');
      setWarned(true);
    }
  }, [warned]);

  return useQuery<MarketDataResult, Error>({
    queryKey: ['intraday', symbol],
    queryFn: () => fetchIntraday(symbol),
    refetchInterval: 300_000,
    staleTime: 250_000,
    retry: (failureCount, error) => {
      if (error.message === 'NO_API_KEY') return false;
      return failureCount < 2;
    },
    retryDelay: 15_000,
  });
}

/**
 * Fetch daily data — best for 1W, 1M, 3M, 1Y timeframes.
 */
export function useMarketData(symbol: string) {
  const [warned, setWarned] = useState(false);

  useEffect(() => {
    if (!getApiKey() && !warned) {
      console.warn('[Strategy Lab] No Alpha Vantage API key found.');
      setWarned(true);
    }
  }, [warned]);

  return useQuery<MarketDataResult, Error>({
    queryKey: ['market-data', symbol],
    queryFn: () => fetchMarketData(symbol),
    refetchInterval: 300_000,
    staleTime: 250_000,
    retry: (failureCount, error) => {
      if (error.message === 'NO_API_KEY') return false;
      return failureCount < 2;
    },
    retryDelay: 15_000,
  });
}

/**
 * Fetch quotes for multiple symbols at once.
 */
export function useMultiMarketData(symbols: string[] = DEFAULT_SYMBOLS) {
  const [warned, setWarned] = useState(false);

  useEffect(() => {
    if (!getApiKey() && !warned) {
      console.warn('[Strategy Lab] No Alpha Vantage API key found.');
      setWarned(true);
    }
  }, [warned]);

  return useQuery<Record<string, MarketDataResult>, Error>({
    queryKey: ['market-data-multi', ...symbols],
    queryFn: async () => {
      const key = getApiKey();
      if (!key) throw new Error('NO_API_KEY');

      const record: Record<string, MarketDataResult> = {};

      for (let i = 0; i < symbols.length; i++) {
        const sym = symbols[i];
        try {
          const data = await fetchQuote(sym);
          if (data) record[sym] = data;
        } catch {
          /* skip */
        }
        if (i < symbols.length - 1) await delay(1_200);
      }

      return record;
    },
    refetchInterval: 120_000,
    staleTime: 115_000,
    retry: (failureCount, error) => {
      if (error.message === 'NO_API_KEY') return false;
      return failureCount < 2;
    },
    retryDelay: 5_000,
  });
}

/**
 * Search symbols via Alpha Vantage SYMBOL_SEARCH.
 * Enabled only when query is 2+ chars.
 */
export function useSymbolSearch(query: string) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debounced, setDebounced] = useState('');

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebounced(query.trim()), 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  return useQuery<SymbolSearchResult[], Error>({
    queryKey: ['symbol-search', debounced],
    queryFn: () => fetchSymbolSearch(debounced),
    enabled: debounced.length >= 2,
    staleTime: 60_000,
    retry: false,
  });
}

export { DEFAULT_SYMBOLS, getApiKey };