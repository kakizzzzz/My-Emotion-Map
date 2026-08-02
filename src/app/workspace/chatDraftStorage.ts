import type { DataMode } from '../../types';

const CHAT_DRAFT_PREFIX = 'my-emotion-map.chat-draft.v2.';

export const chatWorkspaceKey = (
  userId: string | null,
  mode: DataMode,
) => `${mode}:${userId ?? 'guest'}`;

const workspacePrefix = (workspaceKey: string) =>
  `${CHAT_DRAFT_PREFIX}${encodeURIComponent(workspaceKey)}.`;

export const chatDraftKey = (
  workspaceKey: string,
  conversationId: string,
) => `${workspacePrefix(workspaceKey)}${encodeURIComponent(conversationId)}`;

export const clearChatDraftsForWorkspace = (workspaceKey: string) => {
  try {
    const prefix = workspacePrefix(workspaceKey);
    const keys: string[] = [];
    for (let index = 0; index < window.sessionStorage.length; index += 1) {
      const key = window.sessionStorage.key(index);
      if (key?.startsWith(prefix)) keys.push(key);
    }
    keys.forEach((key) => window.sessionStorage.removeItem(key));
    return true;
  } catch {
    return false;
  }
};

export const clearLegacyChatDrafts = () => {
  try {
    const legacyPrefix = 'my-emotion-map.chat-draft.';
    const keys: string[] = [];
    for (let index = 0; index < window.sessionStorage.length; index += 1) {
      const key = window.sessionStorage.key(index);
      if (key?.startsWith(legacyPrefix) && !key.startsWith(CHAT_DRAFT_PREFIX)) {
        keys.push(key);
      }
    }
    keys.forEach((key) => window.sessionStorage.removeItem(key));
    return true;
  } catch {
    return false;
  }
};

export const clearChatDraftsForUser = (userId: string) => {
  const legacyCleared = clearLegacyChatDrafts();
  const realCleared = clearChatDraftsForWorkspace(chatWorkspaceKey(userId, 'real'));
  return legacyCleared && realCleared;
};
