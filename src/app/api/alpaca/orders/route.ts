import { NextResponse } from 'next/server';
import { getAlpacaClient } from '@/lib/services/alpaca-client';

/**
 * GET /api/alpaca/orders – list orders (optional ?status=filled)
 * POST /api/alpaca/orders – place a new order
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') as
      | import('@/lib/services/alpaca-client').AlpacaOrderStatus
      | undefined;

    const alpaca = getAlpacaClient();
    const orders = await alpaca.getOrders({ status });

    return NextResponse.json({ success: true, data: orders });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch orders';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const alpaca = getAlpacaClient();
    const order = await alpaca.placeOrder(body);

    return NextResponse.json({ success: true, data: order }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to place order';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}