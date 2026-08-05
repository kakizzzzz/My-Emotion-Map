import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EmotionMoment, EmotionNote } from '../../src/types';
import type { UserLocation } from '../../src/useLocationController';
import {
  clearAmbientLocationState, evaluateAmbientLocation, loadAmbientLocationState,
  saveAmbientLocationState, useAmbientLocationAwareness,
  type AmbientLocationState,
} from '../../src/app/useAmbientLocationAwareness';

const DAY_MS = 86_400_000;
const START = Date.UTC(2026, 7, 1, 12);
const emptyState = (): AmbientLocationState => ({ version: 1, stars: {} });
const location = (now: number, lat = 0, lng = 0, accuracy: number | null = 20): UserLocation =>
  ({ lat, lng, accuracy, heading: null, timestamp: now });

const records = ({
  id = 'star-a',
  lat = 0,
  lng = 0,
  occurredAt = START - 60 * DAY_MS,
  draft = false,
  followUp = true,
}: {
  id?: string; lat?: number; lng?: number;
  occurredAt?: number; draft?: boolean;
  followUp?: boolean | undefined;
} = {}) => {
  const note: EmotionNote = {
    id: `note-${id}`,
    title: id,
    place: '',
    date: new Date(occurredAt).toISOString().slice(0, 10),
    time: '',
    emotion: null,
    placeRating: null,
    answers: [],
    excerpt: '',
    isDraft: draft,
    followUpEnabled: followUp,
    occurredAtUtc: new Date(occurredAt).toISOString(),
  };
  const moment: EmotionMoment = {
    id,
    emotion: null,
    intensity: 3,
    place: '',
    date: note.date,
    time: '',
    longitude: lng,
    latitude: lat,
    noteId: note.id,
    placeRating: null,
    occurredAtUtc: note.occurredAtUtc,
  };
  return { moment, note };
};

const evaluate = ({
  now = START,
  currentLocation = location(now),
  items = [records()],
  state = emptyState(),
}: {
  now?: number; currentLocation?: UserLocation;
  items?: ReturnType<typeof records>[];
  state?: AmbientLocationState;
} = {}) => evaluateAmbientLocation({
  now,
  userLocation: currentLocation,
  moments: items.map((item) => item.moment),
  notes: items.map((item) => item.note),
  state,
});

const stateAfterObservedExit = () => {
  const near = evaluate();
  const exitAt = START + DAY_MS;
  const far = evaluate({
    now: exitAt,
    currentLocation: location(exitAt, 0.01, 0.01),
    state: near.state,
  });
  return { exitAt, near, far };
};

