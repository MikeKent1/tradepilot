// ─── Alpaca Trading Client ───────────────────────────────────────────
//
//  REST API client for Alpaca's Paper Trading API.
//  Keys are server-side only — all requests go through Next.js API routes.
//
//  Alpaca Paper Trading base URL: https://paper-api.alpaca.markets
//  Docs: https://docs.alpaca.markets/reference/
//
//  Endpoints implemented:
//    GET  /v2/account          – account info (cash, equity, buying_power, etc.)
//    GET  /v2/positions        – list open positions
//    GET  /v2/positions/{sym}  – single position detail
//    GET  /v2/orders           – list orders (with status filter)
//    POST /v2/orders           – place new order
//    DELETE /v2/positions/{sym} – close position
//    GET  /v2/assets           – list tradeable assets
//    GET  /v2/clock            – market clock (is_open, next_open, etc.)
//
//  Usage (from server-side code / API routes):
//    const alpaca = getAlpacaClient();
//    const account = await alpaca.getAccount();
//    const order = await alpaca.placeOrder({ symbol: 'AAPL', qty: 1, side: 'buy', ... });
//

// ════════════════════════════════════════════════════════════════════
// Types
// ════════════════════════════════════════════════════════════════════

export type AlpacaOrderSide = 'buy' | 'sell';
export type AlpacaOrderType = 'market' | 'limit' | 'stop' | 'stop_limit' | 'trailing_stop';
export type AlpacaTimeInForce = 'day' | 'gtc' | 'opg' | 'cls' | 'ioc' | 'fok';
export type AlpacaOrderStatus =
  | 'new'
  | 'partially_filled'
  | 'filled'
  | 'done_for_day'
  | 'canceled'
  | 'expired'
  | 'replaced'
  | 'pending_cancel'
  | 'pending_replace'
  | 'accepted'
  | 'pending_new'
  | 'accepted_for_bidding'
  | 'stopped'
  | 'rejected'
  | 'suspended';

export interface AlpacaAccount {
  id: string;
  account_number: string;
  status: string;
  currency: string;
  cash: string;
  portfolio_value: string;
  buying_power: string;
  equity: string;
  last_equity: string;
  long_market_value: string;
  short_market_value: string;
  initial_margin: string;
  maintenance_margin: string;
  daytrade_count: number;
  pattern_day_trader: boolean;
  trading_blocked: boolean;
  transfers_blocked: boolean;
  account_blocked: boolean;
  created_at: string;
}

export interface AlpacaPosition {
  asset_id: string;
  symbol: string;
  exchange: string;
  asset_class: string;
  avg_entry_price: string;
  qty: string;
  qty_available: string;
  side: 'long' | 'short';
  market_value: string;
  cost_basis: string;
  unrealized_pl: string;
  unrealized_plpc: string;
  unrealized_intraday_pl: string;
  unrealized_intraday_plpc: string;
  current_price: string;
  lastday_price: string;
  change_today: string;
  asset_marginable: boolean;
}

export interface AlpacaOrder {
  id: string;
  client_order_id: string;
  created_at: string;
  updated_at: string;
  submitted_at: string;
  filled_at: string | null;
  expired_at: string | null;
  canceled_at: string | null;
  failed_at: string | null;
  replaced_at: string | null;
  replaced_by: string | null;
  replaces: string | null;
  asset_id: string;
  symbol: string;
  asset_class: string;
  notional: string | null;
  qty: string;
  filled_qty: string;
  filled_avg_price: string | null;
  order_class: string;
  order_type: AlpacaOrderType;
  type: AlpacaOrderType;
  side: AlpacaOrderSide;
  time_in_force: AlpacaTimeInForce;
  limit_price: string | null;
  stop_price: string | null;
  status: AlpacaOrderStatus;
  extended_hours: boolean;
  legs: unknown[] | null;
  trail_percent: string | null;
  trail_price: string | null;
  hwm: string | null;
}

export interface AlpacaAsset {
  id: string;
  class: string;
  exchange: string;
  symbol: string;
  name: string;
  status: string;
  tradable: boolean;
  marginable: boolean;
  shortable: boolean;
  easy_to_borrow: boolean;
  fractionable: boolean;
  maintenance_margin_requirement: number;
}

export interface AlpacaClock {
  timestamp: string;
  is_open: boolean;
  next_open: string;
  next_close: string;
}

export interface PlaceOrderRequest {
  symbol: string;
  qty?: number;
  notional?: number;
  side: AlpacaOrderSide;
  type: AlpacaOrderType;
  time_in_force: AlpacaTimeInForce;
  limit_price?: number;
  stop_price?: number;
  trail_price?: number;
  trail_percent?: number;
  client_order_id?: string;
  extended_hours?: boolean;
  order_class?: 'simple' | 'bracket' | 'oco' | 'oto';
  take_profit?: { limit_price: number };
  stop_loss?: { stop_price: number; limit_price?: number };
}

export interface AlpacaError {
  code: number;
  message: string;
}

// ════════════════════════════════════════════════════════════════════
// Client Class
// ════════════════════════════════════════════════════════════════════

class AlpacaClient {
  private baseUrl: string;
  private apiKey: string;
  private secretKey: string;

  constructor() {
    const apiKey = process.env.ALPACA_API_KEY;
    const secretKey = process.env.ALPACA_SECRET_KEY;
    const paper = process.env.ALPACA_PAPER !== 'false'; // default to paper trading

    if (!apiKey || !secretKey) {
      throw new Error(
        'Alpaca API keys not configured. Set ALPACA_API_KEY and ALPACA_SECRET_KEY in .env.local',
      );
    }

    this.baseUrl = paper
      ? 'https://paper-api.alpaca.markets'
      : 'https://api.alpaca.markets';
    this.apiKey = apiKey;
    this.secretKey = secretKey;
  }

