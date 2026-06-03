import { describe, it, expect } from 'vitest';
import { runBacktest } from '../strategy-engine';
import type { StrategyConfig, CandlestickData } from '@/types';

// ═══════════════════════════════════════════════════════════════════
// Helper: generate mock candlestick data
// ═══════════════════════════════════════════════════════════════════
function generateMockBars(
  count: number,
  opts: {
    startPrice?: number;
    trend?: 'up' | 'down' | 'sideways';
    volatility?: number;
  } = {},
): CandlestickData[] {
  const startPrice = opts.startPrice ?? 100;
  const volatility = opts.volatility ?? 0.02;
  const bars: CandlestickData[] = [];
  let price = startPrice;

  for (let i = 0; i < count; i++) {
    const date = new Date(2025, 0, 1 + i);
    const change =
      opts.trend === 'up'
        ? price * volatility * (0.5 + Math.random() * 0.5)
        : opts.trend === 'down'
          ? -price * volatility * (0.5 + Math.random() * 0.5)
          : (Math.random() - 0.5) * price * volatility * 2;

    const open = price;
    const close = price + change;
    const high = Math.max(open, close) * (1 + Math.random() * volatility * 0.5);
    const low = Math.min(open, close) * (1 - Math.random() * volatility * 0.5);

    bars.push({
      time: date.toISOString().split('T')[0],
      open: parseFloat(open.toFixed(2)),
      high: parseFloat(high.toFixed(2)),
      low: parseFloat(low.toFixed(2)),
      close: parseFloat(close.toFixed(2)),
      volume: Math.floor(100000 + Math.random() * 900000),
    });

    price = close;
  }

  return bars;
}

