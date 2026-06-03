import type { StrategyConfig, EntryRule, ExitRule } from '@/types';

export interface StrategyTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;          // emoji or icon identifier
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  category: string;
  tags: string[];
  config: StrategyConfig;
}

export const strategyTemplates: StrategyTemplate[] = [
  // ─── 1. Moving Average Crossover ──────────────────────────
  {
    id: 'ma-crossover',
    name: 'Moving Average Crossover',
    description:
      'Classic trend-following strategy that buys when a fast MA crosses above a slow MA and sells when it crosses below. Works well in trending markets.',
    icon: '📈',
    difficulty: 'beginner',
    category: 'Trend Following',
    tags: ['moving-average', 'crossover', 'trend'],
    config: {
      type: 'trend_following',
      timeframes: ['1h', '4h'],
      symbols: ['SPY', 'AAPL'],
      indicators: ['sma', 'ema'],
      entryRules: [
        {
          type: 'indicator_cross',
          description: 'Fast EMA crosses above Slow SMA',
          params: {
            indicator: 'ema',
            condition: 'crosses_above',
            secondaryIndicator: 'sma',
            period: 9,
            secondaryPeriod: 21,
          },
        } as EntryRule,
      ],
      exitRules: [
        {
          type: 'indicator_signal',
          description: 'Fast EMA crosses below Slow SMA',
          params: {
            indicator: 'ema',
            condition: 'crosses_below',
            period: 9,
          },
        } as ExitRule,
        {
          type: 'stop_loss',
          description: 'Stop loss at 3%',
          params: { percent: 3 },
        } as ExitRule,
        {
          type: 'take_profit',
          description: 'Take profit at 6%',
          params: { percent: 6 },
        } as ExitRule,
      ],
      riskPerTrade: 2,
      maxPositions: 3,
    },
  },

  // ─── 2. RSI Mean Reversion ─────────────────────────────────
  {
    id: 'rsi-mean-reversion',
    name: 'RSI Mean Reversion',
    description:
      'Mean reversion strategy using RSI. Buys when RSI drops below oversold threshold (30) and crosses back above. Sells when RSI rises above overbought (70) and crosses below. Ideal for ranging markets.',
    icon: '🔄',
    difficulty: 'beginner',
    category: 'Mean Reversion',
    tags: ['rsi', 'oversold', 'overbought', 'mean-reversion'],
    config: {
      type: 'mean_reversion',
      timeframes: ['15m', '1h'],
      symbols: ['MSFT', 'GOOGL'],
      indicators: ['rsi'],
      entryRules: [
        {
          type: 'indicator_cross',
          description: 'RSI crosses above 30 (oversold recovery)',
          params: {
            indicator: 'rsi',
            condition: 'crosses_above',
            threshold: 30,
            period: 14,
          },
        } as EntryRule,
      ],
      exitRules: [
        {
          type: 'indicator_signal',
          description: 'RSI crosses below 70 (overbought)',
          params: {
            indicator: 'rsi',
            condition: 'crosses_below',
            threshold: 70,
            period: 14,
          },
        } as ExitRule,
        {
          type: 'stop_loss',
          description: 'Stop loss at 2%',
          params: { percent: 2 },
        } as ExitRule,
        {
          type: 'take_profit',
          description: 'Take profit at 4%',
          params: { percent: 4 },
        } as ExitRule,
      ],
      riskPerTrade: 1.5,
      maxPositions: 4,
    },
  },

  // ─── 3. Breakout Strategy ──────────────────────────────────
  {
    id: 'breakout',
    name: 'Breakout Trading',
    description:
      'Momentum breakout strategy that enters when price breaks above a key resistance level with volume confirmation. Uses trailing stop to capture extended moves.',
    icon: '🚀',
    difficulty: 'intermediate',
    category: 'Breakout',
    tags: ['breakout', 'momentum', 'volume'],
    config: {
      type: 'breakout',
      timeframes: ['5m', '15m', '1h'],
      symbols: ['NVDA', 'TSLA'],
      indicators: ['volume', 'sma'],
      entryRules: [
        {
          type: 'price_level',
          description: 'Price breaks above resistance level',
          params: {
            level: 0, // user-specified
            direction: 'breakout_above',
          },
        } as EntryRule,
        {
          type: 'indicator_cross',
          description: 'Volume above 1.5x average',
          params: {
            indicator: 'volume',
            condition: 'above',
            threshold: 150,
          },
        } as EntryRule,
      ],
      exitRules: [
        {
          type: 'trailing_stop',
          description: 'Trailing stop at 3% with 1.5% activation',
          params: {
            percent: 3,
            activationPercent: 1.5,
          },
        } as ExitRule,
        {
          type: 'stop_loss',
          description: 'Hard stop loss at 4%',
          params: { percent: 4 },
        } as ExitRule,
      ],
      riskPerTrade: 2,
      maxPositions: 2,
    },
  },

  // ─── 4. MACD Signal ────────────────────────────────────────
  {
    id: 'macd-signal',
    name: 'MACD Signal Line Crossover',
    description:
      'Uses MACD line crossing above signal line for buy signals, and crossing below for sell signals. Combines with trend filter (SMA 200) to trade only in the direction of the longer trend.',
    icon: '📊',
    difficulty: 'intermediate',
    category: 'Trend Following',
    tags: ['macd', 'signal-line', 'trend-filter'],
    config: {
      type: 'trend_following',
      timeframes: ['4h', '1d'],
      symbols: ['QQQ', 'IWM'],
      indicators: ['macd', 'sma'],
      entryRules: [
        {
          type: 'indicator_cross',
          description: 'MACD line crosses above signal line',
          params: {
            indicator: 'macd',
            condition: 'crosses_above',
            threshold: 0,
          },
        } as EntryRule,
      ],
      exitRules: [
        {
          type: 'indicator_signal',
          description: 'MACD line crosses below signal line',
          params: {
            indicator: 'macd',
            condition: 'crosses_below',
            threshold: 0,
          },
        } as ExitRule,
        {
          type: 'stop_loss',
          description: 'Stop loss at 2.5%',
          params: { percent: 2.5 },
        } as ExitRule,
        {
          type: 'take_profit',
          description: 'Take profit at 5%',
          params: { percent: 5 },
        } as ExitRule,
      ],
      riskPerTrade: 2,
      maxPositions: 3,
    },
  },

  // ─── 5. Bollinger Bounce ───────────────────────────────────
  {
    id: 'bollinger-bounce',
    name: 'Bollinger Band Bounce',
    description:
      'Mean reversion strategy using Bollinger Bands. Buys when price touches the lower band and shows reversal. Sells when price reaches upper band or middle band (SMA 20).',
    icon: '🎯',
    difficulty: 'intermediate',
    category: 'Mean Reversion',
    tags: ['bollinger', 'bands', 'reversal'],
    config: {
      type: 'mean_reversion',
      timeframes: ['15m', '1h', '4h'],
      symbols: ['AMD', 'META'],
      indicators: ['bollinger', 'sma'],
      entryRules: [
        {
          type: 'indicator_cross',
          description: 'Price near lower Bollinger Band with RSI confirming',
          params: {
            indicator: 'bollinger',
            condition: 'below',
            threshold: 20,
          },
        } as EntryRule,
      ],
      exitRules: [
        {
          type: 'indicator_signal',
          description: 'Price reaches middle band (SMA 20)',
          params: {
            indicator: 'bollinger',
            condition: 'crosses_above',
            threshold: 50,
          },
        } as ExitRule,
        {
          type: 'stop_loss',
          description: 'Stop loss at 2%',
          params: { percent: 2 },
        } as ExitRule,
        {
          type: 'take_profit',
          description: 'Take profit at 3%',
          params: { percent: 3 },
        } as ExitRule,
      ],
      riskPerTrade: 1.5,
      maxPositions: 3,
    },
  },

  // ─── 6. Scalping ───────────────────────────────────────────
  {
    id: 'scalping',
    name: 'Quick Scalping',
    description:
      'High-frequency scalping strategy for small, rapid profits. Uses RSI and volume spikes to capture quick moves on short timeframes. Tight stops and fast profit targets.',
    icon: '⚡',
    difficulty: 'advanced',
    category: 'Scalping',
    tags: ['scalping', 'fast', 'rsi', 'volume'],
    config: {
      type: 'scalping',
      timeframes: ['1m', '5m'],
      symbols: ['SPY', 'QQQ'],
      indicators: ['rsi', 'volume'],
      entryRules: [
        {
          type: 'indicator_cross',
          description: 'RSI crosses above 40 with volume spike',
          params: {
            indicator: 'rsi',
            condition: 'crosses_above',
            threshold: 40,
            period: 7,
          },
        } as EntryRule,
      ],
      exitRules: [
        {
          type: 'take_profit',
          description: 'Quick take profit at 0.5%',
          params: { percent: 0.5 },
        } as ExitRule,
        {
          type: 'stop_loss',
          description: 'Tight stop loss at 0.3%',
          params: { percent: 0.3 },
        } as ExitRule,
        {
          type: 'time_based',
          description: 'Exit after 15 minutes if no target hit',
          params: { durationMinutes: 15 },
        } as ExitRule,
      ],
      riskPerTrade: 0.5,
      maxPositions: 5,
    },
  },

  // ─── 7. Golden Cross ───────────────────────────────────────
  {
    id: 'golden-cross',
    name: 'Golden Cross / Death Cross',
    description:
      'Long-term trend following using SMA 50 and SMA 200 crossovers. Golden Cross (50 above 200) signals buy; Death Cross (50 below 200) signals sell. Best on daily timeframe.',
    icon: '🥇',
    difficulty: 'beginner',
    category: 'Trend Following',
    tags: ['golden-cross', 'death-cross', 'sma', 'long-term'],
    config: {
      type: 'trend_following',
      timeframes: ['1d'],
      symbols: ['SPY', 'DIA', 'QQQ'],
      indicators: ['sma'],
      entryRules: [
        {
          type: 'indicator_cross',
          description: 'SMA 50 crosses above SMA 200 (Golden Cross)',
          params: {
            indicator: 'sma',
            condition: 'crosses_above',
            secondaryIndicator: 'sma',
            period: 50,
            secondaryPeriod: 200,
          },
        } as EntryRule,
      ],
      exitRules: [
        {
          type: 'indicator_signal',
          description: 'SMA 50 crosses below SMA 200 (Death Cross)',
          params: {
            indicator: 'sma',
            condition: 'crosses_below',
            period: 50,
          },
        } as ExitRule,
        {
          type: 'stop_loss',
          description: 'Stop loss at 5%',
          params: { percent: 5 },
        } as ExitRule,
        {
          type: 'take_profit',
          description: 'Take profit at 15%',
          params: { percent: 15 },
        } as ExitRule,
      ],
      riskPerTrade: 3,
      maxPositions: 4,
    },
  },

  // ─── 8. Volume Breakout ────────────────────────────────────
  {
    id: 'volume-breakout',
    name: 'Volume Surge Breakout',
    description:
      'Detects unusual volume surges combined with price breakouts. Enters when volume exceeds 2x average and price breaks recent high. Good for catching explosive moves.',
    icon: '💥',
    difficulty: 'intermediate',
    category: 'Breakout',
    tags: ['volume', 'breakout', 'surge'],
    config: {
      type: 'breakout',
      timeframes: ['5m', '15m', '30m'],
      symbols: ['TSLA', 'NVDA', 'AMD'],
      indicators: ['volume'],
      entryRules: [
        {
          type: 'indicator_cross',
          description: 'Volume 200% above average',
          params: {
            indicator: 'volume',
            condition: 'above',
            threshold: 200,
          },
        } as EntryRule,
      ],
      exitRules: [
        {
          type: 'trailing_stop',
          description: 'Trailing stop at 2%',
          params: {
            percent: 2,
            activationPercent: 1,
          },
        } as ExitRule,
        {
          type: 'stop_loss',
          description: 'Stop loss at 3%',
          params: { percent: 3 },
        } as ExitRule,
        {
          type: 'time_based',
          description: 'Exit after 2 hours',
          params: { durationHours: 2 },
        } as ExitRule,
      ],
      riskPerTrade: 2,
      maxPositions: 2,
    },
  },

  // ─── 9. Dual RSI + SMA Filter ──────────────────────────────
  {
    id: 'dual-rsi-sma',
    name: 'Dual RSI with SMA Filter',
    description:
      'Combines short-term RSI (7) for entry timing with longer RSI (14) for trend context. SMA 50 acts as directional filter — only takes long signals above SMA, short signals below.',
    icon: '🔍',
    difficulty: 'advanced',
    category: 'Mean Reversion',
    tags: ['rsi', 'sma', 'filter', 'dual-indicator'],
    config: {
      type: 'mean_reversion',
      timeframes: ['1h', '4h'],
      symbols: ['AAPL', 'MSFT', 'GOOGL'],
      indicators: ['rsi', 'sma'],
      entryRules: [
        {
          type: 'indicator_cross',
          description: 'RSI(7) crosses above 35',
          params: {
            indicator: 'rsi',
            condition: 'crosses_above',
            threshold: 35,
            period: 7,
          },
        } as EntryRule,
      ],
      exitRules: [
        {
          type: 'indicator_signal',
          description: 'RSI(7) crosses below 65',
          params: {
            indicator: 'rsi',
            condition: 'crosses_below',
            threshold: 65,
            period: 7,
          },
        } as ExitRule,
        {
          type: 'stop_loss',
          description: 'Stop loss at 1.5%',
          params: { percent: 1.5 },
        } as ExitRule,
        {
          type: 'take_profit',
          description: 'Take profit at 3%',
          params: { percent: 3 },
        } as ExitRule,
      ],
      riskPerTrade: 1,
      maxPositions: 3,
    },
  },
];

/**
 * Get a template by its ID.
 */
export function getTemplateById(id: string): StrategyTemplate | undefined {
  return strategyTemplates.find((t) => t.id === id);
}

/**
 * Get templates filtered by category or difficulty.
 */
export function getTemplatesByFilter(filters: {
  category?: string;
  difficulty?: StrategyTemplate['difficulty'];
}): StrategyTemplate[] {
  return strategyTemplates.filter((t) => {
    if (filters.category && t.category !== filters.category) return false;
    if (filters.difficulty && t.difficulty !== filters.difficulty) return false;
    return true;
  });
}

/**
 * All unique categories from templates.
 */
export function getTemplateCategories(): string[] {
  return [...new Set(strategyTemplates.map((t) => t.category))];
}