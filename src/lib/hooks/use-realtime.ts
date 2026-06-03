import { useEffect, useRef, useId } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/client';

type RealtimeTable = 'portfolios' | 'positions' | 'trades' | 'watchlists' | 'strategies' | 'notifications' | 'transactions';

interface UseRealtimeOptions {
  /** Table to subscribe to */
  table: RealtimeTable;
  /** Supabase filter string (e.g. 'portfolio_id=eq.xxx'). Do NOT pass undefined — omit the prop or set enabled=false instead. */
  filter?: string;
  /** React Query key(s) to invalidate on change */
  queryKeys?: string[][];
  /** Only subscribe if this is true (e.g. when we have a user id) */
  enabled?: boolean;
  /** Custom callback before invalidation */
  onInsert?: (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => void;
  onUpdate?: (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => void;
  onDelete?: (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => void;
}

/**
 * Generic Supabase Realtime subscription hook.
 * Automatically invalidates React Query caches when data changes.
 */
export function useRealtime({
  table,
  filter,
  queryKeys = [],
  enabled = true,
  onInsert,
  onUpdate,
  onDelete,
}: UseRealtimeOptions) {
  const queryClient = useQueryClient();
  const channelRef = useRef<RealtimeChannel | null>(null);

  // Generate a unique, stable ID for this hook instance.
  // Ensures unique channel names across Strict Mode double-mounts.
  const hookId = useId();
  const uniqueSuffix = hookId.replace(/:/g, '_');

  useEffect(() => {
    if (!enabled) return;

    const channelName = `realtime:${table}${filter ? `:${filter}` : ''}:${uniqueSuffix}`;

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes' as never,
        {
          event: '*',
          schema: 'public',
          table,
          ...(filter ? { filter } : {}),
        },
        (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
          // Call custom callbacks
          if (payload.eventType === 'INSERT') onInsert?.(payload);
          if (payload.eventType === 'UPDATE') onUpdate?.(payload);
          if (payload.eventType === 'DELETE') onDelete?.(payload);

          // Invalidate React Query caches to trigger refetch
          if (queryKeys.length > 0) {
            for (const key of queryKeys) {
              queryClient.invalidateQueries({ queryKey: key });
            }
          }
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log(`[Realtime] Subscribed to ${table}${filter ? ` (${filter})` : ''}`);
        }
      });

    channelRef.current = channel;

    return () => {
      console.log(`[Realtime] Unsubscribing from ${table}`);
      supabase.removeChannel(channel);
    };
  }, [table, filter, enabled, queryClient, onInsert, onUpdate, onDelete]);

  return channelRef;
}

export type { RealtimeTable };