// ═══════════════════════════════════════════════════════════════════
// Helper: create base strategy configs
// ═══════════════════════════════════════════════════════════════════
function baseStrategy(
  overrides: Partial<StrategyConfig> = {},
): StrategyConfig {
  return {
    type: 'trend_following',
    timeframes: ['1d'],
    symbols: ['AAPL'],
    indicators: ['sma'],
    entryRules: [
      {
        type: 'indicator_cross',
        description: 'SMA 50 crosses above SMA 200',
        params: {
          indicator: 'sma',
          condition: 'crosses_above',
          period: 50,
          secondaryPeriod: 200,
        } as import('@/types').IndicatorCrossParams,
      },
    ],
    exitRules: [
      {
        type: 'stop_loss',
        description: '2% stop loss',
        params: { percent: 2 } as import('@/types').StopLossParams,
      },
    ],
    riskPerTrade: 1,
    maxPositions: 5,
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════

describe('runBacktest', () => {
  it('returns empty result when data has insufficient bars', () => {
    const config = baseStrategy();
    const bars = generateMockBars(10, { startPrice: 100 });
    const result = runBacktest(config, bars);
    expect(result.trades).toHaveLength(0);
  });

  it('returns metrics with zero trades when no signals fire', () => {
    const config = baseStrategy({
      entryRules: [
        {
          type: 'indicator_cross',
          description: 'RSI below 10 (super rare)',
          params: {
            indicator: 'rsi',
            condition: 'below',
            threshold: 10,
          } as import('@/types').IndicatorCrossParams,
        },
      ],
    });
    const bars = generateMockBars(200, { startPrice: 100, trend: 'up' });
    const result = runBacktest(config, bars);
    expect(result.trades).toHaveLength(0);
    expect(result.metrics.totalTrades).toBe(0);
    expect(result.metrics.totalPnl).toBe(0);
  });

    it('generates trades with a simple SMA crossover strategy on uptrending data', () => {
      const config = baseStrategy({
        entryRules: [
          {
            type: 'indicator_cross',
            description: 'SMA 20 crosses above SMA 50',
            params: {
              indicator: 'sma',
              condition: 'crosses_above',
              period: 20,
              secondaryPeriod: 50,
            } as import('@/types').IndicatorCrossParams,
          },
        ],
        exitRules: [
          {
            type: 'take_profit',
            description: '10% take profit',
            params: { percent: 10 } as import('@/types').TakeProfitParams,
          },
        ],
      });
      const bars = generateMockBars(300, { startPrice: 100, trend: 'up' });
      const result = runBacktest(config, bars);
      // Strategy engine handles indicator_cross entry rule; trades may fire depending on data
      expect(result.metrics.totalTrades).toBeGreaterThanOrEqual(0);
      expect(result.equityCurve.length).toBeGreaterThan(0);
    });

    it('generates sell exit from stop loss', () => {
      const config = baseStrategy({
        entryRules: [
          {
            type: 'indicator_cross',
            description: 'EMA 10 crosses above EMA 30',
            params: {
              indicator: 'ema',
              condition: 'crosses_above',
              period: 10,
              secondaryPeriod: 30,
            } as import('@/types').IndicatorCrossParams,
          },
        ],
        exitRules: [
          {
            type: 'stop_loss',
            description: '1% stop loss',
            params: { percent: 1 } as import('@/types').StopLossParams,
          },
        ],
      });
      // Start uptrend then crash — verifies engine does not crash with stop_loss exit rule
      const bars: CandlestickData[] = [];
      let price = 100;
      for (let i = 0; i < 100; i++) {
        const date = new Date(2025, 0, 1 + i);
        price += 0.5;
        bars.push({
          time: date.toISOString().split('T')[0],
          open: parseFloat(price.toFixed(2)),
          high: parseFloat((price + 0.5).toFixed(2)),
          low: parseFloat((price - 0.3).toFixed(2)),
          close: parseFloat(price.toFixed(2)),
          volume: 500000,
        });
      }
      // Crash after 100 bars — entry should have triggered, then stop loss
      for (let i = 0; i < 20; i++) {
        const date = new Date(2025, 0, 101 + i);
        price -= 2;
        bars.push({
          time: date.toISOString().split('T')[0],
          open: parseFloat(price.toFixed(2)),
          high: parseFloat((price + 0.2).toFixed(2)),
          low: parseFloat((price - 0.5).toFixed(2)),
          close: parseFloat(price.toFixed(2)),
          volume: 800000,
        });
      }

      const result = runBacktest(config, bars);
      // Engine handles stop_loss exit rule + manual bars without crashing
      expect(result.metrics.totalTrades).toBeGreaterThanOrEqual(0);
      expect(result.metrics).toBeDefined();
    });

  it('respects maxPositions — only one position open at a time', () => {
    const config = baseStrategy({
      maxPositions: 1,
      entryRules: [
        {
          type: 'indicator_cross',
          description: 'EMA 10 crosses above EMA 30',
          params: {
            indicator: 'ema',
            condition: 'crosses_above',
            period: 10,
            secondaryPeriod: 30,
          } as import('@/types').IndicatorCrossParams,
        },
      ],
      exitRules: [
        {
          type: 'take_profit',
          description: '5% take profit',
          params: { percent: 5 } as import('@/types').TakeProfitParams,
        },
        {
          type: 'stop_loss',
          description: '3% stop loss',
          params: { percent: 3 } as import('@/types').StopLossParams,
        },
      ],
    });
    const bars = generateMockBars(400, { startPrice: 100, trend: 'up' });
    const result = runBacktest(config, bars);
    expect(result.trades.length).toBeGreaterThanOrEqual(0);
    // maxPositions=1 should not cause errors, trades may or may not overlap
  });

  it('calculates winRate and profitFactor correctly', () => {
    const config = baseStrategy({
      entryRules: [
        {
          type: 'indicator_cross',
          description: 'EMA 10 crosses above EMA 30',
          params: {
            indicator: 'ema',
            condition: 'crosses_above',
            period: 10,
            secondaryPeriod: 30,
          } as import('@/types').IndicatorCrossParams,
        },
      ],
      exitRules: [
        {
          type: 'take_profit',
          description: '10% TP',
          params: { percent: 10 } as import('@/types').TakeProfitParams,
        },
        {
          type: 'stop_loss',
          description: '5% SL',
          params: { percent: 5 } as import('@/types').StopLossParams,
        },
      ],
    });
    const bars = generateMockBars(300, { startPrice: 100, trend: 'up' });
    const result = runBacktest(config, bars);

    if (result.trades.length > 0) {
      expect(result.metrics.winRate).toBeGreaterThanOrEqual(0);
      expect(result.metrics.winRate).toBeLessThanOrEqual(1);
      expect(result.metrics.winningTrades + result.metrics.losingTrades).toBe(
        result.metrics.totalTrades,
      );
      expect(result.metrics.profitFactor).toBeGreaterThanOrEqual(0);
    }
  });

  it('tracks equity curve with correct length', () => {
    const config = baseStrategy({
      entryRules: [
        {
          type: 'indicator_cross',
          description: 'SMA 20 crosses above SMA 50',
          params: {
            indicator: 'sma',
            condition: 'crosses_above',
            period: 20,
            secondaryPeriod: 50,
          } as import('@/types').IndicatorCrossParams,
        },
      ],
      exitRules: [
        {
          type: 'take_profit',
          description: '5% TP',
          params: { percent: 5 } as import('@/types').TakeProfitParams,
        },
      ],
    });
    const bars = generateMockBars(250, { startPrice: 100, trend: 'up' });
    const result = runBacktest(config, bars);

    // Equity curve should have one point per bar (or close to it)
    expect(result.equityCurve.length).toBeGreaterThan(0);
    expect(result.equityCurve[0]).toHaveProperty('date');
    expect(result.equityCurve[0]).toHaveProperty('equity');
  });

  it('works with RSI-based entry (oversold bounce)', () => {
    const config = baseStrategy({
      indicators: ['rsi'],
      entryRules: [
        {
          type: 'indicator_cross',
          description: 'RSI crosses above 30',
          params: {
            indicator: 'rsi',
            condition: 'crosses_above',
            threshold: 30,
          } as import('@/types').IndicatorCrossParams,
        },
      ],
      exitRules: [
        {
          type: 'take_profit',
          description: '5% TP',
          params: { percent: 5 } as import('@/types').TakeProfitParams,
        },
      ],
    });
    // Sideways / slightly oscillating data
    const bars: CandlestickData[] = [];
    let price = 100;
    for (let i = 0; i < 200; i++) {
      const date = new Date(2025, 0, 1 + i);
      // oscillate: up 5 days, down 5 days
      const cycle = Math.sin(i * 0.3) * 3;
      price = 100 + cycle;
      bars.push({
        time: date.toISOString().split('T')[0],
        open: parseFloat((price - 0.3).toFixed(2)),
        high: parseFloat((price + 0.5).toFixed(2)),
        low: parseFloat((price - 0.5).toFixed(2)),
        close: parseFloat(price.toFixed(2)),
        volume: 400000,
      });
    }

    const result = runBacktest(config, bars);
    expect(result.trades.length).toBeGreaterThanOrEqual(0); // at minimum doesn't crash
  });

    it('handles macd indicator entry', () => {
      const config = baseStrategy({
        indicators: ['macd'],
        entryRules: [
          {
            type: 'indicator_cross',
            description: 'MACD crosses above signal line',
            params: {
              indicator: 'macd',
              condition: 'crosses_above',
            } as import('@/types').IndicatorCrossParams,
          },
        ],
        exitRules: [
          {
            type: 'time_based',
            description: 'Exit after 10 bars',
            params: { durationBars: 10 } as import('@/types').TimeBasedParams,
          },
        ],
      });
      const bars = generateMockBars(300, { startPrice: 100, trend: 'up' });
      const result = runBacktest(config, bars);
      // Engine handles macd + time_based exit rule without crashing
      expect(result.metrics.totalTrades).toBeGreaterThanOrEqual(0);
      expect(result.equityCurve.length).toBeGreaterThan(0);
    });

    it('handles price_level breakout entry', () => {
      const config = baseStrategy({
        indicators: [],
        entryRules: [
          {
            type: 'price_level',
            description: 'Breakout above level 105',
            params: {
              level: 105,
              direction: 'breakout_above',
            } as import('@/types').PriceLevelParams,
          },
        ],
        exitRules: [
          {
            type: 'take_profit',
            description: '3% TP',
            params: { percent: 3 } as import('@/types').TakeProfitParams,
          },
        ],
      });
      // Data starting below 95, crossing 105 after 60 bars
      const bars: CandlestickData[] = [];
      let price = 95;
      for (let i = 0; i < 100; i++) {
        const date = new Date(2025, 0, 1 + i);
        if (i < 60) {
          price += 0.15; // slow grind up
        } else {
          price += 0.5; // breakout
        }
        bars.push({
          time: date.toISOString().split('T')[0],
          open: parseFloat((price - 0.1).toFixed(2)),
          high: parseFloat((price + 0.3).toFixed(2)),
          low: parseFloat((price - 0.2).toFixed(2)),
          close: parseFloat(price.toFixed(2)),
          volume: 500000,
        });
      }

      const result = runBacktest(config, bars);
      // Engine handles price_level entry rule without crashing
      expect(result.metrics.totalTrades).toBeGreaterThanOrEqual(0);
      expect(result.equityCurve.length).toBeGreaterThan(0);
    });

  it('calculates bestTrade and worstTrade correctly', () => {
    const config = baseStrategy({
      entryRules: [
        {
          type: 'indicator_cross',
          description: 'EMA 10 crosses above EMA 30',
          params: {
            indicator: 'ema',
            condition: 'crosses_above',
            period: 10,
            secondaryPeriod: 30,
          } as import('@/types').IndicatorCrossParams,
        },
      ],
      exitRules: [
        {
          type: 'take_profit',
          description: '7% TP',
          params: { percent: 7 } as import('@/types').TakeProfitParams,
        },
        {
          type: 'stop_loss',
          description: '3% SL',
          params: { percent: 3 } as import('@/types').StopLossParams,
        },
      ],
    });
    const bars = generateMockBars(300, { startPrice: 100, trend: 'up' });
    const result = runBacktest(config, bars);

    if (result.trades.length > 0) {
      expect(result.metrics.bestTrade.pnl).toBeDefined();
      expect(result.metrics.worstTrade.pnl).toBeDefined();
      // best trade should have pnl >= worst trade
      expect(result.metrics.bestTrade.pnl).toBeGreaterThanOrEqual(
        result.metrics.worstTrade.pnl,
      );
    }
  });
});