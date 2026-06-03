// ─── Risk Manager (Advanced) ─────────────────────────────────────────────
//
//  Central risk management for live/paper trading. Validates whether
//  a trade can be placed based on configurable rules:
//
//  BASIC RULES (existing):
//  - Max daily loss (stops trading when reached)
//  - Max concurrent positions (per-symbol and total)
//  - Max position size (% of portfolio)
//  - Max exposure (% of portfolio deployed)
//  - Min cash buffer (keep some cash reserved)
//  - Max trades per day
//
//  ADVANCED RULES (new):
//  - Value at Risk (VaR) calculations (historical method)
//  - Correlation checks between existing and proposed positions
//  - Portfolio-level stop loss (max drawdown circuit breaker)
//  - Kelly Criterion dynamic position sizing
//  - Circuit breakers (daily loss %, weekly loss %, consecutive losses, VIX spike)
//
//  Usage:
//    const rm = new RiskManager({
//      maxDailyLoss: 500,
//      maxPositions: 5,
//      // advanced
//      varConfidence: 0.95,
//      maxCorrelation: 0.7,
//      useKellyCriterion: true,
//      kellyFraction: 0.5,
//      portfolioMaxDrawdown: -0.15,
//      maxConsecutiveLosses: 5,
//    });
//
//    const result = rm.canTrade({ symbol, quantity, price, capital, positions });
//    if (!result.allowed) console.log(result.reason);
//
// ════════════════════════════════════════════════════════════════════════

import type {
  Position,
  CorrelationPair,
  PortfolioRiskMetrics,
  CircuitBreakerState,
  CircuitBreakerReason,
  AdvancedRiskConfig,
} from '@/types';

export interface RiskConfig {
  /** Maximum daily loss in dollars. When reached, all trading stops. */
  maxDailyLoss?: number;
  /** Maximum number of concurrent open positions (total across symbols). */
  maxPositions?: number;
  /** Maximum position size as a fraction of total capital (e.g., 0.25 = 25%). */
  maxPositionSize?: number;
  /** Maximum total exposure as a fraction of capital (e.g., 0.8 = 80%). */
  maxExposure?: number;
  /** Minimum cash to keep unallocated (dollars). */
  minCashBuffer?: number;
  /** Maximum trades per day (rate limit). */
  maxTradesPerDay?: number;
  /** VaR confidence level (e.g., 0.95 for 95%). Default: 0.95 */
  varConfidence?: number;
  /** Maximum correlation allowed before blocking new position (e.g., 0.7). Default: 0.8 */
  maxCorrelation?: number;
  /** Enable Kelly Criterion position sizing (overrides riskPerTrade). Default: false */
  useKellyCriterion?: boolean;
  /** Kelly fraction multiplier (0.5 = half-Kelly, safer). Default: 0.5 */
  kellyFraction?: number;
  /** Portfolio-level max drawdown (percentage, negative, e.g., -0.15 = -15%). Default: -0.20 */
  portfolioMaxDrawdown?: number;
  /** Max daily loss percentage of capital (e.g., -0.03 = -3%). Default: -0.05 */
  maxDailyLossPercent?: number;
  /** Max weekly loss percentage of capital. Default: -0.08 */
  maxWeeklyLossPercent?: number;
  /** Max consecutive losses before circuit breaker trips. Default: 7 */
  maxConsecutiveLosses?: number;
  /** VIX threshold for volatility circuit breaker. Default: 35 */
  vixThreshold?: number;
  /** Cooldown minutes after circuit breaker trips. Default: 30 */
  circuitBreakerCooldown?: number;
}

