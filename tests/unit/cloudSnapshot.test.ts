import { describe, expect, it } from 'vitest';
import { createEmptyAppData } from '../../src/app/appDataRepository';
import { prepareCloudSnapshot } from '../../src/services/cloudSnapshot';
import type { Conversation } from '../../src/types';

const deliveredConversation: Conversation = {
  id: 'delivered',
  title: '已完成',
  preview: '旧预览',
  kind: 'regular',
  messages: [{
    id: 'delivered-message',
    role: 'assistant',
    body: '已完成回答',
    deliveryState: 'delivered',
  }],
};

describe('cloud snapshot preparation', () => {
  it('keeps stars and follow-ups while excluding transient pending chat', () => {
    const snapshot = {
      ...createEmptyAppData(),
      moments: [{
        id: 'moment-1',
        noteId: 'note-1',
        emotion: 'calm' as const,
        intensity: 2,
        place: '安静角落',
        date: '2026-08-04',
        time: '10:00',
        latitude: 29.8683,
        longitude: 121.544,
        placeRating: 'comfortable' as const,
      }],
      notes: [{
        id: 'note-1',
        title: '安静角落',
        place: '安静角落',
        date: '2026-08-04',
        time: '10:00',
        emotion: 'calm' as const,
        placeRating: 'comfortable' as const,
        answers: [],
        excerpt: '测试',
        followUpEnabled: true,
      }],
      followUps: [{
        id: 'follow-up-1',
        noteId: 'note-1',
        intervalDays: 3,
        dueAt: '2026-08-07T02:00:00.000Z',
        status: 'queued' as const,
      }],
      conversations: [
        deliveredConversation,
        {
          id: 'pending-only',
          title: '等待中',
          preview: '尚未完成',
          kind: 'regular' as const,
          messages: [{
            id: 'pending-message',
            role: 'user' as const,
            body: '尚未完成',
            deliveryState: 'pending' as const,
          }],
        },
        {
          id: 'mixed',
          title: '混合',
          preview: '尚未完成',
          kind: 'regular' as const,
          unread: true,
          messages: [
            {
              id: 'safe-message',
              role: 'assistant' as const,
              body: '云端应保留',
              deliveryState: 'delivered' as const,
            },
            {
              id: 'pending-tail',
              role: 'user' as const,
              body: '尚未完成',
              deliveryState: 'pending' as const,
            },
          ],
        },
      ],
      lastConversationId: 'pending-only',
    };

    const prepared = prepareCloudSnapshot(snapshot);

    expect(prepared.moments).toEqual(snapshot.moments);
    expect(prepared.followUps).toEqual(snapshot.followUps);
    expect(prepared.conversations.map((item) => item.id)).toEqual([
      'delivered',
      'mixed',
    ]);
    expect(prepared.conversations[1]).toMatchObject({
      preview: '云端应保留',
      unread: true,
      messages: [{ id: 'safe-message' }],
    });
    expect(prepared.lastConversationId).toBeUndefined();
  });
});
