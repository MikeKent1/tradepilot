'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/stores/app-store';
import { useAuth } from '@/lib/auth/auth-provider';
import {
  LayoutDashboard,
  Briefcase,
  TrendingUp,
  ArrowLeftRight,
  Lightbulb,
  BarChart3,
  Settings,
  Search,
  Scan,
  ChevronLeft,
  ChevronRight,
  LogOut,
  FlaskConical,
  Zap,
  Activity,
  Sun,
  Moon,
} from 'lucide-react';

const navItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/portfolio', label: 'Portfolio', icon: Briefcase },
  { href: '/market', label: 'Market', icon: TrendingUp },
  { href: '/screener', label: 'Screener', icon: Scan },
  { href: '/trades', label: 'Trades', icon: ArrowLeftRight },
  { href: '/strategies', label: 'Strategies', icon: Lightbulb },
  { href: '/monitor', label: 'Monitor', icon: Activity },
  { href: '/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { sidebarCollapsed, toggleSidebar, unreadCount, tradingMode, setTradingMode, theme, toggleTheme, mobileSidebarOpen, setMobileSidebarOpen } =
    useAppStore();
  const { user, signOut } = useAuth();

  const displayName: string =
    (user?.user_metadata?.name as string) || user?.email?.split('@')[0] || 'Trader';
  const avatarLetter = displayName.charAt(0).toUpperCase();

  return (
    <>
      {/* Mobile overlay */}
      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}
      <aside
        className={cn(
          'shrink-0 h-screen bg-sidebar border-r border-card-border flex flex-col transition-all duration-200 sticky top-0 z-50',
          // Desktop
          sidebarCollapsed ? 'w-16' : 'w-56',
          // Mobile: off-canvas
          'fixed inset-y-0 left-0 w-56 lg:static lg:translate-x-0',
          mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        )}
      >
      {/* Logo */}
      <div className="flex items-center h-14 px-4 border-b border-card-border">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center shrink-0">
            <TrendingUp className="w-4 h-4 text-white" />
          </div>
          {!sidebarCollapsed && (
            <span className="font-bold text-sm text-white truncate">
              Strategy Lab
            </span>
          )}
        </div>
        <button
          onClick={toggleSidebar}
          className="ml-auto text-zinc-500 hover:text-zinc-300 p-1 shrink-0 cursor-pointer"
        >
          {sidebarCollapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <ChevronLeft className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* Search */}
      {!sidebarCollapsed && (
        <div className="px-3 py-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-zinc-500" />
            <input
              type="text"
              placeholder="Search assets..."
              className="w-full bg-card border border-card-border rounded-lg pl-8 pr-3 py-1.5 text-xs text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-accent/50 transition-colors"
            />
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 px-2 py-2 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const isActive =
            item.href === '/'
              ? pathname === '/'
              : pathname.startsWith(item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-150 group',
                isActive
                  ? 'bg-sidebar-active text-white'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-sidebar-hover',
                sidebarCollapsed && 'justify-center px-0',
              )}
            >
              <Icon className="w-4.5 h-4.5 shrink-0" />
              {!sidebarCollapsed && <span>{item.label}</span>}
              {item.label === 'Dashboard' && !sidebarCollapsed && unreadCount > 0 && (
                <span className="ml-auto bg-accent text-white text-[10px] rounded-full w-5 h-5 flex items-center justify-center font-medium">
                  {unreadCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Mode Switcher */}
      <div className="px-2 pb-1">
        {sidebarCollapsed ? (
          <button
            onClick={() => setTradingMode(tradingMode === 'paper' ? 'live' : 'paper')}
            className="w-full flex items-center justify-center p-2 rounded-lg transition-colors cursor-pointer"
            title={tradingMode === 'paper' ? 'Paper Trading' : 'Live Trading'}
          >
            {tradingMode === 'paper' ? (
              <FlaskConical className="w-4.5 h-4.5 text-amber-400" />
            ) : (
              <Zap className="w-4.5 h-4.5 text-green-400" />
            )}
          </button>
        ) : (
          <div className="bg-card border border-card-border rounded-lg p-1">
            <div className="flex">
              <button
                onClick={() => setTradingMode('paper')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md text-xs font-medium transition-all cursor-pointer ${
                  tradingMode === 'paper'
                    ? 'bg-amber-500/15 text-amber-400 shadow-sm'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                <FlaskConical className="w-3.5 h-3.5" />
                <span>Paper</span>
              </button>
              <button
                onClick={() => setTradingMode('live')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md text-xs font-medium transition-all cursor-pointer ${
                  tradingMode === 'live'
                    ? 'bg-green-500/15 text-green-400 shadow-sm'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                <Zap className="w-3.5 h-3.5" />
                <span>Live</span>
              </button>
            </div>
            <p className="text-[10px] text-zinc-600 text-center mt-1.5">
              {tradingMode === 'paper'
                ? '📝 Paper — virtual money'
                : '💰 Live — real money'}
            </p>
          </div>
        )}
      </div>

      {/* Theme Toggle */}
      <div className="px-2 pb-1">
        <button
          onClick={toggleTheme}
          className={cn(
            'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-zinc-400 hover:text-zinc-200 hover:bg-sidebar-hover transition-colors cursor-pointer',
            sidebarCollapsed && 'justify-center px-0',
          )}
          title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
        >
          {theme === 'dark' ? (
            <Sun className="w-4.5 h-4.5 shrink-0" />
          ) : (
            <Moon className="w-4.5 h-4.5 shrink-0" />
          )}
          {!sidebarCollapsed && <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>}
        </button>
      </div>

      {/* User Footer */}
      <div className="p-2 border-t border-card-border space-y-1">
        <div
          className={cn(
            'flex items-center gap-3 p-2 rounded-lg',
            sidebarCollapsed && 'justify-center',
          )}
        >
          <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center shrink-0">
            <span className="text-xs font-bold text-accent">{avatarLetter}</span>
          </div>
          {!sidebarCollapsed && (
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-zinc-300 truncate">
                {displayName}
              </p>
              <p className="text-[10px] text-zinc-500 truncate">
                {user?.email || 'Paper Account'}
              </p>
            </div>
          )}
        </div>
        {!sidebarCollapsed && (
          <button
            onClick={signOut}
            className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs text-zinc-500 hover:text-zinc-200 hover:bg-sidebar-hover transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign out</span>
          </button>
        )}
      </div>
    </aside>
    </>
  );
}