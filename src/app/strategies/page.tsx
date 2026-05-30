'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useStrategiesData } from '@/lib/hooks/use-strategies-data';
import { formatCurrency, formatPercent, pnlColor } from '@/lib/utils';
import type {
  StrategyConfig,
  Timeframe,
  IndicatorType,
  EntryRule,
  ExitRule,
  IndicatorCrossParams,
  PriceLevelParams,
  ChartPatternParams,
  CustomRuleParams,
  TakeProfitParams,
  StopLossParams,
  TrailingStopParams,
  IndicatorSignalParams,
  TimeBasedParams,
} from '@/types';
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
  ChevronDown,
  Percent,
  Shield,
  Clock,
  Zap,
  Gauge,
  Search,
  Trash2,
  Settings2,
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
] as const;

// ─── Indicator definitions ──────────────────────────────────────────
interface IndicatorDef {
  id: IndicatorType;
  label: string;
  desc: string;
  icon: React.ReactNode;
}

const availableIndicators: IndicatorDef[] = [
  { id: 'rsi', label: 'RSI', desc: 'Relative Strength Index — overbought/oversold signals', icon: <Gauge className="w-4 h-4" /> },
  { id: 'macd', label: 'MACD', desc: 'Moving Average Convergence Divergence — trend momentum', icon: <Activity className="w-4 h-4" /> },
  { id: 'sma', label: 'SMA', desc: 'Simple Moving Average — trend direction', icon: <TrendingUp className="w-4 h-4" /> },
  { id: 'ema', label: 'EMA', desc: 'Exponential Moving Average — faster trend response', icon: <Zap className="w-4 h-4" /> },
  { id: 'bollinger', label: 'Bollinger Bands', desc: 'Volatility-based support & resistance', icon: <Layers className="w-4 h-4" /> },
  { id: 'volume', label: 'Volume', desc: 'Trade volume analysis for confirmation', icon: <BarChart3 className="w-4 h-4" /> },
];

// ─── Timeframe options ──────────────────────────────────────────────
const timeframeOptions: { id: Timeframe; label: string }[] = [
  { id: '1m', label: '1 min' },
  { id: '5m', label: '5 min' },
  { id: '15m', label: '15 min' },
  { id: '30m', label: '30 min' },
  { id: '1h', label: '1 hour' },
  { id: '4h', label: '4 hours' },
  { id: '1d', label: '1 day' },
  { id: '1w', label: '1 week' },
];

// ─── Entry rule presets ─────────────────────────────────────────────
const entryRulePresets: { type: EntryRule['type']; label: string; desc: string; icon: React.ReactNode }[] = [
  { type: 'indicator_cross', label: 'Indicator Cross', desc: 'RSI crossover, MACD signal line cross, MA crossovers', icon: <Activity className="w-3.5 h-3.5" /> },
  { type: 'price_level', label: 'Price Level', desc: 'Buy at support, break above resistance', icon: <TrendingUp className="w-3.5 h-3.5" /> },
  { type: 'pattern', label: 'Chart Pattern', desc: 'Double bottom, head & shoulders, flags, etc.', icon: <Layers className="w-3.5 h-3.5" /> },
  { type: 'custom', label: 'Custom Rule', desc: 'Define your own entry condition', icon: <Zap className="w-3.5 h-3.5" /> },
];

const exitRulePresets: { type: ExitRule['type']; label: string; desc: string; icon: React.ReactNode }[] = [
  { type: 'take_profit', label: 'Take Profit', desc: 'Fixed % or price target', icon: <TrendingUp className="w-3.5 h-3.5 text-emerald-400" /> },
  { type: 'stop_loss', label: 'Stop Loss', desc: 'Fixed % or price stop', icon: <Shield className="w-3.5 h-3.5 text-red-400" /> },
  { type: 'trailing_stop', label: 'Trailing Stop', desc: 'Dynamic stop that follows price', icon: <ArrowLeftRight className="w-3.5 h-3.5" /> },
  { type: 'indicator_signal', label: 'Indicator Signal', desc: 'Exit on RSI overbought, MACD bearish cross', icon: <Gauge className="w-3.5 h-3.5" /> },
  { type: 'time_based', label: 'Time Based', desc: 'Exit after X bars/hours/days', icon: <Clock className="w-3.5 h-3.5" /> },
  { type: 'custom', label: 'Custom Rule', desc: 'Define your own exit condition', icon: <Zap className="w-3.5 h-3.5" /> },
];

// ─── Risk presets ───────────────────────────────────────────────────
const riskPerTradeOptions = [0.5, 1, 2, 3, 5, 10];
const maxPositionsOptions = [1, 2, 3, 5, 10, 20];