export interface RiskTradeRequest {
  symbol: string;
  quantity: number;
  price: number;
  /** Total portfolio capital available */
  capital: number;
  /** Currently open positions */
  positions: Array<{
    symbol: string;
    quantity: number;
    avg_price: number;
    market_value: number;
    unrealized_pnl: number;
  }>;
  /** Total P&L for the current day */
  dailyPnl?: number;
  /** Total P&L for the current week */
  weeklyPnl?: number;
  /** Number of trades executed today */
  tradesToday?: number;
  /** Current VIX value (optional, for volatility circuit breaker) */
  vix?: number;
  /** Number of consecutive losing trades */
  consecutiveLosses?: number;
  /** Historical daily returns (% decimal, e.g., [0.01, -0.02, ...]) for VaR calc */
  dailyReturns?: number[];
  /** Win/loss history for streak tracking (true=win, false=loss) */
  tradeOutcomes?: boolean[];
  /** Peak portfolio value ever seen (for drawdown calculation) */
  peakPortfolioValue?: number;
  /** Correlation matrix data for open positions */
  correlations?: CorrelationPair[];
}

export interface RiskResult {
  allowed: boolean;
  reason?: string;
  rule?: string;
}

export interface RiskMetricsResult {
  varDaily: number;
  varWeekly: number;
  maxDrawdown: number;
  maxDrawdownDollar: number;
  currentDrawdown: number;
  kellyFraction: number;
}

// ─── Defaults ───────────────────────────────────────────────────────────

const DEFAULT_MAX_POSITIONS = 10;
const DEFAULT_MAX_POSITION_SIZE = 0.25; // 25%
const DEFAULT_MAX_EXPOSURE = 0.9; // 90%
const DEFAULT_MIN_CASH_BUFFER = 100; // $100
const DEFAULT_MAX_TRADES_PER_DAY = 50;
const DEFAULT_VAR_CONFIDENCE = 0.95;
const DEFAULT_MAX_CORRELATION = 0.8;
const DEFAULT_KELLY_FRACTION = 0.5;
const DEFAULT_PORTFOLIO_MAX_DRAWDOWN = -0.20;
const DEFAULT_MAX_DAILY_LOSS_PCT = -0.05;
const DEFAULT_MAX_WEEKLY_LOSS_PCT = -0.08;
const DEFAULT_MAX_CONSECUTIVE_LOSSES = 7;
const DEFAULT_VIX_THRESHOLD = 35;
const DEFAULT_CIRCUIT_BREAKER_COOLDOWN = 30; // minutes

// Z-score for confidence levels (one-tailed)
const Z_SCORES: Record<number, number> = {
  0.90: 1.282,
  0.95: 1.645,
  0.975: 1.960,
  0.99: 2.326,
};

export class RiskManager {
  private config: Required<RiskConfig>;

  /** Circuit breaker state */
  private circuitBreaker: CircuitBreakerState = {
    isTripped: false,
    reason: null,
    trippedAt: null,
    cooldownMinutes: DEFAULT_CIRCUIT_BREAKER_COOLDOWN,
    resumeAt: null,
  };

  /** Track peak portfolio value for drawdown */
  private peakValue: number = 0;

  constructor(config: RiskConfig = {}) {
    this.config = {
      maxDailyLoss: config.maxDailyLoss ?? Infinity,
      maxPositions: config.maxPositions ?? DEFAULT_MAX_POSITIONS,
      maxPositionSize: config.maxPositionSize ?? DEFAULT_MAX_POSITION_SIZE,
      maxExposure: config.maxExposure ?? DEFAULT_MAX_EXPOSURE,
      minCashBuffer: config.minCashBuffer ?? DEFAULT_MIN_CASH_BUFFER,
      maxTradesPerDay: config.maxTradesPerDay ?? DEFAULT_MAX_TRADES_PER_DAY,
      varConfidence: config.varConfidence ?? DEFAULT_VAR_CONFIDENCE,
      maxCorrelation: config.maxCorrelation ?? DEFAULT_MAX_CORRELATION,
      useKellyCriterion: config.useKellyCriterion ?? false,
      kellyFraction: config.kellyFraction ?? DEFAULT_KELLY_FRACTION,
      portfolioMaxDrawdown: config.portfolioMaxDrawdown ?? DEFAULT_PORTFOLIO_MAX_DRAWDOWN,
      maxDailyLossPercent: config.maxDailyLossPercent ?? DEFAULT_MAX_DAILY_LOSS_PCT,
      maxWeeklyLossPercent: config.maxWeeklyLossPercent ?? DEFAULT_MAX_WEEKLY_LOSS_PCT,
      maxConsecutiveLosses: config.maxConsecutiveLosses ?? DEFAULT_MAX_CONSECUTIVE_LOSSES,
      vixThreshold: config.vixThreshold ?? DEFAULT_VIX_THRESHOLD,
      circuitBreakerCooldown: config.circuitBreakerCooldown ?? DEFAULT_CIRCUIT_BREAKER_COOLDOWN,
    };
  }

