import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  loadNormalizedEmotionActionContext,
  loadNormalizedEmotionReadContext,
  loadNormalizedEmotionRevision,
  type NormalizedEmotionAccess,
} from '../../supabase/functions/_shared/normalizedEmotionRepository';
import { normalizedEmotionRecordPair } from '../../supabase/functions/_shared/normalizedEmotionRecords';
import { normalizedProposalNoteFingerprint } from '../../supabase/functions/_shared/emotionMapMcpActions';
import { proposalNoteFingerprint } from '../../src/services/externalAccess';
import type { EmotionNote } from '../../src/types';

const access: NormalizedEmotionAccess = {
  supabaseUrl: 'https://emotion-map.supabase.co',
  userId: 'user-a',
  authorization: 'Bearer user-token',
  apiKey: 'anon-key',
};

const settings = (revision: number) => [{
  user_id: 'user-a',
  dataset_revision: revision,
  data_model_version: 2,
  migration_verified_at: '2026-08-04T00:00:00.000Z',
}];

const record = {
  user_id: 'user-a',
  moment_id: 'moment-a',
  note_id: 'note-a',
  sort_order: 0,
  longitude: 121.544,
  latitude: 29.8683,
  place: 'Ningbo',
  emotion: null,
  intensity: 0,
  place_rating: null,
  color: '#f4c95d',
  tag_group_id: null,
  tag_order: null,
  local_date: '2026-08-04',
  local_time: '14:30',
  occurred_at_utc: null,
  time_zone: null,
  utc_offset_minutes: null,
  time_precision: 'minute',
  event_time_source: 'legacy',
  source: 'manual',
  photo_taken_at: null,
  photo_taken_at_kind: null,
  photo_taken_at_source: null,
  imported_at: null,
  location_captured_at: null,
  location_time_relation: null,
  title: 'Harbor walk',
  title_source: 'user',
  answers: [{ id: 'q1', question: 'Why?', answer: 'Quiet' }],
  excerpt: 'Sea breeze',
  is_draft: false,
  is_new: false,
  follow_up_enabled: false,
};

const message = {
  user_id: 'user-a',
  conversation_id: 'chat-a',
  id: 'message-a',
  sort_order: 9,
  role: 'assistant',
  body: 'Here is the record.',
  kind: 'message',
  note_ids: ['note-a'],
  external_evidence: [],
  mcp_calls: [],
  options: [],
  clarification_options: [],
  request_id: null,
  reply_to_request_id: null,
  delivery_state: 'delivered',
  retryable: false,
  reference_confirmation: null,
  follow_up_id: null,
  created_at: '2026-08-04T00:00:00.000Z',
};

afterEach(() => vi.unstubAllGlobals());

describe('normalized Edge repository', () => {
  it('reads dataset_revision only from verified normalized settings', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(settings(12)), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(loadNormalizedEmotionRevision(access)).resolves.toBe(12);
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain('/rest/v1/emotion_settings');
    expect(url).toContain('dataset_revision');
  });

  it('loads only formal active records and eight recent target-conversation messages', async () => {
    const fetchMock = vi.fn((input: string | URL | Request) => {
      const url = String(input);
      const body = url.includes('/emotion_settings')
        ? settings(7)
        : url.includes('/emotion_records')
          ? [record]
          : url.includes('/emotion_messages')
            ? [message]
            : [];
      return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
    });
    vi.stubGlobal('fetch', fetchMock);

    const loaded = await loadNormalizedEmotionReadContext(access, 'chat-a');

    expect(loaded).toMatchObject({
      revision: 7,
      snapshot: {
        dataMode: 'real',
        moments: [expect.objectContaining({ noteId: 'note-a' })],
        notes: [expect.objectContaining({
          id: 'note-a', title: 'Harbor walk', emotion: null,
        })],
        conversations: [{
          id: 'chat-a',
          title: '',
          preview: 'Here is the record.',
          messages: [expect.objectContaining({
            id: 'message-a', noteIds: ['note-a'],
          })],
        }],
      },
    });
    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    const recordsUrl = urls.find((url) => url.includes('/emotion_records')) ?? '';
    const messagesUrl = urls.find((url) => url.includes('/emotion_messages')) ?? '';
    expect(recordsUrl).toContain('deleted_at=is.null');
    expect(recordsUrl).toContain('is_draft=eq.false');
    expect(recordsUrl).toContain('is_new=eq.false');
    expect(messagesUrl).toContain('conversation_id=eq.chat-a');
    expect(messagesUrl).toContain('limit=8');
  });

  it('action reads only the named target record and retries a changing revision', async () => {
    const revisions = [1, 2, 2, 2];
    const fetchMock = vi.fn((input: string | URL | Request) => {
      const url = String(input);
      const body = url.includes('/emotion_settings')
        ? settings(revisions.shift() ?? 2)
        : [record];
      return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
    });
    vi.stubGlobal('fetch', fetchMock);

    const loaded = await loadNormalizedEmotionActionContext(access, 'note-a');

    expect(loaded?.revision).toBe(2);
    const recordUrls = fetchMock.mock.calls
      .map((call) => String(call[0]))
      .filter((url) => url.includes('/emotion_records'));
    expect(recordUrls).toHaveLength(2);
    expect(recordUrls.every((url) =>
      url.includes('note_id=eq.note-a') && url.includes('limit=1'))).toBe(true);
    expect(fetchMock.mock.calls.some((call) =>
      String(call[0]).includes('/emotion_messages'))).toBe(false);
  });

  it('reconstructs the exact client note used by the proposal fingerprint', async () => {
    const pair = normalizedEmotionRecordPair(record);
    expect(pair).not.toBeNull();
    const note = pair?.note as EmotionNote;

    const [server, client] = await Promise.all([
      normalizedProposalNoteFingerprint(note),
      proposalNoteFingerprint(note),
    ]);
    expect(server).toBe(client);
  });
});
