import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/client';

/**
 * POST /api/portfolio/withdraw
 * Withdraw funds from portfolio balance.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { portfolio_id, user_id, amount, mode, notes } = body;

    // Validate
    if (!portfolio_id || !user_id || !amount) {
      return NextResponse.json(
        { error: 'Missing required fields: portfolio_id, user_id, amount' },
        { status: 400 },
      );
    }

    if (typeof amount !== 'number' || amount <= 0) {
      return NextResponse.json(
        { error: 'Amount must be a positive number' },
        { status: 400 },
      );
    }

    // Fetch current portfolio balance
    const { data: portfolio, error: fetchError } = await supabase
      .from('portfolios')
      .select('cash_balance, total_value')
      .eq('id', portfolio_id)
      .single();

    if (fetchError || !portfolio) {
      return NextResponse.json({ error: 'Portfolio not found' }, { status: 404 });
    }

    const currentBalance = Number(portfolio.cash_balance);

    // Check sufficient funds
    if (amount > currentBalance) {
      return NextResponse.json(
        { error: `Insufficient funds. Available: $${currentBalance.toFixed(2)}` },
        { status: 400 },
      );
    }

    const newBalance = currentBalance - amount;

    // Insert transaction record
    const { data: transaction, error: txError } = await supabase
      .from('transactions')
      .insert({
        portfolio_id,
        user_id,
        type: 'withdraw',
        amount,
        balance_before: currentBalance,
        balance_after: newBalance,
        mode: mode || 'paper',
        notes: notes || null,
      })
      .select()
      .single();

    if (txError) {
      return NextResponse.json({ error: txError.message }, { status: 500 });
    }

    // Update portfolio balance
    const { error: updateError } = await supabase
      .from('portfolios')
      .update({
        cash_balance: newBalance,
        total_value: Number(portfolio.total_value) - amount,
        updated_at: new Date().toISOString(),
      })
      .eq('id', portfolio_id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: `Withdrew $${amount.toFixed(2)}. New balance: $${newBalance.toFixed(2)}`,
      transaction,
      new_balance: newBalance,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to process withdrawal' },
      { status: 500 },
    );
  }
}