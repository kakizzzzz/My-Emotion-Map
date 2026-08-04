import { describe, expect, it } from 'vitest';
import {
  createEmptyAppData,
  migrateAppData,
} from '../../src/app/appDataRepository';

describe('persisted pending chat recovery', () => {
  it('marks an interrupted request as stopped after reload', () => {
    const migrated = migrateAppData({
      ...createEmptyAppData(),
      conversations: [{
        id: 'conversation-1',
        title: '测试',
        preview: '仍在等待',
        kind: 'regular',
        messages: [{
          id: 'request-1',
          role: 'user',
          body: '仍在等待',
          requestId: 'request-1',
          deliveryState: 'pending',
        }],
      }],
    });

    expect(migrated.status).toBe('ok');
    if (migrated.status !== 'ok') return;
    expect(
      migrated.snapshot.conversations[0].messages[0].deliveryState,
    ).toBe('stopped');
  });
});
