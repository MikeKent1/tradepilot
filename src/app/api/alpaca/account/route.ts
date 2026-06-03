import { NextResponse } from 'next/server';
import { getAlpacaClient } from '@/lib/services/alpaca-client';

/**
 * GET /api/alpaca/account
 *
 * Returns the Alpaca account info (cash, equity, buying_power, etc.)
 * Works with both paper and live accounts depending on ALPACA_PAPER env var.
 */
export async function GET() {
  try {
    const alpaca = getAlpacaClient();
    const account = await alpaca.getAccount();

    return NextResponse.json({
      success: true,
      data: account,
      meta: { paper: alpaca.isPaper, baseUrl: alpaca.baseUrlValue },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to fetch Alpaca account';
    const isAuthError = message.includes('401') || message.includes('403');
    const status = isAuthError ? 401 : 500;

    return NextResponse.json(
      { success: false, error: message, hint: isAuthError ? 'Check your ALPACA_API_KEY and ALPACA_SECRET_KEY in .env.local' : undefined },
      { status },
    );
  }
}