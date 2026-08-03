import type {
  ChatDeliveryState,
  ClarificationOption,
  Conversation,
  ExternalEvidenceReference,
  McpCallReference,
} from '../types';
import { FOLLOW_UP_CONVERSATION_ID } from '../domain/followUps';
import { createRecordId } from './createRecordId';

type SubmitChatRequest = {
  conversationId: string;
  requestId: string;
  body: string;
  fallbackTitle: string;
  createdAt: string;
  referenceConfirmation?: {
    optionId: string;
    continuationToken: string;
  };
};

export const submitChatRequest = (
  conversations: Conversation[],
  input: SubmitChatRequest,
): Conversation[] => {
  const retryConversation = conversations.find((conversation) =>
    conversation.messages.some((message) => message.requestId === input.requestId)
  );
  if (retryConversation) {
    return conversations.map((conversation) =>
      conversation.id === retryConversation.id
        ? {
            ...conversation,
            messages: conversation.messages.map((message) =>
              message.requestId === input.requestId
                ? { ...message, deliveryState: 'pending' as const }
                : message,
            ),
          }
        : conversation,
    );
  }
  const userMessage = {
    id: input.requestId,
    role: 'user' as const,
    kind: 'message' as const,
    body: input.body,
    requestId: input.requestId,
    deliveryState: 'pending' as const,
    referenceConfirmation: input.referenceConfirmation,
    createdAt: input.createdAt,
  };
  if (conversations.some((conversation) => conversation.id === input.conversationId)) {
    return conversations.map((conversation) =>
      conversation.id === input.conversationId
        ? {
            ...conversation,
            preview: input.body.slice(0, 120),
            messages: [...conversation.messages, userMessage],
          }
        : conversation,
    );
  }
  const firstLine = input.body.split(/\r?\n/, 1)[0]?.trim() ?? '';
  const created: Conversation = {
    id: input.conversationId,
    title: firstLine.slice(0, 42) || input.fallbackTitle,
    preview: input.body.slice(0, 120),
    kind: 'regular',
    messages: [userMessage],
  };
  const companion = conversations.find(
    (conversation) => conversation.id === FOLLOW_UP_CONVERSATION_ID,
  );
  return companion
    ? [
        companion,
        created,
        ...conversations.filter((conversation) => conversation !== companion),
      ]
    : [created, ...conversations];
};

export const failChatRequest = (
  conversations: Conversation[],
  requestId: string,
  deliveryState: Extract<ChatDeliveryState, 'failed' | 'stopped'>,
): Conversation[] => conversations.map((conversation) => ({
  ...conversation,
  messages: conversation.messages.map((message) =>
    message.requestId === requestId
      ? { ...message, deliveryState }
      : message,
  ),
}));

export const completeChatRequest = (
  conversations: Conversation[],
  input: {
    conversationId: string;
    requestId: string;
    assistantBody: string;
    noteIds: string[];
    externalEvidence?: ExternalEvidenceReference[];
    mcpCalls?: McpCallReference[];
    clarificationOptions: ClarificationOption[];
    retryable?: boolean;
    createdAt: string;
  },
): Conversation[] => conversations.map((conversation) => {
  if (conversation.id !== input.conversationId) return conversation;
  const requestExists = conversation.messages.some(
    (message) => message.requestId === input.requestId,
  );
  if (!requestExists) return conversation;
  const alreadyDelivered = conversation.messages.some(
    (message) => message.replyToRequestId === input.requestId,
  );
  const messages = conversation.messages.map((message) =>
    message.requestId === input.requestId
      ? { ...message, deliveryState: 'delivered' as const }
      : message,
  );
  if (alreadyDelivered) return { ...conversation, messages };
  return {
    ...conversation,
    preview: input.assistantBody.slice(0, 120),
    messages: [
      ...messages,
      {
        id: createRecordId('message'),
        role: 'assistant',
        kind: input.clarificationOptions.length ? 'clarification' : 'message',
        body: input.assistantBody,
        noteIds: input.noteIds,
        externalEvidence: input.externalEvidence?.slice(0, 6),
        mcpCalls: input.mcpCalls?.slice(0, 2),
        clarificationOptions: input.clarificationOptions.slice(0, 3),
        retryable: input.retryable === true,
        replyToRequestId: input.requestId,
        createdAt: input.createdAt,
      },
    ],
  };
});
