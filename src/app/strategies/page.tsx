'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useStrategiesData } from '@/lib/hooks/use-strategies-data';
import { formatCurrency, formatPercent, pnlColor } from '@/lib/utils';
import {
  Plus,
  Play,
  Pause,
  Archive,
  Activity,
  BarChart3,
  Target,
  X,
  Save,
  TrendingUp,
  ArrowLeftRight,
  CandlestickChart,
  Layers,
} from 'lucide-react';

const statusIcons: Record<string, React.ReactNode> = {
  active: <Play className="w-3.5 h-3.5 text-emerald-400" />,
  paused: <Pause className="w-3.5 h-3.5 text-warning" />,
  draft: <Archive className="w-3.5 h-3.5 text-zinc-500" />,
  archived: <Archive className="w-3.5 h-3.5 text-zinc-600" />,
};

const statusColors: Record<string, string> = {
  active: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  paused: 'bg-warning/10 text-warning border-warning/20',
  draft: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
  archived: 'bg-zinc-700/10 text-zinc-500 border-zinc-700/20',
};

const strategyTypes = [
  { id: 'trend_following', label: 'Trend Following', icon: TrendingUp, desc: 'Follow market momentum with moving averages and trend indicators' },
  { id: 'mean_reversion', label: 'Mean Reversion', icon: ArrowLeftRight, desc: 'Trade price reversals using RSI, Bollinger Bands, and statistical models' },
  { id: 'breakout', label: 'Breakout', icon: CandlestickChart, desc: 'Capture price movements when assets break support/resistance levels' },
  { id: 'scalping', label: 'Scalping', icon: Layers, desc: 'High-frequency short-term trades for small, consistent profits' },
  { id: 'custom', label: 'Custom', icon: Activity, desc: 'Define your own entry/exit rules and indicators' },
];

