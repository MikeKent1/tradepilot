'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

const shortcutsList = [
  { keys: ['Ctrl', 'D'], description: 'Go to Dashboard' },
  { keys: ['Ctrl', 'P'], description: 'Go to Portfolio' },
  { keys: ['Ctrl', 'M'], description: 'Go to Market' },
  { keys: ['Ctrl', 'T'], description: 'Go to Trades' },
  { keys: ['Ctrl', 'S'], description: 'Go to Strategies' },
  { keys: ['Ctrl', 'A'], description: 'Go to Analytics' },
  { keys: ['Ctrl', 'K'], description: 'Focus search bar' },
  { keys: ['?'], description: 'Show this dialog' },
];

export function KeyboardShortcutsModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = () => setOpen((prev) => !prev);
    window.addEventListener('toggle-shortcuts-modal', handler);
    // also ESC to close
    const escHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) setOpen(false);
    };
    window.addEventListener('keydown', escHandler);
    return () => {
      window.removeEventListener('toggle-shortcuts-modal', handler);
      window.removeEventListener('keydown', escHandler);
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={() => setOpen(false)}
    >
      <div
        className="bg-card border border-card-border rounded-xl w-full max-w-md mx-4 p-6 animate-fade-in shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground">Keyboard Shortcuts</h2>
          <button
            onClick={() => setOpen(false)}
            className="text-muted hover:text-foreground transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="space-y-2">
          {shortcutsList.map((item) => (
            <div
              key={item.description}
              className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-sidebar-hover transition-colors"
            >
              <span className="text-sm text-muted-foreground">{item.description}</span>
              <div className="flex items-center gap-1">
                {item.keys.map((key) => (
                  <kbd
                    key={key}
                    className="px-2 py-0.5 text-xs font-medium bg-sidebar border border-card-border rounded-md text-muted-foreground"
                  >
                    {key}
                  </kbd>
                ))}
              </div>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-muted text-center mt-4">
          Press <kbd className="px-1.5 py-0.5 text-[10px] bg-sidebar border border-card-border rounded text-muted-foreground">?</kbd> to toggle this dialog
        </p>
      </div>
    </div>
  );
}