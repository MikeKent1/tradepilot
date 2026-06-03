import { NextResponse } from 'next/server';
import { getAlpacaClient } from '@/lib/services/alpaca-client';
import * as dataService from '@/lib/services/data-service';

/**
 * POST /api/alpaca/sync
 *
 * Syncs Alpaca positions & account with Supabase.
 * Call this periodically or after order execution to keep
 * the local portfolio in sync with the broker.
 *
 * Body:
 * {
 *   userId: string,
 *   mode: 'paper' | 'live'
 * }
 *
 * Flow:
 *  1. Fetch Alpaca account & positions
 *  2. Fetch Supabase portfolio & positions
 *  3. Diff & reconcile
 *  4. Return sync summary
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { userId, mode = 'paper' } = body;

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'userId is required' },
        { status: 400 },
      );
    }

    const tradingMode = (mode === 'live' ? 'live' : 'paper') as 'paper' | 'live';
    const alpaca = getAlpacaClient();

    // ── 1. Fetch Alpaca state ────────────────────────────────
    const [alpacaAccount, alpacaPositions] = await Promise.all([
      alpaca.getAccount(),
      alpaca.getPositions(),
    ]);

    // ── 2. Fetch Supabase state ──────────────────────────────
    let portfolio = await dataService.fetchPortfolio(userId, tradingMode);
    if (!portfolio) {
      portfolio = await dataService.createPortfolio(userId, 'Default', tradingMode);
    }
    if (!portfolio) {
      return NextResponse.json(
        { success: false, error: 'Failed to find or create portfolio' },
        { status: 500 },
      );
    }

    const supabasePositions = await dataService.fetchPositions(portfolio.id);

    // ── 3. Reconcile ──────────────────────────────────────────
    const syncedPositions: string[] = [];
    const closedPositions: string[] = [];
    const createdPositions: string[] = [];

    // Upsert each Alpaca position into Supabase
    for (const ap of alpacaPositions) {
      const qty = parseFloat(ap.qty);
      const avgPrice = parseFloat(ap.avg_entry_price);
      const currentPrice = parseFloat(ap.current_price);
      const marketValue = parseFloat(ap.market_value);
      const unrealizedPl = parseFloat(ap.unrealized_pl);
      const unrealizedPlpc = parseFloat(ap.unrealized_plpc);

      const existing = supabasePositions.find(
        (p) => p.symbol.toUpperCase() === ap.symbol.toUpperCase(),
      );

      if (existing) {
        await dataService.upsertPosition(portfolio.id, {
          id: existing.id,
          symbol: ap.symbol,
          name: ap.symbol,
          quantity: qty,
          avg_price: avgPrice,
          current_price: currentPrice,
          market_value: marketValue,
          unrealized_pnl: unrealizedPl,
          unrealized_pnl_percent: unrealizedPlpc,
          realized_pnl: existing.realized_pnl,
        });
        syncedPositions.push(ap.symbol);
      } else {
        await dataService.upsertPosition(portfolio.id, {
          symbol: ap.symbol,
          name: ap.symbol,
          quantity: qty,
          avg_price: avgPrice,
          current_price: currentPrice,
          market_value: marketValue,
          unrealized_pnl: unrealizedPl,
          unrealized_pnl_percent: unrealizedPlpc,
          realized_pnl: 0,
        });
        createdPositions.push(ap.symbol);
      }
    }

    // Close Supabase positions that no longer exist in Alpaca
    const alpacaSymbols = new Set(alpacaPositions.map((p) => p.symbol.toUpperCase()));
    for (const sp of supabasePositions) {
      if (!alpacaSymbols.has(sp.symbol.toUpperCase())) {
        await dataService.deletePosition(sp.id);
        closedPositions.push(sp.symbol);
      }
    }

    // ── 4. Update portfolio balance from Alpaca ──────────────
    const alpacaCash = parseFloat(alpacaAccount.cash);
    const alpacaEquity = parseFloat(alpacaAccount.equity);
    const alpacaLongMarketValue = parseFloat(alpacaAccount.long_market_value);
    const alpacaPnl = alpacaEquity - alpacaCash - alpacaLongMarketValue;

    await dataService.updatePortfolioBalance(portfolio.id, {
      cash_balance: alpacaCash,
      total_value: alpacaEquity,
      total_pnl: alpacaPnl,
      total_pnl_percent: portfolio.total_value > 0
        ? ((alpacaEquity - portfolio.total_value + portfolio.total_pnl) / (portfolio.total_value - portfolio.total_pnl)) * 100
        : 0,
    });

    // ── 5. Return summary ────────────────────────────────────
    return NextResponse.json({
      success: true,
      data: {
        account: {
          cash: alpacaCash,
          equity: alpacaEquity,
          buyingPower: parseFloat(alpacaAccount.buying_power),
          longMarketValue: alpacaLongMarketValue,
          daytradeCount: alpacaAccount.daytrade_count,
          status: alpacaAccount.status,
        },
        synced: syncedPositions.length,
        created: createdPositions.length,
        closed: closedPositions.length,
        syncedSymbols: syncedPositions,
        createdSymbols: createdPositions,
        closedSymbols: closedPositions,
        alpacaPositions: alpacaPositions.map((p) => ({
          symbol: p.symbol,
          qty: parseFloat(p.qty),
          avgEntry: parseFloat(p.avg_entry_price),
          marketValue: parseFloat(p.market_value),
          unrealizedPl: parseFloat(p.unrealized_pl),
        })),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Sync failed';
    console.error('Alpaca sync error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}