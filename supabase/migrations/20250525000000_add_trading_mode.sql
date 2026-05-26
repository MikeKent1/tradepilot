-- Add trading mode support to portfolios and trades
-- Enables dual Paper/Live mode without duplicating tables

-- 1. Add mode column to portfolios
ALTER TABLE public.portfolios
  ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'paper'
  CHECK (mode IN ('paper', 'live'));

-- 2. Add mode column to trades
ALTER TABLE public.trades
  ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'paper'
  CHECK (mode IN ('paper', 'live'));

-- 3. Create paper portfolio for existing users who only have a default (no mode set)
-- (The default column handles the initial ALTER, but future portfolios need a mode)
-- No data migration needed — existing rows default to 'paper'

-- 4. Add composite index for mode-filtered queries
CREATE INDEX IF NOT EXISTS idx_portfolios_user_mode ON public.portfolios(user_id, mode);
CREATE INDEX IF NOT EXISTS idx_trades_portfolio_mode ON public.trades(portfolio_id, mode);
CREATE INDEX IF NOT EXISTS idx_trades_strategy_mode ON public.trades(strategy_id, mode);

-- 5. Update RLS policies — they already work via portfolio ownership,
--    no changes needed since mode is just an additional filter column