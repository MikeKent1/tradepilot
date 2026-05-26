-- Strategy Lab - Database Schema
-- PAPER TRADING / SIMULATION ONLY - No real money or broker integration

-- ─── Users (extends Supabase auth.users) ────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Portfolios ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.portfolios (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL DEFAULT 'Default Portfolio',
  cash_balance DECIMAL(18, 2) NOT NULL DEFAULT 100000.00,
  total_value DECIMAL(18, 2) NOT NULL DEFAULT 100000.00,
  total_pnl DECIMAL(18, 2) NOT NULL DEFAULT 0.00,
  total_pnl_percent DECIMAL(10, 4) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Positions ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.positions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  portfolio_id UUID REFERENCES public.portfolios(id) ON DELETE CASCADE NOT NULL,
  symbol TEXT NOT NULL,
  name TEXT NOT NULL,
  quantity DECIMAL(18, 8) NOT NULL DEFAULT 0,
  avg_price DECIMAL(18, 4) NOT NULL DEFAULT 0,
  current_price DECIMAL(18, 4) NOT NULL DEFAULT 0,
  market_value DECIMAL(18, 2) NOT NULL DEFAULT 0,
  unrealized_pnl DECIMAL(18, 2) NOT NULL DEFAULT 0,
  unrealized_pnl_percent DECIMAL(10, 4) NOT NULL DEFAULT 0,
  realized_pnl DECIMAL(18, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(portfolio_id, symbol)
);

-- ─── Trades ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.trades (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  portfolio_id UUID REFERENCES public.portfolios(id) ON DELETE CASCADE NOT NULL,
  symbol TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('buy', 'sell')),
  quantity DECIMAL(18, 8) NOT NULL,
  price DECIMAL(18, 4) NOT NULL,
  total DECIMAL(18, 2) NOT NULL,
  fee DECIMAL(18, 2) NOT NULL DEFAULT 0.00,
  pnl DECIMAL(18, 2),
  pnl_percent DECIMAL(10, 4),
  strategy_id UUID,
  notes TEXT,
  executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Watchlists ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.watchlists (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  symbol TEXT NOT NULL,
  name TEXT NOT NULL,
  price DECIMAL(18, 4) NOT NULL DEFAULT 0,
  change DECIMAL(18, 4) NOT NULL DEFAULT 0,
  change_percent DECIMAL(10, 4) NOT NULL DEFAULT 0,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, symbol)
);

-- ─── Strategies ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.strategies (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL DEFAULT 'manual',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'archived')),
  config JSONB DEFAULT '{}',
  total_trades INT DEFAULT 0,
  win_rate DECIMAL(5, 4) DEFAULT 0,
  avg_pnl DECIMAL(18, 2) DEFAULT 0,
  total_pnl DECIMAL(18, 2) DEFAULT 0,
  total_pnl_percent DECIMAL(10, 4) DEFAULT 0,
  sharpe_ratio DECIMAL(10, 4) DEFAULT 0,
  max_drawdown DECIMAL(10, 4) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Notifications ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('success', 'error', 'warning', 'info')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Indexes ──────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_portfolios_user ON public.portfolios(user_id);
CREATE INDEX IF NOT EXISTS idx_positions_portfolio ON public.positions(portfolio_id);
CREATE INDEX IF NOT EXISTS idx_trades_portfolio ON public.trades(portfolio_id);
CREATE INDEX IF NOT EXISTS idx_trades_symbol ON public.trades(symbol);
CREATE INDEX IF NOT EXISTS idx_watchlists_user ON public.watchlists(user_id);
CREATE INDEX IF NOT EXISTS idx_strategies_user ON public.strategies(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications(user_id);

-- ─── Auto-create profile on user signup ──────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ─── Auto-create default portfolio for new users ─────────
CREATE OR REPLACE FUNCTION public.create_default_portfolio()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.portfolios (user_id, name, cash_balance, total_value)
  VALUES (NEW.id, 'Default Portfolio', 100000.00, 100000.00);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_profile_created ON public.profiles;
CREATE TRIGGER on_profile_created
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.create_default_portfolio();

-- ─── RLS Policies ────────────────────────────────────────
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portfolios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.watchlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.strategies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Profiles: users can read/update their own profile
CREATE POLICY "Users can read own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Portfolios: CRUD by owner
CREATE POLICY "Users can read own portfolios" ON public.portfolios
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own portfolios" ON public.portfolios
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own portfolios" ON public.portfolios
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own portfolios" ON public.portfolios
  FOR DELETE USING (auth.uid() = user_id);

-- Positions: CRUD by portfolio owner
CREATE POLICY "Users can read own positions" ON public.positions
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.portfolios WHERE portfolios.id = positions.portfolio_id AND portfolios.user_id = auth.uid()));
CREATE POLICY "Users can insert own positions" ON public.positions
  FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.portfolios WHERE portfolios.id = positions.portfolio_id AND portfolios.user_id = auth.uid()));
CREATE POLICY "Users can update own positions" ON public.positions
  FOR UPDATE USING (EXISTS (SELECT 1 FROM public.portfolios WHERE portfolios.id = positions.portfolio_id AND portfolios.user_id = auth.uid()));
CREATE POLICY "Users can delete own positions" ON public.positions
  FOR DELETE USING (EXISTS (SELECT 1 FROM public.portfolios WHERE portfolios.id = positions.portfolio_id AND portfolios.user_id = auth.uid()));

-- Trades: CRUD by portfolio owner
CREATE POLICY "Users can read own trades" ON public.trades
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.portfolios WHERE portfolios.id = trades.portfolio_id AND portfolios.user_id = auth.uid()));
CREATE POLICY "Users can insert own trades" ON public.trades
  FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.portfolios WHERE portfolios.id = trades.portfolio_id AND portfolios.user_id = auth.uid()));

-- Watchlists: CRUD by owner
CREATE POLICY "Users can read own watchlists" ON public.watchlists
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own watchlists" ON public.watchlists
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own watchlists" ON public.watchlists
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own watchlists" ON public.watchlists
  FOR DELETE USING (auth.uid() = user_id);

-- Strategies: CRUD by owner
CREATE POLICY "Users can read own strategies" ON public.strategies
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own strategies" ON public.strategies
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own strategies" ON public.strategies
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own strategies" ON public.strategies
  FOR DELETE USING (auth.uid() = user_id);

-- Notifications: read/manage by owner
CREATE POLICY "Users can read own notifications" ON public.notifications
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own notifications" ON public.notifications
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own notifications" ON public.notifications
  FOR UPDATE USING (auth.uid() = user_id);