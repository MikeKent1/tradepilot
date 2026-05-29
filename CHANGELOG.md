# 📋 Changelog — Tradepilot (Strategy Lab)

_Κάθε φορά που προσθέτουμε ένα νέο feature, το καταγράφουμε εδώ με ημερομηνία._

---

## 2026-05-26 (later #2) — Unified Error Handling

### ✅ Ενέργειες
- **`src/lib/errors.ts`** — `AppError` class με typed error codes (`NETWORK_ERROR`, `AUTH_ERROR`, `VALIDATION_ERROR`, `NOT_FOUND`, `PERMISSION_DENIED`, `RATE_LIMITED`, `SERVER_ERROR`, `UNKNOWN_ERROR`)
  - `parseSupabaseError(err)` — μετατρέπει Supabase/network errors σε `AppError` με σωστό severity + retryable flag
  - `isRetryableError`, `isAuthError`, `isNetworkError` — type guards
- **`src/lib/hooks/use-online-status.ts`** — Tracks `navigator.onLine` state (online/offline detection)
- **`src/lib/hooks/use-error-handler.ts`** — `useErrorHandler` hook: δέχεται context, κάνει parse errors → toast + auto-signOut σε auth errors
- **`src/lib/hooks/use-query-error-handler.ts`** — `useQueryErrorHandler`: global subscriber στο React Query `MutationCache` → toast notifications για όλα τα mutation errors
- **`src/components/error-boundary.tsx`** — React class Error Boundary με glass-card fallback UI + retry button. `ErrorBoundaryWrapper` για εύκολο wrapping.
- **`src/components/ui/offline-banner.tsx`** — Amber banner με wifi-off icon όταν ο browser είναι offline
- **`src/components/providers/query-provider.tsx`** — Προσθήκη retry logic βασισμένο σε `isRetryableError` (max 2 retries για network/server/rate-limit errors)
- **`src/components/providers/app-providers.tsx`** — Ενσωμάτωση `ErrorBoundary`, `useQueryErrorHandler`, `OfflineBanner`

### 🔧 Τεχνικές λεπτομέρειες
- Το `ErrorBoundary` είναι class component (το React Error Boundary API απαιτεί class)
- Ο `useQueryErrorHandler` κάνει subscribe σε MutationCache για global mutation error toasts
- Το QueryClient retry πολιτική: retry μόνο για `retryable` errors (network, server 5xx, rate-limit 429) — max 2 attempts
- Auth errors (401, session expired) κάνουν αυτόματα signOut
- Validation/constraint errors (23505, 23503, 23502, 22P02) εμφανίζονται ως warning και δεν είναι retryable
- Offline detection χρησιμοποιεί `window.addEventListener('online'/'offline')`

---

## 2026-05-26 (later) — Supabase Realtime Subscriptions (useRealtime)

### ✅ Ενέργειες
- **Δημιουργία `useRealtime` hook** (`src/lib/hooks/use-realtime.ts`): Γενικό Supabase Realtime hook που αυτόματα κάνει invalidate React Query caches όταν υπάρχουν αλλαγές στη βάση.
  - Υποστηρίζει `portfolios`, `positions`, `trades`, `watchlists`, `strategies`, `notifications` πίνακες
  - Δέχεται `filter`, `queryKeys`, `enabled`, `onInsert`/`onUpdate`/`onDelete` callbacks
  - Αυτόματο cleanup στο unmount
- **Ενσωμάτωση useRealtime σε όλα τα data hooks**:
  - `use-portfolio-data.ts` — real-time για portfolio + positions
  - `use-trades.ts` — real-time για trades
  - `use-watchlist-data.ts` — real-time για watchlist
  - `use-notifications-data.ts` — **αντικατάσταση του polling** (`refetchInterval: 30_000`) με real-time subscription
  - `use-strategies-data.ts` — real-time για strategies
  - `use-strategy-detail.ts` — real-time για strategy + strategy-trades
  - `use-analytics-data.ts` — real-time για portfolio + analytics-trades
- **Fix**: Type safety — το `filter: undefined` δεν είναι αποδεκτό από Supabase `.on()`, χρησιμοποιείται conditional spread `...(filter ? { filter } : {})`
- **Fix**: `insertTrade` — το `Omit` τώρα εξαιρεί και το `mode` (το mode περνιέται ως 3ο argument)
- **SQL Migration**: `20250526000000_enable_replica_identity.sql` — `ALTER TABLE ... REPLICA IDENTITY FULL` και για τους 6 πίνακες (απαραίτητο για UPDATE/DELETE events)