  // ══════════════════════════════════════════════════════════════════════
  // Full Risk Validation
  // ══════════════════════════════════════════════════════════════════════

  /**
   * Full risk validation for a prospective trade.
   * Checks basic rules first, then advanced rules.
   */
  canTrade(req: RiskTradeRequest): RiskResult {
    // 0. Check circuit breaker first
    const cbCheck = this.checkCircuitBreaker();
    if (cbCheck) return cbCheck;

    // 1. Basic rules
    const basicChecks: Array<() => RiskResult | null> = [
      () => this.checkDailyLoss(req),
      () => this.checkDailyLossPercent(req),
      () => this.checkWeeklyLossPercent(req),
      () => this.checkMaxPositions(req),
      () => this.checkPositionSize(req),
      () => this.checkExposure(req),
      () => this.checkCashBuffer(req),
      () => this.checkTradeLimit(req),
    ];

    for (const check of basicChecks) {
      const result = check();
      if (result !== null) return result;
    }

    // 2. Advanced rules
    const advancedChecks: Array<() => RiskResult | null> = [
      () => this.checkDrawdown(req),
      () => this.checkCorrelation(req),
      () => this.checkConsecutiveLosses(req),
      () => this.checkVolatilitySpike(req),
    ];

    for (const check of advancedChecks) {
      const result = check();
      if (result !== null) {
        // Some advanced checks trip circuit breakers
        this.maybeTripCircuitBreaker(result);
        return result;
      }
    }

    return { allowed: true };
  }

  // ══════════════════════════════════════════════════════════════════════
  // Basic Rules
  // ══════════════════════════════════════════════════════════════════════

  checkDailyLoss(req: RiskTradeRequest): RiskResult | null {
    if (this.config.maxDailyLoss === Infinity) return null;
    const dailyPnl = req.dailyPnl ?? 0;
    if (dailyPnl <= -this.config.maxDailyLoss) {
      this.tripCircuitBreaker('daily_loss');
      return {
        allowed: false,
        reason: `Daily loss limit reached ($${this.config.maxDailyLoss}). Current P&L: $${dailyPnl.toFixed(2)}`,
        rule: 'maxDailyLoss',
      };
    }
    return null;
  }

  checkDailyLossPercent(req: RiskTradeRequest): RiskResult | null {
    const dailyPnl = req.dailyPnl ?? 0;
    const capital = req.capital || 1;
    const dailyPnlPct = dailyPnl / capital;
    if (dailyPnlPct <= this.config.maxDailyLossPercent) {
      this.tripCircuitBreaker('daily_loss');
      return {
        allowed: false,
        reason: `Daily loss limit reached: ${(dailyPnlPct * 100).toFixed(1)}% exceeds ${(this.config.maxDailyLossPercent * 100).toFixed(1)}%`,
        rule: 'maxDailyLossPercent',
      };
    }
    return null;
  }

  checkWeeklyLossPercent(req: RiskTradeRequest): RiskResult | null {
    const weeklyPnl = req.weeklyPnl ?? 0;
    const capital = req.capital || 1;
    const weeklyPnlPct = weeklyPnl / capital;
    if (weeklyPnlPct <= this.config.maxWeeklyLossPercent) {
      this.tripCircuitBreaker('weekly_loss');
      return {
        allowed: false,
        reason: `Weekly loss limit reached: ${(weeklyPnlPct * 100).toFixed(1)}% exceeds ${(this.config.maxWeeklyLossPercent * 100).toFixed(1)}%`,
        rule: 'maxWeeklyLossPercent',
      };
    }
    return null;
  }

