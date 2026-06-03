import { NextResponse } from 'next/server';
import { getAlpacaClient } from '@/lib/services/alpaca-client';
import * as dataService from '@/lib/services/data-service';

/**
 * POST /api/alpaca/execute
 *
 * Executes a trade signal through Alpaca AND Supabase portfolio.
 * This is the bridge between LiveStrategyEngine signals and the broker.
 *
 * Body:
 * {
 *   userId: string,
 *   symbol: string,
 *   name: string,
 *   type: 'buy' | 'sell',
 *   quantity: number,
 *   price: number,
 *   strategyId?: string,
 *   reason?: string,
 *   mode: 'paper' | 'live'
 * }
 *
 * Flow:
 *  1. Place order on Alpaca
 *  2. Record trade in Supabase (via dataService)
 *  3. Upsert position in Supabase
 *  4. Update portfolio balance in Supabase
 *  5. Return combined result
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      userId,
      symbol,
      name,
      type,
      quantity,
      price,
      strategyId,
      reason,
      mode = 'paper',
    } = body;

    // ── Validation ──────────────────────────────────────────
    if (!userId || !symbol || !type || !quantity || !price) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: userId, symbol, type, quantity, price' },
        { status: 400 },
      );
    }

    if (!['buy', 'sell'].includes(type)) {
      return NextResponse.json(
        { success: false, error: 'type must be "buy" or "sell"' },
        { status: 400 },
      );
    }

    const tradingMode = (mode === 'live' ? 'live' : 'paper') as 'paper' | 'live';
    const alpaca = getAlpacaClient();

    // ── 1. Get or create portfolio in Supabase ───────────────
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

    // ── 2. Pre-flight checks ─────────────────────────────────
    const positions = await dataService.fetchPositions(portfolio.id);

    if (type === 'buy') {
      const total = quantity * price;
      const fee = Math.max(1.5, total * 0.001);
      if (total + fee > portfolio.cash_balance) {
        return NextResponse.json(
          { success: false, error: 'Insufficient cash balance' },
          { status: 400 },
        );
      }
    }

    if (type === 'sell') {
      const existingPos = positions.find(
        (p) => p.symbol.toUpperCase() === symbol.toUpperCase(),
      );
      if (!existingPos || existingPos.quantity < quantity) {
        return NextResponse.json(
          { success: false, error: 'Insufficient position quantity for sell' },
          { status: 400 },
        );
      }
    }

    // ── 3. Place order on Alpaca ──────────────────────────────
    let alpacaOrder: Awaited<ReturnType<typeof alpaca.placeOrder>> | null = null;
    let alpacaError: string | null = null;

    try {
      if (type === 'buy') {
        alpacaOrder = await alpaca.placeOrder({
          symbol: symbol.toUpperCase(),
          qty: quantity,
          side: 'buy',
          type: 'market',
          time_in_force: 'day',
          client_order_id: `tp-${Date.now()}-${symbol.toLowerCase()}`,
        });
      } else {
        // For sells, close the position via Alpaca
        alpacaOrder = await alpaca.closePositionPartial(symbol.toUpperCase(), quantity);
      }
    } catch (err) {
      alpacaError = err instanceof Error ? err.message : 'Alpaca order failed';
      // Continue with Supabase even if Alpaca fails (paper mode resilience)
      console.warn(`Alpaca order failed (continuing with Supabase): ${alpacaError}`);
    }

    // ── 4. Record in Supabase ─────────────────────────────────
    const total = quantity * price;
    const fee = Math.max(1.5, total * 0.001);

    // Calculate P&L for sells
    let pnl: number | undefined;
    let pnlPercent: number | undefined;
    const existingPos = positions.find(
      (p) => p.symbol.toUpperCase() === symbol.toUpperCase(),
    );

    if (type === 'sell' && existingPos && existingPos.quantity > 0) {
      const costBasis = existingPos.avg_price * Math.min(quantity, existingPos.quantity);
      const proceeds = price * Math.min(quantity, existingPos.quantity);
      pnl = proceeds - costBasis;
      pnlPercent = costBasis > 0 ? (pnl / costBasis) * 100 : 0;
    }

    // Insert trade
    const savedTrade = await dataService.insertTrade(portfolio.id, {
      symbol: symbol.toUpperCase(),
      name: name || symbol.toUpperCase(),
      type,
      quantity,
      price,
      total,
      fee,
      pnl,
      pnl_percent: pnlPercent,
      strategy_id: strategyId,
      notes: reason ? `${reason}${alpacaOrder ? ` | Alpaca #${alpacaOrder.id}` : ' | Paper only'}` : undefined,
      executed_at: new Date().toISOString(),
    }, tradingMode);

    // Upsert position
    if (type === 'buy') {
      const oldQty = existingPos?.quantity ?? 0;
      const oldCost = existingPos ? existingPos.avg_price * existingPos.quantity : 0;
      const newQty = oldQty + quantity;
      const newAvg = (oldCost + total) / newQty;

      await dataService.upsertPosition(portfolio.id, {
        id: existingPos?.id,
        symbol: symbol.toUpperCase(),
        name: name || symbol.toUpperCase(),
        quantity: newQty,
        avg_price: newAvg,
        current_price: price,
        market_value: newQty * price,
        unrealized_pnl: (price - newAvg) * newQty,
        unrealized_pnl_percent: ((price - newAvg) / newAvg) * 100,
        realized_pnl: existingPos?.realized_pnl ?? 0,
      });
    } else if (existingPos) {
      const newQty = existingPos.quantity - quantity;
      if (newQty <= 0) {
        await dataService.deletePosition(existingPos.id);
      } else {
        await dataService.upsertPosition(portfolio.id, {
          id: existingPos.id,
          symbol: existingPos.symbol,
          name: existingPos.name,
          quantity: newQty,
          avg_price: existingPos.avg_price,
          current_price: price,
          market_value: newQty * price,
          unrealized_pnl: (price - existingPos.avg_price) * newQty,
          unrealized_pnl_percent: ((price - existingPos.avg_price) / existingPos.avg_price) * 100,
          realized_pnl: existingPos.realized_pnl + (pnl ?? 0),
        });
      }
    }

    // Update portfolio balance
    const cashDelta = type === 'buy' ? -(total + fee) : total - fee;
    const newCash = portfolio.cash_balance + cashDelta;

    const remainingPositions =
      type === 'sell' && existingPos
        ? positions.filter(
            (p) => p.id !== existingPos.id || existingPos.quantity - quantity > 0,
          )
        : positions;

    const posValue =
      type === 'buy'
        ? existingPos
          ? positions.reduce((sum, p) => {
              if (p.id === existingPos.id) {
                return sum + (existingPos.quantity + quantity) * price;
              }
              return sum + p.market_value;
            }, 0)
          : positions.reduce((sum, p) => sum + p.market_value, 0) + total
        : remainingPositions.reduce((sum, p) => {
            if (p.id === existingPos?.id) {
              return sum + Math.max(0, p.quantity - quantity) * price;
            }
            return sum + p.market_value;
          }, 0);

    const newTotalValue = newCash + posValue;
    const newTotalPnl = portfolio.total_pnl + (pnl ?? 0);
    const initialEquity = newTotalValue - newTotalPnl;
    const newTotalPnlPercent = initialEquity > 0 ? (newTotalPnl / initialEquity) * 100 : 0;

    await dataService.updatePortfolioBalance(portfolio.id, {
      cash_balance: newCash,
      total_value: newTotalValue,
      total_pnl: newTotalPnl,
      total_pnl_percent: newTotalPnlPercent,
    });

    // ── 5. Return combined result ─────────────────────────────
    return NextResponse.json({
      success: true,
      data: {
        trade: savedTrade,
        alpacaOrder: alpacaOrder ?? null,
        alpacaError,
        portfolio: {
          id: portfolio.id,
          cash_balance: newCash,
          total_value: newTotalValue,
          total_pnl: newTotalPnl,
          total_pnl_percent: newTotalPnlPercent,
        },
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Execution failed';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}