### 🔧 Τεχνικές λεπτομέρειες
- Τα queryKeys περνιούνται μόνο όταν το ID/user είναι defined (αποφυγή `string | undefined` type errors)
- Το `use-notifications-data.ts` δεν κάνει πλέον polling — η ενημέρωση γίνεται instant μέσω WebSocket
- Όλα τα hooks είναι `'use client'` και ακολουθούν το υπάρχον pattern

---

## 2026-05-26 — Supabase Schema Verification & First Run

### ✅ Ενέργειες
- **Schema verification**: Τα SQL migrations έχουν ήδη εφαρμοστεί στο Supabase (`hnfgwffxqimatnjnlrzp`). Όλοι οι πίνακες, triggers, composite indexes, και RLS policies είναι ενεργά.
  - Πίνακες: `profiles`, `portfolios`, `positions`, `trades`, `watchlists`, `strategies`, `notifications`
  - Triggers: `on_auth_user_created` (auto-profile), `on_profile_created` (auto-portfolio)
  - RLS: Πλήρης row-level security σε όλους τους πίνακες (CRUD policies ανά owner)
- **Dependencies**: `pnpm install` — όλα ενημερωμένα
- **Dev Server**: `pnpm dev` — τρέχει επιτυχώς στο **http://localhost:3000**
  - Supabase client συνδεδεμένο ✅
  - `GET / 200` σε ~1.7s (Turbopack)
  - Next.js 16.2.6

### ✅ Ολοκληρωμένα Tasks (26/5)
- [x] **Refactor `use-analytics-data.ts`**: Πλέον καλεί `data-service.fetchPortfolio()` / `fetchTrades()` αντί για απευθείας Supabase queries
- [x] **Μετονομασία `middleware.ts` → `proxy.ts`**: Next.js 16 compatibility — το deprecation warning έφυγε
- [x] **Fix TypeScript types**: Πλήρης ευθυγράμμιση με Supabase schema
  - Προσθήκη `mode: TradingMode` σε `Portfolio` και `Trade` interfaces
  - Αφαίρεση `volume?: string` από `WatchlistItem` (δεν υπάρχει στο schema)
  - Ενημέρωση mappers στο `data-service.ts` (mapPortfolio, mapTrade, mapWatchlistItem)
  - Ενημέρωση `mock-data.ts` (mockPortfolio, mockTrades + mode, mockWatchlist - volume)

### 🔜 Τι πρέπει ακόμα να γίνει
- [ ] **Πρώτο E2E test**: Signup → Login → Dashboard → Create Strategy → Execute Trade → Verify Analytics
- [ ] **Auth testing**: Έλεγχος ότι login/signup λειτουργούν με Supabase Auth
- [ ] **Real-time subscriptions**: Προσθήκη Supabase Realtime για live updates
- [ ] **Error handling**: Unified error handling + toast notifications σε όλα τα mutations
- [ ] **Mobile responsiveness**: Έλεγχος όλων των σελίδων σε κινητό

---

## 2026-05-25 — Dual Trading Mode (Paper / Live)

### 🆕 Νέα Αρχεία
| Αρχείο | Περιγραφή |
|--------|------------|
| `supabase/migrations/20250525000000_add_trading_mode.sql` | SQL migration: προσθέτει `mode` column σε portfolios & trades, composite indexes |

### ✏️ Τροποποιημένα Αρχεία

| Αρχείο | Τι άλλαξε |
|--------|------------|
| `src/types/index.ts` | Προστέθηκε `TradingMode = 'paper' \| 'live'` |
| `src/stores/app-store.ts` | Προστέθηκε `tradingMode` state + `setTradingMode` action με localStorage persistence |
| `src/components/layout/sidebar.tsx` | Προστέθηκε **Mode Switcher** (Paper/Live toggle) κάτω από το navigation |
| `src/lib/services/data-service.ts` | `fetchPortfolio`, `fetchTrades`, `fetchTradesByStrategy`, `insertTrade` δέχονται `mode` parameter. Προστέθηκε `createPortfolio` |
| `src/lib/hooks/use-portfolio-data.ts` | Περνάει `tradingMode` σε όλα τα service calls, ενημερωμένα queryKey invalidation |
| `src/lib/hooks/use-trades.ts` | Περνάει `tradingMode` στο `fetchTrades` |
| `src/lib/hooks/use-strategy-detail.ts` | Περνάει `tradingMode` στο `fetchTradesByStrategy` |
| `src/lib/hooks/use-analytics-data.ts` | Φιλτράρει portfolio & trades βάσει `tradingMode` (και απευθείας Supabase queries) |
| `src/scripts/run-schema.js` | Τρέχει και το νέο migration `20250525000000_add_trading_mode.sql` |

