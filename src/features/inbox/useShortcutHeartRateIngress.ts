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
import {
  ackShortcutObservationRows,
  fetchShortcutObservationPages,
  mergeShortcutObservationItems,
  parseShortcutObservationRow,
} from './shortcutDelivery';
import { SHORTCUT_REFRESH_EVENT } from '../../domain/shortcutConnection';

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
      const rows = await fetchShortcutObservationPages(client);
      if (cancelled || !rows) return;
      const parsed = rows.flatMap((row) => {
        const item = parseShortcutObservationRow(row);
        return item ? [item] : [];
      });
      if (parsed.length) {
        setItems((current) => mergeShortcutObservationItems(current, parsed));
      }
      await ackShortcutObservationRows(client, rows);
    };
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    void refresh();
    window.addEventListener('focus', refreshWhenVisible);
    window.addEventListener(SHORTCUT_REFRESH_EVENT, refreshWhenVisible);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', refreshWhenVisible);
      window.removeEventListener(SHORTCUT_REFRESH_EVENT, refreshWhenVisible);
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