  checkMaxPositions(req: RiskTradeRequest): RiskResult | null {
    const totalPositions = req.positions.length;
    if (totalPositions >= this.config.maxPositions) {
      return {
        allowed: false,
        reason: `Maximum positions reached (${this.config.maxPositions})`,
        rule: 'maxPositions',
      };
    }
    return null;
  }

  checkPositionSize(req: RiskTradeRequest): RiskResult | null {
    if (this.config.maxPositionSize >= 1) return null;
    const tradeValue = req.quantity * req.price;
    const maxAllowed = req.capital * this.config.maxPositionSize;
    if (tradeValue > maxAllowed) {
      return {
        allowed: false,
        reason: `Position too large: $${tradeValue.toFixed(2)} exceeds ${(this.config.maxPositionSize * 100).toFixed(0)}% of capital ($${maxAllowed.toFixed(2)})`,
        rule: 'maxPositionSize',
      };
    }
    return null;
  }

  checkExposure(req: RiskTradeRequest): RiskResult | null {
    if (this.config.maxExposure >= 1) return null;
    const currentExposure = req.positions.reduce(
      (sum, p) => sum + p.market_value,
      0,
    );
    const proposedExposure = req.quantity * req.price;
    const totalExposure = currentExposure + proposedExposure;

    if (totalExposure > req.capital * this.config.maxExposure) {
      return {
        allowed: false,
        reason: `Exposure limit reached: ${((totalExposure / req.capital) * 100).toFixed(0)}% exceeds ${(this.config.maxExposure * 100).toFixed(0)}%`,
        rule: 'maxExposure',
      };
    }
    return null;
  }

  checkCashBuffer(req: RiskTradeRequest): RiskResult | null {
    const tradeCost = req.quantity * req.price;
    const currentEquity =
      req.capital -
      req.positions.reduce((sum, p) => sum + p.market_value, 0);
    const remainingCash = currentEquity - tradeCost;

    if (remainingCash < this.config.minCashBuffer) {
      return {
        allowed: false,
        reason: `Insufficient cash buffer: after trade would have $${remainingCash.toFixed(2)}, minimum is $${this.config.minCashBuffer}`,
        rule: 'minCashBuffer',
      };
    }
    return null;
  }

  checkTradeLimit(req: RiskTradeRequest): RiskResult | null {
    const tradesToday = req.tradesToday ?? 0;
    if (tradesToday >= this.config.maxTradesPerDay) {
      return {
        allowed: false,
        reason: `Daily trade limit reached (${this.config.maxTradesPerDay})`,
        rule: 'maxTradesPerDay',
      };
    }
    return null;
  }

  // ══════════════════════════════════════════════════════════════════════
  // Advanced Rules — Drawdown (Portfolio-level Stop Loss)
  // ══════════════════════════════════════════════════════════════════════

  /**
   * Portfolio-level max drawdown check.
   * Uses peak value tracking + current portfolio to calculate drawdown.
   */
  checkDrawdown(req: RiskTradeRequest): RiskResult | null {
    const portfolioMaxDD = this.config.portfolioMaxDrawdown;
    if (portfolioMaxDD >= 0) return null; // disabled

    const currentValue = req.capital;
    const peak = req.peakPortfolioValue ?? this.peakValue;

    // Update peak if we're at a new high
    if (currentValue > peak) {
      this.peakValue = currentValue;
      return null;
    }

    if (peak <= 0) return null;

    const drawdown = (currentValue - peak) / peak;

    if (drawdown <= portfolioMaxDD) {
      this.tripCircuitBreaker('drawdown');
      return {
        allowed: false,
        reason: `Portfolio drawdown limit reached: ${(drawdown * 100).toFixed(1)}% exceeds ${(portfolioMaxDD * 100).toFixed(1)}%`,
        rule: 'portfolioMaxDrawdown',
      };
    }
    return null;
  }