### 📦 Features που προστέθηκαν

#### Dual Trading Mode
- ✅ **Paper Mode** (🟡 amber): Όλα τα trades είναι εικονικά — για testing στρατηγικών χωρίς ρίσκο
- ✅ **Live Mode** (🟢 green): Για πραγματικές συναλλαγές με broker (μελλοντικά)
- ✅ **Persistent**: Το mode αποθηκεύεται στο localStorage, επιβιώνει από refresh
- ✅ **Sidebar Switcher**: Εύκολο toggle με οπτική ένδειξη (amber=paper, green=live)
- ✅ **Collapsed support**: Όταν το sidebar είναι κλειστό, φαίνεται μόνο το εικονίδιο
- ✅ **Database separation**: Portfolios & trades έχουν `mode` column ('paper'/'live') — οι queries φιλτράρουν ανάλογα
- ✅ **Data isolation**: Όλοι οι hooks (portfolio, trades, strategy, analytics) σέβονται το ενεργό mode
| `src/lib/hooks/use-strategy-detail.ts` | React Query hook — φέρνει strategy + trades από Supabase βάσει ID |
| `src/app/strategies/[id]/page.tsx` | **Strategy Detail Page** — πλήρης σελίδα λεπτομερειών για κάθε strategy (dynamic route) |

### ✏️ Τροποποιημένα Αρχεία

| Αρχείο | Τι άλλαξε |
|--------|------------|
| `src/app/strategies/page.tsx` | Προστέθηκε `useRouter` → το κουμπί "View Details" κάνει navigate στο `strategies/${id}` |

### 📦 Features που προστέθηκαν

#### Strategy Detail Page (`/strategies/[id]`)
- ✅ **Header**: Όνομα, status badge, description, type icon, dates
- ✅ **Edit Mode**: Inline επεξεργασία ονόματος/περιγραφής με Save/Cancel
- ✅ **Status Workflow**: Activate → Pause → Archive (state machine)
- ✅ **Delete**: Confirm dialog → διαγραφή + redirect στη λίστα
- ✅ **5 KPI Cards**: Total P&L, Win Rate, Total Trades, Avg P&L/Trade, Max Drawdown
- ✅ **Equity Curve**: Pure SVG cumulative P&L line chart (zero-line, gradient fill, currency Y-axis)
- ✅ **Configuration Panel**: Collapsible JSON view
- ✅ **Trades Table**: Λίστα από trades (50 max), με P&L χρώματα
- ✅ **Loading/Error/Not Found States**

#### Supabase Integration
- ✅ `src/lib/supabase/client.ts` — Supabase client (client-side)
- ✅ `src/lib/services/data-service.ts` — Όλα τα CRUD API calls προς Supabase
- ✅ `supabase/migrations/` — SQL migrations έτοιμα για εφαρμογή
- ✅ `src/scripts/run-schema.js` — Script για να τρέξει το schema

---

## Προηγούμενα (Before 2026-05-25)

### 🏗️ Project Foundation
| Component | Περιγραφή |
|-----------|------------|
| `src/app/layout.tsx` | Root layout — Inter font, dark theme, AppProviders wrapper |
| `src/app/page.tsx` | Dashboard home page |
| `src/app/globals.css` | Global styles (dark theme, glass cards, animations) |
| `src/middleware.ts` | Next.js middleware |
| `tailwind.config.ts` / `postcss.config.mjs` | Tailwind CSS v4 setup |

### 📄 App Pages (Routes)
| Route | Αρχείο | Status |
|-------|--------|--------|
| `/` | `src/app/page.tsx` | ✅ Dashboard |
| `/strategies` | `src/app/strategies/page.tsx` | ✅ Strategy List + Create Modal |
| `/strategies/[id]` | `src/app/strategies/[id]/page.tsx` | ✅ Strategy Detail |
| `/trades` | `src/app/trades/page.tsx` | ✅ Trades Page |
| `/portfolio` | `src/app/portfolio/page.tsx` | ✅ Portfolio Page |
| `/market` | `src/app/market/page.tsx` | ✅ Market Data Page |
| `/analytics` | `src/app/analytics/page.tsx` | ✅ Analytics Page |
| `/settings` | `src/app/settings/page.tsx` | ✅ Settings Page |
| `/login` | `src/app/login/page.tsx` | ✅ Login Page |
| `/signup` | `src/app/signup/page.tsx` | ✅ Signup Page |

