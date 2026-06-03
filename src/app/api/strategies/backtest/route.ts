import { NextRequest, NextResponse } from 'next/server';
import { generateCandlestickData } from '@/lib/mock-data';
import { runBacktest } from '@/lib/services/strategy-engine';
import { fetchDailyCandles } from '@/lib/services/alpha-vantage';
import type { AlphaVantageError } from '@/lib/services/alpha-vantage';
import type { StrategyConfig, CandlestickData } from '@/types';

/**
 * Try Alpha Vantage first; fall back to synthetic data on failure.
 */
async function getCandles(
  symbol: string,
  days: number,
): Promise<{ data: CandlestickData[]; source: 'alpha-vantage' | 'synthetic' }> {
  // 1) Try Alpha Vantage
  const result = await fetchDailyCandles(symbol, 'compact');
  if (!('error' in result)) {
    // Limit to requested day count (AV compact returns ~100 bars)
    const sliced = result.slice(-days);
    return { data: sliced, source: 'alpha-vantage' };
  }

  // 2) Fallback to synthetic (log the real error)
  console.warn(
    `Alpha Vantage fetch failed for ${symbol}: ${(result as AlphaVantageError).error}`,
  );
  return {
    data: generateCandlestickData(symbol, days),
    source: 'synthetic',
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { config, symbol, days = 252 } = body as {
      config: StrategyConfig;
      symbol?: string;
      days?: number;
    };

    if (!config) {
      return NextResponse.json({ error: 'Missing strategy config' }, { status: 400 });
    }

    // Gather candle data for requested symbols (or default)
    const symbols = symbol ? [symbol] : config.symbols;
    const symbolDataMap: Record<string, CandlestickData[]> = {};
    const dataSources: string[] = [];

    for (const sym of symbols) {
      const { data, source } = await getCandles(sym, days);
      symbolDataMap[sym] = data;
      dataSources.push(source);
    }

    // Run backtest per symbol
    const results = symbols.map((sym) => {
      const data = symbolDataMap[sym];
      const result = runBacktest(config, data, 100_000);
      return {
        symbol: sym,
        ...result,
      };
    });

    // Aggregate if multiple symbols
    const aggregated = results.length === 1 ? results[0] : null;

    return NextResponse.json({
      results,
      aggregated,
      dataSource: dataSources.length === 1 ? dataSources[0] : dataSources,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Backtest error:', error);
    return NextResponse.json(
      { error: 'Backtest execution failed', details: String(error) },
      { status: 500 },
    );
  }
}
