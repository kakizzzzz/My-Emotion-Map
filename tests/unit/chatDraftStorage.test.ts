import { beforeEach, describe, expect, it } from 'vitest';
import {
  chatDraftKey,
  chatWorkspaceKey,
  clearChatDraftsForWorkspace,
} from '../../src/app/workspace/chatDraftStorage';

describe('chat draft workspace isolation', () => {
  beforeEach(() => window.sessionStorage.clear());

  it('separates accounts, Demo, and real workspaces', () => {
    const realA = chatWorkspaceKey('user-a', 'real');
    const realB = chatWorkspaceKey('user-b', 'real');
    const demoA = chatWorkspaceKey('user-a', 'demo');
    expect(chatDraftKey(realA, 'thread-revisit')).not.toBe(
      chatDraftKey(realB, 'thread-revisit'),
    );
    expect(chatDraftKey(realA, 'thread-revisit')).not.toBe(
      chatDraftKey(demoA, 'thread-revisit'),
    );
  });

  it('clears only the selected workspace drafts', () => {
    const realA = chatWorkspaceKey('user-a', 'real');
    const realB = chatWorkspaceKey('user-b', 'real');
    sessionStorage.setItem(chatDraftKey(realA, 'one'), 'A');
    sessionStorage.setItem(chatDraftKey(realB, 'one'), 'B');

    clearChatDraftsForWorkspace(realA);

    expect(sessionStorage.getItem(chatDraftKey(realA, 'one'))).toBeNull();
    expect(sessionStorage.getItem(chatDraftKey(realB, 'one'))).toBe('B');
  });
});
