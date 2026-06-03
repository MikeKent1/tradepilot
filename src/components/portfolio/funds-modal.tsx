'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { DollarSign, X, Loader2, ArrowDownToLine, ArrowUpFromLine } from 'lucide-react';

interface FundsModalProps {
  open: boolean;
  onClose: () => void;
  cashBalance: number;
  onDeposit: (amount: number) => void;
  onWithdraw: (amount: number) => void;
  isDepositing: boolean;
  isWithdrawing: boolean;
}

export function FundsModal({
  open,
  onClose,
  cashBalance,
  onDeposit,
  onWithdraw,
  isDepositing,
  isWithdrawing,
}: FundsModalProps) {
  const [tab, setTab] = useState<'deposit' | 'withdraw'>('deposit');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');

  if (!open) return null;

  const parsedAmount = parseFloat(amount);
  const isValid = !isNaN(parsedAmount) && parsedAmount > 0;
  const isWithdrawInvalid = tab === 'withdraw' && parsedAmount > cashBalance;
  const canSubmit = isValid && !isWithdrawInvalid;
  const isLoading = isDepositing || isWithdrawing;

  const handleSubmit = () => {
    if (!canSubmit) return;
    if (tab === 'deposit') {
      onDeposit(parsedAmount);
    } else {
      onWithdraw(parsedAmount);
    }
    setAmount('');
    setNotes('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && canSubmit) {
      handleSubmit();
    }
    if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className="relative bg-card border border-card-border rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden"
        onKeyDown={handleKeyDown}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-card-border">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-emerald-400" />
            Manage Funds
          </h2>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-300 p-1 rounded-lg hover:bg-card-hover transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Current Balance */}
        <div className="px-6 py-4 bg-card-hover/30 border-b border-card-border">
          <p className="text-xs text-zinc-500 mb-1">Current Balance</p>
          <p className="text-2xl font-bold text-white font-mono">
            ${cashBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-card-border">
          <button
            onClick={() => setTab('deposit')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors cursor-pointer ${
              tab === 'deposit'
                ? 'text-emerald-400 border-b-2 border-emerald-400 bg-emerald-400/5'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <ArrowDownToLine className="w-4 h-4" />
            Deposit
          </button>
          <button
            onClick={() => setTab('withdraw')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors cursor-pointer ${
              tab === 'withdraw'
                ? 'text-amber-400 border-b-2 border-amber-400 bg-amber-400/5'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <ArrowUpFromLine className="w-4 h-4" />
            Withdraw
          </button>
        </div>

        {/* Form */}
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs text-zinc-400 mb-1.5">
              {tab === 'deposit' ? 'Deposit Amount' : 'Withdraw Amount'}
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">
                $
              </span>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                min="0.01"
                step="0.01"
                autoFocus
                className="w-full bg-background border border-card-border rounded-lg pl-8 pr-4 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 transition-colors"
              />
            </div>
            {isWithdrawInvalid && (
              <p className="text-xs text-red-400 mt-1.5">
                Insufficient funds. Available: ${cashBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </p>
            )}
          </div>

          {/* Quick Amounts */}
          <div className="flex gap-2 flex-wrap">
            {[100, 500, 1000, 5000, 10000].map((preset) => (
              <button
                key={preset}
                onClick={() => setAmount(preset.toString())}
                className="px-3 py-1 text-xs rounded-md bg-card-border text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 transition-colors cursor-pointer"
              >
                ${preset.toLocaleString()}
              </button>
            ))}
          </div>

          <div>
            <label className="block text-xs text-zinc-400 mb-1.5">
              Note <span className="text-zinc-600">(optional)</span>
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={tab === 'deposit' ? 'e.g. Monthly deposit' : 'e.g. Profit withdrawal'}
              className="w-full bg-background border border-card-border rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-accent/50 transition-colors"
            />
          </div>

          {/* Summary */}
          {isValid && (
            <div className="bg-card-hover/50 rounded-lg p-3 text-xs space-y-1">
              <div className="flex justify-between text-zinc-400">
                <span>Balance after {tab}:</span>
                <span className="text-white font-mono">
                  ${(
                    tab === 'deposit'
                      ? cashBalance + parsedAmount
                      : cashBalance - parsedAmount
                  ).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-card-border flex items-center justify-end gap-3">
          <Button variant="ghost" size="md" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            variant={tab === 'deposit' ? 'primary' : 'secondary'}
            size="md"
            onClick={handleSubmit}
            disabled={!canSubmit || isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {tab === 'deposit' ? 'Depositing...' : 'Withdrawing...'}
              </>
            ) : tab === 'deposit' ? (
              <>
                <ArrowDownToLine className="w-4 h-4" />
                Deposit ${parsedAmount.toLocaleString()}
              </>
            ) : (
              <>
                <ArrowUpFromLine className="w-4 h-4" />
                Withdraw ${parsedAmount.toLocaleString()}
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}