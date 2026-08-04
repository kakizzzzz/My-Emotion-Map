import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AppLanguageContext, getAppCopy } from '../../src/i18n';
import { ChatScreen } from '../../src/features/chat/ChatScreen';
import { NoteViewSheet } from '../../src/features/notes/NoteViewSheet';
import type {
  Conversation,
  EmotionMoment,
  EmotionNote,
  FollowUpRecord,
} from '../../src/types';

const languageValue = {
  language: 'zh' as const,
  copy: getAppCopy('zh'),
  locale: 'zh-CN',
  speechLocale: 'zh-CN',
  setLanguage: vi.fn(),
};
const renderZh = (node: ReactNode) => render(
  <AppLanguageContext.Provider value={languageValue}>
    {node}
  </AppLanguageContext.Provider>,
);
const note: EmotionNote = {
  id: 'note-one',
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
const makeFollowUp = (
  id: string,
  intervalDays: number,
  answeredAt: string,
): FollowUpRecord => ({
  id,
  noteId: note.id,
  intervalDays,
  dueAt: answeredAt,
  status: 'answered',
  promptVersion: 2,
  followUpConsentedAt: '2026-08-01T00:00:00.000Z',
  responseOptionId: 'lighter',
  response: '轻了',
  answeredAt,
  answeredVia: 'chat',
  assistantReply: '这次回看已经追加保存。',
});

describe('follow-up rendering and targeting', () => {
  it('records the current feeling against the exact follow-up reply that was tapped', () => {
    const onRevisitEmotion = vi.fn();
    const oldFollowUp = makeFollowUp(
      'follow-old',
      3,
      '2026-08-04T00:00:00.000Z',
    );
    const newFollowUp = makeFollowUp(
      'follow-new',
      7,
      '2026-08-08T00:00:00.000Z',
    );
    const conversation: Conversation = {
      id: 'thread-revisit',
      title: '交流回访',
      preview: '',
      kind: 'companion',
      messages: [
        {
          id: 'reply-old',
          role: 'assistant',
          kind: 'followup_reply',
          body: '',
          followUpId: oldFollowUp.id,
        },
        {
          id: 'reply-new',
          role: 'assistant',
          kind: 'followup_reply',
          body: '',
          followUpId: newFollowUp.id,
        },
      ],
    };
    renderZh(
      <ChatScreen
        notes={[note]}
        followUps={[oldFollowUp, newFollowUp]}
        conversations={[conversation]}
        activeConversationId={conversation.id}
        workspaceKey="test-follow-up-target"
        onAnswerFollowUp={vi.fn()}
        onRevisitEmotion={onRevisitEmotion}
        cloudAuth={null}
        cloudRevision={null}
        cloudStatus="signed_out"
        onBeginChat={vi.fn()}
        onCompleteChat={vi.fn()}
        onFailChat={vi.fn()}
        onNewConversation={vi.fn()}
        onRenameConversation={vi.fn()}
        onExitToMap={vi.fn()}
        onToast={vi.fn()}
      />,
    );
    fireEvent.click(
      screen.getAllByRole('button', { name: '记录现在的感受' })[0],
    );
    expect(onRevisitEmotion).toHaveBeenCalledWith(note.id, oldFollowUp.id);
  });

  it('shows the generated v2 follow-up prompt in record history', () => {
    const followUp = makeFollowUp(
      'follow-history',
      3,
      '2026-08-04T00:00:00.000Z',
    );
    const moment: EmotionMoment = {
      id: 'moment-one',
      noteId: note.id,
      emotion: 'calm',
      intensity: 1,
      place: note.place,
      date: note.date,
      time: note.time,
      latitude: 37.558,
      longitude: 126.998,
      placeRating: note.placeRating,
    };
    renderZh(
      <NoteViewSheet
        moment={moment}
        note={note}
        followUps={[followUp]}
        revisits={[]}
        onClose={vi.fn()}
        onEdit={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '回访记录' }));
    expect(
      screen.getByText('现在回看“安静角落”，感觉有变化吗？'),
    ).toBeInTheDocument();
  });
});
