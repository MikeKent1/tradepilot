import { create } from 'zustand';
import { Notification, TradingMode } from '@/types';
import { mockNotifications } from '@/lib/mock-data';
import { generateId } from '@/lib/utils';

interface AppState {
  // Notifications
  notifications: Notification[];
  unreadCount: number;
  addNotification: (notification: Omit<Notification, 'id' | 'timestamp' | 'read'>) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  removeNotification: (id: string) => void;

  // UI State
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  activeSection: string;
  setActiveSection: (section: string) => void;

  // Search
  searchQuery: string;
  setSearchQuery: (query: string) => void;

  // Trading Mode
  tradingMode: TradingMode;
  setTradingMode: (mode: TradingMode) => void;

  // Mobile sidebar
  mobileSidebarOpen: boolean;
  setMobileSidebarOpen: (open: boolean) => void;

  // Theme
  theme: 'dark' | 'light';
  toggleTheme: () => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  // Notifications
  notifications: mockNotifications,
  unreadCount: mockNotifications.filter((n) => !n.read).length,

  addNotification: (notification) => {
    const newNotification: Notification = {
      id: generateId(),
      ...notification,
      timestamp: new Date().toISOString(),
      read: false,
    };
    set((state) => ({
      notifications: [newNotification, ...state.notifications],
      unreadCount: state.unreadCount + 1,
    }));
  },

  markAsRead: (id) =>
    set((state) => {
      const notifications = state.notifications.map((n) =>
        n.id === id ? { ...n, read: true } : n,
      );
      return {
        notifications,
        unreadCount: notifications.filter((n) => !n.read).length,
      };
    }),

  markAllAsRead: () =>
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, read: true })),
      unreadCount: 0,
    })),

  removeNotification: (id) =>
    set((state) => {
      const notifications = state.notifications.filter((n) => n.id !== id);
      return {
        notifications,
        unreadCount: notifications.filter((n) => !n.read).length,
      };
    }),

  // UI State
  sidebarCollapsed: false,
  toggleSidebar: () =>
    set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  activeSection: 'dashboard',
  setActiveSection: (section) => set({ activeSection: section }),

  // Search
  searchQuery: '',
  setSearchQuery: (query) => set({ searchQuery: query }),

  // Trading Mode — persist in localStorage
  tradingMode: (() => {
    if (typeof window === 'undefined') return 'paper';
    try {
      const saved = localStorage.getItem('tradepilot:tradingMode');
      if (saved === 'paper' || saved === 'live') return saved;
    } catch {
      /* ignore */
    }
    return 'paper';
  })(),
  setTradingMode: (mode) => {
    set({ tradingMode: mode });
    try {
      localStorage.setItem('tradepilot:tradingMode', mode);
    } catch {
      /* ignore */
    }
  },

  // Mobile sidebar
  mobileSidebarOpen: false,
  setMobileSidebarOpen: (open) => set({ mobileSidebarOpen: open }),

  // Theme
  theme: (() => {
    if (typeof window === 'undefined') return 'dark';
    try {
      const saved = localStorage.getItem('tradepilot:theme');
      if (saved === 'dark' || saved === 'light') return saved;
    } catch {
      /* ignore */
    }
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  })(),
  toggleTheme: () => {
    set((state) => {
      const next = state.theme === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem('tradepilot:theme', next);
      } catch {
        /* ignore */
      }
      return { theme: next };
    });
  },
}));
