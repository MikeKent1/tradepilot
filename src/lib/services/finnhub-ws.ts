// ─── Finnhub WebSocket Client ─────────────────────────────────────────
//
//  Singleton WebSocket client that connects to Finnhub's real-time
//  trade stream. Supports dynamic symbol subscriptions and exposes
//  a simple event-based API for consuming live price updates.
//
//  Usage:
//    const ws = getFinnhubWS();
//    ws.subscribe('AAPL');
//    ws.onPrice((symbol, price, volume, timestamp) => { ... });
//
//  Finnhub free tier: unlimited WebSocket connections, US stocks only.
//  Protocol: wss://ws.finnhub.io?token=YOUR_KEY
//  Subscribe:  {"type":"subscribe","symbol":"AAPL"}
//  Unsubscribe: {"type":"unsubscribe","symbol":"AAPL"}
//  Trade msg:  {"type":"trade","data":[{"p":156.78,"s":"AAPL","t":1700000000000,"v":100}]}
//  Ping msg:   {"type":"ping"}
//

const FINNHUB_WS_URL = 'wss://ws.finnhub.io';

type PriceCallback = (
  symbol: string,
  price: number,
  volume: number,
  timestamp: number,
) => void;

type ConnectionCallback = () => void;
type ErrorCallback = (error: string) => void;

interface TradeMessage {
  type: 'trade';
  data: Array<{
    p: number; // last price
    s: string; // symbol
    t: number; // UNIX milliseconds timestamp
    v: number; // volume
    c?: string[]; // trade conditions
  }>;
}

interface PingMessage {
  type: 'ping';
}

type FinnhubMessage = TradeMessage | PingMessage;

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

export interface FinnhubQuote {
  symbol: string;
  price: number;
  volume: number;
  timestamp: number;
  fetchedAt: string;
}

class FinnhubWebSocket {
  private ws: WebSocket | null = null;
  private apiKey: string;
  private subscribedSymbols: Set<string> = new Set();
  private pendingSubscriptions: Set<string> = new Set();

  // Connection state
  private _status: ConnectionStatus = 'disconnected';
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelayMs = 1_000; // starts at 1s, doubles each attempt
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private intentionalClose = false;

  // Latest price per symbol
  private latestPrices: Map<string, FinnhubQuote> = new Map();

  // Event listeners
  private priceListeners: PriceCallback[] = [];
  private connectionListeners: ConnectionCallback[] = [];
  private errorListeners: ErrorCallback[] = [];

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  // ════════════════════════════════════════════════════════════════
  // Public API
  // ════════════════════════════════════════════════════════════════

  get status(): ConnectionStatus {
    return this._status;
  }

  get symbolCount(): number {
    return this.subscribedSymbols.size;
  }

  /** Get latest cached quote for a symbol */
  getQuote(symbol: string): FinnhubQuote | undefined {
    return this.latestPrices.get(symbol);
  }

  /** Get all latest cached quotes */
  getAllQuotes(): FinnhubQuote[] {
    return Array.from(this.latestPrices.values());
  }

  /**
   * Subscribe to real-time trades for a symbol.
   *
   * If not connected, the subscription is queued and will be applied
   * once the connection is established. Safe to call multiple times;
   * duplicate symbols are ignored.
   */
  subscribe(symbol: string): void {
    const normalized = symbol.toUpperCase();
    if (this.subscribedSymbols.has(normalized)) return;

    this.subscribedSymbols.add(normalized);

    if (this._status === 'connected' && this.ws?.readyState === WebSocket.OPEN) {
      this.sendSubscribe(normalized);
    } else {
      this.pendingSubscriptions.add(normalized);
      if (this._status === 'disconnected') {
        this.connect();
      }
    }
  }

  /**
   * Unsubscribe from real-time trades for a symbol.
   */
  unsubscribe(symbol: string): void {
    const normalized = symbol.toUpperCase();
    if (!this.subscribedSymbols.has(normalized)) return;

    this.subscribedSymbols.delete(normalized);
    this.pendingSubscriptions.delete(normalized);

    if (this._status === 'connected' && this.ws?.readyState === WebSocket.OPEN) {
      this.sendUnsubscribe(normalized);
    }
  }

  /**
   * Subscribe to multiple symbols at once.
   */
  subscribeMany(symbols: string[]): void {
    const newSymbols = symbols
      .map((s) => s.toUpperCase())
      .filter((s) => !this.subscribedSymbols.has(s));

    if (newSymbols.length === 0) return;

    for (const s of newSymbols) {
      this.subscribedSymbols.add(s);
    }

    if (this._status === 'connected' && this.ws?.readyState === WebSocket.OPEN) {
      for (const s of newSymbols) {
        this.sendSubscribe(s);
      }
    } else {
      for (const s of newSymbols) {
        this.pendingSubscriptions.add(s);
      }
      if (this._status === 'disconnected') {
        this.connect();
      }
    }
  }

