import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  createEmptyAppData,
  migrateAppData,
  validateReferentialIntegrity,
} from '../../src/app/appDataRepository';
import { createRecord } from '../../src/app/recordFactory';
import { upsertFollowUpRevisit } from '../../src/app/recordAssociations';
import {
  promoteNextDueFollowUp,
} from '../../src/domain/followUps';
import { prepareCloudSnapshot } from '../../src/services/cloudSnapshot';
import type {
  AppDataSnapshot,
  EmotionNote,
  FollowUpRecord,
} from '../../src/types';

const note: EmotionNote = {
  id: 'note-contract',
  title: 'Contract record',
  place: 'Ningbo',
  date: '2026-08-04',
  time: '14:30',
  emotion: null,
  placeRating: null,
  answers: [],
  excerpt: '',
  isDraft: false,
};

describe('normalized sync migration product invariants', () => {
  it('keeps unselected emotion null and unknown-zone time as local wall time', () => {
    const record = createRecord({
      longitude: 121.544,
      latitude: 29.8683,
      place: 'Ningbo',
      language: 'en',
      source: 'manual',
      date: '2026-08-04',
      time: '14:30',
      eventTimeSource: 'photo-exif',
      eventTimestamp: '2026-08-04T14:30:00',
    });

    expect(record.moment).toMatchObject({
      emotion: null,
      placeRating: null,
      occurredAtUtc: null,
      timeZone: null,
      localDate: '2026-08-04',
      localTime: '14:30',
    });
    expect(record.note).toMatchObject({
      id: record.moment.noteId,
      emotion: null,
      placeRating: null,
      occurredAtUtc: null,
      timeZone: null,
    });
  });

  it('keeps one canonical moment-note pair and rejects demo workspaces', () => {
    const { moment, note: createdNote } = createRecord({
      longitude: 121.544,
      latitude: 29.8683,
      place: 'Ningbo',
      language: 'zh',
      source: 'manual',
    });
    const snapshot = {
      ...createEmptyAppData(),
      moments: [moment],
      notes: [createdNote],
    };

    expect(validateReferentialIntegrity(snapshot)).toEqual([]);
    expect(snapshot.moments).toHaveLength(snapshot.notes.length);
    expect(snapshot.notes[0].id).toBe(snapshot.moments[0].noteId);
    expect(migrateAppData({ ...snapshot, dataMode: 'demo' })).toEqual({
      status: 'invalid',
      issues: ['demo-snapshot-rejected'],
    });
  });

  it('keeps one active follow-up while leaving the rest in the inbox', () => {
    const due = (id: string, dueAt: string): FollowUpRecord => ({
      id,
      noteId: note.id,
      intervalDays: 3,
      dueAt,
      status: 'queued',
    });
    const now = new Date('2026-08-04T12:00:00.000Z');
    const routed = promoteNextDueFollowUp([
      due('chat-slot', '2026-08-04T09:00:00.000Z'),
      due('inbox-only', '2026-08-04T10:00:00.000Z'),
    ], now);

    expect(routed.filter((item) => item.status === 'active')).toHaveLength(1);
    expect(routed.find((item) => item.id === 'inbox-only')).toMatchObject({
      status: 'queued',
      promptedAt: now.toISOString(),
    });
  });

  it('never creates more than one revisit for a source follow-up', () => {
    const first = upsertFollowUpRevisit(
      [], note, 'follow-up-contract', 'lighter',
      '2026-08-04T12:00:00.000Z',
    );
    const second = upsertFollowUpRevisit(
      first, note, 'follow-up-contract', 'same',
      '2026-08-04T12:05:00.000Z',
    );

    expect(second).toHaveLength(1);
    expect(second[0]).toMatchObject({
      sourceFollowUpId: 'follow-up-contract',
      changeDirection: 'same',
    });
  });

  it('uploads completed chat states but never a pending AI message', () => {
    const snapshot: AppDataSnapshot = {
      ...createEmptyAppData(),
      conversations: [{
        id: 'chat-contract',
        title: 'Chat',
        preview: 'pending',
        kind: 'regular',
        messages: [
          { id: 'pending', role: 'user', body: 'pending', deliveryState: 'pending' },
          { id: 'delivered', role: 'assistant', body: 'done', deliveryState: 'delivered' },
          { id: 'failed', role: 'assistant', body: 'failed', deliveryState: 'failed' },
          { id: 'stopped', role: 'assistant', body: 'stopped', deliveryState: 'stopped' },
        ],
      }],
    };

    expect(prepareCloudSnapshot(snapshot).conversations[0].messages.map(
      (message) => message.deliveryState,
    )).toEqual(['delivered', 'failed', 'stopped']);
  });

  it('preserves every foreground and same-browser refresh trigger', () => {
    const syncSource = readFileSync('src/services/useCloudSync.ts', 'utf8');

    expect(syncSource).toContain('new BroadcastChannel(`my-emotion-map-sync:${userId}`)');
    for (const event of ['focus', 'pageshow', 'online']) {
      expect(syncSource).toContain(`window.addEventListener('${event}', recheck)`);
    }
    expect(syncSource).toContain("document.addEventListener('visibilitychange', recheck)");
    expect(syncSource).toContain("window.removeEventListener('focus', recheck)");
    expect(syncSource).toContain("window.removeEventListener('pageshow', recheck)");
    expect(syncSource).toContain("window.removeEventListener('online', recheck)");
    expect(syncSource).toContain("document.removeEventListener('visibilitychange', recheck)");
  });
});
