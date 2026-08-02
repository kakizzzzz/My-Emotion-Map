import { useCallback, type Dispatch, type SetStateAction } from 'react';
import type {
  ChatDeliveryState,
  ClarificationOption,
  Conversation,
  ExternalEvidenceReference,
} from '../types';
import {
  completeChatRequest,
  failChatRequest,
  submitChatRequest,
} from './chatDelivery';

export type BeginChatInput = {
  conversationId: string;
  requestId: string;
  body: string;
  createdAt: string;
  referenceConfirmation?: {
    optionId: string;
    continuationToken: string;
  };
};

export type CompleteChatInput = {
  conversationId: string;
  requestId: string;
  assistantBody: string;
  noteIds: string[];
  externalEvidence?: ExternalEvidenceReference[];
  clarificationOptions: ClarificationOption[];
  createdAt: string;
};

export function useChatDeliveryHandlers({
  setConversations,
  fallbackTitle,
}: {
  setConversations: Dispatch<SetStateAction<Conversation[]>>;
  fallbackTitle: string;
}) {
  const beginChat = useCallback((input: BeginChatInput) => {
    setConversations((current) => submitChatRequest(current, {
      ...input,
      fallbackTitle,
    }));
  }, [fallbackTitle, setConversations]);

  const completeChat = useCallback((input: CompleteChatInput) => {
    setConversations((current) => completeChatRequest(current, input));
  }, [setConversations]);

  const failChat = useCallback((
    requestId: string,
    state: Extract<ChatDeliveryState, 'failed' | 'stopped'>,
  ) => {
    setConversations((current) => failChatRequest(current, requestId, state));
  }, [setConversations]);

  return { beginChat, completeChat, failChat };
}