  /** Disconnect and clear all subscriptions */
  disconnect(): void {
    this.intentionalClose = true;
    this.cleanup();
    this.subscribedSymbols.clear();
    this.pendingSubscriptions.clear();
    this.latestPrices.clear();
    this.setStatus('disconnected');
  }

  // ── Event listeners ──────────────────────────────────────

  onPrice(cb: PriceCallback): () => void {
    this.priceListeners.push(cb);
    return () => {
      this.priceListeners = this.priceListeners.filter((l) => l !== cb);
    };
  }

  onConnectionChange(cb: ConnectionCallback): () => void {
    this.connectionListeners.push(cb);
    return () => {
      this.connectionListeners = this.connectionListeners.filter((l) => l !== cb);
    };
  }

  onError(cb: ErrorCallback): () => void {
    this.errorListeners.push(cb);
    return () => {
      this.errorListeners = this.errorListeners.filter((l) => l !== cb);
    };
  }

  // ════════════════════════════════════════════════════════════════
  // Internal
  // ════════════════════════════════════════════════════════════════

  private connect(): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.setStatus('connecting');

    const url = `${FINNHUB_WS_URL}?token=${this.apiKey}`;
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      this.setStatus('connected');
      this.reconnectAttempts = 0;
      this.reconnectDelayMs = 1_000;
      this.intentionalClose = false;

      // Re-subscribe pending symbols
      for (const s of this.pendingSubscriptions) {
        this.sendSubscribe(s);
      }
      this.pendingSubscriptions.clear();

      // Also re-subscribe any symbols that were active before reconnect
      for (const s of this.subscribedSymbols) {
        this.sendSubscribe(s);
      }

      // Start ping interval (Finnhub requires ping every 60s, we do 45s for safety)
      this.startPing();
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as FinnhubMessage;
        this.handleMessage(msg);
      } catch {
        // Ignore unparseable messages
      }
    };

    this.ws.onerror = () => {
      this.emitError('WebSocket error');
    };

    this.ws.onclose = (event) => {
      this.stopPing();

      if (!this.intentionalClose && this.subscribedSymbols.size > 0) {
        this.attemptReconnect();
      } else {
        this.setStatus('disconnected');
      }
    };
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.setStatus('disconnected');
      this.emitError('Max reconnection attempts reached');
      return;
    }

    this.setStatus('reconnecting');
    this.reconnectAttempts++;

    const delay = this.reconnectDelayMs * Math.pow(2, this.reconnectAttempts - 1);
    // Add jitter: ±25%
    const jitter = (Math.random() * 0.5 - 0.25) * delay;
    const jitteredDelay = Math.max(500, Math.round(delay + jitter));

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, jitteredDelay);
  }

  private cleanup(): void {
    this.stopPing();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onerror = null;
      this.ws.onclose = null;
      if (
        this.ws.readyState === WebSocket.OPEN ||
        this.ws.readyState === WebSocket.CONNECTING
      ) {
        this.ws.close();
      }
      this.ws = null;
    }
  }

  private startPing(): void {
    this.stopPing();
    this.pingTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 45_000);
  }

  private stopPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private sendSubscribe(symbol: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'subscribe', symbol }));
    }
  }

  private sendUnsubscribe(symbol: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'unsubscribe', symbol }));
    }
  }

  private handleMessage(msg: FinnhubMessage): void {
    if (msg.type === 'trade' && msg.data) {
      for (const trade of msg.data) {
        const quote: FinnhubQuote = {
          symbol: trade.s,
          price: trade.p,
          volume: trade.v,
          timestamp: trade.t,
          fetchedAt: new Date().toISOString(),
        };

        this.latestPrices.set(trade.s, quote);

        // Notify listeners
        for (const cb of this.priceListeners) {
          try {
            cb(trade.s, trade.p, trade.v, trade.t);
          } catch {
            // Swallow listener errors
          }
        }
      }
    }
    // Ping messages are ignored — we send our own
  }

  private setStatus(status: ConnectionStatus): void {
    const prev = this._status;
    this._status = status;
    if (prev !== status) {
      for (const cb of this.connectionListeners) {
        try {
          cb();
        } catch {
          // Swallow
        }
      }
    }
  }

  private emitError(message: string): void {
    for (const cb of this.errorListeners) {
      try {
        cb(message);
      } catch {
        // Swallow
      }
    }
  }
}

// ════════════════════════════════════════════════════════════════════
// Singleton
// ════════════════════════════════════════════════════════════════════

let instance: FinnhubWebSocket | null = null;

export function getFinnhubWS(): FinnhubWebSocket {
  if (!instance) {
    const apiKey = process.env.NEXT_PUBLIC_FINNHUB_API_KEY;
    if (!apiKey) {
      throw new Error(
        'Finnhub API key not configured. Set NEXT_PUBLIC_FINNHUB_API_KEY in .env.local',
      );
    }
    instance = new FinnhubWebSocket(apiKey);
  }
  return instance;
}

export { FinnhubWebSocket };
export default getFinnhubWS;