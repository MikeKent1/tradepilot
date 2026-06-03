import { NextResponse } from 'next/server';
import { getAlpacaClient } from '@/lib/services/alpaca-client';

/**
 * GET /api/alpaca/positions
 *
 * Returns all open positions from Alpaca.
 */
export async function GET() {
  try {
    const alpaca = getAlpacaClient();
    const positions = await alpaca.getPositions();

    return NextResponse.json({
      success: true,
      data: positions,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to fetch positions';
    const isAuthError = message.includes('401') || message.includes('403');
    const status = isAuthError ? 401 : 500;

    return NextResponse.json(
      { success: false, error: message },
      { status },
    );
  }
}