// ─── Default params per rule type ────────────────────────────────────
function getDefaultEntryParams(type: EntryRule['type']): EntryRule['params'] {
  switch (type) {
    case 'indicator_cross':
      return { indicator: 'rsi', condition: 'crosses_above', threshold: 50, period: 14 } as IndicatorCrossParams;
    case 'price_level':
      return { level: 0, direction: 'breakout_above' } as PriceLevelParams;
    case 'pattern':
      return { patternName: 'double_bottom', confirmationBars: 2 } as ChartPatternParams;
    case 'custom':
      return { expression: '', note: '' } as CustomRuleParams;
  }
}

function getDefaultExitParams(type: ExitRule['type']): ExitRule['params'] {
  switch (type) {
    case 'take_profit':
      return { percent: 5 } as TakeProfitParams;
    case 'stop_loss':
      return { percent: 2 } as StopLossParams;
    case 'trailing_stop':
      return { percent: 3, activationPercent: 1.5 } as TrailingStopParams;
    case 'indicator_signal':
      return { indicator: 'rsi', condition: 'above', threshold: 70, period: 14 } as IndicatorSignalParams;
    case 'time_based':
      return { durationBars: 10 } as TimeBasedParams;
    case 'custom':
      return { expression: '', note: '' } as CustomRuleParams;
  }
}

