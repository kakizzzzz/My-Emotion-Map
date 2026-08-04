import {
  useCallback,
  useEffect,
  useRef,
  type Dispatch,
  type SetStateAction,
} from 'react';
import type { AppLanguage, AppCopy } from '../i18n';
import type {
  AppView,
  ChatOption,
  Conversation,
  EmotionNote,
  FollowUpRecord,
  RevisitRecord,
} from '../types';
import { createRecordId } from './createRecordId';
import { useFollowUpScheduler } from './useFollowUpScheduler';
import {
  FOLLOW_UP_CONVERSATION_ID,
  getFollowUpAssistantReply,
  getFollowUpPrompt,
} from '../domain/followUps';
import { upsertFollowUpRevisit } from './recordAssociations';

type FollowUpCoordinatorOptions = {
  followUps: FollowUpRecord[];
  setFollowUps: Dispatch<SetStateAction<FollowUpRecord[]>>;
  setConversations: Dispatch<SetStateAction<Conversation[]>>;
  setRevisits: Dispatch<SetStateAction<RevisitRecord[]>>;
  notes: EmotionNote[];
  activeView: AppView;
  activeConversationId: string;
  language: AppLanguage;
  navigationCopy: AppCopy['navigation'];
};

export function useFollowUpCoordinator({
  followUps,
  setFollowUps,
  setConversations,
  setRevisits,
  notes,
  activeView,
  activeConversationId,
  language,
  navigationCopy,
}: FollowUpCoordinatorOptions) {
  const answeringRef = useRef(new Set<string>());
  const activeFollowUp =
    followUps.find((record) => record.status === 'active') ?? null;
  useFollowUpScheduler(followUps, setFollowUps);

  useEffect(() => {
    if (!activeFollowUp) return;
    setConversations((current) => {
      const companion = current.find(
        (conversation) =>
          conversation.id === FOLLOW_UP_CONVERSATION_ID,
      );
      if (companion?.messages.some(
        (message) => message.followUpId === activeFollowUp.id,
      )) {
        return current;
      }
      const isVisible =
        activeView === 'chat' &&
        activeConversationId === FOLLOW_UP_CONVERSATION_ID;
      const note = notes.find((item) => item.id === activeFollowUp.noteId);
      if (!note) return current;
      const prompt = getFollowUpPrompt(activeFollowUp, note, language);
      const followUpMessage = {
        id: createRecordId('follow-up'),
        role: 'assistant' as const,
        body: '',
        kind: 'followup_prompt' as const,
        noteIds: [activeFollowUp.noteId],
        followUpId: activeFollowUp.id,
        createdAt:
          activeFollowUp.promptedAt ?? new Date().toISOString(),
      };
      if (!companion) {
        return [
          {
            id: FOLLOW_UP_CONVERSATION_ID,
            title: navigationCopy.chat,
            preview: prompt,
            kind: 'companion' as const,
            unread: !isVisible,
            messages: [followUpMessage],
          },
          ...current,
        ];
      }
      return current.map((conversation) =>
        conversation.id === FOLLOW_UP_CONVERSATION_ID
          ? {
              ...conversation,
              title: navigationCopy.chat,
              preview: prompt,
              unread: !isVisible,
              messages: [
                ...conversation.messages,
                followUpMessage,
              ],
            }
          : conversation,
      );
    });
  }, [
    activeConversationId,
    activeFollowUp,
    activeView,
    language,
    navigationCopy.chat,
    notes,
    setConversations,
  ]);

  const answerFollowUp = useCallback(
    (
      followUpId: string,
      label: string,
      kind: ChatOption['responseKind'],
      source: 'chat' | 'inbox' = 'chat',
    ) => {
      if (answeringRef.current.has(followUpId)) return;
      const record = followUps.find((item) => item.id === followUpId);
      if (
        !record ||
        (record.status !== 'active' &&
          !(record.status === 'queued' && new Date(record.dueAt).getTime() <= Date.now()))
      ) return;
      answeringRef.current.add(followUpId);
      const answeredAt = new Date().toISOString();
      const assistantReply = getFollowUpAssistantReply(kind, language);
      const answerCommandId = createRecordId('follow-up-command');
      setFollowUps((current) =>
        current.map((item) =>
          item.id === followUpId
            ? {
                ...item,
                status:
                  kind === 'skip' ? 'skipped' : 'answered',
                response: label,
                responseKind: kind,
                responseOptionId: kind,
                answerCommandId,
                answeredAt,
                answeredVia: source,
                assistantReply,
                seenAt: item.seenAt ?? answeredAt,
              }
            : item,
        ),
      );
      const note = notes.find((item) => item.id === record.noteId);
      if (kind !== 'skip' && note) {
        setRevisits((current) => upsertFollowUpRevisit(
          current,
          note,
          followUpId,
          kind,
          answeredAt,
        ));
      }

      setConversations((current) =>
        current.map((conversation) =>
          conversation.id === FOLLOW_UP_CONVERSATION_ID
            ? {
                ...conversation,
                unread: false,
                preview: assistantReply,
                messages: [
                  ...conversation.messages.map((message) =>
                    message.followUpId === followUpId
                      ? { ...message, options: undefined }
                      : message,
                  ),
                  {
                    id: createRecordId('follow-up-response'),
                    role: 'user',
                    kind: 'followup_answer',
                    body: label,
                    followUpId,
                    createdAt: answeredAt,
                  },
                  {
                    id: createRecordId('follow-up-reply'),
                    role: 'assistant',
                    kind: 'followup_reply',
                    body: assistantReply,
                    followUpId,
                    createdAt: answeredAt,
                  },
                ],
              }
            : conversation,
        ),
      );
    },
    [
      followUps,
      language,
      notes,
      setConversations,
      setFollowUps,
      setRevisits,
    ],
  );

  return { activeFollowUp, answerFollowUp };
}
