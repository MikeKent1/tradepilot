import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/trades
 * Simulated trade execution endpoint.
 * PAPER TRADING ONLY - No real money or broker interaction.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { symbol, type, quantity, price } = body;

    // Validate input
    if (!symbol || !type || !quantity || !price) {
      return NextResponse.json(
        { error: 'Missing required fields: symbol, type, quantity, price' },
        { status: 400 }
      );
    }

    if (!['buy', 'sell'].includes(type)) {
      return NextResponse.json(
        { error: 'Type must be "buy" or "sell"' },
        { status: 400 }
      );
    }

    if (quantity <= 0 || price <= 0) {
      return NextResponse.json(
        { error: 'Quantity and price must be positive numbers' },
        { status: 400 }
      );
    }

    // Simulate trade execution with a small random delay and fee
    const fee = 1.50; // $1.50 flat fee
    const total = quantity * price;
    const executionPrice = price + (Math.random() - 0.5) * price * 0.001; // ±0.05% slippage

    const trade = {
      id: `trd-${Date.now()}`,
      symbol: symbol.toUpperCase(),
      type,
      quantity: Number(quantity),
      price: +executionPrice.toFixed(2),
      total: Number((quantity * executionPrice).toFixed(2)),
      fee,
      executed_at: new Date().toISOString(),
      status: 'filled',
    };

    return NextResponse.json({
      success: true,
      message: `Simulated ${type} order for ${quantity} shares of ${symbol.toUpperCase()} executed at $${executionPrice.toFixed(2)}.`,
      trade,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to execute simulated trade' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/trades
 * Returns simulated trade history.
 */
export async function GET() {
  // This would connect to a database in production
  // For now, returns a placeholder response
  return NextResponse.json({
    message: 'Trade history endpoint. Connect to Supabase for persistent storage.',
    note: 'PAPER TRADING / SIMULATION ONLY',
  });
}