'use client';

import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth/auth-provider';
import { useToast } from '@/lib/hooks/use-toast';
import { supabase } from '@/lib/supabase/client';
import {
  User,
  Bell,
  Shield,
  Palette,
  Key,
  Eye,
  EyeOff,
  RefreshCw,
  Save,
  Lock,
  CheckCircle,
  AlertTriangle,
  Loader2,
} from 'lucide-react';

// ─── Preferences (localStorage backed) ──────────────────

function getPref<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(`tradepilot:${key}`);
    return raw != null ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function setPref<T>(key: string, value: T) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(`tradepilot:${key}`, JSON.stringify(value));
  } catch {
    /* quota exceeded, ignore */
  }
}

// ─── Page component ─────────────────────────────────────

export default function SettingsPage() {
  const { user } = useAuth();
  const { addToast } = useToast();

  // ── Profile form state ──────────────────────────────
  const [displayName, setDisplayName] = useState(
    () => (user?.user_metadata?.name as string) || user?.email?.split('@')[0] || '',
  );
  const [email] = useState(user?.email || '');
  const [savingProfile, setSavingProfile] = useState(false);

  // ── Change password ─────────────────────────────────
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  // ── Preferences ─────────────────────────────────────
  const [showBalance, setShowBalance] = useState(() => getPref('showBalance', true));
  const [priceAlerts, setPriceAlerts] = useState(() => getPref('priceAlerts', true));
  const [tradeConfirmations, setTradeConfirmations] = useState(() => getPref('tradeConfirmations', true));
  const [newsUpdates, setNewsUpdates] = useState(() => getPref('newsUpdates', false));

  // ── API key ─────────────────────────────────────────
  const [apiKey, setApiKey] = useState(() => getPref('alphaVantageKey', ''));
  const [showApiKey, setShowApiKey] = useState(false);
  const [savingApiKey, setSavingApiKey] = useState(false);

  function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
    return (
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={() => onChange(!on)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer ${
          on ? 'bg-accent' : 'bg-card-border'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            on ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    );
  }

  // ── Handlers ────────────────────────────────────────

  async function handleSaveProfile() {
    if (!user) return;
    setSavingProfile(true);
    const { error } = await supabase.auth.updateUser({
      data: { name: displayName },
    });
    setSavingProfile(false);
    if (error) {
      addToast(error.message, 'error');
    } else {
      addToast('Profile updated successfully', 'success');
    }
  }

  async function handleChangePassword() {
    if (!user) return;
    if (!currentPassword) {
      addToast('Enter your current password', 'error');
      return;
    }
    if (newPassword.length < 6) {
      addToast('New password must be at least 6 characters', 'error');
      return;
    }
    if (newPassword !== confirmPassword) {
      addToast('Passwords do not match', 'error');
      return;
    }

    setChangingPassword(true);

    // Re-authenticate then update
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user.email!,
      password: currentPassword,
    });

    if (signInError) {
      setChangingPassword(false);
      addToast(signInError.message, 'error');
      return;
    }

    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setChangingPassword(false);

    if (error) {
      addToast(error.message, 'error');
    } else {
      addToast('Password changed successfully', 'success');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    }
  }

  function handleToggleBalance(v: boolean) {
    setShowBalance(v);
    setPref('showBalance', v);
  }

  function handleToggleAlerts(v: boolean) {
    setPriceAlerts(v);
    setPref('priceAlerts', v);
  }

  function handleToggleConfirmations(v: boolean) {
    setTradeConfirmations(v);
    setPref('tradeConfirmations', v);
  }

  function handleToggleNews(v: boolean) {
    setNewsUpdates(v);
    setPref('newsUpdates', v);
  }

  async function handleSaveApiKey() {
    setSavingApiKey(true);
    setPref('alphaVantageKey', apiKey.trim());
    // Re-trigger any Alpha Vantage hooks by reloading the page
    window.location.reload();
    setSavingApiKey(false);
    addToast('API key saved. Refreshing...', 'success');
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-sm text-zinc-400 mt-0.5">Configure your trading environment</p>
      </div>

      {/* Profile */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-zinc-500" />
            <CardTitle>Profile</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">
              Display Name
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full bg-card border border-card-border rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-accent/50"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">
              Email
            </label>
            <input
              type="email"
              value={email}
              disabled
              className="w-full bg-card border border-card-border rounded-lg px-3 py-2 text-sm text-zinc-500 cursor-not-allowed opacity-60"
            />
            <p className="text-[10px] text-zinc-600 mt-1">
              Email cannot be changed. Contact support for account changes.
            </p>
          </div>
          <div className="flex justify-end">
            <Button variant="primary" size="sm" onClick={handleSaveProfile} disabled={savingProfile}>
              {savingProfile ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              {savingProfile ? 'Saving...' : 'Save Profile'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Change Password */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-zinc-500" />
            <CardTitle>Change Password</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">
              Current Password
            </label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full bg-card border border-card-border rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-accent/50 placeholder-zinc-600"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">
              New Password
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Min 6 characters"
              className="w-full bg-card border border-card-border rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-accent/50 placeholder-zinc-600"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">
              Confirm New Password
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-type new password"
              className="w-full bg-card border border-card-border rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-accent/50 placeholder-zinc-600"
            />
          </div>
          <div className="flex justify-end">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleChangePassword}
              disabled={changingPassword}
            >
              {changingPassword ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Shield className="w-3.5 h-3.5" />
              )}
              {changingPassword ? 'Updating...' : 'Change Password'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Alpha Vantage API Key */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Key className="w-4 h-4 text-zinc-500" />
            <CardTitle>Alpha Vantage API Key</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">
              API Key
            </label>
            <div className="relative">
              <input
                type={showApiKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Enter your Alpha Vantage key"
                className="w-full bg-card border border-card-border rounded-lg pl-3 pr-10 py-2 text-sm text-zinc-200 focus:outline-none focus:border-accent/50 placeholder-zinc-600 font-mono"
              />
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 cursor-pointer"
              >
                {showApiKey ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
            <p className="text-[10px] text-zinc-600 mt-1">
              Get a free key at{' '}
              <a
                href="https://www.alphavantage.co/support/#api-key"
                target="_blank"
                rel="noreferrer"
                className="text-accent hover:text-accent-hover"
              >
                alphavantage.co
              </a>
              . Stored locally in your browser.
            </p>
          </div>
          <div className="flex justify-end">
            <Button variant="primary" size="sm" onClick={handleSaveApiKey} disabled={savingApiKey}>
              {savingApiKey ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <CheckCircle className="w-3.5 h-3.5" />
              )}
              {savingApiKey ? 'Saving...' : 'Save API Key'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Display Preferences */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Palette className="w-4 h-4 text-zinc-500" />
            <CardTitle>Display</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-sm text-zinc-200">Show Balance</p>
              <p className="text-xs text-zinc-500">Display portfolio balance on all screens</p>
            </div>
            <Toggle on={showBalance} onChange={handleToggleBalance} />
          </div>
        </CardContent>
      </Card>

      {/* Notification Preferences */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-zinc-500" />
            <CardTitle>Notifications</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-sm text-zinc-200">Price Alerts</p>
              <p className="text-xs text-zinc-500">Get notified on price thresholds</p>
            </div>
            <Toggle on={priceAlerts} onChange={handleToggleAlerts} />
          </div>
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-sm text-zinc-200">Trade Confirmations</p>
              <p className="text-xs text-zinc-500">Show confirmation on trade execution</p>
            </div>
            <Toggle on={tradeConfirmations} onChange={handleToggleConfirmations} />
          </div>
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-sm text-zinc-200">News Updates</p>
              <p className="text-xs text-zinc-500">Receive market news updates</p>
            </div>
            <Toggle on={newsUpdates} onChange={handleToggleNews} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}