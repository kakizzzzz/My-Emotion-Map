import { act, renderHook } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { useFollowUpCoordinator } from '../../src/app/useFollowUpCoordinator';
import { FOLLOW_UP_CONVERSATION_ID } from '../../src/domain/followUps';
import type {
  Conversation,
  EmotionNote,
  FollowUpRecord,
  RevisitRecord,
} from '../../src/types';
import { getAppCopy } from '../../src/i18n';

const note: EmotionNote = {
  id: 'note-inbox',
  title: '安静角落',
  titleSource: 'user',
  place: '图书馆',
  date: '2026-08-01',
  time: '10:00',
  emotion: 'calm',
  placeRating: 'comfortable',
  answers: [],
  excerpt: '测试记录',
  followUpEnabled: true,
};
const active: FollowUpRecord = {
  id: 'follow-up-inbox',
  noteId: note.id,
  intervalDays: 3,
  dueAt: '2026-08-04T00:00:00.000Z',
  status: 'active',
  promptVersion: 2,
  followUpConsentedAt: '2026-08-01T00:00:00.000Z',
};
const companion: Conversation = {
  id: FOLLOW_UP_CONVERSATION_ID,
  title: '交流回访',
  preview: '旧预览',
  kind: 'companion',
  unread: true,
  messages: [{
    id: 'prompt-inbox',
    role: 'assistant',
    kind: 'followup_prompt',
    body: '',
    followUpId: active.id,
    noteIds: [note.id],
  }],
};

const useHarness = () => {
  const [followUps, setFollowUps] = useState<FollowUpRecord[]>([active]);
  const [conversations, setConversations] = useState<Conversation[]>([companion]);
  const [revisits, setRevisits] = useState<RevisitRecord[]>([]);
  const coordinator = useFollowUpCoordinator({
    followUps,
    setFollowUps,
    setConversations,
    setRevisits,
    notes: [note],
    activeView: 'map',
    activeConversationId: FOLLOW_UP_CONVERSATION_ID,
    language: 'zh',
    navigationCopy: getAppCopy('zh').navigation,
  });
  return { followUps, conversations, revisits, ...coordinator };
};

describe('follow-up inbox history', () => {
  it('mirrors an inbox answer into companion chat and clears its unread state', () => {
    const { result } = renderHook(useHarness);
    act(() => {
      result.current.answerFollowUp(active.id, '轻了', 'lighter', 'inbox');
    });

    const thread = result.current.conversations[0];
    expect(thread.unread).toBe(false);
    expect(thread.messages.map((message) => message.kind)).toEqual([
      'followup_prompt',
      'followup_answer',
      'followup_reply',
    ]);
    expect(thread.messages[1]).toMatchObject({
      role: 'user',
      body: '轻了',
      followUpId: active.id,
    });
    expect(result.current.followUps[0]).toMatchObject({
      status: 'answered',
      answeredVia: 'inbox',
      responseOptionId: 'lighter',
    });
  });
});
