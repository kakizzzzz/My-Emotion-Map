import { useEffect, type Dispatch, type SetStateAction } from 'react';
import { consumeShortcutHeartFragment } from '../../domain/starInbox';
import type { HealthPreferences, StarInboxItem } from '../../types';
import type { ToastHandler } from '../../app/appTypes';
import {
  loadShortcutEventIds,
  rememberShortcutEventId,
  stripShortcutFragment,
} from './shortcutHeartRateBridge';

export const useShortcutHeartRateIngress = ({
  items,
  setItems,
  preferences,
  onToast,
  messages,
}: {
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
    const consume = () => {
      const rawHash = stripShortcutFragment();
      if (!rawHash) return;
      const knownEventIds = loadShortcutEventIds();
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
        rememberShortcutEventId(result.sourceEventId);
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
  }, [items, messages, onToast, preferences, setItems]);
};