  // ══════════════════════════════════════════════════════════════════════
  // Advanced Rules — Correlation Check
  // ══════════════════════════════════════════════════════════════════════

  /**
   * Check if the proposed symbol is too correlated with existing positions.
   * If correlation > maxCorrelation for any existing position, block the trade
   * (unless on the opposite side — e.g., selling a correlated pair).
   */
  checkCorrelation(req: RiskTradeRequest): RiskResult | null {
    const maxCorr = this.config.maxCorrelation;
    if (maxCorr >= 1) return null;

    const correlations = req.correlations;
    if (!correlations || correlations.length === 0) return null;

    const proposedSymbol = req.symbol.toUpperCase();

    for (const pos of req.positions) {
      const existingSymbol = pos.symbol.toUpperCase();
      if (existingSymbol === proposedSymbol) continue;

      // Find correlation between these two symbols
      const pair = correlations.find(
        (c) =>
          (c.symbolA.toUpperCase() === proposedSymbol &&
            c.symbolB.toUpperCase() === existingSymbol) ||
          (c.symbolA.toUpperCase() === existingSymbol &&
            c.symbolB.toUpperCase() === proposedSymbol),
      );

      if (pair && Math.abs(pair.correlation) >= maxCorr) {
        return {
          allowed: false,
          reason: `Correlation too high: ${proposedSymbol} ↔ ${existingSymbol} (${(pair.correlation * 100).toFixed(0)}% exceeds ${(maxCorr * 100).toFixed(0)}% limit)`,
          rule: 'maxCorrelation',
        };
      }
    }

    return null;
  }

  // ══════════════════════════════════════════════════════════════════════
  // Advanced Rules — Consecutive Losses
  // ══════════════════════════════════════════════════════════════════════

  checkConsecutiveLosses(req: RiskTradeRequest): RiskResult | null {
    const maxLosses = this.config.maxConsecutiveLosses;
    const consecutive = req.consecutiveLosses ?? 0;

    if (consecutive >= maxLosses) {
      this.tripCircuitBreaker('consecutive_losses');
      return {
        allowed: false,
        reason: `Circuit breaker: ${consecutive} consecutive losses (max ${maxLosses})`,
        rule: 'maxConsecutiveLosses',
      };
    }
    return null;
  }

  // ══════════════════════════════════════════════════════════════════════
  // Advanced Rules — Volatility Spike (VIX)
  // ══════════════════════════════════════════════════════════════════════

  checkVolatilitySpike(req: RiskTradeRequest): RiskResult | null {
    const vixThreshold = this.config.vixThreshold;
    const currentVix = req.vix;

    if (currentVix === undefined || currentVix === null) return null;

    if (currentVix >= vixThreshold) {
      this.tripCircuitBreaker('volatility_spike');
      return {
        allowed: false,
        reason: `Volatility spike: VIX ${currentVix.toFixed(1)} exceeds threshold ${vixThreshold}`,
        rule: 'vixThreshold',
      };
    }
    return null;
  }

  // ══════════════════════════════════════════════════════════════════════
  // Circuit Breaker
  // ══════════════════════════════════════════════════════════════════════

  /**
   * Check if circuit breaker is currently tripped and still in cooldown.
   */
  checkCircuitBreaker(): RiskResult | null {
    if (!this.circuitBreaker.isTripped) return null;

    const now = new Date();
    const resumeAt = this.circuitBreaker.resumeAt
      ? new Date(this.circuitBreaker.resumeAt)
      : null;

    if (resumeAt && now < resumeAt) {
      const remaining = Math.ceil((resumeAt.getTime() - now.getTime()) / 60000);
      return {
        allowed: false,
        reason: `Circuit breaker active (${this.circuitBreaker.reason}). Resumes in ${remaining} min.`,
        rule: 'circuitBreaker',
      };
    }

    // Cooldown expired, reset
    this.circuitBreaker = {
      isTripped: false,
      reason: null,
      trippedAt: null,
      cooldownMinutes: this.config.circuitBreakerCooldown,
      resumeAt: null,
    };
    return null;
  }

