import type { StarInboxItem } from '../../types';

export const SHORTCUT_DELIVERY_PAGE_SIZE = 20;
const MAX_PAGES_PER_REFRESH = 50;

type ShortcutRpcClient = {
  rpc: (
    name: string,
    parameters: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: unknown }>;
};

export type ShortcutObservationRow = {
  id?: unknown;
  event_id?: unknown;
  sampled_at?: unknown;
  context?: unknown;
  samples?: unknown;
  median_bpm?: unknown;
  is_test?: unknown;
  low_signal?: unknown;
  decision_reason?: unknown;
  threshold_snapshot?: unknown;
  algorithm_version?: unknown;
  signal_level?: unknown;
  repeat_count?: unknown;
  created_at?: unknown;
  status?: unknown;
};

export const fetchShortcutObservationPages = async (
  client: ShortcutRpcClient,
): Promise<ShortcutObservationRow[] | null> => {
  const rows: ShortcutObservationRow[] = [];
  let afterCreatedAt: string | null = null;
  let afterId: string | null = null;
  for (let page = 0; page < MAX_PAGES_PER_REFRESH; page += 1) {
    const { data, error } = await client.rpc(
      'list_shortcut_observations_page',
      {
        p_after_created_at: afterCreatedAt,
        p_after_id: afterId,
        p_limit: SHORTCUT_DELIVERY_PAGE_SIZE,
      },
    );
    if (error || !Array.isArray(data)) return null;
    rows.push(...data as ShortcutObservationRow[]);
    if (data.length < SHORTCUT_DELIVERY_PAGE_SIZE) return rows;
    const last = data.at(-1) as ShortcutObservationRow;
    if (typeof last.created_at !== 'string' || typeof last.id !== 'string') {
      return null;
    }
    afterCreatedAt = last.created_at;
    afterId = last.id;
  }
  return rows;
};

export const ackShortcutObservationRows = async (
  client: ShortcutRpcClient,
  rows: ShortcutObservationRow[],
) => {
  const pendingIds = rows.flatMap((row) =>
    row.status === 'pending' && typeof row.id === 'string' ? [row.id] : [],
  );
  if (!pendingIds.length) return true;
  const { error } = await client.rpc('ack_shortcut_observations', {
    p_ids: pendingIds,
  });
  return !error;
};

const DECISION_REASONS = new Set<NonNullable<StarInboxItem['decisionReason']>>([
  'outside_range',
  'outside_range_single_sample',
  'post_workout_review',
  'unknown_strict_review',
  'pending_test',
  'outside_resting_range',
  'low_signal_review',
  'non_resting_review',
  'test_event',
  'legacy_review',
]);

const parseThreshold = (value: unknown): StarInboxItem['thresholdSnapshot'] => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const snapshot = value as Record<string, unknown>;
  const restingMin = Number(snapshot.restingMin);
  const restingMax = Number(snapshot.restingMax);
  if (
    !Number.isFinite(restingMin) || !Number.isFinite(restingMax) ||
    restingMin < 35 || restingMax > 220 || restingMin >= restingMax
  ) return undefined;
  return {
    restingMin: Math.round(restingMin),
    restingMax: Math.round(restingMax),
    singleSampleEnabled: snapshot.singleSampleEnabled === true,
    workoutPolicy: snapshot.workoutPolicy === 'post_workout_review'
      ? 'post_workout_review'
      : 'suppress',
    unknownPolicy: snapshot.unknownPolicy === 'strict_review'
      ? 'strict_review'
      : 'suppress',
    cooldownMinutes:
      Number.isInteger(snapshot.cooldownMinutes) &&
      Number(snapshot.cooldownMinutes) >= 5 &&
      Number(snapshot.cooldownMinutes) <= 180
        ? Number(snapshot.cooldownMinutes)
        : 30,
  };
};

export const parseShortcutObservationRow = (
  row: ShortcutObservationRow,
): StarInboxItem | null => {
  if (
    typeof row.id !== 'string' || typeof row.event_id !== 'string' ||
    typeof row.sampled_at !== 'string' || typeof row.median_bpm !== 'number' ||
    !Number.isFinite(row.median_bpm) || row.median_bpm < 20 ||
    row.median_bpm > 260
  ) return null;
  const samples = Array.isArray(row.samples)
    ? row.samples.flatMap((sample): Array<{ bpm: number; at: string }> => {
        if (!sample || typeof sample !== 'object' || Array.isArray(sample)) return [];
        const value = sample as Record<string, unknown>;
        return typeof value.bpm === 'number' && Number.isFinite(value.bpm) &&
          value.bpm >= 20 && value.bpm <= 260 && typeof value.at === 'string'
          ? [{ bpm: Math.round(value.bpm), at: value.at }]
          : [];
      }).slice(0, 3)
    : [];
  const reason = DECISION_REASONS.has(
    row.decision_reason as NonNullable<StarInboxItem['decisionReason']>,
  )
    ? row.decision_reason as NonNullable<StarInboxItem['decisionReason']>
    : 'legacy_review';
  return {
    id: `shortcut:${row.id}`,
    source: 'heart-rate',
    sourceEventId: row.event_id,
    eventAt: row.sampled_at,
    receivedAt: typeof row.created_at === 'string'
      ? row.created_at
      : row.sampled_at,
    heartRate: Math.round(row.median_bpm),
    verification: row.is_test === true ? 'test' : 'verified',
    context: row.context === 'resting' || row.context === 'workout'
      ? row.context
      : 'unknown',
    samples,
    lowSignalConfidence: row.low_signal === true,
    decisionReason: reason,
    thresholdSnapshot: parseThreshold(row.threshold_snapshot),
    algorithmVersion: typeof row.algorithm_version === 'string'
      ? row.algorithm_version.slice(0, 80)
      : 'legacy',
    signalLevel: row.signal_level === 'standard' ? 'standard' : 'low',
    repeatCount:
      Number.isInteger(row.repeat_count) && Number(row.repeat_count) >= 1
        ? Math.min(Number(row.repeat_count), 1_000_000)
        : 1,
    status: 'pending',
  };
};

export const mergeShortcutObservationItems = (
  current: StarInboxItem[],
  incoming: StarInboxItem[],
) => {
  const next = [...current];
  for (const item of incoming) {
    const index = next.findIndex((existing) =>
      existing.id === item.id || existing.sourceEventId === item.sourceEventId,
    );
    if (index < 0) {
      next.push(item);
    } else if (next[index].status === 'pending') {
      next[index] = {
        ...item,
        seenAt: next[index].seenAt,
      };
    }
  }
  return next;
};