export default function StrategiesPage() {
  const router = useRouter();
  const { strategies, isLoading, upsertStrategy, deleteStrategy, isSaving } = useStrategiesData();
  const [showModal, setShowModal] = useState(false);
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formType, setFormType] = useState('trend_following');
  const [formStatus, setFormStatus] = useState<'draft' | 'active'>('draft');

  const resetForm = () => {
    setFormName('');
    setFormDesc('');
    setFormType('trend_following');
    setFormStatus('draft');
  };

  const handleCreate = () => {
    if (!formName.trim()) return;

    const selectedType = strategyTypes.find((t) => t.id === formType)!;

    upsertStrategy({
      name: formName.trim(),
      description: formDesc.trim() || `${selectedType.label} strategy`,
      type: formType,
      status: formStatus,
      config: {
        type: formType,
        timeframes: ['1h', '4h', '1d'],
        indicators: [],
        entryRules: [],
        exitRules: [],
        riskPerTrade: 1,
        maxPositions: 5,
      },
      performance: {
        total_trades: 0,
        win_rate: 0,
        avg_pnl: 0,
        total_pnl: 0,
        total_pnl_percent: 0,
        sharpe_ratio: 0,
        max_drawdown: 0,
      },
    });

    resetForm();
    setShowModal(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Strategies</h1>
          <p className="text-sm text-zinc-400 mt-0.5">Design and test trading strategies</p>
        </div>
        <Button onClick={() => setShowModal(true)}>
          <Plus className="w-4 h-4" />
          New Strategy
        </Button>
      </div>

      {/* Strategy Cards */}
      <div className="space-y-4">
        {strategies.map((strategy) => (
          <Card key={strategy.id}>
            <CardContent className="!p-0">
              <div className="p-5">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-semibold text-white">{strategy.name}</h3>
                      <span
                        className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border ${statusColors[strategy.status]}`}
                      >
                        {statusIcons[strategy.status]}
                        {strategy.status.toUpperCase()}
                      </span>
                    </div>
                    <p className="text-sm text-zinc-400 mb-4">{strategy.description}</p>

                    {/* Performance Stats */}
                    {strategy.performance.total_trades > 0 ? (
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                        <div>
                          <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Total Trades</p>
                          <p className="text-sm font-semibold text-zinc-200 mt-0.5">
                            {strategy.performance.total_trades}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Win Rate</p>
                          <p className="text-sm font-semibold text-zinc-200 mt-0.5">
                            {(strategy.performance.win_rate * 100).toFixed(1)}%
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Total P&L</p>
                          <p className={`text-sm font-semibold mt-0.5 ${pnlColor(strategy.performance.total_pnl)}`}>
                            {formatCurrency(strategy.performance.total_pnl)}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Sharpe</p>
                          <p className="text-sm font-semibold text-zinc-200 mt-0.5">
                            {strategy.performance.sharpe_ratio?.toFixed(2) ?? '—'}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Max Drawdown</p>
                          <p className="text-sm font-semibold text-red-400 mt-0.5">
                            {strategy.performance.max_drawdown?.toFixed(1) ?? '—'}%
                          </p>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-zinc-500">No trades executed yet. Activate this strategy to begin.</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Action Bar */}
              <div className="flex items-center gap-2 px-5 py-3 border-t border-card-border bg-background">
                {strategy.status !== 'active' && strategy.status !== 'archived' && (
                  <button
                    onClick={() => upsertStrategy({ ...strategy, status: 'active' })}
                    disabled={isSaving}
                    className="flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 cursor-pointer transition-colors"
                  >
                    <Play className="w-3.5 h-3.5" /> Activate
                  </button>
                )}
                {strategy.status === 'active' && (
                  <button
                    onClick={() => upsertStrategy({ ...strategy, status: 'paused' })}
                    disabled={isSaving}
                    className="flex items-center gap-1.5 text-xs text-warning hover:text-warning/80 cursor-pointer transition-colors"
                  >
                    <Pause className="w-3.5 h-3.5" /> Pause
                  </button>
                )}
                <button
                  onClick={() => deleteStrategy(strategy.id)}
                  className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 cursor-pointer transition-colors ml-auto"
                >
                  <Archive className="w-3.5 h-3.5" /> Delete
                </button>
                <button
                  onClick={() => router.push(`/strategies/${strategy.id}`)}
                  className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-300 cursor-pointer transition-colors"
                >
                  <Activity className="w-3.5 h-3.5" /> View Details
                </button>
                <button className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-300 cursor-pointer transition-colors">
                  <BarChart3 className="w-3.5 h-3.5" /> Backtest
                </button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {strategies.length === 0 && !isLoading && (
        <Card>
          <CardContent>
            <div className="py-12 text-center">
              <Target className="w-10 h-10 text-zinc-600 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-zinc-300 mb-1">No Strategies Yet</h3>
              <p className="text-sm text-zinc-500 mb-4">Create your first trading strategy to start backtesting.</p>
              <Button onClick={() => setShowModal(true)}>
                <Plus className="w-4 h-4" />
                Create Strategy
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── New Strategy Modal ─────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center animate-fade-in">
          <div className="glass-card w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-white">Create New Strategy</h2>
              <button
                onClick={() => {
                  resetForm();
                  setShowModal(false);
                }}
                className="text-zinc-500 hover:text-zinc-300 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Name */}
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                  Strategy Name
                </label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Golden Cross Scalper"
                  className="w-full bg-card border border-card-border rounded-lg px-3 py-2.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-accent/50"
                  autoFocus
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                  Description
                </label>
                <textarea
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  placeholder="Briefly describe what this strategy does..."
                  rows={3}
                  className="w-full bg-card border border-card-border rounded-lg px-3 py-2.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-accent/50 resize-none"
                />
              </div>

              {/* Strategy Type */}
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-2">
                  Strategy Type
                </label>
                <div className="grid grid-cols-1 gap-2">
                  {strategyTypes.map((type) => {
                    const Icon = type.icon;
                    return (
                      <button
                        key={type.id}
                        onClick={() => setFormType(type.id)}
                        className={`flex items-center gap-3 p-3 rounded-lg border text-left transition-all cursor-pointer ${
                          formType === type.id
                            ? 'border-accent/50 bg-accent/10'
                            : 'border-card-border bg-card hover:bg-card-hover'
                        }`}
                      >
                        <div className={`p-1.5 rounded-md ${formType === type.id ? 'bg-accent/20' : 'bg-zinc-800'}`}>
                          <Icon className="w-4 h-4 text-accent" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-zinc-200">{type.label}</p>
                          <p className="text-[11px] text-zinc-500 truncate">{type.desc}</p>
                        </div>
                        {formType === type.id && (
                          <span className="text-accent text-[10px] font-medium px-2 py-0.5 rounded-full bg-accent/10">
                            Selected
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Status */}
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                  Initial Status
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setFormStatus('draft')}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer ${
                      formStatus === 'draft'
                        ? 'bg-zinc-500/20 text-zinc-300 border border-zinc-500/30'
                        : 'bg-card border border-card-border text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    <Archive className="w-3.5 h-3.5 inline mr-1.5" />
                    Draft
                  </button>
                  <button
                    onClick={() => setFormStatus('active')}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer ${
                      formStatus === 'active'
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                        : 'bg-card border border-card-border text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    <Play className="w-3.5 h-3.5 inline mr-1.5" />
                    Active
                  </button>
                </div>
              </div>

              {/* Preview Card */}
              <div className="p-3 rounded-lg bg-card border border-card-border">
                <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-2">Preview</p>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-semibold text-zinc-200">
                    {formName || 'Unnamed Strategy'}
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-full border ${
                      statusColors[formStatus]
                    }`}
                  >
                    {formStatus.toUpperCase()}
                  </span>
                </div>
                <p className="text-xs text-zinc-500">
                  {formDesc || strategyTypes.find((t) => t.id === formType)?.desc || 'No description'}
                </p>
                <div className="flex items-center gap-3 mt-2 text-[10px] text-zinc-500">
                  <span>Type: {strategyTypes.find((t) => t.id === formType)?.label}</span>
                  <span>•</span>
                  <span>0 trades</span>
                  <span>•</span>
                  <span>Win rate: 0%</span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <Button
                  variant="secondary"
                  className="flex-1"
                  onClick={() => {
                    resetForm();
                    setShowModal(false);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleCreate}
                  disabled={!formName.trim() || isSaving}
                  className="flex-1"
                >
                  <Save className="w-4 h-4" />
                  {isSaving ? 'Saving...' : 'Create Strategy'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}