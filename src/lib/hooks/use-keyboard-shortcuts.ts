'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface Shortcut {
  key: string;
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  handler: () => void;
  description: string;
}

const useKeyboardShortcuts = (shortcuts: Shortcut[]) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // ignore when typing in input/textarea
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      for (const s of shortcuts) {
        const ctrlOk = s.ctrl ? (e.ctrlKey || e.metaKey) : !e.ctrlKey && !e.metaKey;
        const altOk = s.alt ? e.altKey : !e.altKey;
        const shiftOk = s.shift ? e.shiftKey : !e.shiftKey;

        if (e.key.toLowerCase() === s.key.toLowerCase() && ctrlOk && altOk && shiftOk) {
          e.preventDefault();
          s.handler();
          return;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [shortcuts]);
};

export function useGlobalShortcuts() {
  const router = useRouter();

  useKeyboardShortcuts([
    { key: 'd', ctrl: true, handler: () => router.push('/'), description: 'Go to Dashboard' },
    { key: 'p', ctrl: true, handler: () => router.push('/portfolio'), description: 'Go to Portfolio' },
    { key: 'm', ctrl: true, handler: () => router.push('/market'), description: 'Go to Market' },
    { key: 't', ctrl: true, handler: () => router.push('/trades'), description: 'Go to Trades' },
    { key: 's', ctrl: true, handler: () => router.push('/strategies'), description: 'Go to Strategies' },
    { key: 'a', ctrl: true, handler: () => router.push('/analytics'), description: 'Go to Analytics' },
    { key: 'k', ctrl: true, handler: () => {
      // focus search
      const input = document.querySelector<HTMLInputElement>('[placeholder="Search assets..."]');
      input?.focus();
    }, description: 'Quick search'},
    { key: '?', handler: () => {
      // toggle shortcuts modal — dispatched as custom event
      window.dispatchEvent(new CustomEvent('toggle-shortcuts-modal'));
    }, description: 'Show keyboard shortcuts'},
  ]);
}