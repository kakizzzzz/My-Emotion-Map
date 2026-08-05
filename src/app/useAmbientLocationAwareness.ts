import { useEffect, useRef, useState } from 'react';
import type { EmotionMoment, EmotionNote } from '../types';
import type { UserLocation } from '../useLocationController';

const DAY_MS = 86_400_000;
const MIN_STAR_AGE_MS = 30 * DAY_MS;
const MIN_REENTRY_ABSENCE_MS = 30 * DAY_MS;
const PER_STAR_PROMPT_COOLDOWN_MS = 30 * DAY_MS;
const GLOBAL_PROMPT_COOLDOWN_MS = 8 * 60 * 60 * 1000;
const MAX_LOCATION_AGE_MS = 120_000;
const MAX_LOCATION_ACCURACY_M = 120;
const MIN_PROCESS_INTERVAL_MS = 30_000;
const MIN_PROCESS_MOVEMENT_M = 50;
const MIN_ENTER_RADIUS_M = 80;
const MAX_ENTER_RADIUS_M = 180;
const EXIT_RADIUS_M = 300;
const EARTH_RADIUS_M = 6_371_000;
const STORAGE_VERSION = 1;

export type AmbientStarPresence = {
  anchorKey: string;
  presence: 'near' | 'far';
  lastEnteredAt?: string;
  lastExitedAt?: string;
  lastPromptedAt?: string;
};

export type AmbientLocationState = {
  version: 1;
  lastGlobalPromptedAt?: string;
  stars: Record<string, AmbientStarPresence>;
};

export type AmbientLocationPrompt = {
  primaryMomentId: string;
  momentIds: string[];
  count: number;
  reason: 'first-near' | 'return-after-absence';
};

type EvaluationInput = {
  now: number; userLocation: UserLocation;
  moments: EmotionMoment[]; notes: EmotionNote[];
  state: AmbientLocationState;
};

type EvaluationResult = {
  accepted: boolean; changed: boolean;
  state: AmbientLocationState; prompt: AmbientLocationPrompt | null;
};

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const emptyState = (): AmbientLocationState => ({ version: 1, stars: {} });
const storageKey = (userId: string) =>
  `my-emotion-map.ambient-location.${userId}.v1`;
const validCoordinate = (lat: number, lng: number) =>
  Number.isFinite(lat) && Number.isFinite(lng) &&
  Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
const validIso = (value: unknown): value is string =>
  typeof value === 'string' && Number.isFinite(Date.parse(value));

const browserStorage = (): StorageLike | null => {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
};

const sanitizeState = (value: unknown): AmbientLocationState => {
  if (!value || typeof value !== 'object') return emptyState();
  const raw = value as Partial<AmbientLocationState>;
  const stars: Record<string, AmbientStarPresence> = {};
  if (raw.version === STORAGE_VERSION && raw.stars && typeof raw.stars === 'object') {
    for (const [id, entry] of Object.entries(raw.stars)) {
      if (!entry || typeof entry !== 'object') continue;
      const item = entry as Partial<AmbientStarPresence>;
      if (!item.anchorKey || (item.presence !== 'near' && item.presence !== 'far')) continue;
      stars[id] = {
        anchorKey: item.anchorKey,
        presence: item.presence,
        ...(validIso(item.lastEnteredAt) ? { lastEnteredAt: item.lastEnteredAt } : {}),
        ...(validIso(item.lastExitedAt) ? { lastExitedAt: item.lastExitedAt } : {}),
        ...(validIso(item.lastPromptedAt) ? { lastPromptedAt: item.lastPromptedAt } : {}),
      };
    }
  }
  return {
    version: 1,
    stars,
    ...(validIso(raw.lastGlobalPromptedAt)
      ? { lastGlobalPromptedAt: raw.lastGlobalPromptedAt }
      : {}),
  };
};

export const loadAmbientLocationState = (
  userId: string,
  storage: StorageLike | null = browserStorage(),
): AmbientLocationState => {
  try {
    return storage ? sanitizeState(JSON.parse(storage.getItem(storageKey(userId)) ?? 'null')) : emptyState();
  } catch {
    return emptyState();
  }
};