// ─── Inline Rule Param Editors ───────────────────────────────────────
function EntryRuleParamsEditor({
  rule,
  onChange,
}: {
  rule: EntryRule;
  onChange: (params: EntryRule['params']) => void;
}) {
  const p = rule.params;
  const type = rule.type;

  if (type === 'indicator_cross') {
    const params = p as IndicatorCrossParams;
    return (
      <div className="grid grid-cols-2 gap-2 mt-2 pl-4 border-l-2 border-accent/20">
        <div>
          <label className="text-[10px] text-zinc-500">Indicator</label>
          <select
            value={params.indicator}
            onChange={(e) => onChange({ ...params, indicator: e.target.value as IndicatorType })}
            className="w-full bg-card border border-card-border rounded px-2 py-1 text-xs text-zinc-200 mt-0.5"
          >
            {availableIndicators.map((ind) => (
              <option key={ind.id} value={ind.id}>{ind.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[10px] text-zinc-500">Condition</label>
          <select
            value={params.condition}
            onChange={(e) => onChange({ ...params, condition: e.target.value as IndicatorCrossParams['condition'] })}
            className="w-full bg-card border border-card-border rounded px-2 py-1 text-xs text-zinc-200 mt-0.5"
          >
            <option value="crosses_above">Crosses Above</option>
            <option value="crosses_below">Crosses Below</option>
            <option value="above">Above</option>
            <option value="below">Below</option>
          </select>
        </div>
        <div>
          <label className="text-[10px] text-zinc-500">Threshold</label>
          <input
            type="number"
            value={params.threshold ?? ''}
            onChange={(e) => onChange({ ...params, threshold: e.target.value ? Number(e.target.value) : undefined })}
            placeholder="e.g. 30"
            className="w-full bg-card border border-card-border rounded px-2 py-1 text-xs text-zinc-200 mt-0.5"
          />
        </div>
        <div>
          <label className="text-[10px] text-zinc-500">Period</label>
          <input
            type="number"
            value={params.period ?? ''}
            onChange={(e) => onChange({ ...params, period: e.target.value ? Number(e.target.value) : undefined })}
            placeholder="e.g. 14"
            className="w-full bg-card border border-card-border rounded px-2 py-1 text-xs text-zinc-200 mt-0.5"
          />
        </div>
      </div>
    );
  }

  if (type === 'price_level') {
    const params = p as PriceLevelParams;
    return (
      <div className="grid grid-cols-2 gap-2 mt-2 pl-4 border-l-2 border-accent/20">
        <div>
          <label className="text-[10px] text-zinc-500">Direction</label>
          <select
            value={params.direction}
            onChange={(e) => onChange({ ...params, direction: e.target.value as PriceLevelParams['direction'] })}
            className="w-full bg-card border border-card-border rounded px-2 py-1 text-xs text-zinc-200 mt-0.5"
          >
            <option value="breakout_above">Breakout Above</option>
            <option value="breakout_below">Breakout Below</option>
            <option value="bounce_at">Bounce At</option>
          </select>
        </div>
        <div>
          <label className="text-[10px] text-zinc-500">Price Level</label>
          <input
            type="number"
            value={params.level || ''}
            onChange={(e) => onChange({ ...params, level: Number(e.target.value) })}
            placeholder="0 = auto detect"
            className="w-full bg-card border border-card-border rounded px-2 py-1 text-xs text-zinc-200 mt-0.5"
          />
        </div>
      </div>
    );
  }

  if (type === 'pattern') {
    const params = p as ChartPatternParams;
    return (
      <div className="grid grid-cols-2 gap-2 mt-2 pl-4 border-l-2 border-accent/20">
        <div>
          <label className="text-[10px] text-zinc-500">Pattern</label>
          <select
            value={params.patternName}
            onChange={(e) => onChange({ ...params, patternName: e.target.value as ChartPatternParams['patternName'] })}
            className="w-full bg-card border border-card-border rounded px-2 py-1 text-xs text-zinc-200 mt-0.5"
          >
            <option value="double_bottom">Double Bottom</option>
            <option value="double_top">Double Top</option>
            <option value="head_shoulders">Head & Shoulders</option>
            <option value="flag">Flag</option>
            <option value="triangle">Triangle</option>
            <option value="wedge">Wedge</option>
          </select>
        </div>
        <div>
          <label className="text-[10px] text-zinc-500">Confirm Bars</label>
          <input
            type="number"
            value={params.confirmationBars ?? ''}
            onChange={(e) => onChange({ ...params, confirmationBars: e.target.value ? Number(e.target.value) : undefined })}
            placeholder="e.g. 2"
            className="w-full bg-card border border-card-border rounded px-2 py-1 text-xs text-zinc-200 mt-0.5"
          />
        </div>
      </div>
    );
  }

  if (type === 'custom') {
    const params = p as CustomRuleParams;
    return (
      <div className="space-y-2 mt-2 pl-4 border-l-2 border-accent/20">
        <div>
          <label className="text-[10px] text-zinc-500">Condition Expression</label>
          <input
            type="text"
            value={params.expression}
            onChange={(e) => onChange({ ...params, expression: e.target.value })}
            placeholder="e.g. close > sma(50) AND rsi(14) < 30"
            className="w-full bg-card border border-card-border rounded px-2 py-1 text-xs text-zinc-200 mt-0.5"
          />
        </div>
        <div>
          <label className="text-[10px] text-zinc-500">Note (optional)</label>
          <input
            type="text"
            value={params.note ?? ''}
            onChange={(e) => onChange({ ...params, note: e.target.value })}
            placeholder="Describe what this does..."
            className="w-full bg-card border border-card-border rounded px-2 py-1 text-xs text-zinc-200 mt-0.5"
          />
        </div>
      </div>
    );
  }

  return null;
}

function ExitRuleParamsEditor({
  rule,
  onChange,
}: {
  rule: ExitRule;
  onChange: (params: ExitRule['params']) => void;
}) {
  const p = rule.params;
  const type = rule.type;

  if (type === 'take_profit') {
    const params = p as TakeProfitParams;
    return (
      <div className="grid grid-cols-2 gap-2 mt-2 pl-4 border-l-2 border-emerald-500/20">
        <div>
          <label className="text-[10px] text-zinc-500">Profit %</label>
          <div className="flex items-center gap-1 mt-0.5">
            <input
              type="number"
              value={params.percent}
              onChange={(e) => onChange({ ...params, percent: Number(e.target.value) })}
              className="w-full bg-card border border-card-border rounded px-2 py-1 text-xs text-emerald-400"
              step="0.5"
              min="0.5"
            />
            <span className="text-xs text-zinc-500">%</span>
          </div>
        </div>
        <div>
          <label className="text-[10px] text-zinc-500">Target Price (opt)</label>
          <input
            type="number"
            value={params.targetPrice ?? ''}
            onChange={(e) => onChange({ ...params, targetPrice: e.target.value ? Number(e.target.value) : undefined })}
            placeholder="Use % instead"
            className="w-full bg-card border border-card-border rounded px-2 py-1 text-xs text-zinc-200 mt-0.5"
          />
        </div>
      </div>
    );
  }

  if (type === 'stop_loss') {
    const params = p as StopLossParams;
    return (
      <div className="grid grid-cols-2 gap-2 mt-2 pl-4 border-l-2 border-red-500/20">
        <div>
          <label className="text-[10px] text-zinc-500">Stop Loss %</label>
          <div className="flex items-center gap-1 mt-0.5">
            <input
              type="number"
              value={params.percent}
              onChange={(e) => onChange({ ...params, percent: Number(e.target.value) })}
              className="w-full bg-card border border-card-border rounded px-2 py-1 text-xs text-red-400"
              step="0.5"
              min="0.5"
            />
            <span className="text-xs text-zinc-500">%</span>
          </div>
        </div>
        <div>
          <label className="text-[10px] text-zinc-500">Stop Price (opt)</label>
          <input
            type="number"
            value={params.stopPrice ?? ''}
            onChange={(e) => onChange({ ...params, stopPrice: e.target.value ? Number(e.target.value) : undefined })}
            placeholder="Use % instead"
            className="w-full bg-card border border-card-border rounded px-2 py-1 text-xs text-zinc-200 mt-0.5"
          />
        </div>
      </div>
    );
  }

  if (type === 'trailing_stop') {
    const params = p as TrailingStopParams;
    return (
      <div className="grid grid-cols-2 gap-2 mt-2 pl-4 border-l-2 border-amber-500/20">
        <div>
          <label className="text-[10px] text-zinc-500">Trail Distance %</label>
          <div className="flex items-center gap-1 mt-0.5">
            <input
              type="number"
              value={params.percent}
              onChange={(e) => onChange({ ...params, percent: Number(e.target.value) })}
              className="w-full bg-card border border-card-border rounded px-2 py-1 text-xs text-zinc-200"
              step="0.5"
              min="0.5"
            />
            <span className="text-xs text-zinc-500">%</span>
          </div>
        </div>
        <div>
          <label className="text-[10px] text-zinc-500">Activation % (opt)</label>
          <div className="flex items-center gap-1 mt-0.5">
            <input
              type="number"
              value={params.activationPercent ?? ''}
              onChange={(e) => onChange({ ...params, activationPercent: e.target.value ? Number(e.target.value) : undefined })}
              placeholder="e.g. 1.5"
              className="w-full bg-card border border-card-border rounded px-2 py-1 text-xs text-zinc-200"
              step="0.5"
              min="0"
            />
            <span className="text-xs text-zinc-500">%</span>
          </div>
        </div>
      </div>
    );
  }

  if (type === 'indicator_signal') {
    const params = p as IndicatorSignalParams;
    return (
      <div className="grid grid-cols-2 gap-2 mt-2 pl-4 border-l-2 border-accent/20">
        <div>
          <label className="text-[10px] text-zinc-500">Indicator</label>
          <select
            value={params.indicator}
            onChange={(e) => onChange({ ...params, indicator: e.target.value as IndicatorType })}
            className="w-full bg-card border border-card-border rounded px-2 py-1 text-xs text-zinc-200 mt-0.5"
          >
            {availableIndicators.map((ind) => (
              <option key={ind.id} value={ind.id}>{ind.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[10px] text-zinc-500">Condition</label>
          <select
            value={params.condition}
            onChange={(e) => onChange({ ...params, condition: e.target.value as IndicatorSignalParams['condition'] })}
            className="w-full bg-card border border-card-border rounded px-2 py-1 text-xs text-zinc-200 mt-0.5"
          >
            <option value="crosses_above">Crosses Above</option>
            <option value="crosses_below">Crosses Below</option>
            <option value="above">Above</option>
            <option value="below">Below</option>
          </select>
        </div>
        <div>
          <label className="text-[10px] text-zinc-500">Threshold</label>
          <input
            type="number"
            value={params.threshold ?? ''}
            onChange={(e) => onChange({ ...params, threshold: e.target.value ? Number(e.target.value) : undefined })}
            placeholder="e.g. 70"
            className="w-full bg-card border border-card-border rounded px-2 py-1 text-xs text-zinc-200 mt-0.5"
          />
        </div>
        <div>
          <label className="text-[10px] text-zinc-500">Period</label>
          <input
            type="number"
            value={params.period ?? ''}
            onChange={(e) => onChange({ ...params, period: e.target.value ? Number(e.target.value) : undefined })}
            placeholder="e.g. 14"
            className="w-full bg-card border border-card-border rounded px-2 py-1 text-xs text-zinc-200 mt-0.5"
          />
        </div>
      </div>
    );
  }

  if (type === 'time_based') {
    const params = p as TimeBasedParams;
    return (
      <div className="grid grid-cols-2 gap-2 mt-2 pl-4 border-l-2 border-blue-500/20">
        <div>
          <label className="text-[10px] text-zinc-500">Bars</label>
          <input
            type="number"
            value={params.durationBars ?? ''}
            onChange={(e) => onChange({ ...params, durationBars: e.target.value ? Number(e.target.value) : undefined })}
            placeholder="e.g. 10"
            className="w-full bg-card border border-card-border rounded px-2 py-1 text-xs text-zinc-200 mt-0.5"
          />
        </div>
        <div>
          <label className="text-[10px] text-zinc-500">Hours</label>
          <input
            type="number"
            value={params.durationHours ?? ''}
            onChange={(e) => onChange({ ...params, durationHours: e.target.value ? Number(e.target.value) : undefined })}
            placeholder="e.g. 4"
            className="w-full bg-card border border-card-border rounded px-2 py-1 text-xs text-zinc-200 mt-0.5"
          />
        </div>
        <div>
          <label className="text-[10px] text-zinc-500">Days</label>
          <input
            type="number"
            value={params.durationDays ?? ''}
            onChange={(e) => onChange({ ...params, durationDays: e.target.value ? Number(e.target.value) : undefined })}
            placeholder="e.g. 1"
            className="w-full bg-card border border-card-border rounded px-2 py-1 text-xs text-zinc-200 mt-0.5"
          />
        </div>
        <div className="flex items-end">
          <label className="flex items-center gap-1.5 text-[10px] text-zinc-400 cursor-pointer">
            <input
              type="checkbox"
              checked={params.exitAtEndOfSession ?? false}
              onChange={(e) => onChange({ ...params, exitAtEndOfSession: e.target.checked })}
              className="rounded"
            />
            Exit at session end
          </label>
        </div>
      </div>
    );
  }

  if (type === 'custom') {
    const params = p as CustomRuleParams;
    return (
      <div className="space-y-2 mt-2 pl-4 border-l-2 border-accent/20">
        <div>
          <label className="text-[10px] text-zinc-500">Condition Expression</label>
          <input
            type="text"
            value={params.expression}
            onChange={(e) => onChange({ ...params, expression: e.target.value })}
            placeholder="e.g. rsi(14) > 70 OR close < ema(20)"
            className="w-full bg-card border border-card-border rounded px-2 py-1 text-xs text-zinc-200 mt-0.5"
          />
        </div>
        <div>
          <label className="text-[10px] text-zinc-500">Note (optional)</label>
          <input
            type="text"
            value={params.note ?? ''}
            onChange={(e) => onChange({ ...params, note: e.target.value })}
            placeholder="Describe what this does..."
            className="w-full bg-card border border-card-border rounded px-2 py-1 text-xs text-zinc-200 mt-0.5"
          />
        </div>
      </div>
    );
  }

  return null;
}

// ─── Symbol suggestions ──────────────────────────────────────────────
const POPULAR_SYMBOLS = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'AMD', 'SPY', 'QQQ', 'IWM', 'DIA', 'JPM', 'V', 'NFLX', 'DIS'];

// ═══════════════════════════════════════════════════════════════════════
//  MAIN PAGE COMPONENT
// ═══════════════════════════════════════════════════════════════════════
export default function StrategiesPage() {
  const router = useRouter();
  const { strategies, isLoading, upsertStrategy, deleteStrategy, isSaving } = useStrategiesData();
  const [showModal, setShowModal] = useState(false);
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formType, setFormType] = useState<StrategyConfig['type']>('trend_following');
  const [formStatus, setFormStatus] = useState<'draft' | 'active'>('draft');

  // ─── Config fields ────────────────────────────────────────────
  const [formTimeframes, setFormTimeframes] = useState<Timeframe[]>(['1h', '4h', '1d']);
  const [formSymbols, setFormSymbols] = useState<string[]>([]);
  const [formSymbolInput, setFormSymbolInput] = useState('');
  const [formIndicators, setFormIndicators] = useState<IndicatorType[]>([]);
  const [formEntryRules, setFormEntryRules] = useState<EntryRule[]>([]);
  const [formExitRules, setFormExitRules] = useState<ExitRule[]>([]);
  const [formRiskPerTrade, setFormRiskPerTrade] = useState(1);
  const [formMaxPositions, setFormMaxPositions] = useState(5);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const resetForm = () => {
    setFormName('');
    setFormDesc('');
    setFormType('trend_following');
    setFormStatus('draft');
    setFormTimeframes(['1h', '4h', '1d']);
    setFormSymbols([]);
    setFormSymbolInput('');
    setFormIndicators([]);
    setFormEntryRules([]);
    setFormExitRules([]);
    setFormRiskPerTrade(1);
    setFormMaxPositions(5);
    setShowAdvanced(false);
  };

  const toggleTimeframe = (tf: Timeframe) => {
    setFormTimeframes((prev) =>
      prev.includes(tf) ? prev.filter((t) => t !== tf) : [...prev, tf],
    );
  };

  const toggleIndicator = (ind: IndicatorType) => {
    setFormIndicators((prev) =>
      prev.includes(ind) ? prev.filter((i) => i !== ind) : [...prev, ind],
    );
  };

  const addSymbol = useCallback((symbol: string) => {
    const clean = symbol.trim().toUpperCase();
    if (!clean) return;
    setFormSymbols((prev) => (prev.includes(clean) ? prev : [...prev, clean]));
    setFormSymbolInput('');
  }, []);

  const removeSymbol = (symbol: string) => {
    setFormSymbols((prev) => prev.filter((s) => s !== symbol));
  };

  const handleSymbolKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addSymbol(formSymbolInput);
    }
  };

  const toggleEntryRule = (type: EntryRule['type']) => {
    setFormEntryRules((prev) => {
      const exists = prev.find((r) => r.type === type);
      if (exists) return prev.filter((r) => r.type !== type);
      const preset = entryRulePresets.find((p) => p.type === type);
      const defaultParams = getDefaultEntryParams(type);
      return [...prev, { type, description: preset?.desc ?? '', params: defaultParams }];
    });
  };

  const updateEntryRuleParams = (index: number, params: EntryRule['params']) => {
    setFormEntryRules((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], params };
      return updated;
    });
  };

  const toggleExitRule = (type: ExitRule['type']) => {
    setFormExitRules((prev) => {
      const exists = prev.find((r) => r.type === type);
      if (exists) return prev.filter((r) => r.type !== type);
      const preset = exitRulePresets.find((p) => p.type === type);
      const defaultParams = getDefaultExitParams(type);
      return [...prev, { type, description: preset?.desc ?? '', params: defaultParams }];
    });
  };

  const updateExitRuleParams = (index: number, params: ExitRule['params']) => {
    setFormExitRules((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], params };
      return updated;
    });
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
        timeframes: formTimeframes,
        symbols: formSymbols,
        indicators: formIndicators,
        entryRules: formEntryRules,
        exitRules: formExitRules,
        riskPerTrade: formRiskPerTrade,
        maxPositions: formMaxPositions,
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

  // ─── Count selected config items for preview ───────────────
  const configSummary = [
    formTimeframes.length > 0 && `${formTimeframes.length} timeframe${formTimeframes.length > 1 ? 's' : ''}`,
    formSymbols.length > 0 && `${formSymbols.length} symbol${formSymbols.length > 1 ? 's' : ''}`,
    formIndicators.length > 0 && `${formIndicators.length} indicator${formIndicators.length > 1 ? 's' : ''}`,
    formEntryRules.length > 0 && `${formEntryRules.length} entry rule${formEntryRules.length > 1 ? 's' : ''}`,
    formExitRules.length > 0 && `${formExitRules.length} exit rule${formExitRules.length > 1 ? 's' : ''}`,
  ].filter(Boolean).join(' · ') || 'Default config';

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

      {/* ═══════════════════════════════════════════════════════════════
          NEW STRATEGY MODAL
          ═══════════════════════════════════════════════════════════ */}
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

            <div className="space-y-5">
              {/* ── Name ─────────────────────────────────────── */}
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

              {/* ── Description ──────────────────────────────── */}
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                  Description
                </label>
                <textarea
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  placeholder="Briefly describe what this strategy does..."
                  rows={2}
                  className="w-full bg-card border border-card-border rounded-lg px-3 py-2.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-accent/50 resize-none"
                />
              </div>

              {/* ── Strategy Type ────────────────────────────── */}
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

              {/* ═══════════════════════════════════════════════════
                  ADVANCED CONFIGURATION (collapsible)
                  ════════════════════════════════════════════════ */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="flex items-center gap-2 text-xs font-medium text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer w-full"
                >
                  <ChevronDown
                    className={`w-3.5 h-3.5 transition-transform ${showAdvanced ? 'rotate-0' : '-rotate-90'}`}
                  />
                  {showAdvanced ? 'Hide' : 'Show'} Advanced Configuration
                  {!showAdvanced && (
                    <span className="text-[10px] text-zinc-600 ml-1">— risk, indicators, entry/exit rules</span>
                  )}
                </button>

                {showAdvanced && (
                  <div className="mt-4 space-y-5 pl-1 border-l-2 border-card-border pl-3">

                    {/* ── Symbols ─────────────────────────────── */}
                    <div>
                      <label className="flex items-center gap-1.5 text-xs font-medium text-zinc-400 mb-2">
                        <Search className="w-3.5 h-3.5" />
                        Trading Symbols
                      </label>

                      {/* Selected symbol chips */}
                      {formSymbols.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-2">
                          {formSymbols.map((sym) => (
                            <span
                              key={sym}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-accent/10 text-accent border border-accent/20"
                            >
                              {sym}
                              <button
                                onClick={() => removeSymbol(sym)}
                                className="text-accent/60 hover:text-accent cursor-pointer"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Symbol input + add button */}
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={formSymbolInput}
                          onChange={(e) => setFormSymbolInput(e.target.value.toUpperCase())}
                          onKeyDown={handleSymbolKeyDown}
                          placeholder="e.g. AAPL, TSLA..."
                          className="flex-1 bg-card border border-card-border rounded-lg px-3 py-2 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-accent/50 uppercase"
                        />
                        <button
                          type="button"
                          onClick={() => addSymbol(formSymbolInput)}
                          className="px-3 py-2 rounded-lg bg-accent/10 text-accent text-xs font-medium border border-accent/20 hover:bg-accent/20 cursor-pointer transition-colors"
                        >
                          Add
                        </button>
                      </div>

                      {/* Quick suggestions */}
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {POPULAR_SYMBOLS.filter((s) => !formSymbols.includes(s)).slice(0, 8).map((sym) => (
                          <button
                            key={sym}
                            type="button"
                            onClick={() => addSymbol(sym)}
                            className="px-2 py-0.5 rounded text-[10px] text-zinc-500 border border-zinc-700 hover:text-zinc-300 hover:border-zinc-600 cursor-pointer transition-colors"
                          >
                            + {sym}
                          </button>
                        ))}
                      </div>

                      {formSymbols.length === 0 && (
                        <p className="text-[10px] text-zinc-500 mt-1">Add symbols this strategy will trade. If empty, trades all available.</p>
                      )}
                    </div>

                    {/* ── Timeframes ────────────────────────── */}
                    <div>
                      <label className="flex items-center gap-1.5 text-xs font-medium text-zinc-400 mb-2">
                        <Clock className="w-3.5 h-3.5" />
                        Timeframes
                      </label>
                      <div className="flex flex-wrap gap-1.5">
                        {timeframeOptions.map((tf) => (
                          <button
                            key={tf.id}
                            type="button"
                            onClick={() => toggleTimeframe(tf.id)}
                            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                              formTimeframes.includes(tf.id)
                                ? 'bg-accent/20 text-accent border border-accent/40'
                                : 'bg-card border border-card-border text-zinc-500 hover:text-zinc-300 hover:border-zinc-600'
                            }`}
                          >
                            {tf.label}
                          </button>
                        ))}
                      </div>
                      {formTimeframes.length === 0 && (
                        <p className="text-[10px] text-zinc-500 mt-1">Select at least one timeframe</p>
                      )}
                    </div>

                    {/* ── Indicators ────────────────────────── */}
                    <div>
                      <label className="flex items-center gap-1.5 text-xs font-medium text-zinc-400 mb-2">
                        <Gauge className="w-3.5 h-3.5" />
                        Technical Indicators
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        {availableIndicators.map((ind) => (
                          <button
                            key={ind.id}
                            type="button"
                            onClick={() => toggleIndicator(ind.id)}
                            className={`flex items-center gap-2 p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                              formIndicators.includes(ind.id)
                                ? 'border-accent/40 bg-accent/10'
                                : 'border-card-border bg-card hover:bg-card-hover'
                            }`}
                          >
                            <span className={`${formIndicators.includes(ind.id) ? 'text-accent' : 'text-zinc-500'}`}>
                              {ind.icon}
                            </span>
                            <div className="min-w-0">
                              <p className={`text-xs font-medium ${formIndicators.includes(ind.id) ? 'text-accent' : 'text-zinc-300'}`}>
                                {ind.label}
                              </p>
                              <p className="text-[10px] text-zinc-500 truncate">{ind.desc}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* ── Entry Rules ───────────────────────── */}
                    <div>
                      <label className="flex items-center gap-1.5 text-xs font-medium text-zinc-400 mb-2">
                        <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                        Entry Rules
                      </label>
                      <div className="space-y-1.5">
                        {entryRulePresets.map((rule) => {
                          const isSelected = formEntryRules.some((r) => r.type === rule.type);
                          const ruleIndex = formEntryRules.findIndex((r) => r.type === rule.type);
                          return (
                            <div key={rule.type}>
                              <button
                                type="button"
                                onClick={() => toggleEntryRule(rule.type)}
                                className={`flex items-center gap-2.5 w-full p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                                  isSelected
                                    ? 'border-accent/40 bg-accent/10'
                                    : 'border-card-border bg-card hover:bg-card-hover'
                                }`}
                              >
                                <span className={`${isSelected ? 'text-accent' : 'text-zinc-500'}`}>
                                  {rule.icon}
                                </span>
                                <div className="flex-1 min-w-0">
                                  <p className={`text-xs font-medium ${isSelected ? 'text-accent' : 'text-zinc-300'}`}>
                                    {rule.label}
                                  </p>
                                  <p className="text-[10px] text-zinc-500 truncate">{rule.desc}</p>
                                </div>
                                <div
                                  className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-all ${
                                    isSelected
                                      ? 'bg-accent border-accent'
                                      : 'border-zinc-600'
                                  }`}
                                >
                                  {isSelected && (
                                    <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                  )}
                                </div>
                              </button>
                              {/* Inline params editor */}
                              {isSelected && ruleIndex >= 0 && (
                                <EntryRuleParamsEditor
                                  rule={formEntryRules[ruleIndex]}
                                  onChange={(params) => updateEntryRuleParams(ruleIndex, params)}
                                />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* ── Exit Rules ────────────────────────── */}
                    <div>
                      <label className="flex items-center gap-1.5 text-xs font-medium text-zinc-400 mb-2">
                        <Shield className="w-3.5 h-3.5 text-red-400" />
                        Exit Rules
                      </label>
                      <div className="space-y-1.5">
                        {exitRulePresets.map((rule) => {
                          const isSelected = formExitRules.some((r) => r.type === rule.type);
                          const ruleIndex = formExitRules.findIndex((r) => r.type === rule.type);
                          return (
                            <div key={rule.type}>
                              <button
                                type="button"
                                onClick={() => toggleExitRule(rule.type)}
                                className={`flex items-center gap-2.5 w-full p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                                  isSelected
                                    ? 'border-accent/40 bg-accent/10'
                                    : 'border-card-border bg-card hover:bg-card-hover'
                                }`}
                              >
                                <span className={`${isSelected ? 'text-accent' : 'text-zinc-500'}`}>
                                  {rule.icon}
                                </span>
                                <div className="flex-1 min-w-0">
                                  <p className={`text-xs font-medium ${isSelected ? 'text-accent' : 'text-zinc-300'}`}>
                                    {rule.label}
                                  </p>
                                  <p className="text-[10px] text-zinc-500 truncate">{rule.desc}</p>
                                </div>
                                <div
                                  className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-all ${
                                    isSelected
                                      ? 'bg-accent border-accent'
                                      : 'border-zinc-600'
                                  }`}
                                >
                                  {isSelected && (
                                    <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                  )}
                                </div>
                              </button>
                              {/* Inline params editor */}
                              {isSelected && ruleIndex >= 0 && (
                                <ExitRuleParamsEditor
                                  rule={formExitRules[ruleIndex]}
                                  onChange={(params) => updateExitRuleParams(ruleIndex, params)}
                                />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* ── Risk Management ───────────────────── */}
                    <div>
                      <label className="flex items-center gap-1.5 text-xs font-medium text-zinc-400 mb-3">
                        <Percent className="w-3.5 h-3.5" />
                        Risk Management
                      </label>

                      {/* Risk per Trade */}
                      <div className="mb-4">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs text-zinc-400">Risk per Trade</span>
                          <span className="text-xs font-semibold text-accent">{formRiskPerTrade}%</span>
                        </div>
                        <div className="flex gap-1.5 flex-wrap">
                          {riskPerTradeOptions.map((val) => (
                            <button
                              key={val}
                              type="button"
                              onClick={() => setFormRiskPerTrade(val)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                                formRiskPerTrade === val
                                  ? 'bg-accent/20 text-accent border border-accent/40'
                                  : 'bg-card border border-card-border text-zinc-500 hover:text-zinc-300 hover:border-zinc-600'
                              }`}
                            >
                              {val}%
                            </button>
                          ))}
                        </div>
                        <p className="text-[10px] text-zinc-500 mt-1">
                          Percentage of portfolio at risk on any single trade
                        </p>
                      </div>

                      {/* Max Positions */}
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs text-zinc-400">Max Concurrent Positions</span>
                          <span className="text-xs font-semibold text-accent">{formMaxPositions}</span>
                        </div>
                        <div className="flex gap-1.5 flex-wrap">
                          {maxPositionsOptions.map((val) => (
                            <button
                              key={val}
                              type="button"
                              onClick={() => setFormMaxPositions(val)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                                formMaxPositions === val
                                  ? 'bg-accent/20 text-accent border border-accent/40'
                                  : 'bg-card border border-card-border text-zinc-500 hover:text-zinc-300 hover:border-zinc-600'
                              }`}
                            >
                              {val}
                            </button>
                          ))}
                        </div>
                        <p className="text-[10px] text-zinc-500 mt-1">
                          Maximum number of open positions at the same time
                        </p>
                      </div>
                    </div>

                  </div>
                )}
              </div>

              {/* ── Initial Status ──────────────────────────── */}
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

              {/* ── Preview Card ────────────────────────────── */}
              <div className="p-3 rounded-lg bg-card border border-card-border space-y-2">
                <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Preview</p>
                <div className="flex items-center gap-2">
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
                <div className="flex items-center gap-2 text-[10px] text-zinc-500 flex-wrap">
                  <span>Type: {strategyTypes.find((t) => t.id === formType)?.label}</span>
                  <span>·</span>
                  <span>Risk: {formRiskPerTrade}%/trade</span>
                  <span>·</span>
                  <span>Max {formMaxPositions} positions</span>
                </div>
                <div className="flex items-center gap-2 text-[10px] text-zinc-600">
                  <span>{configSummary}</span>
                </div>
              </div>

              {/* ── Actions ─────────────────────────────────── */}
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