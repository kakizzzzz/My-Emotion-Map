import { useEffect, type Dispatch, type SetStateAction } from 'react';
import type { FollowUpRecord } from '../types';
import { promoteNextDueFollowUp } from '../domain/followUps';

const MAX_TIMEOUT_MS = 2_147_000_000;

export function useFollowUpScheduler(
  followUps: FollowUpRecord[],
  setFollowUps: Dispatch<SetStateAction<FollowUpRecord[]>>,
) {
  useEffect(() => {
    if (followUps.some((record) => record.status === 'active')) return;
    const nextQueued = followUps
      .filter((record) => record.status === 'queued')
      .sort(
        (left, right) =>
          new Date(left.dueAt).getTime() - new Date(right.dueAt).getTime(),
      )[0];
    if (!nextQueued) return;

    const dueTime = new Date(nextQueued.dueAt).getTime();
    const delay = Number.isFinite(dueTime)
      ? Math.min(MAX_TIMEOUT_MS, Math.max(0, dueTime - Date.now()))
      : 0;
    const timer = window.setTimeout(() => {
      setFollowUps((current) => {
        const promoted = promoteNextDueFollowUp(current);
        return promoted.every((record, index) => record === current[index])
          ? current
          : promoted;
      });
    }, delay);
    return () => window.clearTimeout(timer);
  }, [followUps, setFollowUps]);
}
