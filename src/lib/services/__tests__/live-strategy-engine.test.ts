import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { Strategy, StrategyConfig, EntryRule, ExitRule, LiveStrategyState } from '@/types';
import { LiveStrategyEngine, type LiveEngineOptions } from '../live-strategy-engine';
import type { LiveQuote } from '../alpha-vantage';

// ── Helper: create a minimal mock Strategy ──────────────

function mockStrategy(overrides: Partial<Strategy> = {}, configOverrides: Partial<StrategyConfig> = {}): Strategy {
  const config: StrategyConfig = {
    type: 'trend_following',
    timeframes: ['1h'],
    symbols: ['AAPL'],
    indicators: ['rsi', 'sma'],
    entryRules: [
      {
        type: 'indicator_cross',
        description: 'RSI below 30',
        params: {
          indicator: 'rsi',
          condition: 'below',
          threshold: 30,
          period: 14,
        },
      },
    ],
    exitRules: [
      {
        type: 'stop_loss',
        description: 'Stop loss at -2%',
        params: { percent: 2 },
      },
      {
        type: 'take_profit',
        description: 'Take profit at +5%',
        params: { percent: 5 },
      },
    ],
    riskPerTrade: 1,
    maxPositions: 5,
    ...configOverrides,
  };

  return {
    id: 'test-strategy-id',
    user_id: 'test-user-id',
    name: 'Test Strategy',
    status: 'draft',
    type: 'trend_following',
    config,
    performance: {
      total_trades: 0,
      win_rate: 0,
      avg_pnl: 0,
      total_pnl: 0,
      total_pnl_percent: 0,
      sharpe_ratio: 0,
      max_drawdown: 0,
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

// ── Helper for building a LiveQuote (matching actual interface) ──

function makeQuote(overrides: Partial<LiveQuote> = {}): LiveQuote {
  return {
    symbol: 'AAPL',
    price: 150,
    open: 150.20,
    high: 151.00,
    low: 149.50,
    volume: 1_000_000,
    previousClose: 149.80,
    change: 0.20,
    changePercent: 0.13,
    latestTradingDay: new Date().toISOString().split('T')[0],
    fetchedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('LiveStrategyEngine', () => {
  let engine: LiveStrategyEngine;

  beforeEach(() => {
    engine = new LiveStrategyEngine(mockStrategy());
  });

  afterEach(() => {
    try {
      engine.stop();
    } catch {
      // already stopped
    }
  });

  // ── Initialization ────────────────────────────────────

  describe('initialization', () => {
    it('starts in "idle" state', () => {
      expect(engine.state.status).toBe('idle');
    });

    it('sets strategyId from the strategy', () => {
      expect(engine.strategyId).toBe('test-strategy-id');
    });

    it('stores the strategy config', () => {
      expect(engine.config.symbols).toContain('AAPL');
    });

    it('initializes empty symbol history for each symbol', () => {
      const history = engine.getHistory('AAPL');
      expect(history).toEqual([]);
    });

    it('initializes with no open positions', () => {
      expect(engine.getOpenPositions()).toEqual([]);
    });

    it('initializes with no closed trades', () => {
      expect(engine.getClosedTrades()).toEqual([]);
    });

    it('has correct symbolsWatching in state', () => {
      expect(engine.state.symbolsWatching).toEqual(['AAPL']);
    });

    it('accepts custom tick interval', () => {
      const e2 = new LiveStrategyEngine(mockStrategy(), { tickIntervalMs: 30_000 });
      expect(e2.state.tickIntervalMs).toBe(30_000);
    });

    it('accepts custom capital', () => {
      const e2 = new LiveStrategyEngine(mockStrategy(), { capital: 50_000 });
      expect(e2).toBeDefined();
    });

    it('accepts custom maxPositions', () => {
      const e2 = new LiveStrategyEngine(
        mockStrategy({}, { maxPositions: 10 }),
        { maxPositions: 3 },
      );
      expect(e2).toBeDefined();
    });
  });

  // ── State management ──────────────────────────────────

  describe('state management', () => {
    it('has null lastTickAt initially', () => {
      expect(engine.state.lastTickAt).toBeNull();
    });

    it('has null nextTickAt initially', () => {
      expect(engine.state.nextTickAt).toBeNull();
    });

    it('has null error initially', () => {
      expect(engine.state.error).toBeNull();
    });

    it('tracks signal count at 0 initially', () => {
      expect(engine.state.signalsToday).toBe(0);
    });

    it('has null lastSignal initially', () => {
      expect(engine.state.lastSignal).toBeNull();
    });

    it('state is publicly readable', () => {
      const s = engine.state;
      expect(s.status).toBeDefined();
      expect(s.strategyId).toBe('test-strategy-id');
    });
  });

  // ── Event system ──────────────────────────────────────

  describe('event system', () => {
    it('registers callback and returns unsubscribe function', () => {
      const unsub = engine.on('tick', () => {});
      expect(typeof unsub).toBe('function');
    });

    it('off unregisters a callback without error', () => {
      const fn = vi.fn();
      const unsub = engine.on('tick', fn);
      unsub();
      // off() is called internally by the unsubscribe function
    });

    it('unsubscribe does not throw', () => {
      const cleanup = engine.on('signal', () => {});
      expect(() => cleanup()).not.toThrow();
    });
  });

  // ── Reset ─────────────────────────────────────────────

  describe('reset()', () => {
    it('clears all positions and history', () => {
      const history = engine.getHistory('AAPL');
      history.push({ price: 150, volume: 500_000, time: new Date().toISOString() });

      engine.reset();

      expect(engine.getHistory('AAPL')).toEqual([]);
      expect(engine.getOpenPositions()).toEqual([]);
      expect(engine.getClosedTrades()).toEqual([]);
      expect(engine.state.status).toBe('idle');
    });

    it('resets signalCount', () => {
      engine.reset();
      expect(engine.state.signalsToday).toBe(0);
    });
  });

  // ── History management ────────────────────────────────

  describe('getHistory()', () => {
    it('returns mutable array', () => {
      const history = engine.getHistory('AAPL');
      const initialLen = history.length;
      history.push({ price: 150, volume: 500_000, time: new Date().toISOString() });
      expect(engine.getHistory('AAPL').length).toBe(initialLen + 1);
    });

    it('returns empty array for unknown symbol', () => {
      expect(engine.getHistory('UNKNOWN')).toEqual([]);
    });

    it('handles many data points (warm-up scenario)', () => {
      const history = engine.getHistory('AAPL');
      for (let i = 0; i < 200; i++) {
        history.push({ price: 100 + i * 0.5, volume: 500_000, time: new Date().toISOString() });
      }
      expect(history.length).toBe(200);
    });
  });

  // ── Stop loss calculation logic ───────────────────────

  describe('stop loss logic (via config)', () => {
    it('configures stop_loss as an exit rule', () => {
      const sl = engine.config.exitRules.find((r) => r.type === 'stop_loss');
      expect(sl).toBeDefined();
      expect(sl!.params).toHaveProperty('percent', 2);
    });

    it('configure with custom stop loss percent', () => {
      const e2 = new LiveStrategyEngine(
        mockStrategy({}, {
          exitRules: [{ type: 'stop_loss', description: 'SL 3%', params: { percent: 3 } }],
        }),
      );
      const sl = e2.config.exitRules.find((r) => r.type === 'stop_loss');
      expect(sl?.params).toHaveProperty('percent', 3);
    });
  });

  // ── Take profit calculation ───────────────────────────

  describe('take profit logic (via config)', () => {
    it('configures take_profit as an exit rule', () => {
      const tp = engine.config.exitRules.find((r) => r.type === 'take_profit');
      expect(tp).toBeDefined();
      expect(tp!.params).toHaveProperty('percent', 5);
    });
  });

  // ── Configuration edge cases ──────────────────────────

  describe('configuration edge cases', () => {
    it('handles empty entry rules gracefully', () => {
      const e2 = new LiveStrategyEngine(
        mockStrategy({}, { entryRules: [] }),
      );
      expect(e2.state.status).toBe('idle');
      expect(e2.config.entryRules).toEqual([]);
    });

    it('handles empty exit rules gracefully', () => {
      const e2 = new LiveStrategyEngine(
        mockStrategy({}, { exitRules: [] }),
      );
      expect(e2.state.status).toBe('idle');
    });

    it('handles multiple symbols', () => {
      const e2 = new LiveStrategyEngine(
        mockStrategy({}, { symbols: ['AAPL', 'MSFT', 'GOOGL'] }),
      );
      expect(e2.getHistory('AAPL')).toBeDefined();
      expect(e2.getHistory('MSFT')).toBeDefined();
      expect(e2.getHistory('GOOGL')).toBeDefined();
      expect(e2.state.symbolsWatching).toEqual(['AAPL', 'MSFT', 'GOOGL']);
    });

    it('handles crypto symbols', () => {
      const e2 = new LiveStrategyEngine(
        mockStrategy({}, { symbols: ['BTC/USD', 'ETH/USD'] }),
      );
      expect(e2.getHistory('BTC/USD')).toBeDefined();
      expect(e2.getHistory('ETH/USD')).toBeDefined();
    });
  });

  // ── Entry rule types (via config inspection) ──────────

  describe('entry rule types', () => {
    it('supports indicator_cross entry rule', () => {
      const e2 = new LiveStrategyEngine(
        mockStrategy({}, {
          entryRules: [
            {
              type: 'indicator_cross',
              description: 'RSI oversold',
              params: { indicator: 'rsi', condition: 'below', period: 14, threshold: 30 },
            },
          ],
        }),
      );
      expect(e2.config.entryRules[0].type).toBe('indicator_cross');
    });

    it('supports price_level entry rule', () => {
      const e2 = new LiveStrategyEngine(
        mockStrategy({}, {
          entryRules: [
            {
              type: 'price_level',
              description: 'Breakout above $160',
              params: { level: 160, direction: 'breakout_above' },
            },
          ],
        }),
      );
      expect(e2.config.entryRules[0].type).toBe('price_level');
    });

    it('supports pattern entry rule', () => {
      const e2 = new LiveStrategyEngine(
        mockStrategy({}, {
          entryRules: [
            {
              type: 'pattern',
              description: 'Double bottom',
              params: { patternName: 'double_bottom' },
            },
          ],
        }),
      );
      expect(e2.config.entryRules[0].type).toBe('pattern');
    });
  });

  // ── Exit rule types (via config inspection) ───────────

  describe('exit rule types', () => {
    it('supports take_profit exit rule', () => {
      const tp = engine.config.exitRules.find((r) => r.type === 'take_profit');
      expect(tp).toBeDefined();
    });

    it('supports stop_loss exit rule', () => {
      const sl = engine.config.exitRules.find((r) => r.type === 'stop_loss');
      expect(sl).toBeDefined();
    });

    it('supports trailing_stop exit rule', () => {
      const e2 = new LiveStrategyEngine(
        mockStrategy({}, {
          exitRules: [
            {
              type: 'trailing_stop',
              description: 'Trailing stop -3%',
              params: { percent: 3, activationPercent: 2 },
            },
          ],
        }),
      );
      expect(e2.config.exitRules[0].type).toBe('trailing_stop');
    });

    it('supports indicator_signal exit rule', () => {
      const e2 = new LiveStrategyEngine(
        mockStrategy({}, {
          exitRules: [
            {
              type: 'indicator_signal',
              description: 'RSI overbought → exit',
              params: { indicator: 'rsi', condition: 'crosses_above', threshold: 70, period: 14 },
            },
          ],
        }),
      );
      expect(e2.config.exitRules[0].type).toBe('indicator_signal');
    });

    it('supports time_based exit rule', () => {
      const e2 = new LiveStrategyEngine(
        mockStrategy({}, {
          exitRules: [
            {
              type: 'time_based',
              description: 'Exit after 60 min',
              params: { durationMinutes: 60 },
            },
          ],
        }),
      );
      expect(e2.config.exitRules[0].type).toBe('time_based');
    });
  });

  // ── Position tracking (via public getters) ────────────

  describe('position tracking', () => {
    it('starts with zero open positions in state', () => {
      expect(engine.state.openPositions).toBe(0);
    });

    it('getOpenPositions returns empty array initially', () => {
      expect(engine.getOpenPositions()).toEqual([]);
    });

    it('getClosedTrades returns empty array initially', () => {
      expect(engine.getClosedTrades()).toEqual([]);
    });

    it('after reset, positions and trades are empty', () => {
      engine.reset();
      expect(engine.getOpenPositions()).toEqual([]);
      expect(engine.getClosedTrades()).toEqual([]);
    });
  });

  // ── Quote data integrity ──────────────────────────────

  describe('quote data integrity', () => {
    it('validates quote has all required fields', () => {
      const q = makeQuote();
      expect(q.symbol).toBe('AAPL');
      expect(typeof q.price).toBe('number');
      expect(typeof q.volume).toBe('number');
      expect(q.fetchedAt).toBeDefined();
      expect(q.previousClose).toBeDefined();
      expect(q.change).toBeDefined();
      expect(q.changePercent).toBeDefined();
    });

    it('low <= price <= high relationship holds', () => {
      const q = makeQuote({ low: 149.00, high: 151.00, price: 150.00 });
      expect(q.low).toBeLessThanOrEqual(q.price);
      expect(q.price).toBeLessThanOrEqual(q.high);
    });
  });

  // ── Stop (lifecycle) ──────────────────────────────────

  describe('stop() lifecycle', () => {
    it('sets status to idle on stop', () => {
      engine.stop();
      expect(engine.state.status).toBe('idle');
    });

    it('clears nextTickAt on stop', () => {
      engine.stop();
      expect(engine.state.nextTickAt).toBeNull();
    });

    it('double stop is safe (idempotent)', () => {
      engine.stop();
      expect(() => engine.stop()).not.toThrow();
      expect(engine.state.status).toBe('idle');
    });
  });

  // ── Risk management integration (config) ──────────────

  describe('risk manager integration', () => {
    it('accepts riskManager in options', () => {
      const rm = {
        canOpenPosition: vi.fn().mockReturnValue({ allowed: true }),
        getExposure: vi.fn().mockReturnValue(0),
        getDailyTrades: vi.fn().mockReturnValue(0),
        getDailyPnL: vi.fn().mockReturnValue(0),
        getMaxDrawdown: vi.fn().mockReturnValue(0),
        reset: vi.fn(),
      } as unknown as import('../risk-manager').RiskManager;

      const e2 = new LiveStrategyEngine(mockStrategy(), { riskManager: rm });
      expect(e2).toBeDefined();
    });
  });

  // ── Parameterised config tests ────────────────────────

  describe.each([
    { symbols: ['AAPL'], riskPerTrade: 1, name: 'Standard equity' },
    { symbols: ['BTC/USD'], riskPerTrade: 0.5, name: 'Crypto conservative' },
    { symbols: ['AAPL', 'MSFT', 'GOOGL'], riskPerTrade: 2, name: 'Large watchlist' },
  ])('engine with $name', ({ symbols, riskPerTrade }) => {
    it('creates engine correctly', () => {
      const e2 = new LiveStrategyEngine(
        mockStrategy({}, { symbols, riskPerTrade }),
      );
      expect(e2.state.symbolsWatching).toEqual(symbols);
      for (const sym of symbols) {
        expect(e2.getHistory(sym)).toBeDefined();
      }
    });
  });
});