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
  id: 'note-routing',
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
const chatFollowUp: FollowUpRecord = {
  id: 'follow-up-chat',
  noteId: note.id,
  intervalDays: 3,
  dueAt: '2026-08-04T00:00:00.000Z',
  status: 'active',
  promptedAt: '2026-08-04T00:00:00.000Z',
  promptVersion: 2,
};
const inboxFollowUp: FollowUpRecord = {
  id: 'follow-up-inbox',
  noteId: note.id,
  intervalDays: 7,
  dueAt: '2026-08-04T00:00:00.000Z',
  status: 'queued',
  promptedAt: '2026-08-04T00:00:01.000Z',
  promptVersion: 2,
};
const companion: Conversation = {
  id: FOLLOW_UP_CONVERSATION_ID,
  title: '交流回访',
  preview: '当前聊天回访',
  kind: 'companion',
  unread: true,
  messages: [{
    id: 'prompt-chat',
    role: 'assistant',
    kind: 'followup_prompt',
    body: '',
    followUpId: chatFollowUp.id,
    noteIds: [note.id],
  }],
};

const useHarness = () => {
  const [followUps, setFollowUps] = useState<FollowUpRecord[]>([
    chatFollowUp,
    inboxFollowUp,
  ]);
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

describe('follow-up chat and inbox history isolation', () => {
  it('keeps an inbox answer out of companion chat', () => {
    const { result } = renderHook(useHarness);
    act(() => {
      result.current.answerFollowUp(
        inboxFollowUp.id,
        '轻了',
        'lighter',
        'inbox',
      );
    });

    expect(result.current.conversations[0].messages).toEqual(
      companion.messages,
    );
    expect(result.current.followUps.find(
      (record) => record.id === inboxFollowUp.id,
    )).toMatchObject({
      status: 'answered',
      answeredVia: 'inbox',
      responseOptionId: 'lighter',
    });
  });

  it('writes only the chat-slot answer into companion history', () => {
    const { result } = renderHook(useHarness);
    act(() => {
      result.current.answerFollowUp(
        chatFollowUp.id,
        '一样',
        'same',
        'chat',
      );
    });

    const thread = result.current.conversations[0];
    expect(thread.messages.map((message) => message.kind)).toEqual([
      'followup_prompt',
      'followup_answer',
      'followup_reply',
    ]);
    expect(thread.messages.some(
      (message) => message.followUpId === inboxFollowUp.id,
    )).toBe(false);
    expect(result.current.followUps.find(
      (record) => record.id === inboxFollowUp.id,
    )).toMatchObject({ status: 'queued' });
  });
});
