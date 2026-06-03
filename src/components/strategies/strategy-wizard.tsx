'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { strategyTemplates, type StrategyTemplate } from '@/lib/strategy-templates';
import { X, Sparkles, Zap, TrendingUp, Target, BarChart3, ArrowLeftRight, CandlestickChart, Layers } from 'lucide-react';

interface StrategyWizardProps {
  open: boolean;
  onClose: () => void;
  onSelect: (template: StrategyTemplate, customName: string, customDesc: string) => void;
}

const difficultyColors: Record<string, string> = {
  beginner: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  intermediate: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  advanced: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
};

const difficultyIcons: Record<string, React.ReactNode> = {
  beginner: <Zap className="w-3 h-3 text-emerald-400" />,
  intermediate: <Target className="w-3 h-3 text-amber-400" />,
  advanced: <BarChart3 className="w-3 h-3 text-rose-400" />,
};

const categoryIcons: Record<string, React.ReactNode> = {
  'Trend Following': <TrendingUp className="w-4 h-4" />,
  'Mean Reversion': <ArrowLeftRight className="w-4 h-4" />,
  'Breakout': <CandlestickChart className="w-4 h-4" />,
  'Scalping': <Layers className="w-4 h-4" />,
};

export function StrategyWizard({ open, onClose, onSelect }: StrategyWizardProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [customName, setCustomName] = useState('');
  const [customDesc, setCustomDesc] = useState('');
  const [filterCategory, setFilterCategory] = useState<string | null>(null);
  const [filterDifficulty, setFilterDifficulty] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const categories = [...new Set(strategyTemplates.map((t) => t.category))];
  const difficulties = [...new Set(strategyTemplates.map((t) => t.difficulty))];

  const filtered = strategyTemplates.filter((t) => {
    if (filterCategory && t.category !== filterCategory) return false;
    if (filterDifficulty && t.difficulty !== filterDifficulty) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        t.name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.tags.some((tag) => tag.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const selected = strategyTemplates.find((t) => t.id === selectedId) ?? null;

  const handleClose = () => {
    setSelectedId(null);
    setCustomName('');
    setCustomDesc('');
    setFilterCategory(null);
    setFilterDifficulty(null);
    setSearchQuery('');
    onClose();
  };

  const handleSelectTemplate = (template: StrategyTemplate) => {
    setSelectedId(template.id);
    setCustomName(template.name);
    setCustomDesc(template.description);
  };

  const handleBack = () => {
    setSelectedId(null);
    setCustomName('');
    setCustomDesc('');
  };

  const handleCreate = () => {
    if (!selected) return;
    onSelect(selected, customName.trim() || selected.name, customDesc.trim() || selected.description);
    handleClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center animate-fade-in">
      <div className="glass-card w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* ── Header ───────────────────────────────────────── */}
        <div className="flex items-center justify-between p-5 border-b border-card-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-1.5 rounded-md bg-accent/10">
              <Sparkles className="w-5 h-5 text-accent" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">
                {selectedId ? 'Customize Template' : 'Strategy Templates'}
              </h2>
              <p className="text-xs text-zinc-500">
                {selectedId ? 'Name your strategy and create it' : 'Pick a pre-built template to get started quickly'}
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="text-zinc-500 hover:text-zinc-300 cursor-pointer p-1 rounded hover:bg-card-hover transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ── Body ─────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* STEP 1: Browse templates */}
          {!selectedId && (
            <>
              {/* Filters */}
              <div className="space-y-3">
                {/* Search */}
                <div className="relative">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search templates..."
                    className="w-full bg-card border border-card-border rounded-lg pl-9 pr-3 py-2.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-accent/50"
                  />
                  <Sparkles className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                </div>

                {/* Category chips */}
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() => setFilterCategory(null)}
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-all cursor-pointer ${
                      !filterCategory
                        ? 'bg-accent/10 text-accent border-accent/30'
                        : 'bg-card border-card-border text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    All
                  </button>
                  {categories.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setFilterCategory(filterCategory === cat ? null : cat)}
                      className={`px-3 py-1 rounded-full text-xs font-medium border transition-all cursor-pointer flex items-center gap-1.5 ${
                        filterCategory === cat
                          ? 'bg-accent/10 text-accent border-accent/30'
                          : 'bg-card border-card-border text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      {categoryIcons[cat]}
                      {cat}
                    </button>
                  ))}
                </div>

                {/* Difficulty chips */}
                <div className="flex items-center gap-2 flex-wrap">
                  {difficulties.map((diff) => (
                    <button
                      key={diff}
                      onClick={() => setFilterDifficulty(filterDifficulty === diff ? null : diff)}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-all cursor-pointer flex items-center gap-1.5 ${
                        filterDifficulty === diff
                          ? difficultyColors[diff]
                          : 'bg-card border-card-border text-zinc-500 hover:text-zinc-300'
                      }`}
                    >
                      {difficultyIcons[diff]}
                      {diff.charAt(0).toUpperCase() + diff.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Template cards */}
              <div className="grid grid-cols-1 gap-3">
                {filtered.map((template) => (
                  <button
                    key={template.id}
                    onClick={() => handleSelectTemplate(template)}
                    className={`flex items-start gap-4 p-4 rounded-lg border text-left transition-all cursor-pointer hover:scale-[1.01] ${
                      selectedId === template.id
                        ? 'border-accent/50 bg-accent/5'
                        : 'border-card-border bg-card hover:bg-card-hover hover:border-accent/20'
                    }`}
                  >
                    {/* Icon */}
                    <div className="text-2xl shrink-0 w-10 h-10 flex items-center justify-center rounded-lg bg-card-hover border border-card-border">
                      {template.icon}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-sm font-semibold text-zinc-200">{template.name}</h3>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-medium border ${difficultyColors[template.difficulty]}`}>
                          {template.difficulty}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-500 line-clamp-2 mb-2">{template.description}</p>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="px-2 py-0.5 rounded bg-zinc-800/50 text-[10px] text-zinc-500">
                          {template.category}
                        </span>
                        {template.tags.slice(0, 3).map((tag) => (
                          <span key={tag} className="px-2 py-0.5 rounded bg-zinc-800/50 text-[10px] text-zinc-600">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Quick stats */}
                    <div className="text-right shrink-0 space-y-1">
                      <div className="text-[10px] text-zinc-600">
                        Risk: {template.config.riskPerTrade}%
                      </div>
                      <div className="text-[10px] text-zinc-600">
                        Max: {template.config.maxPositions} pos
                      </div>
                      <div className="text-[10px] text-zinc-600">
                        {template.config.timeframes.join(', ')}
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              {filtered.length === 0 && (
                <div className="py-10 text-center">
                  <Sparkles className="w-8 h-8 text-zinc-600 mx-auto mb-3" />
                  <p className="text-sm text-zinc-500">No templates match your filters</p>
                  <button
                    onClick={() => {
                      setFilterCategory(null);
                      setFilterDifficulty(null);
                      setSearchQuery('');
                    }}
                    className="text-xs text-accent hover:underline mt-1 cursor-pointer"
                  >
                    Clear all filters
                  </button>
                </div>
              )}
            </>
          )}

          {/* STEP 2: Customize & confirm */}
          {selectedId && selected && (
            <div className="space-y-5">
              {/* Back button */}
              <button
                onClick={handleBack}
                className="flex items-center gap-1 text-sm text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
              >
                ← Back to templates
              </button>

              {/* Preview card */}
              <div className="flex items-start gap-4 p-4 rounded-lg border border-accent/20 bg-accent/5">
                <div className="text-3xl shrink-0 w-12 h-12 flex items-center justify-center rounded-lg bg-card-hover border border-card-border">
                  {selected.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-bold text-zinc-200 mb-1">{selected.name}</h3>
                  <p className="text-xs text-zinc-500 mb-3">{selected.description}</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-medium border ${difficultyColors[selected.difficulty]}`}>
                      {selected.difficulty}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-zinc-800/50 text-[10px] text-zinc-500">
                      {selected.category}
                    </span>
                    {selected.tags.map((tag) => (
                      <span key={tag} className="px-2 py-0.5 rounded bg-zinc-800/50 text-[10px] text-zinc-600">
                        {tag}
                      </span>
                    ))}
                  </div>

                  {/* Quick config summary */}
                  <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div className="bg-zinc-900/50 rounded-lg px-3 py-2">
                      <div className="text-[10px] text-zinc-500">Entry Rules</div>
                      <div className="text-sm font-medium text-zinc-200">{selected.config.entryRules.length}</div>
                    </div>
                    <div className="bg-zinc-900/50 rounded-lg px-3 py-2">
                      <div className="text-[10px] text-zinc-500">Exit Rules</div>
                      <div className="text-sm font-medium text-zinc-200">{selected.config.exitRules.length}</div>
                    </div>
                    <div className="bg-zinc-900/50 rounded-lg px-3 py-2">
                      <div className="text-[10px] text-zinc-500">Risk/Trade</div>
                      <div className="text-sm font-medium text-zinc-200">{selected.config.riskPerTrade}%</div>
                    </div>
                    <div className="bg-zinc-900/50 rounded-lg px-3 py-2">
                      <div className="text-[10px] text-zinc-500">Timeframes</div>
                      <div className="text-sm font-medium text-zinc-200">{selected.config.timeframes.join(', ')}</div>
                    </div>
                  </div>

                  {/* Indicators & Symbols */}
                  <div className="mt-2 flex items-center gap-3 text-[10px] text-zinc-600">
                    <span>Symbols: {selected.config.symbols.join(', ') || 'SPY'}</span>
                    <span>·</span>
                    <span>Indicators: {selected.config.indicators.join(', ')}</span>
                  </div>
                </div>
              </div>

              {/* Custom name */}
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                  Strategy Name
                </label>
                <input
                  type="text"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder={selected.name}
                  className="w-full bg-card border border-card-border rounded-lg px-3 py-2.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-accent/50"
                  autoFocus
                />
              </div>

              {/* Custom description */}
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                  Description
                </label>
                <textarea
                  value={customDesc}
                  onChange={(e) => setCustomDesc(e.target.value)}
                  placeholder={selected.description}
                  rows={3}
                  className="w-full bg-card border border-card-border rounded-lg px-3 py-2.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-accent/50 resize-none"
                />
              </div>
            </div>
          )}
        </div>

        {/* ── Footer ────────────────────────────────────────── */}
        <div className="flex items-center justify-between p-5 border-t border-card-border shrink-0">
          <div className="text-xs text-zinc-600">
            {selectedId ? 'Customize and create your strategy' : `${filtered.length} template${filtered.length !== 1 ? 's' : ''} available`}
          </div>
          <div className="flex gap-3">
            <Button variant="secondary" onClick={handleClose}>
              Cancel
            </Button>
            {selectedId && selected && (
              <Button onClick={handleCreate}>
                <Sparkles className="w-4 h-4" />
                Create from Template
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}