  /** Returns the base URL so callers can check if paper mode is active */
  get isPaper(): boolean {
    return this.baseUrl.includes('paper');
  }

  get baseUrlValue(): string {
    return this.baseUrl;
  }

  // ════════════════════════════════════════════════════════════
  // Private HTTP helper
  // ════════════════════════════════════════════════════════════

  private async request<T>(
    method: 'GET' | 'POST' | 'DELETE' | 'PATCH',
    path: string,
    body?: unknown,
    query?: Record<string, string>,
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    if (query) {
      Object.entries(query).forEach(([k, v]) => url.searchParams.set(k, v));
    }

    const headers: Record<string, string> = {
      'APCA-API-KEY-ID': this.apiKey,
      'APCA-API-SECRET-KEY': this.secretKey,
      Accept: 'application/json',
    };

    if (body) {
      headers['Content-Type'] = 'application/json';
    }

    const res = await fetch(url.toString(), {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const errorText = await res.text();
      let errorJson: AlpacaError | null = null;
      try {
        errorJson = JSON.parse(errorText);
      } catch {
        // not JSON
      }
      throw new Error(
        `Alpaca API error ${res.status}: ${errorJson?.message ?? errorText}`,
      );
    }

    // 204 No Content (e.g. DELETE success)
    if (res.status === 204) return undefined as T;

    return res.json() as Promise<T>;
  }

  // ════════════════════════════════════════════════════════════
  // Account
  // ════════════════════════════════════════════════════════════

  /** Get account info */
  async getAccount(): Promise<AlpacaAccount> {
    return this.request<AlpacaAccount>('GET', '/v2/account');
  }

  // ════════════════════════════════════════════════════════════
  // Positions
  // ════════════════════════════════════════════════════════════

  /** List all open positions */
  async getPositions(): Promise<AlpacaPosition[]> {
    return this.request<AlpacaPosition[]>('GET', '/v2/positions');
  }

  /** Get a single position by symbol */
  async getPosition(symbol: string): Promise<AlpacaPosition> {
    return this.request<AlpacaPosition>('GET', `/v2/positions/${symbol}`);
  }

  /** Close a position (liquidate fully) */
  async closePosition(symbol: string): Promise<AlpacaOrder> {
    return this.request<AlpacaOrder>('DELETE', `/v2/positions/${symbol}`);
  }

  /** Close a portion of a position */
  async closePositionPartial(
    symbol: string,
    qty: number,
  ): Promise<AlpacaOrder> {
    return this.request<AlpacaOrder>(
      'DELETE',
      `/v2/positions/${symbol}`,
      undefined,
      { qty: String(qty) },
    );
  }

  // ════════════════════════════════════════════════════════════
  // Orders
  // ════════════════════════════════════════════════════════════

  /** Place a new order */
  async placeOrder(order: PlaceOrderRequest): Promise<AlpacaOrder> {
    return this.request<AlpacaOrder>('POST', '/v2/orders', order);
  }

  /** List orders (optionally filtered by status) */
  async getOrders(params?: {
    status?: AlpacaOrderStatus;
    symbol?: string;
    after?: string;
    until?: string;
    limit?: number;
    direction?: 'asc' | 'desc';
  }): Promise<AlpacaOrder[]> {
    const query: Record<string, string> = {};
    if (params?.status) query.status = params.status;
    if (params?.symbol) query.symbols = params.symbol;
    if (params?.after) query.after = params.after;
    if (params?.until) query.until = params.until;
    if (params?.limit) query.limit = String(params.limit);
    if (params?.direction) query.direction = params.direction;

    return this.request<AlpacaOrder[]>('GET', '/v2/orders', undefined, query);
  }

  /** Get a single order by ID */
  async getOrder(orderId: string): Promise<AlpacaOrder> {
    return this.request<AlpacaOrder>('GET', `/v2/orders/${orderId}`);
  }

  /** Cancel an open order */
  async cancelOrder(orderId: string): Promise<AlpacaOrder> {
    return this.request<AlpacaOrder>('DELETE', `/v2/orders/${orderId}`);
  }

  /** Cancel all open orders */
  async cancelAllOrders(): Promise<AlpacaOrder[]> {
    return this.request<AlpacaOrder[]>('DELETE', '/v2/orders');
  }

  // ════════════════════════════════════════════════════════════
  // Assets & Clock
  // ════════════════════════════════════════════════════════════

  /** List tradeable assets */
  async getAssets(params?: {
    status?: 'active' | 'inactive';
    asset_class?: string;
    exchange?: string;
  }): Promise<AlpacaAsset[]> {
    const query: Record<string, string> = {};
    if (params?.status) query.status = params.status;
    if (params?.asset_class) query.asset_class = params.asset_class;
    if (params?.exchange) query.exchange = params.exchange;

    return this.request<AlpacaAsset[]>('GET', '/v2/assets', undefined, query);
  }

  /** Get market clock */
  async getClock(): Promise<AlpacaClock> {
    return this.request<AlpacaClock>('GET', '/v2/clock');
  }
}

// ════════════════════════════════════════════════════════════════════
// Singleton
// ════════════════════════════════════════════════════════════════════

let instance: AlpacaClient | null = null;

export function getAlpacaClient(): AlpacaClient {
  if (!instance) {
    instance = new AlpacaClient();
  }
  return instance;
}

export { AlpacaClient };
export default getAlpacaClient;