export const saveAmbientLocationState = (
  userId: string,
  state: AmbientLocationState,
  storage: StorageLike | null = browserStorage(),
) => {
  try {
    if (!storage) return false;
    storage.setItem(storageKey(userId), JSON.stringify(sanitizeState(state)));
    return true;
  } catch {
    return false;
  }
};

export const clearAmbientLocationState = (
  userId: string,
  storage: StorageLike | null = browserStorage(),
) => {
  try {
    if (!storage) return false;
    storage.removeItem(storageKey(userId));
    return true;
  } catch {
    return false;
  }
};

const haversineMeters = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const toRadians = (value: number) => value * Math.PI / 180;
  const deltaLat = toRadians(b.lat - a.lat);
  const deltaLng = toRadians(b.lng - a.lng);
  const raw = Math.sin(deltaLat / 2) ** 2 +
    Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) *
    Math.sin(deltaLng / 2) ** 2;
  const bounded = Math.min(1, Math.max(0, raw));
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(bounded), Math.sqrt(1 - bounded));
};

const localNoon = (value: unknown) => {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
  return date.getFullYear() === Number(match[1]) &&
    date.getMonth() === Number(match[2]) - 1 && date.getDate() === Number(match[3])
    ? date.getTime() : null;
};

const occurredAt = (moment: EmotionMoment, note: EmotionNote) => {
  for (const value of [note.occurredAtUtc, moment.occurredAtUtc]) {
    if (validIso(value)) return Date.parse(value);
  }
  for (const value of [note.localDate, note.date, moment.localDate, moment.date]) {
    const parsed = localNoon(value);
    if (parsed !== null) return parsed;
  }
  return null;
};

const anchorKey = (moment: EmotionMoment) =>
  `${moment.latitude.toFixed(6)},${moment.longitude.toFixed(6)}`;

export const evaluateAmbientLocation = ({
  now, userLocation, moments, notes, state,
}: EvaluationInput): EvaluationResult => {
  const age = now - userLocation.timestamp;
  if (!Number.isFinite(userLocation.timestamp) || age < 0 || age > MAX_LOCATION_AGE_MS ||
    (userLocation.accuracy !== null && (!Number.isFinite(userLocation.accuracy) ||
      userLocation.accuracy < 0 || userLocation.accuracy > MAX_LOCATION_ACCURACY_M)) ||
    !validCoordinate(userLocation.lat, userLocation.lng)) {
    return { accepted: false, changed: false, state, prompt: null };
  }

  const previous = sanitizeState(state);
  const noteById = new Map(notes.map((note) => [note.id, note]));
  const candidates = moments.flatMap((moment) => {
    const note = noteById.get(moment.noteId);
    const time = note ? occurredAt(moment, note) : null;
    if (!note || note.isDraft === true || note.followUpEnabled !== true ||
      !validCoordinate(moment.latitude, moment.longitude) || time === null ||
      now - time < MIN_STAR_AGE_MS) return [];
    return [{ moment, time }];
  });
  const accuracy = userLocation.accuracy ?? 100;
  const enterRadius = Math.min(MAX_ENTER_RADIUS_M,
    Math.max(MIN_ENTER_RADIUS_M, accuracy * 1.5));
  const exitRadius = Math.max(EXIT_RADIUS_M, enterRadius * 2);
  const nextStars: Record<string, AmbientStarPresence> = {};
  const eligible: Array<{
    momentId: string;
    distance: number;
    time: number;
    reason: AmbientLocationPrompt['reason'];
  }> = [];
  const nowIso = new Date(now).toISOString();

  for (const { moment, time } of candidates) {
    const anchor = anchorKey(moment);
    const old = previous.stars[moment.id]?.anchorKey === anchor
      ? previous.stars[moment.id] : undefined;
    const distance = haversineMeters(
      { lat: userLocation.lat, lng: userLocation.lng },
      { lat: moment.latitude, lng: moment.longitude },
    );
    if (!old) {
      if (distance <= enterRadius) {
        nextStars[moment.id] = { anchorKey: anchor, presence: 'near', lastEnteredAt: nowIso };
        eligible.push({ momentId: moment.id, distance, time, reason: 'first-near' });
      }
      continue;
    }
    if (old.presence === 'near') {
      nextStars[moment.id] = distance >= exitRadius
        ? { ...old, presence: 'far', lastExitedAt: nowIso }
        : old;
      continue;
    }
    if (distance > enterRadius) {
      nextStars[moment.id] = old;
      continue;
    }
    nextStars[moment.id] = { ...old, presence: 'near', lastEnteredAt: nowIso };
    // Time away is never inferred: only an observed far transition proves absence.
    const exitedAt = validIso(old.lastExitedAt) ? Date.parse(old.lastExitedAt) : null;
    const promptedAt = validIso(old.lastPromptedAt) ? Date.parse(old.lastPromptedAt) : null;
    if (exitedAt !== null && now - exitedAt >= MIN_REENTRY_ABSENCE_MS &&
      (promptedAt === null || now - promptedAt >= PER_STAR_PROMPT_COOLDOWN_MS)) {
      eligible.push({ momentId: moment.id, distance, time, reason: 'return-after-absence' });
    }
  }

  eligible.sort((a, b) => a.distance - b.distance || a.time - b.time ||
    a.momentId.localeCompare(b.momentId));
  const globalPromptedAt = validIso(previous.lastGlobalPromptedAt)
    ? Date.parse(previous.lastGlobalPromptedAt) : null;
  const mayPrompt = eligible.length > 0 &&
    (globalPromptedAt === null || now - globalPromptedAt >= GLOBAL_PROMPT_COOLDOWN_MS);
  const prompt = mayPrompt ? {
    primaryMomentId: eligible[0].momentId,
    momentIds: eligible.map((item) => item.momentId),
    count: eligible.length,
    reason: eligible[0].reason,
  } : null;
  if (prompt) {
    for (const item of eligible) {
      nextStars[item.momentId] = { ...nextStars[item.momentId], lastPromptedAt: nowIso };
    }
  }
  const next: AmbientLocationState = {
    version: 1,
    stars: nextStars,
    ...((prompt ? nowIso : previous.lastGlobalPromptedAt)
      ? { lastGlobalPromptedAt: prompt ? nowIso : previous.lastGlobalPromptedAt }
      : {}),
  };
  return {
    accepted: true,
    changed: JSON.stringify(next) !== JSON.stringify(previous),
    state: next,
    prompt,
  };
};