beforeEach(() => window.localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('nearby old-star state machine', () => {
  it('prompts once on first nearby observation and not again the next day', () => {
    const first = evaluate();
    expect(first.prompt).toMatchObject({
      primaryMomentId: 'star-a', count: 1, reason: 'first-near',
    });
    const nextDay = evaluate({ now: START + DAY_MS, state: first.state });
    expect(nextDay.prompt).toBeNull();
    expect(evaluate({ now: START + 400 * DAY_MS, state: first.state }).prompt)
      .toBeNull();
    expect(nextDay.state.stars['star-a'].lastEnteredAt)
      .toBe(first.state.stars['star-a'].lastEnteredAt);
  });

  it('records a real observed exit without prompting', () => {
    const { exitAt, far } = stateAfterObservedExit();
    expect(far.prompt).toBeNull();
    expect(far.state.stars['star-a']).toMatchObject({
      presence: 'far', lastExitedAt: new Date(exitAt).toISOString(),
    });
  });

  it.each([[1, false], [29, false], [31, true], [366, true]])(
    'after an observed exit, returning after %i days prompts=%s', (days, prompts) => {
    const { exitAt, far } = stateAfterObservedExit();
    const now = exitAt + days * DAY_MS;
    const result = evaluate({ now, currentLocation: location(now), state: far.state });
    expect(Boolean(result.prompt)).toBe(prompts);
    expect(result.state.stars['star-a'].presence).toBe('near');
    if (prompts) expect(result.prompt?.reason).toBe('return-after-absence');
    },
  );

  it('does not turn daily commute near/far cycles into daily prompts', () => {
    let result = evaluate();
    let prompts = result.prompt ? 1 : 0;
    for (let index = 1; index <= 8; index += 1) {
      const now = START + index * 12 * 60 * 60 * 1000;
      const isFar = index % 2 === 1;
      result = evaluate({
        now,
        currentLocation: location(now, isFar ? 0.01 : 0, isFar ? 0.01 : 0),
        state: result.state,
      });
      if (result.prompt) prompts += 1;
    }
    expect(prompts).toBe(1);
  });

  it('coalesces nearby candidates and chooses the nearest stable primary', () => {
    const items = [
      records({ id: 'farther', lat: 0.0005, occurredAt: START - 80 * DAY_MS }),
      records({ id: 'nearest', lat: 0.0001, occurredAt: START - 40 * DAY_MS }),
    ];
    const result = evaluate({ items });
    expect(result.prompt).toEqual({
      primaryMomentId: 'nearest',
      momentIds: ['nearest', 'farther'],
      count: 2,
      reason: 'first-near',
    });
    expect(result.state.stars.nearest.lastPromptedAt)
      .toBe(result.state.stars.farther.lastPromptedAt);
  });

  it.each([
    ['newer than 30 days', records({ occurredAt: START - 29 * DAY_MS })],
    ['draft', records({ draft: true })],
    ['follow-up disabled', records({ followUp: false })],
    ['follow-up unset', (() => {
      const item = records();
      delete item.note.followUpEnabled;
      return item;
    })()],
  ])('excludes %s records', (_label, item) => {
    const result = evaluate({ items: [item] });
    expect(result.prompt).toBeNull();
    expect(result.state.stars).toEqual({});
  });

  it.each([
    ['stale timestamp', location(START - 120_001)],
    ['accuracy above 120m', location(START, 0, 0, 121)],
    ['invalid coordinate', location(START, 91, 0)],
  ])('ignores %s without changing state', (_label, currentLocation) => {
    const existing = evaluate().state;
    const result = evaluate({ currentLocation, state: existing });
    expect(result).toMatchObject({ accepted: false, changed: false, prompt: null });
    expect(result.state).toBe(existing);
  });

  it('uses the prescribed fallback radius when accuracy is null', () => {
    const result = evaluate({ currentLocation: location(START, 0, 0, null) });
    expect(result.accepted).toBe(true);
    expect(result.prompt?.reason).toBe('first-near');
  });

  it('resets old presence when a star moves and treats the new anchor as new', () => {
    const original = evaluate();
    const moved = records({ lat: 0.02, lng: 0.02 });
    const away = evaluate({ items: [moved], state: original.state });
    expect(away.state.stars).toEqual({});
    const now = START + DAY_MS;
    const atNewAnchor = evaluate({
      now,
      currentLocation: location(now, 0.02, 0.02),
      items: [moved],
      state: away.state,
    });
    expect(atNewAnchor.prompt?.reason).toBe('first-near');
  });

  it('removes orphan state when a record is deleted or no longer eligible', () => {
    const existing = evaluate().state;
    const deleted = evaluate({ items: [], state: existing });
    expect(deleted.changed).toBe(true);
    expect(deleted.state.stars).toEqual({});
  });

  it('drops a second group during the global eight-hour cooldown without queuing', () => {
    const firstItem = records({ id: 'first' });
    const first = evaluate({ items: [firstItem] });
    const now = START + 60 * 60 * 1000;
    const second = evaluate({
      now,
      currentLocation: location(now),
      items: [firstItem, records({ id: 'second' })],
      state: first.state,
    });
    expect(second.prompt).toBeNull();
    expect(second.state.stars.second.presence).toBe('near');
    const later = evaluate({
      now: START + 9 * 60 * 60 * 1000,
      currentLocation: location(START + 9 * 60 * 60 * 1000),
      items: [firstItem, records({ id: 'second' })],
      state: second.state,
    });
    expect(later.prompt).toBeNull();
  });
});

describe('local-only ambient state storage', () => {
  it('stores only star anchors and timestamps, never user location samples', () => {
    const state = evaluate().state;
    expect(saveAmbientLocationState('account-a', state)).toBe(true);
    const serialized = Array.from({ length: window.localStorage.length }, (_, index) => {
      const key = window.localStorage.key(index) ?? '';
      return `${key}:${window.localStorage.getItem(key)}`;
    }).join('|');
    expect(serialized).not.toMatch(/heading|speed|trajectory|latitude|longitude/);
    expect(serialized).toContain('anchorKey');
  });

  it('isolates account keys and clears only the requested account', () => {
    expect(saveAmbientLocationState('account-a', evaluate().state)).toBe(true);
    expect(saveAmbientLocationState('account-b', evaluate().state)).toBe(true);
    const keys = Array.from({ length: window.localStorage.length },
      (_, index) => window.localStorage.key(index));
    expect(keys).toContain('my-emotion-map.ambient-location.account-a.v1');
    expect(keys).toContain('my-emotion-map.ambient-location.account-b.v1');
    expect(clearAmbientLocationState('account-a')).toBe(true);
    expect(loadAmbientLocationState('account-a')).toEqual(emptyState());
    expect(loadAmbientLocationState('account-b').stars['star-a']).toBeDefined();
  });

  it('falls back safely when localStorage throws and the pure state keeps working', () => {
    const broken = {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('blocked'); },
      removeItem: () => { throw new Error('blocked'); },
    };
    expect(loadAmbientLocationState('account-a', broken)).toEqual(emptyState());
    expect(saveAmbientLocationState('account-a', emptyState(), broken)).toBe(false);
    expect(clearAmbientLocationState('account-a', broken)).toBe(false);
    const first = evaluate();
    expect(evaluate({ now: START + DAY_MS, state: first.state }).prompt).toBeNull();
  });

  it('keeps the hook in memory without throwing when localStorage is blocked', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(START);
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    const onPrompt = vi.fn();
    const { unmount } = renderHook(() => useAmbientLocationAwareness({
      userId: 'account-a', enabled: true, userLocation: location(START),
      moments: [records().moment], notes: [records().note], onPrompt,
    }));
    await waitFor(() => expect(onPrompt).toHaveBeenCalledOnce());
    unmount();
  });
});
