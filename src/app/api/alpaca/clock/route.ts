import { NextResponse } from 'next/server';
import { getAlpacaClient } from '@/lib/services/alpaca-client';

/**
 * GET /api/alpaca/clock
 *
 * Returns the market clock — whether the market is open, next open/close times.
 */
export async function GET() {
  try {
    const alpaca = getAlpacaClient();
    const clock = await alpaca.getClock();

    return NextResponse.json({
      success: true,
      data: clock,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to fetch market clock';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}