import { describe, it, expect, beforeEach } from 'vitest';
import { RiskManager, type RiskTradeRequest, type RiskConfig } from '../risk-manager';
import type { CorrelationPair } from '@/types';

// ═══════════════════════════════════════════════════════════════════
// Helper: build a minimal valid trade request
// ═══════════════════════════════════════════════════════════════════
function baseRequest(
  overrides: Partial<RiskTradeRequest> = {},
): RiskTradeRequest {
  return {
    symbol: 'AAPL',
    quantity: 10,
    price: 150,
    capital: 100_000,
    positions: [],
    ...overrides,
  };
}

describe('RiskManager', () => {
  describe('constructor and defaults', () => {
    it('initializes with sensible defaults', () => {
      const rm = new RiskManager();
      const cfg = rm.getConfig();
      expect(cfg.maxPositions).toBe(10);
      expect(cfg.maxPositionSize).toBe(0.25);
      expect(cfg.maxExposure).toBe(0.9);
      expect(cfg.minCashBuffer).toBe(100);
      expect(cfg.maxTradesPerDay).toBe(50);
      expect(cfg.varConfidence).toBe(0.95);
      expect(cfg.maxCorrelation).toBe(0.8);
      expect(cfg.useKellyCriterion).toBe(false);
    });

    it('accepts custom config overrides', () => {
      const rm = new RiskManager({ maxPositions: 5, maxPositionSize: 0.1 });
      const cfg = rm.getConfig();
      expect(cfg.maxPositions).toBe(5);
      expect(cfg.maxPositionSize).toBe(0.1);
    });
  });

  describe('canTrade() — basic rules', () => {
    it('allows a simple valid trade', () => {
      const rm = new RiskManager();
      const result = rm.canTrade(baseRequest());
      expect(result.allowed).toBe(true);
    });

    it('blocks trade when daily loss limit exceeded (absolute)', () => {
      const rm = new RiskManager({ maxDailyLoss: 1000 });
      const result = rm.canTrade(
        baseRequest({ dailyPnl: -1500 }),
      );
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Daily loss limit');
    });

    it('blocks trade when daily loss % exceeded', () => {
      const rm = new RiskManager({ maxDailyLossPercent: -0.03 });
      const result = rm.canTrade(
        baseRequest({ dailyPnl: -4000, capital: 100_000 }),
      );
      expect(result.allowed).toBe(false);
      expect(result.rule).toBe('maxDailyLossPercent');
    });

    it('blocks trade when weekly loss % exceeded', () => {
      const rm = new RiskManager({ maxWeeklyLossPercent: -0.05 });
      const result = rm.canTrade(
        baseRequest({ weeklyPnl: -6000, capital: 100_000 }),
      );
      expect(result.allowed).toBe(false);
      expect(result.rule).toBe('maxWeeklyLossPercent');
    });

    it('blocks trade when max positions reached', () => {
      const rm = new RiskManager({ maxPositions: 2 });
      const result = rm.canTrade(
        baseRequest({
          positions: [
            { symbol: 'MSFT', quantity: 10, avg_price: 300, market_value: 3000, unrealized_pnl: 100 },
            { symbol: 'GOOGL', quantity: 5, avg_price: 2800, market_value: 14000, unrealized_pnl: -200 },
          ],
        }),
      );
      expect(result.allowed).toBe(false);
      expect(result.rule).toBe('maxPositions');
    });

    it('blocks trade when position size exceeds max', () => {
      const rm = new RiskManager({ maxPositionSize: 0.1 }); // 10%
      const result = rm.canTrade(
        baseRequest({ quantity: 100, price: 150, capital: 100_000 }),
      ); // $15,000 = 15% of capital
      expect(result.allowed).toBe(false);
      expect(result.rule).toBe('maxPositionSize');
    });

    it('blocks trade when exposure exceeds limit', () => {
      const rm = new RiskManager({ maxExposure: 0.5, maxPositionSize: 1 }); // 50%, disable position size check
      const result = rm.canTrade(
        baseRequest({
          quantity: 500,
          price: 100,
          capital: 100_000,
          positions: [
            { symbol: 'MSFT', quantity: 10, avg_price: 300, market_value: 45000, unrealized_pnl: 0 },
          ],
        }),
      ); // current 45k + proposed 50k = 95k = 95% > 50%
      expect(result.allowed).toBe(false);
      expect(result.rule).toBe('maxExposure');
    });

    it('blocks trade when cash buffer insufficient', () => {
      const rm = new RiskManager({ minCashBuffer: 20000, maxPositionSize: 1 }); // disable position size check
      const result = rm.canTrade(
        baseRequest({
          quantity: 800,
          price: 100,
          capital: 100_000,
          positions: [
            { symbol: 'MSFT', quantity: 10, avg_price: 300, market_value: 10000, unrealized_pnl: 0 },
          ],
        }),
      ); // equity=90k - 80k trade = 10k remaining < 20k buffer
      expect(result.allowed).toBe(false);
      expect(result.rule).toBe('minCashBuffer');
    });

    it('blocks trade when daily trade limit reached', () => {
      const rm = new RiskManager({ maxTradesPerDay: 3 });
      const result = rm.canTrade(baseRequest({ tradesToday: 5 }));
      expect(result.allowed).toBe(false);
      expect(result.rule).toBe('maxTradesPerDay');
    });
  });

  describe('canTrade() — advanced rules', () => {
    it('blocks trade when drawdown exceeds portfolio limit', () => {
      const rm = new RiskManager({ portfolioMaxDrawdown: -0.1 });
      // Peak was 100k, current is 85k = -15% drawdown
      rm.setPeakValue(100_000);
      const result = rm.canTrade(
        baseRequest({ capital: 85_000, peakPortfolioValue: 100_000 }),
      );
      expect(result.allowed).toBe(false);
      expect(result.rule).toBe('portfolioMaxDrawdown');
    });

    it('allows trade when drawdown is within limit', () => {
      const rm = new RiskManager({ portfolioMaxDrawdown: -0.2 });
      rm.setPeakValue(100_000);
      const result = rm.canTrade(
        baseRequest({ capital: 95_000, peakPortfolioValue: 100_000 }),
      );
      expect(result.allowed).toBe(true);
    });

    it('blocks trade for high correlation', () => {
      const rm = new RiskManager({ maxCorrelation: 0.7 });
      const correlations: CorrelationPair[] = [
        {
          symbolA: 'AAPL',
          symbolB: 'MSFT',
          correlation: 0.85,
          lookbackDays: 252,
          updatedAt: new Date().toISOString(),
        },
      ];
      const result = rm.canTrade(
        baseRequest({
          symbol: 'AAPL',
          positions: [
            { symbol: 'MSFT', quantity: 10, avg_price: 300, market_value: 3000, unrealized_pnl: 0 },
          ],
          correlations,
        }),
      );
      expect(result.allowed).toBe(false);
      expect(result.rule).toBe('maxCorrelation');
    });

    it('allows trade when correlation is below threshold', () => {
      const rm = new RiskManager({ maxCorrelation: 0.8 });
      const correlations: CorrelationPair[] = [
        {
          symbolA: 'AAPL',
          symbolB: 'MSFT',
          correlation: 0.65,
          lookbackDays: 252,
          updatedAt: new Date().toISOString(),
        },
      ];
      const result = rm.canTrade(
        baseRequest({
          symbol: 'AAPL',
          positions: [
            { symbol: 'MSFT', quantity: 10, avg_price: 300, market_value: 3000, unrealized_pnl: 0 },
          ],
          correlations,
        }),
      );
      expect(result.allowed).toBe(true);
    });

    it('blocks trade when max consecutive losses reached', () => {
      const rm = new RiskManager({ maxConsecutiveLosses: 5 });
      const result = rm.canTrade(
        baseRequest({ consecutiveLosses: 7 }),
      );
      expect(result.allowed).toBe(false);
      expect(result.rule).toBe('maxConsecutiveLosses');
    });

    it('blocks trade on VIX spike', () => {
      const rm = new RiskManager({ vixThreshold: 30 });
      const result = rm.canTrade(
        baseRequest({ vix: 35 }),
      );
      expect(result.allowed).toBe(false);
      expect(result.rule).toBe('vixThreshold');
    });
  });

  describe('circuit breaker', () => {
    it('starts untripped', () => {
      const rm = new RiskManager();
      expect(rm.getCircuitBreakerState().isTripped).toBe(false);
    });

    it('trips on daily loss and blocks subsequent trades', () => {
      const rm = new RiskManager({ maxDailyLoss: 1000 });
      // First request trips circuit breaker
      rm.canTrade(baseRequest({ dailyPnl: -1500 }));
      const state = rm.getCircuitBreakerState();
      expect(state.isTripped).toBe(true);

      // Subsequent trade should be blocked by circuit breaker
      const result = rm.canTrade(baseRequest({ dailyPnl: 0 }));
      expect(result.allowed).toBe(false);
      expect(result.rule).toBe('circuitBreaker');
    });

    it('can be manually reset', () => {
      const rm = new RiskManager({ maxDailyLoss: 1000 });
      rm.canTrade(baseRequest({ dailyPnl: -1500 }));
      expect(rm.getCircuitBreakerState().isTripped).toBe(true);

      rm.resetCircuitBreaker();
      expect(rm.getCircuitBreakerState().isTripped).toBe(false);

      // Now trades are allowed again
      const result = rm.canTrade(baseRequest());
      expect(result.allowed).toBe(true);
    });

    it('recovers automatically after cooldown expires', () => {
      const rm = new RiskManager({
        maxDailyLoss: 1000,
        circuitBreakerCooldown: 0, // instant
      });
      rm.canTrade(baseRequest({ dailyPnl: -1500 }));
      expect(rm.getCircuitBreakerState().isTripped).toBe(true);

      // Next check should reset since cooldown is 0
      const result = rm.canTrade(baseRequest());
      expect(result.allowed).toBe(true);
      expect(rm.getCircuitBreakerState().isTripped).toBe(false);
    });
  });

  describe('VaR calculation', () => {
    it('calculates daily VaR from historical returns', () => {
      const rm = new RiskManager();
      const returns = [-0.02, -0.01, 0.0, 0.01, 0.02, -0.03, 0.015, -0.005, 0.025, -0.01];
      const varDaily = rm.calculateVaR(returns, 100_000, 0.95);
      expect(varDaily).toBeGreaterThan(0);
      // VaR should be roughly around 3% (worst return at 95th percentile)
      expect(varDaily).toBeLessThan(10_000);
    });

    it('calculates weekly VaR from daily VaR', () => {
      const rm = new RiskManager();
      const dailyVar = 2000;
      const weeklyVar = rm.calculateWeeklyVaR(dailyVar);
      expect(weeklyVar).toBeCloseTo(2000 * Math.sqrt(5), 0);
    });

    it('falls back when no returns data', () => {
      const rm = new RiskManager();
      const varDaily = rm.calculateVaR([], 100_000, 0.95);
      expect(varDaily).toBeGreaterThan(0); // uses fallback 1.5% std dev
    });
  });

  describe('Kelly Criterion', () => {
    it('calculates Kelly fraction correctly', () => {
      const rm = new RiskManager();
      // winRate=0.6, avgWin=100, avgLoss=-50 => b=100/50=2
      // f = (0.6*2 - 0.4)/2 = (1.2-0.4)/2 = 0.8/2 = 0.4
      const kelly = rm.calculateKellyFraction(0.6, 100, -50);
      expect(kelly).toBeCloseTo(0.25, 2); // clamped at 0.25
    });

    it('returns 0 when disabled', () => {
      const rm = new RiskManager({ useKellyCriterion: false });
      const size = rm.getRecommendedBetSize(0.6, 100, -50);
      expect(size).toBe(0);
    });

    it('returns half-Kelly by default when enabled', () => {
      const rm = new RiskManager({
        useKellyCriterion: true,
        kellyFraction: 0.5,
      });
      const size = rm.getRecommendedBetSize(0.6, 100, -50);
      // Pure kelly = 0.25 (clamped), half = 0.125
      expect(size).toBeCloseTo(0.125, 3);
    });

    it('calculates Kelly quantity correctly', () => {
      const rm = new RiskManager({
        useKellyCriterion: true,
        kellyFraction: 0.5,
      });
      const quantity = rm.calculateKellyQuantity(100_000, 50, 0.6, 100, -50);
      // Half-Kelly = 0.125 => alloc = 12,500 => /50 = 250 shares
      expect(quantity).toBe(250);
    });
  });

  describe('correlation', () => {
    it('returns 1 for perfectly correlated returns', () => {
      const rm = new RiskManager();
      const r1 = [0.01, 0.02, -0.01, 0.03, 0.0];
      const r2 = [0.01, 0.02, -0.01, 0.03, 0.0];
      expect(rm.calculateCorrelation(r1, r2)).toBeCloseTo(1.0, 5);
    });

    it('returns -1 for perfectly inverse returns', () => {
      const rm = new RiskManager();
      const r1 = [0.01, 0.02, -0.01, 0.03];
      const r2 = [-0.01, -0.02, 0.01, -0.03];
      expect(rm.calculateCorrelation(r1, r2)).toBeCloseTo(-1.0, 5);
    });

    it('returns 0 for unequal length arrays', () => {
      const rm = new RiskManager();
      expect(rm.calculateCorrelation([0.01, 0.02], [0.01])).toBe(0);
    });

    it('builds correlation matrix from symbol returns', () => {
      const rm = new RiskManager();
      const symbolReturns = new Map<string, number[]>();
      symbolReturns.set('AAPL', [0.01, 0.02, -0.01]);
      symbolReturns.set('MSFT', [0.015, 0.025, -0.005]);
      symbolReturns.set('GOOGL', [-0.01, -0.02, 0.01]);

      const matrix = rm.buildCorrelationMatrix(symbolReturns);
      // 3 symbols => 3 choose 2 = 3 pairs
      expect(matrix.length).toBe(3);
      expect(matrix[0]).toHaveProperty('symbolA');
      expect(matrix[0]).toHaveProperty('symbolB');
      expect(matrix[0]).toHaveProperty('correlation');
    });

    it('counts highly correlated pairs', () => {
      const rm = new RiskManager({ maxCorrelation: 0.7 });
      const pairs: CorrelationPair[] = [
        { symbolA: 'AAPL', symbolB: 'MSFT', correlation: 0.85, lookbackDays: 252, updatedAt: '' },
        { symbolA: 'AAPL', symbolB: 'GOOGL', correlation: 0.5, lookbackDays: 252, updatedAt: '' },
        { symbolA: 'MSFT', symbolB: 'GOOGL', correlation: -0.9, lookbackDays: 252, updatedAt: '' },
      ];
      const count = rm.countCorrelatedPairs(pairs);
      expect(count).toBe(2); // 0.85 and -0.9 are >= 0.7 in magnitude
    });
  });

  describe('computePortfolioRiskMetrics', () => {
    it('returns comprehensive risk metrics', () => {
      const rm = new RiskManager();
      const metrics = rm.computePortfolioRiskMetrics({
        capital: 100_000,
        peakValue: 105_000,
        dailyReturns: [-0.01, 0.02, -0.005, 0.015, -0.008],
        positions: [
          { symbol: 'AAPL', market_value: 30000, unrealized_pnl: 500 },
          { symbol: 'MSFT', market_value: 20000, unrealized_pnl: -200 },
        ],
        correlations: [],
        winRate: 0.6,
        avgWin: 100,
        avgLoss: -50,
      });

      expect(metrics.varDaily).toBeGreaterThan(0);
      expect(metrics.varWeekly).toBeGreaterThan(metrics.varDaily);
      expect(metrics.currentDrawdown).toBeLessThan(0); // below peak
      expect(metrics.concentration).toHaveLength(2);
      expect(metrics.varConfidence).toBe(0.95);
    });
  });

  describe('updateConfig', () => {
    it('updates config at runtime', () => {
      const rm = new RiskManager({ maxPositions: 10 });
      expect(rm.getConfig().maxPositions).toBe(10);

      rm.updateConfig({ maxPositions: 3 });
      expect(rm.getConfig().maxPositions).toBe(3);

      // Now blocks with only 3 positions
      const result = rm.canTrade(
        baseRequest({
          positions: [
            { symbol: 'A', quantity: 1, avg_price: 10, market_value: 10, unrealized_pnl: 0 },
            { symbol: 'B', quantity: 1, avg_price: 10, market_value: 10, unrealized_pnl: 0 },
            { symbol: 'C', quantity: 1, avg_price: 10, market_value: 10, unrealized_pnl: 0 },
          ],
        }),
      );
      expect(result.allowed).toBe(false);
    });
  });

  describe.each([
    { dailyPnl: -500, maxDailyLoss: 1000, expectAllowed: true },
    { dailyPnl: -1500, maxDailyLoss: 1000, expectAllowed: false },
    { capital: 100_000, quantity: 50, price: 400, maxPositionSize: 0.25, expectAllowed: true },
    { capital: 100_000, quantity: 500, price: 400, maxPositionSize: 0.1, expectAllowed: false },
  ])('parameterised checks', ({ dailyPnl, maxDailyLoss, capital, quantity, price, maxPositionSize, expectAllowed }) => {
    it(`returns allowed=${expectAllowed}`, () => {
      const config: RiskConfig = {};
      if (maxDailyLoss !== undefined) config.maxDailyLoss = maxDailyLoss;
      if (maxPositionSize !== undefined) config.maxPositionSize = maxPositionSize;

      const rm = new RiskManager(config);
      const result = rm.canTrade(
        baseRequest({
          dailyPnl: dailyPnl ?? 0,
          capital: capital ?? 100_000,
          quantity: quantity ?? 10,
          price: price ?? 150,
        }),
      );
      expect(result.allowed).toBe(expectAllowed);
    });
  });
});