import {
  useCallback,
  useEffect,
  useReducer,
  type Dispatch,
  type SetStateAction,
} from 'react';
import type { FollowUpRecord } from '../types';
import { promoteNextDueFollowUp } from '../domain/followUps';

const MAX_TIMEOUT_MS = 2_147_000_000;

const hasSameRecords = (
  left: FollowUpRecord[],
  right: FollowUpRecord[],
) => left.length === right.length &&
  left.every((record, index) => record === right[index]);

export function useFollowUpScheduler(
  followUps: FollowUpRecord[],
  setFollowUps: Dispatch<SetStateAction<FollowUpRecord[]>>,
) {
  const [scheduleVersion, reschedule] = useReducer(
    (value: number) => value + 1,
    0,
  );
  const reconcile = useCallback(() => {
    setFollowUps((current) => {
      const promoted = promoteNextDueFollowUp(current);
      return hasSameRecords(current, promoted) ? current : promoted;
    });
  }, [setFollowUps]);

  useEffect(() => {
    reconcile();
    const normalized = promoteNextDueFollowUp(followUps);
    if (normalized.some((record) => record.status === 'active')) return;

    const nextQueued = normalized
      .filter((record) => record.status === 'queued')
      .sort(
        (left, right) =>
          new Date(left.dueAt).getTime() - new Date(right.dueAt).getTime(),
      )[0];
    if (!nextQueued) return;

    const dueTime = new Date(nextQueued.dueAt).getTime();
    if (!Number.isFinite(dueTime)) return;
    const delay = Math.min(
      MAX_TIMEOUT_MS,
      Math.max(0, dueTime - Date.now()),
    );
    const timer = window.setTimeout(() => {
      reconcile();
      // Browser timers cap near 24.85 days. Always schedule the next
      // chunk so long follow-ups and clock rollbacks cannot strand a task.
      reschedule();
    }, delay);
    return () => window.clearTimeout(timer);
  }, [followUps, reconcile, scheduleVersion]);

  useEffect(() => {
    const recheck = () => {
      if (document.visibilityState === 'hidden') return;
      reconcile();
      reschedule();
    };
    window.addEventListener('focus', recheck);
    window.addEventListener('pageshow', recheck);
    document.addEventListener('visibilitychange', recheck);
    return () => {
      window.removeEventListener('focus', recheck);
      window.removeEventListener('pageshow', recheck);
      document.removeEventListener('visibilitychange', recheck);
    };
  }, [reconcile]);
}