type UseAmbientLocationAwarenessOptions = {
  userId: string | null; enabled: boolean;
  userLocation: UserLocation | null;
  moments: EmotionMoment[]; notes: EmotionNote[];
  onPrompt: (prompt: AmbientLocationPrompt) => void;
};

export function useAmbientLocationAwareness({
  userId, enabled, userLocation, moments, notes, onPrompt,
}: UseAmbientLocationAwarenessOptions) {
  const statesRef = useRef<Record<string, AmbientLocationState>>({});
  const lastProcessedRef = useRef<UserLocation | null>(null);
  const onPromptRef = useRef(onPrompt);
  const [visible, setVisible] = useState(
    () => typeof document === 'undefined' || document.visibilityState !== 'hidden',
  );

  useEffect(() => { onPromptRef.current = onPrompt; }, [onPrompt]);
  useEffect(() => {
    const update = () => setVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);
  useEffect(() => { lastProcessedRef.current = null; }, [userId]);
  useEffect(() => {
    if (!userId || !enabled || !visible || !userLocation) return;
    const previousSample = lastProcessedRef.current;
    if (previousSample && userLocation.timestamp - previousSample.timestamp < MIN_PROCESS_INTERVAL_MS &&
      haversineMeters(previousSample, userLocation) < MIN_PROCESS_MOVEMENT_M) return;
    const current = statesRef.current[userId] ?? loadAmbientLocationState(userId);
    statesRef.current[userId] = current;
    const result = evaluateAmbientLocation({
      now: Date.now(), userLocation, moments, notes, state: current,
    });
    if (!result.accepted) return;
    lastProcessedRef.current = userLocation;
    statesRef.current[userId] = result.state;
    if (result.changed) saveAmbientLocationState(userId, result.state);
    if (result.prompt) onPromptRef.current(result.prompt);
  }, [enabled, moments, notes, userId, userLocation, visible]);
}