### 🧩 Components
| Component | Αρχείο | Περιγραφή |
|-----------|--------|------------|
| Sidebar | `src/components/layout/sidebar.tsx` | Navigation sidebar |
| App Providers | `src/components/providers/app-providers.tsx` | React Query + Auth provider wrapper |
| UI Kit | `src/components/ui/` | Card, Button, and other base UI components |

### 🎣 Custom Hooks
| Hook | Αρχείο | Περιγραφή |
|------|--------|------------|
| `useMarketData` | `src/lib/hooks/use-market-data.ts` | Market data + multi-symbol + intraday + symbol search |
| `useMultiMarketData` | `src/lib/hooks/use-market-data.ts` | Fetch multiple symbols at once |
| `useIntradayData` | `src/lib/hooks/use-market-data.ts` | Intraday OHLCV data |
| `useSymbolSearch` | `src/lib/hooks/use-market-data.ts` | Symbol search API |
| `usePortfolioData` | `src/lib/hooks/use-portfolio-data.ts` | Portfolio data hook |
| `useStrategiesData` | `src/lib/hooks/use-strategies-data.ts` | Strategy CRUD hook |
| `useStrategyDetail` | `src/lib/hooks/use-strategy-detail.ts` | Single strategy + trades |
| `useAnalyticsData` | `src/lib/hooks/use-analytics-data.ts` | Analytics data hook |
| `useWatchlistData` | `src/lib/hooks/use-watchlist-data.ts` | Watchlist data hook |
| `useNotificationsData` | `src/lib/hooks/use-notifications-data.ts` | Notifications hook |
| `useTrades` | `src/lib/hooks/use-trades.ts` | Trades data hook |
| `useToast` | `src/lib/hooks/use-toast.ts` | Toast notifications |

### 🔐 Authentication
| Αρχείο | Περιγραφή |
|--------|------------|
| `src/lib/auth/auth-provider.tsx` | Auth context provider |
| `src/lib/supabase/client.ts` | Supabase client setup |
| `src/app/login/page.tsx` | Login page UI |
| `src/app/signup/page.tsx` | Signup page UI |
| `src/middleware.ts` | Auth middleware (route protection) |

### 🗄️ State Management
| Store | Αρχείο | Περιγραφή |
|-------|--------|------------|
| App Store | `src/stores/app-store.ts` | Global app state |
| Portfolio Store | `src/stores/portfolio-store.ts` | Portfolio state |
| Strategies Store | `src/stores/strategies-store.ts` | Strategies state |

### 🧠 Types & Utilities
| Αρχείο | Περιγραφή |
|--------|------------|
| `src/types/index.ts` | TypeScript types (`Strategy`, `Trade`, `UserProfile`, `WatchlistItem`, `Notification`) |
| `src/lib/utils.ts` | Utility functions (`formatCurrency`, `formatPercent`, `pnlColor`, `cn`) |
| `src/lib/mock-data.ts` | Mock data for development |

### 🗃️ Database (Supabase)
| Αρχείο | Περιγραφή |
|--------|------------|
| `supabase/migrations/` | SQL migration files |
| `src/scripts/run-schema.js` | Script για να τρέξει το schema στο Supabase |
| `src/lib/services/data-service.ts` | Data service layer (CRUD operations) |

### ⚙️ Configuration
| Αρχείο | Περιγραφή |
|--------|------------|
| `next.config.ts` | Next.js config |
| `tsconfig.json` | TypeScript config |
| `eslint.config.mjs` | ESLint config |
| `.prettierrc` | Prettier config |
| `.env.local` | Environment variables (Supabase URL/keys) |
| `.gitignore` | Git ignore |
| `package.json` | Dependencies |
| `pnpm-lock.yaml` | PNPM lock file |
| `pnpm-workspace.yaml` | PNPM workspace config |

---

> **Οδηγίες**: Κάθε φορά που φτιάχνουμε κάτι καινούργιο, προσθέτουμε μια νέα ημερομηνία από πάνω (πιο πρόσφατη) και συμπληρώνουμε τι προστέθηκε/άλλαξε.