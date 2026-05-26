# Strategy Lab — AI Trading Simulator

A modern **paper trading / simulation platform** built with Next.js, TypeScript, and Tailwind CSS. Design, test, and refine trading strategies in a risk-free simulated environment.

> ⚠️ **IMPORTANT:** This is a PAPER TRADING/SIMULATION platform only. No real money, no broker execution, no live trading. Everything is simulated with fake balances.

---

## Features

- 🔐 **Authentication** — Full Supabase Auth (email/password sign-up/sign-in)
- 📊 **Dashboard** — Portfolio overview, P&L, watchlist, and performance metrics
- 💼 **Portfolio** — Track positions, simulated balance, and unrealized gains
- 📈 **Market** — Asset search, market overview, and candlestick charts
- 📜 **Trades** — Complete simulated trade history with P&L tracking
- 🧠 **Strategies** — Create, backtest, and manage trading strategies
- 📉 **Analytics** — Performance insights, returns distribution, win/loss ratios
- ⚙️ **Settings** — Profile, display preferences, notifications

## Tech Stack

| Layer         | Technology                                      |
| ------------- | ----------------------------------------------- |
| Framework     | Next.js 15 (App Router)                         |
| Language      | TypeScript (strict mode)                        |
| Styling       | Tailwind CSS 3                                  |
| Database      | Supabase (PostgreSQL + Auth)                    |
| State         | Zustand                                         |
| Data Fetching | TanStack React Query                            |
| Charts        | Recharts                                        |
| Icons         | Lucide React                                    |
| Auth          | Supabase Auth (email + password)                |

## Project Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── api/                # API routes
│   │   └── trades/         # Simulated trade execution
│   ├── analytics/          # Analytics page
│   ├── login/              # Login page
│   ├── market/             # Market page
│   ├── portfolio/          # Portfolio page
│   ├── settings/           # Settings page
│   ├── signup/             # Sign-up page
│   ├── strategies/         # Strategies page
│   ├── trades/             # Trades page
│   ├── globals.css         # Global styles + Tailwind
│   ├── layout.tsx          # Root layout (wraps children in providers)
│   └── page.tsx            # Dashboard (home)
├── components/
│   ├── layout/             # Layout components (Sidebar)
│   │   └── sidebar.tsx
│   ├── providers/          # App providers
│   │   ├── query-provider.tsx
│   │   └── app-providers.tsx
│   └── ui/                 # Reusable UI components
│       ├── button.tsx
│       ├── card.tsx
│       └── toast.tsx
├── lib/
│   ├── supabase/           # Supabase client & schema
│   │   ├── client.ts
│   │   └── schema.sql
│   ├── auth/               # Auth context provider
│   │   └── auth-provider.tsx
│   ├── hooks/              # React Query hooks
│   │   ├── use-portfolio-data.ts
│   │   ├── use-trades.ts
│   │   ├── use-toast.ts
│   │   └── index.ts
│   ├── services/           # Data service layer (Supabase queries)
│   │   └── data-service.ts
│   ├── mock-data.ts        # Simulated market/portfolio data
│   └── utils.ts            # Utility functions
├── stores/                 # Zustand state stores
│   ├── app-store.ts
│   ├── portfolio-store.ts
│   └── strategies-store.ts
├── types/                  # TypeScript type definitions
│   └── index.ts
└── middleware.ts           # Auth guard for protected routes
```

---

## Quick Start

### Prerequisites

- **Node.js** 18+
- **pnpm** (recommended) or npm
- **Supabase account** (free tier works)

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Set Up Environment Variables

Copy the example env file:

```bash
cp .env.local.example .env.local
```

Edit `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 3. Set Up Supabase

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Go to **SQL Editor** and run the contents of `src/lib/supabase/schema.sql`
3. Go to **Authentication → Providers** and enable **Email** provider (disable "Confirm email" for development)
4. Copy your project URL and anon key from **Settings → API** into `.env.local`

### 4. Run the Development Server

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser. Sign up, and start paper trading!

### 5. Build for Production

```bash
pnpm build
pnpm start
```

---

## Database Schema (Supabase)

The following tables are created by the migration:

| Table         | Purpose                                        |
| ------------- | ---------------------------------------------- |
| `profiles`    | User profiles (linked to Supabase Auth)        |
| `portfolios`  | Simulated portfolios with cash balance         |
| `positions`   | Current holdings per portfolio                 |
| `trades`      | Complete simulated trade history               |
| `watchlists`  | User watchlists with asset tracking            |
| `strategies`  | Trading strategy definitions & performance     |

> Supabase Auth handles the `users` table automatically via `auth.users`.

---

## Architecture Principles

- **Modular** — Features are self-contained in their respective directories
- **Type-safe** — Full TypeScript strict mode with shared type definitions
- **Separation of Concerns** — UI components are purely presentational; business logic lives in stores/services
- **Scalable** — React Query hooks handle server state; Zustand stores for UI/client state
- **Paper Only** — Every trade simulation function explicitly documents it's paper trading
- **Auth-First** — Protected routes via middleware; all data scoped to authenticated user

---

## Next Recommended Development Steps

1. **Real Market Data** — Integrate with Finnhub, Alpha Vantage, or Yahoo Finance API for live prices
2. **Strategy Engine** — Build the backtesting engine for strategy evaluation (running on Supabase Edge Functions)
3. **AI Integration** — Add AI-powered analysis tools (sentiment analysis, pattern recognition)
4. **Real-time Charts** — Upgrade to lightweight-charts for live streaming
5. **Order Types** — Add limit orders, stop-loss, take-profit in simulation
6. **Multi-Portfolio** — Support multiple simulated portfolios per user
7. **Export/Import** — Allow strategy export and sharing
8. **Alerts** — Configurable price/indicator alerts
9. **Paper Trading Competitions** — Leaderboard-based trading challenges
10. **Strategy Marketplace** — Share and discover community strategies

---

## Rules

- ❌ NO real broker integration
- ❌ NO real money execution
- ❌ NO crypto wallet integration
- ❌ NO leverage/margin system
- ❌ NO automatic autonomous trading
- ✅ Everything is simulated paper trading
- ✅ All trades are executed against fake balances only

---

## License

MIT