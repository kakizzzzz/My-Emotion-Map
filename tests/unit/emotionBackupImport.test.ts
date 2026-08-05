import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyAppData } from '../../src/app/appDataRepository';
import { createDefaultLocalSettings } from '../../src/app/profilePreferences';
import { createRecord } from '../../src/app/recordFactory';
import { exportReadableData } from '../../src/app/exportReadableData';
import {
  createCompleteEmotionBackup,
  emotionBackupChecksum,
  parseCompleteEmotionBackup,
  serializeCompleteEmotionBackup,
} from '../../src/domain/storage/emotionBackup';
import {
  mergeEmotionImport,
  prepareEmotionImport,
} from '../../src/domain/storage/emotionImport';
import { normalizeEmotionSnapshot } from '../../src/domain/storage/normalizedEmotionSnapshot';
import { diffEmotionState } from '../../src/services/normalizedSync/emotionMutationModel';
import { nextEmotionMutationBatch } from '../../src/services/normalizedSync/emotionMutationBatching';
import type { EmotionMutationOutbox } from '../../src/services/normalizedSync/emotionOutbox';

const sourceSnapshot = () => {
  const { moment, note } = createRecord({
    longitude: 139.6917,
    latitude: 35.6895,
    place: 'Tokyo',
    language: 'zh',
    source: 'manual',
  });
  return {
    ...createEmptyAppData(),
    moments: [{ ...moment, isNew: undefined }],
    notes: [{ ...note, isDraft: undefined, title: 'Tokyo memory' }],
  };
};

const normalized = () => {
  const settings = {
    ...createDefaultLocalSettings(),
    avatarSrc: 'data:image/webp;base64,secret-avatar',
    language: 'ko' as const,
    profileName: 'Kaki',
    aboutMe: 'hello',
    aiUserPrompt: 'friendly',
  };
  return normalizeEmotionSnapshot(sourceSnapshot(), settings).snapshot;
};

describe('complete normalized backup and import', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('round-trips synchronized settings while excluding runtime and credential fields', async () => {
    const backup = await createCompleteEmotionBackup({
      normalized: normalized(),
      datasetRevision: 12,
      exportedAt: '2026-08-04T08:00:00.000Z',
    });
    const text = serializeCompleteEmotionBackup(backup);
    const parsed = await parseCompleteEmotionBackup(text);

    expect(parsed).toMatchObject({
      ok: true,
      value: {
        preview: { records: 1, conversations: 0, messages: 0, followUps: 0, revisits: 0 },
      },
    });
    expect(backup.checksum).toMatch(/^[0-9a-f]{64}$/);
    expect(text).toContain('secret-avatar');
    expect(text).toContain('"language": "ko"');
    expect(text).not.toContain('lastViewport');
    expect(text).not.toContain('lastConversationId');
    expect(text).not.toContain('mutation');
    expect(text).not.toContain('session');
  });

  it('rejects checksum changes and hard-stops future versions', async () => {
    const backup = await createCompleteEmotionBackup({
      normalized: normalized(),
      datasetRevision: 2,
    });
    const tampered = { ...backup, datasetRevision: 3 };
    expect(await parseCompleteEmotionBackup(JSON.stringify(tampered))).toEqual({
      ok: false,
      issue: 'checksum-mismatch',
    });
    expect(await parseCompleteEmotionBackup(JSON.stringify({
      ...backup,
      backupVersion: backup.backupVersion + 1,
    }))).toEqual({ ok: false, issue: 'future-version' });
  });

  it('validates references before import', async () => {
    const backup = await createCompleteEmotionBackup({
      normalized: normalized(),
      datasetRevision: 2,
    });
    const invalid = {
      ...backup,
      messages: [{
        id: 'message-a', conversationId: 'missing', sortOrder: 0,
        role: 'user', body: 'hello', kind: 'message',
      }],
    };
    const checksumSource = { ...invalid };
    delete (checksumSource as Partial<typeof invalid>).checksum;
    invalid.checksum = await emotionBackupChecksum(checksumSource);
    expect(await parseCompleteEmotionBackup(JSON.stringify(invalid))).toEqual({
      ok: false,
      issue: 'invalid-format',
    });
  });

  it('merges disjoint IDs and reports same-entity differences without overwriting local data', () => {
    const current = normalized();
    const incoming = structuredClone(current);
    incoming.records[0].title = 'different imported title';
    const second = structuredClone(current.records[0]);
    second.momentId = 'moment-second';
    second.noteId = 'note-second';
    incoming.records.push(second);

    const merged = mergeEmotionImport({ current, incoming });
    expect(merged.snapshot.records).toHaveLength(2);
    expect(merged.snapshot.records[0].title).toBe(current.records[0].title);
    expect(merged.conflicts).toContainEqual({
      entity: 'record',
      id: current.records[0].momentId,
    });
  });

  it('replace preserves device-only state and deletion produces permanent soft-delete mutations', () => {
    const current = normalized();
    const empty = normalizeEmotionSnapshot(
      createEmptyAppData(),
      createDefaultLocalSettings(),
    ).snapshot;
    const device = {
      ...sourceSnapshot(),
      lastViewport: { latitude: 35.6, longitude: 139.7, zoom: 13 },
      lastConversationId: 'device-only',
    };
    const replaced = prepareEmotionImport({
      current,
      incoming: empty,
      mode: 'replace',
      device,
    });
    expect(replaced.appSnapshot.lastViewport).toEqual(device.lastViewport);
    expect(diffEmotionState(current, empty).map((mutation) => mutation.type))
      .toContain('record_soft_delete');
  });

  it('limits large import outboxes to restartable 500-mutation batches', () => {
    const mutation = diffEmotionState(
      normalizeEmotionSnapshot(createEmptyAppData(), createDefaultLocalSettings()).snapshot,
      normalized(),
    )[0];
    const mutations = Array.from({ length: 1_201 }, (_, index) => ({
      ...mutation,
      mutationId: `mutation-${index}`,
      entityId: `record-${index}`,
    }));
    const outbox: EmotionMutationOutbox = {
      userId: 'user-a', expectedRevision: 4, mutations,
      sequence: 1, savedAt: 1, language: 'zh',
    };
    expect(nextEmotionMutationBatch(outbox)).toHaveLength(500);
    outbox.inFlightBatch = {
      expectedRevision: 4,
      mutations: mutations.slice(0, 17),
      startedAt: 2,
    };
    expect(nextEmotionMutationBatch(outbox)).toEqual(outbox.inFlightBatch.mutations);
  });

  it('keeps the existing readable HTML report available', () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:report');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const result = exportReadableData({
      snapshot: sourceSnapshot(),
      range: { mode: 'all' },
      language: 'zh',
    });
    expect(result.recordCount).toBe(1);
  });
});
