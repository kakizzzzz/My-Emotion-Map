import { describe, expect, it } from 'vitest';
import {
  isInboxFollowUp,
  promoteNextDueFollowUp,
} from '../../src/domain/followUps';
import type { FollowUpRecord } from '../../src/types';

const due = (
  id: string,
  dueAt: string,
  extra: Partial<FollowUpRecord> = {},
): FollowUpRecord => ({
  id,
  noteId: `note-${id}`,
  intervalDays: 3,
  dueAt,
  status: 'queued',
  promptVersion: 2,
  ...extra,
});

describe('follow-up chat slot and inbox routing', () => {
  it('routes one newly due record to chat and additional records to inbox', () => {
    const now = new Date('2026-08-04T12:00:00.000Z');
    const routed = promoteNextDueFollowUp([
      due('first', '2026-08-04T09:00:00.000Z'),
      due('second', '2026-08-04T10:00:00.000Z'),
      due('third', '2026-08-05T10:00:00.000Z'),
    ], now);

    expect(routed.find((record) => record.id === 'first')).toMatchObject({
      status: 'active',
      promptedAt: now.toISOString(),
    });
    expect(isInboxFollowUp(
      routed.find((record) => record.id === 'second')!,
      now,
    )).toBe(true);
    const future = routed.find((record) => record.id === 'third');
    expect(future?.status).toBe('queued');
    expect(future?.promptedAt).toBeUndefined();
  });

  it('does not promote an existing inbox backlog after the chat item is answered', () => {
    const now = new Date('2026-08-04T12:00:00.000Z');
    const routed = promoteNextDueFollowUp([
      due('answered-chat', '2026-08-04T09:00:00.000Z', {
        status: 'answered',
        promptedAt: '2026-08-04T09:00:00.000Z',
      }),
      due('old-inbox', '2026-08-04T10:00:00.000Z', {
        promptedAt: '2026-08-04T10:00:00.000Z',
      }),
    ], now);

    expect(routed.some((record) => record.status === 'active')).toBe(false);
    expect(isInboxFollowUp(
      routed.find((record) => record.id === 'old-inbox')!,
      now,
    )).toBe(true);
  });

  it('uses a later newly due record for chat without moving older inbox items', () => {
    const now = new Date('2026-08-06T12:00:00.000Z');
    const routed = promoteNextDueFollowUp([
      due('old-inbox', '2026-08-04T10:00:00.000Z', {
        promptedAt: '2026-08-04T10:00:00.000Z',
      }),
      due('new-chat', '2026-08-06T10:00:00.000Z'),
      due('new-inbox', '2026-08-06T11:00:00.000Z'),
    ], now);

    expect(routed.find((record) => record.id === 'new-chat')).toMatchObject({
      status: 'active',
    });
    expect(isInboxFollowUp(
      routed.find((record) => record.id === 'old-inbox')!,
      now,
    )).toBe(true);
    expect(isInboxFollowUp(
      routed.find((record) => record.id === 'new-inbox')!,
      now,
    )).toBe(true);
  });

  it('removes routing when the phone clock moves behind the due time', () => {
    const beforeDue = new Date('2026-08-03T12:00:00.000Z');
    const routed = promoteNextDueFollowUp([
      due('chat', '2026-08-04T10:00:00.000Z', {
        status: 'active',
        promptedAt: '2026-08-04T10:00:00.000Z',
      }),
      due('inbox', '2026-08-04T11:00:00.000Z', {
        promptedAt: '2026-08-04T11:00:00.000Z',
        seenAt: '2026-08-04T11:30:00.000Z',
      }),
    ], beforeDue);

    expect(routed).toEqual([
      expect.objectContaining({
        id: 'chat', status: 'queued', promptedAt: undefined, seenAt: undefined,
      }),
      expect.objectContaining({
        id: 'inbox', status: 'queued', promptedAt: undefined, seenAt: undefined,
      }),
    ]);
  });
});
