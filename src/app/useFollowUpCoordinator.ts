import {
  useCallback,
  useEffect,
  type Dispatch,
  type SetStateAction,
} from 'react';
import type { AppLanguage, AppCopy } from '../i18n';
import type {
  AppView,
  ChatOption,
  Conversation,
  FollowUpRecord,
} from '../types';
import type { CommunicationSurface } from './appTypes';
import { createRecordId } from './createRecordId';
import { useFollowUpScheduler } from './useFollowUpScheduler';
import {
  FOLLOW_UP_CONVERSATION_ID,
  getFollowUpAssistantReply,
  getFollowUpOptions,
} from '../domain/followUps';

type FollowUpCoordinatorOptions = {
  followUps: FollowUpRecord[];
  setFollowUps: Dispatch<SetStateAction<FollowUpRecord[]>>;
  setConversations: Dispatch<SetStateAction<Conversation[]>>;
  activeView: AppView;
  communicationSurface: CommunicationSurface;
  activeConversationId: string;
  language: AppLanguage;
  navigationCopy: AppCopy['navigation'];
  onRequestRevisit: (noteId: string) => void;
};

export function useFollowUpCoordinator({
  followUps,
  setFollowUps,
  setConversations,
  activeView,
  communicationSurface,
  activeConversationId,
  language,
  navigationCopy,
  onRequestRevisit,
}: FollowUpCoordinatorOptions) {
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
      if (
        !companion ||
        companion.messages.some(
          (message) => message.followUpId === activeFollowUp.id,
        )
      ) {
        return current;
      }
      const isVisible =
        activeView === 'chat' &&
        communicationSurface === 'conversation' &&
        activeConversationId === FOLLOW_UP_CONVERSATION_ID;
      return current.map((conversation) =>
        conversation.id === FOLLOW_UP_CONVERSATION_ID
          ? {
              ...conversation,
              title: navigationCopy.chat,
              preview: activeFollowUp.prompt,
              unread: !isVisible,
              messages: [
                ...conversation.messages,
                {
                  id: createRecordId('follow-up'),
                  role: 'assistant',
                  body: activeFollowUp.prompt,
                  noteIds: [activeFollowUp.noteId],
                  options: getFollowUpOptions(language),
                  followUpId: activeFollowUp.id,
                  createdAt:
                    activeFollowUp.promptedAt ??
                    new Date().toISOString(),
                },
              ],
            }
          : conversation,
      );
    });
  }, [
    activeConversationId,
    activeFollowUp,
    activeView,
    communicationSurface,
    language,
    navigationCopy.chat,
    setConversations,
  ]);

  const answerFollowUp = useCallback(
    (
      followUpId: string,
      label: string,
      kind: ChatOption['responseKind'],
      source: 'chat' | 'inbox',
    ) => {
      const record = followUps.find((item) => item.id === followUpId);
      if (
        !record ||
        (record.status !== 'active' &&
          !(record.status === 'queued' && new Date(record.dueAt).getTime() <= Date.now()))
      ) return;
      const answeredAt = new Date().toISOString();
      const assistantReply = getFollowUpAssistantReply(kind, language);
      setFollowUps((current) =>
        current.map((item) =>
          item.id === followUpId
            ? {
                ...item,
                status:
                  kind === 'skip' ? 'skipped' : 'answered',
                response: label,
                responseKind: kind,
                answeredVia: source,
                answeredAt,
                assistantReply,
                seenAt: item.seenAt ?? answeredAt,
              }
            : item,
        ),
      );

      if (source === 'chat') {
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
                      body: label,
                      followUpId,
                      createdAt: answeredAt,
                    },
                    {
                      id: createRecordId('follow-up-reply'),
                      role: 'assistant',
                      body: assistantReply,
                      followUpId,
                      createdAt: answeredAt,
                    },
                  ],
                }
              : conversation,
          ),
        );
      }

      if (kind !== 'skip') {
        window.setTimeout(() => onRequestRevisit(record.noteId), 220);
      }
    },
    [
      followUps,
      language,
      onRequestRevisit,
      setConversations,
      setFollowUps,
    ],
  );

  return { activeFollowUp, answerFollowUp };
}