  /**
   * Trip the circuit breaker, halting all trading for the cooldown period.
   */
  tripCircuitBreaker(reason: CircuitBreakerReason): void {
    const now = new Date();
    const cooldown = this.config.circuitBreakerCooldown;
    this.circuitBreaker = {
      isTripped: true,
      reason,
      trippedAt: now.toISOString(),
      cooldownMinutes: cooldown,
      resumeAt: new Date(now.getTime() + cooldown * 60000).toISOString(),
    };
  }

  /**
   * Automatically trip circuit breaker for certain advanced rule violations.
   */
  private maybeTripCircuitBreaker(result: RiskResult): void {
    if (!result.allowed) {
      const rule = result.rule;
      if (
        rule === 'portfolioMaxDrawdown' ||
        rule === 'maxConsecutiveLosses' ||
        rule === 'vixThreshold'
      ) {
        // Already tripped inside the individual checks
      }
    }
  }

  /**
   * Manually reset the circuit breaker.
   */
  resetCircuitBreaker(): void {
    this.circuitBreaker = {
      isTripped: false,
      reason: null,
      trippedAt: null,
      cooldownMinutes: this.config.circuitBreakerCooldown,
      resumeAt: null,
    };
  }

  /**
   * Get current circuit breaker state.
   */
  getCircuitBreakerState(): Readonly<CircuitBreakerState> {
    return { ...this.circuitBreaker };
  }

  // ══════════════════════════════════════════════════════════════════════
  // Value at Risk (VaR) — Historical Method
  // ══════════════════════════════════════════════════════════════════════

  /**
   * Calculate daily Value at Risk using the historical method.
   *
   * Method: takes the N daily returns, sorts them, picks the percentile
   * corresponding to (1 - confidence). That's the worst expected loss at
   * the given confidence level.
   *
   * E.g., at 95% confidence with 100 returns: sort, take the 5th worst.
   */
  calculateVaR(
    dailyReturns: number[],
    capital: number,
    confidence?: number,
  ): number {
    const conf = confidence ?? this.config.varConfidence;

    if (!dailyReturns || dailyReturns.length < 5) {
      // Fallback: simple volatility estimate
      // Assume 1.5% daily std dev if no data
      const zScore = this.getZScore(conf);
      return capital * 0.015 * zScore;
    }

    // Sort returns ascending (most negative first)
    const sorted = [...dailyReturns].sort((a, b) => a - b);

    // Find the index at the target percentile
    // For 95% confidence: index = floor(N * (1 - 0.95))
    const percentile = 1 - conf;
    const index = Math.floor(sorted.length * percentile);

    // The VaR return is at this index (worst case at confidence level)
    const varReturn = sorted[Math.max(0, Math.min(index, sorted.length - 1))];

    // VaR = capital * abs(varReturn)
    return capital * Math.abs(varReturn);
  }

  /**
   * Calculate weekly VaR from daily VaR (square root of time rule).
   */
  calculateWeeklyVaR(dailyVar: number): number {
    return dailyVar * Math.sqrt(5); // trading days per week
  }

  /**
   * Get the Z-score for a given confidence level.
   */
  private getZScore(confidence: number): number {
    // Find closest key
    const keys = Object.keys(Z_SCORES).map(Number);
    const closest = keys.reduce((prev, curr) =>
      Math.abs(curr - confidence) < Math.abs(prev - confidence) ? curr : prev,
    );
    return Z_SCORES[closest] ?? 1.645;
  }

  // ══════════════════════════════════════════════════════════════════════
  // Correlation between symbols
  // ══════════════════════════════════════════════════════════════════════

