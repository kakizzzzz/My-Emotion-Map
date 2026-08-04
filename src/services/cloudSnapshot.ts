import type { AppDataSnapshot, ChatMessage } from '../types';

const isCloudSafeMessage = (message: ChatMessage) =>
  message.deliveryState !== 'pending';

export const prepareCloudSnapshot = (
  snapshot: AppDataSnapshot,
): AppDataSnapshot => {
  const conversations = snapshot.conversations.flatMap((conversation) => {
    const messages = conversation.messages.filter(isCloudSafeMessage);
    if (messages.length === conversation.messages.length) {
      return [conversation];
    }
    if (!messages.length && conversation.kind !== 'companion') return [];
    return [{
      ...conversation,
      messages,
      preview: messages.at(-1)?.body.slice(0, 120) ?? '',
      unread: messages.length ? conversation.unread : false,
    }];
  });
  const conversationIds = new Set(
    conversations.map((conversation) => conversation.id),
  );
  return {
    ...snapshot,
    conversations,
    lastConversationId:
      snapshot.lastConversationId &&
      conversationIds.has(snapshot.lastConversationId)
        ? snapshot.lastConversationId
        : undefined,
  };
};
