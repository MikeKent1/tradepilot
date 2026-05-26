'use client';

import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { usePortfolioData } from '@/lib/hooks/use-portfolio-data';
import { useTrades } from '@/lib/hooks/use-trades';
import { formatCurrency, formatPercent } from '@/lib/utils';
import { ArrowUpRight, ArrowDownRight, Plus, Loader2, TrendingUp } from 'lucide-react';

const QUICK_SYMBOLS = ['AAPL', 'MSFT', 'GOOGL', 'NVDA', 'TSLA', 'AMZN', 'META', 'AMD'];

export default function TradesPage() {
  const { portfolio, positions, executeTrade, isExecuting } = usePortfolioData();
  const { data: trades = [] } = useTrades(portfolio?.id);

  const [mode, setMode] = useState<'buy' | 'sell'>('buy');
  const [symbol, setSymbol] = useState('');
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');

  const cashBalance = portfolio?.cash_balance ?? 0;
  const total = Number(quantity || 0) * Number(price || 0);
  const fee = total * 0.001;
  const canSubmit =
    symbol.trim().length > 0 &&
    Number(quantity) > 0 &&
    Number(price) > 0 &&
    !isExecuting;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    executeTrade({
      symbol: symbol.trim().toUpperCase(),
      name: symbol.trim().toUpperCase(),
      type: mode,
      quantity: Number(quantity),
      price: Number(price),
    });
    // Don't clear — user can tweak and re-submit quickly
  };

  const handleQuickSymbol = (sym: string) => {
    setSymbol(sym);
    // Focus price input
    const priceInput = document.getElementById('trade-price') as HTMLInputElement;
    priceInput?.focus();
  };

  const handleModeToggle = (newMode: 'buy' | 'sell') => {
    setMode(newMode);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Trades</h1>
        <p className="text-sm text-zinc-400 mt-0.5">Execute and review your trades</p>
      </div>

      {/* ── Trade Entry Form ─────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>
            <Plus className="w-4 h-4 inline mr-1.5" />
            New Trade
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Mode toggle */}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handleModeToggle('buy')}
                className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all cursor-pointer ${
                  mode === 'buy'
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-[0_0_12px_rgba(16,185,129,0.15)]'
                    : 'bg-card-hover text-zinc-400 border border-card-border hover:text-zinc-200'
                }`}
              >
                <ArrowUpRight className="w-4 h-4 inline mr-1" />
                Buy
              </button>
              <button
                type="button"
                onClick={() => handleModeToggle('sell')}
                className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all cursor-pointer ${
                  mode === 'sell'
                    ? 'bg-red-500/20 text-red-400 border border-red-500/40 shadow-[0_0_12px_rgba(239,68,68,0.15)]'
                    : 'bg-card-hover text-zinc-400 border border-card-border hover:text-zinc-200'
                }`}
              >
                <ArrowDownRight className="w-4 h-4 inline mr-1" />
                Sell
              </button>
            </div>

            {/* Quick symbols */}
            <div>
              <p className="text-xs text-zinc-500 mb-2">Quick select</p>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_SYMBOLS.map((sym) => (
                  <button
                    key={sym}
                    type="button"
                    onClick={() => handleQuickSymbol(sym)}
                    className={`px-2.5 py-1 text-xs rounded-md border transition-colors cursor-pointer ${
                      symbol.toUpperCase() === sym
                        ? 'border-primary/50 bg-primary/10 text-primary'
                        : 'border-card-border text-zinc-400 hover:border-zinc-600 hover:text-zinc-200'
                    }`}
                  >
                    {sym}
                  </button>
                ))}
              </div>
            </div>

            {/* Inputs row */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label htmlFor="trade-symbol" className="block text-xs font-medium text-zinc-400 mb-1">
                  Symbol
                </label>
                <input
                  id="trade-symbol"
                  type="text"
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                  placeholder="e.g. AAPL"
                  className="w-full bg-card-hover border border-card-border rounded-lg px-3 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30 transition-colors"
                  autoComplete="off"
                />
              </div>
              <div>
                <label htmlFor="trade-qty" className="block text-xs font-medium text-zinc-400 mb-1">
                  Quantity
                </label>
                <input
                  id="trade-qty"
                  type="number"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder="0"
                  min="0"
                  step="1"
                  className="w-full bg-card-hover border border-card-border rounded-lg px-3 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30 transition-colors"
                />
              </div>
              <div>
                <label htmlFor="trade-price" className="block text-xs font-medium text-zinc-400 mb-1">
                  Price (USD)
                </label>
                <input
                  id="trade-price"
                  type="number"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                  className="w-full bg-card-hover border border-card-border rounded-lg px-3 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30 transition-colors"
                />
              </div>
            </div>

            {/* Summary + Submit */}
            {total > 0 && (
              <div className="flex items-center justify-between bg-card-hover rounded-lg px-4 py-3 border border-card-border">
                <div className="flex items-center gap-6 text-sm">
                  <div>
                    <span className="text-zinc-500 text-xs">Total</span>
                    <p className="text-zinc-100 font-semibold">{formatCurrency(total)}</p>
                  </div>
                  <div>
                    <span className="text-zinc-500 text-xs">Fee (0.1%)</span>
                    <p className="text-zinc-400">{formatCurrency(fee)}</p>
                  </div>
                  <div>
                    <span className="text-zinc-500 text-xs">Cash After</span>
                    <p className={`font-semibold ${mode === 'buy' ? 'text-zinc-200' : 'text-emerald-400'}`}>
                      {formatCurrency(cashBalance + (mode === 'buy' ? -(total + fee) : total - fee))}
                    </p>
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={!canSubmit}
                  className={`px-6 py-2.5 rounded-lg text-sm font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                    mode === 'buy'
                      ? 'bg-emerald-600 hover:bg-emerald-500 text-white disabled:bg-emerald-600/40 disabled:text-emerald-400/50'
                      : 'bg-red-600 hover:bg-red-500 text-white disabled:bg-red-600/40 disabled:text-red-400/50'
                  } disabled:cursor-not-allowed`}
                >
                  {isExecuting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : mode === 'buy' ? (
                    <TrendingUp className="w-4 h-4" />
                  ) : (
                    <TrendingUp className="w-4 h-4 rotate-180" />
                  )}
                  {isExecuting ? 'Executing...' : mode === 'buy' ? 'Buy' : 'Sell'}{' '}
                  {symbol.toUpperCase() || '...'}
                </button>
              </div>
            )}
          </form>
        </CardContent>
      </Card>

      {/* ── Positions Summary (quick view) ──────────── */}
      {positions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Current Positions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-card-border">
                    <th className="text-left py-2 px-2 text-xs text-zinc-500 font-medium">Symbol</th>
                    <th className="text-right py-2 px-2 text-xs text-zinc-500 font-medium">Qty</th>
                    <th className="text-right py-2 px-2 text-xs text-zinc-500 font-medium">Avg Price</th>
                    <th className="text-right py-2 px-2 text-xs text-zinc-500 font-medium">Current</th>
                    <th className="text-right py-2 px-2 text-xs text-zinc-500 font-medium">Market Value</th>
                    <th className="text-right py-2 px-2 text-xs text-zinc-500 font-medium">Unreal. P&L</th>
                  </tr>
                </thead>
                <tbody>
                  {positions.map((pos) => (
                    <tr key={pos.id} className="border-b border-card-border/50 hover:bg-card-hover transition-colors">
                      <td className="py-2 px-2 font-medium text-zinc-200">{pos.symbol}</td>
                      <td className="py-2 px-2 text-right text-zinc-300">{pos.quantity}</td>
                      <td className="py-2 px-2 text-right text-zinc-400">{formatCurrency(pos.avg_price)}</td>
                      <td className="py-2 px-2 text-right text-zinc-300">{formatCurrency(pos.current_price)}</td>
                      <td className="py-2 px-2 text-right text-zinc-300">{formatCurrency(pos.market_value)}</td>
                      <td className="py-2 px-2 text-right">
                        <span className={pos.unrealized_pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                          {formatCurrency(pos.unrealized_pnl)} ({formatPercent(pos.unrealized_pnl_percent)})
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Trade History ────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Trade History</CardTitle>
          <span className="text-xs text-zinc-500">{trades.length} trades</span>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-card-border">
                  <th className="text-left py-3 px-2 text-xs text-zinc-500 font-medium">Date</th>
                  <th className="text-left py-3 px-2 text-xs text-zinc-500 font-medium">Symbol</th>
                  <th className="text-center py-3 px-2 text-xs text-zinc-500 font-medium">Type</th>
                  <th className="text-right py-3 px-2 text-xs text-zinc-500 font-medium">Qty</th>
                  <th className="text-right py-3 px-2 text-xs text-zinc-500 font-medium">Price</th>
                  <th className="text-right py-3 px-2 text-xs text-zinc-500 font-medium">Total</th>
                  <th className="text-right py-3 px-2 text-xs text-zinc-500 font-medium">P&L</th>
                </tr>
              </thead>
              <tbody>
                {trades.map((trade) => (
                  <tr
                    key={trade.id}
                    className="border-b border-card-border/50 hover:bg-card-hover transition-colors"
                  >
                    <td className="py-3 px-2 text-zinc-400 text-xs">
                      {new Date(trade.executed_at).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-2">
                      <span className="font-medium text-zinc-200">{trade.symbol}</span>
                    </td>
                    <td className="py-3 px-2 text-center">
                      <span
                        className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                          trade.type === 'buy'
                            ? 'bg-emerald-500/10 text-emerald-400'
                            : 'bg-red-500/10 text-red-400'
                        }`}
                      >
                        {trade.type === 'buy' ? (
                          <ArrowUpRight className="w-3 h-3" />
                        ) : (
                          <ArrowDownRight className="w-3 h-3" />
                        )}
                        {trade.type.toUpperCase()}
                      </span>
                    </td>
                    <td className="py-3 px-2 text-right text-zinc-300">{trade.quantity}</td>
                    <td className="py-3 px-2 text-right text-zinc-300">{formatCurrency(trade.price)}</td>
                    <td className="py-3 px-2 text-right text-zinc-300">{formatCurrency(trade.total)}</td>
                    <td className="py-3 px-2 text-right">
                      {trade.pnl !== undefined ? (
                        <span className={trade.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                          {formatCurrency(trade.pnl)} ({formatPercent(trade.pnl_percent ?? 0)})
                        </span>
                      ) : (
                        <span className="text-zinc-500">—</span>
                      )}
                    </td>
                  </tr>
                ))}
                {trades.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-zinc-500 text-sm">
                      No trades yet. Use the form above to make your first trade.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}