  /**
   * Calculate Pearson correlation coefficient between two return series.
   *
   * Formula: r = Σ((x - x̄)(y - ȳ)) / √(Σ(x - x̄)² * Σ(y - ȳ)²)
   */
  calculateCorrelation(returnsA: number[], returnsB: number[]): number {
    if (returnsA.length !== returnsB.length || returnsA.length < 2) {
      return 0;
    }

    const n = returnsA.length;

    // Means
    const meanA = returnsA.reduce((s, v) => s + v, 0) / n;
    const meanB = returnsB.reduce((s, v) => s + v, 0) / n;

    // Covariance and variances
    let cov = 0;
    let varA = 0;
    let varB = 0;

    for (let i = 0; i < n; i++) {
      const diffA = returnsA[i] - meanA;
      const diffB = returnsB[i] - meanB;
      cov += diffA * diffB;
      varA += diffA * diffA;
      varB += diffB * diffB;
    }

    if (varA === 0 || varB === 0) return 0;

    return cov / Math.sqrt(varA * varB);
  }

  /**
   * Build a correlation matrix for a set of symbols given their return series.
   *
   * @param symbolReturns - Map of symbol → daily returns array
   * @returns Array of CorrelationPair
   */
  buildCorrelationMatrix(
    symbolReturns: Map<string, number[]>,
    lookbackDays: number = 252,
  ): CorrelationPair[] {
    const symbols = Array.from(symbolReturns.keys());
    const pairs: CorrelationPair[] = [];
    const now = new Date().toISOString();

    for (let i = 0; i < symbols.length; i++) {
      for (let j = i + 1; j < symbols.length; j++) {
        const symA = symbols[i];
        const symB = symbols[j];
        const returnsA = symbolReturns.get(symA)?.slice(-lookbackDays) ?? [];
        const returnsB = symbolReturns.get(symB)?.slice(-lookbackDays) ?? [];

        const correlation = this.calculateCorrelation(returnsA, returnsB);

        pairs.push({
          symbolA: symA,
          symbolB: symB,
          correlation: Math.round(correlation * 10000) / 10000,
          lookbackDays: Math.min(returnsA.length, returnsB.length),
          updatedAt: now,
        });
      }
    }

    return pairs;
  }

  /**
   * Count how many highly correlated pairs exist given threshold.
   */
  countCorrelatedPairs(correlations: CorrelationPair[], threshold?: number): number {
    const t = threshold ?? this.config.maxCorrelation;
    return correlations.filter((c) => Math.abs(c.correlation) >= t).length;
  }

  // ══════════════════════════════════════════════════════════════════════
  // Kelly Criterion — Dynamic Position Sizing
  // ══════════════════════════════════════════════════════════════════════

  /**
   * Calculate Kelly Criterion optimal bet size.
   *
   * Formula: f* = (p * b - q) / b
   *   where:
   *     p = win probability (win rate)
   *     q = loss probability (1 - p)
   *     b = avg win / avg loss (ratio of avg gains to avg losses)
   *
   * Returns the fraction of capital to bet.
   * If useKellyCriterion is enabled and kellyFraction is set, this
   * overrides the strategy's riskPerTrade.
   */
  calculateKellyFraction(
    winRate: number,
    avgWin: number,
    avgLoss: number,
  ): number {
    if (avgLoss === 0) return 0;

    const p = Math.max(0.01, Math.min(0.99, winRate)); // clamp
    const q = 1 - p;
    const b = avgWin / Math.abs(avgLoss);

    if (b <= 0) return 0;

    // Kelly formula
    const kelly = (p * b - q) / b;

    // Clamp to reasonable range
    return Math.max(0, Math.min(0.25, kelly));
  }

  /**
   * Get the recommended bet size (fraction of capital).
   * If Kelly is enabled, returns the Kelly fraction * kellyFraction multiplier.
   * Otherwise returns 0 (meaning use strategy default).
   */
  getRecommendedBetSize(
    winRate: number,
    avgWin: number,
    avgLoss: number,
  ): number {
    if (!this.config.useKellyCriterion) return 0; // disabled

    const kelly = this.calculateKellyFraction(winRate, avgWin, avgLoss);
    return kelly * this.config.kellyFraction;
  }

