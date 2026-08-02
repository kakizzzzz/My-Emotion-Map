import { useEffect, type Dispatch, type SetStateAction } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { consumeShortcutHeartFragment } from '../../domain/starInbox';
import type { HealthPreferences, StarInboxItem } from '../../types';
import type { ToastHandler } from '../../app/appTypes';
import {
  loadShortcutEventIds,
  rememberShortcutEventId,
  stripShortcutFragment,
} from './shortcutHeartRateBridge';

export const useShortcutHeartRateIngress = ({
  userId,
  client,
  items,
  setItems,
  preferences,
  onToast,
  messages,
}: {
  userId: string | null;
  client: SupabaseClient | null;
  items: StarInboxItem[];
  setItems: Dispatch<SetStateAction<StarInboxItem[]>>;
  preferences: HealthPreferences;
  onToast: ToastHandler;
  messages: {
    invalid: string;
    withinRange: string;
    received: string;
  };
}) => {
  useEffect(() => {
    if (!client || !userId) return;
    let cancelled = false;
    const refresh = async () => {
      const { data, error } = await client
        .from('shortcut_observations')
        .select('id,event_id,sampled_at,context,samples,median_bpm,is_test,low_signal,decision_reason,threshold_snapshot,algorithm_version,signal_level,created_at')
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(20);
      if (cancelled || error || !Array.isArray(data)) return;
      setItems((current) => {
        const known = new Set(current.map((item) => item.sourceEventId));
        const additions: StarInboxItem[] = data.flatMap((row) => {
          if (!row || typeof row.event_id !== 'string' || known.has(row.event_id) ||
            typeof row.sampled_at !== 'string' || typeof row.median_bpm !== 'number') return [];
          known.add(row.event_id);
          const samples = Array.isArray(row.samples)
            ? row.samples.flatMap((sample): Array<{ bpm: number; at: string }> => {
                if (!sample || typeof sample !== 'object') return [];
                const value = sample as { bpm?: unknown; at?: unknown };
                return typeof value.bpm === 'number' && typeof value.at === 'string'
                  ? [{ bpm: Math.round(value.bpm), at: value.at }]
                  : [];
              })
            : [];
          return [{
            id: `shortcut:${String(row.id)}`,
            source: 'heart-rate',
            sourceEventId: row.event_id,
            eventAt: row.sampled_at,
            receivedAt: typeof row.created_at === 'string'
              ? row.created_at
              : new Date().toISOString(),
            heartRate: Math.round(row.median_bpm),
            verification: row.is_test === true ? 'test' : 'verified',
            context: row.context === 'resting' || row.context === 'workout'
              ? row.context
              : 'unknown',
            samples,
            lowSignalConfidence: row.low_signal === true,
            decisionReason:
              row.decision_reason === 'outside_resting_range' ||
              row.decision_reason === 'low_signal_review' ||
              row.decision_reason === 'non_resting_review' ||
              row.decision_reason === 'test_event'
                ? row.decision_reason
                : 'legacy_review',
            thresholdSnapshot: (() => {
              const value = row.threshold_snapshot;
              if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
              const snapshot = value as { restingMin?: unknown; restingMax?: unknown };
              return typeof snapshot.restingMin === 'number' &&
                typeof snapshot.restingMax === 'number'
                ? { restingMin: snapshot.restingMin, restingMax: snapshot.restingMax }
                : undefined;
            })(),
            algorithmVersion: typeof row.algorithm_version === 'string'
              ? row.algorithm_version.slice(0, 100)
              : 'legacy',
            signalLevel: row.signal_level === 'standard' ? 'standard' : 'low',
            status: 'pending',
          }];
        });
        return additions.length ? [...current, ...additions] : current;
      });
    };
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    void refresh();
    window.addEventListener('focus', refreshWhenVisible);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', refreshWhenVisible);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [client, setItems, userId]);

  useEffect(() => {
    const consume = () => {
      if (!userId) return;
      const rawHash = stripShortcutFragment();
      if (!rawHash) return;
      const knownEventIds = loadShortcutEventIds(userId);
      items.forEach((item) => knownEventIds.add(item.sourceEventId));
      const result = consumeShortcutHeartFragment({
        hash: rawHash,
        preferences,
        knownEventIds,
      });
      if (result.kind === 'invalid') {
        onToast(messages.invalid);
        return;
      }
      if (
        result.kind === 'duplicate' ||
        result.kind === 'within-range' ||
        result.kind === 'pending'
      ) {
        if (result.kind !== 'pending') {
          rememberShortcutEventId(userId, result.sourceEventId);
        }
      }
      if (result.kind === 'within-range') onToast(messages.withinRange);
      if (result.kind === 'pending') {
        setItems((current) =>
          current.some((item) => item.sourceEventId === result.sourceEventId)
            ? current
            : [...current, result.item],
        );
        onToast(messages.received);
      }
    };
    consume();
    window.addEventListener('hashchange', consume);
    return () => window.removeEventListener('hashchange', consume);
  }, [items, messages, onToast, preferences, setItems, userId]);
};