  /**
   * Calculate recommended quantity using Kelly position sizing.
   *
   * @param capital - Available capital
   * @param price - Current price per share
   * @param winRate - Historical win rate (0-1)
   * @param avgWin - Average win amount
   * @param avgLoss - Average loss amount (positive number)
   * @returns Recommended quantity (rounded down to integer)
   */
  calculateKellyQuantity(
    capital: number,
    price: number,
    winRate: number,
    avgWin: number,
    avgLoss: number,
  ): number {
    if (price <= 0 || capital <= 0) return 0;

    const betSize = this.getRecommendedBetSize(winRate, avgWin, avgLoss);
    if (betSize <= 0) return 0;

    const allocation = capital * betSize;
    return Math.floor(allocation / price);
  }

  // ══════════════════════════════════════════════════════════════════════
  // Portfolio Risk Metrics (aggregation)
  // ══════════════════════════════════════════════════════════════════════

  /**
   * Compute full portfolio risk metrics snapshot.
   */
  computePortfolioRiskMetrics(params: {
    capital: number;
    peakValue?: number;
    dailyReturns?: number[];
    positions: Array<{
      symbol: string;
      market_value: number;
      unrealized_pnl: number;
    }>;
    correlations?: CorrelationPair[];
    winRate?: number;
    avgWin?: number;
    avgLoss?: number;
  }): PortfolioRiskMetrics {
    const {
      capital,
      peakValue,
      dailyReturns = [],
      positions,
      correlations = [],
      winRate = 0.5,
      avgWin = 100,
      avgLoss = -100,
    } = params;

    // VaR
    const varDaily = this.calculateVaR(dailyReturns, capital);
    const varWeekly = this.calculateWeeklyVaR(varDaily);

    // Drawdown
    const peak = peakValue ?? capital;
    const currentDrawdown = peak > 0 ? (capital - peak) / peak : 0;
    const maxDrawdownDollar = peak > 0 ? Math.min(0, capital - peak) : 0;

    // Concentration
    const totalMarketValue = positions.reduce((s, p) => s + p.market_value, 0);
    const concentration = positions.map((p) => ({
      symbol: p.symbol,
      weight: totalMarketValue > 0 ? p.market_value / totalMarketValue : 0,
    }));

    // Kelly
    const kellyFraction = this.getRecommendedBetSize(winRate, avgWin, Math.abs(avgLoss));

    // Correlated pairs
    const correlatedPairs = this.countCorrelatedPairs(correlations);

    return {
      varDaily: Math.round(varDaily * 100) / 100,
      varWeekly: Math.round(varWeekly * 100) / 100,
      varConfidence: this.config.varConfidence,
      maxDrawdown: Math.round(currentDrawdown * 10000) / 100,
      maxDrawdownDollar: Math.round(maxDrawdownDollar * 100) / 100,
      currentDrawdown: Math.round(currentDrawdown * 10000) / 100,
      sharpeRatio: 0, // requires risk-free rate + returns series
      concentration,
      kellyFraction: Math.round(kellyFraction * 10000) / 100,
      correlatedPairs,
    };
  }

  // ══════════════════════════════════════════════════════════════════════
  // Config Management
  // ══════════════════════════════════════════════════════════════════════

  /**
   * Update risk configuration at runtime.
   */
  updateConfig(partial: Partial<RiskConfig>): void {
    Object.assign(this.config, partial);
  }

  /**
   * Get current risk config (read-only).
   */
  getConfig(): Readonly<Required<RiskConfig>> {
    return { ...this.config };
  }

  /**
   * Update peak portfolio value (e.g., after a deposit or new high).
   */
  setPeakValue(value: number): void {
    if (value > this.peakValue) {
      this.peakValue = value;
    }
  }
}

// ── Singleton for app-wide risk management ──────────────────────────

let instance: RiskManager | null = null;

export function getRiskManager(): RiskManager {
  if (!instance) {
    instance = new RiskManager();
  }
  return instance;
}

export function configureRiskManager(config: RiskConfig): RiskManager {
  instance = new RiskManager(config);
  return instance;
}