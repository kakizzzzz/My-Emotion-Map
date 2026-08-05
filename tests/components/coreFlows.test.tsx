import { useState } from 'react';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_THEME } from '../../src/app/themePreferences';
import {
  CalendarScreen,
  getCalendarPairAnchor,
} from '../../src/features/calendar/CalendarScreen';
import { ChatScreen } from '../../src/features/chat/ChatScreen';
import { LoginScreen } from '../../src/features/auth/LoginScreen';
import { NoteEditorSheet } from '../../src/features/notes/NoteEditorSheet';
import { NoteViewSheet } from '../../src/features/notes/NoteViewSheet';
import { SettingsScreen } from '../../src/features/settings/SettingsScreen';
import { AiSettingsPanel } from '../../src/features/settings/AiSettingsPanel';
import { EmotionMapMcpPanel } from '../../src/features/settings/EmotionMapMcpPanel';
import type { Conversation, EmotionMoment, EmotionNote } from '../../src/types';
import { renderWithLanguage } from '../renderWithLanguage';
import { createGuidedAnswers } from '../../src/domain/notePrompts';
import type { PhotoAssistDelivery } from '../../src/app/appTypes';
import { SideDrawer } from '../../src/app/AppChrome';
import { StarInboxScreen } from '../../src/features/inbox/StarInboxScreen';
import { useChatDeliveryHandlers } from '../../src/app/useChatDeliveryHandlers';
import { ACCOUNT_PREFERENCES_CHANGED_EVENT } from '../../src/app/profilePreferences';

const draftNote: EmotionNote = {
  id: 'note-new',
  title: '',
  titleSource: 'fallback',
  place: 'Selected location',
  date: '2026-07-28',
  time: '14:20',
  emotion: null,
  placeRating: null,
  answers: createGuidedAnswers('zh'),
  excerpt: '',
  isDraft: true,
};

const draftMoment: EmotionMoment = {
  id: 'moment-new',
  noteId: draftNote.id,
  emotion: null,
  intensity: 0,
  place: draftNote.place,
  date: draftNote.date,
  time: draftNote.time,
  latitude: 37.55,
  longitude: 126.95,
  placeRating: null,
  isNew: true,
  source: 'manual',
};

const PhotoAssistHarness = () => {
  const [delivery, setDelivery] = useState<PhotoAssistDelivery | null>(null);
  return (
    <>
      <button
        type="button"
        onClick={() => setDelivery({
          requestId: 'late-photo-result',
          result: {
            titleSuggestion: '模型生成的标题',
            optionalQuestions: ['画面中似乎有一张桌子，实际情况是怎样的？'],
          },
        })}
      >
        模拟晚到结果
      </button>
      <NoteEditorSheet
        moment={{ ...draftMoment, source: 'photo' }}
        note={draftNote}
        onSave={() => undefined}
        onClose={() => undefined}
        onToast={() => undefined}
        photoAssistDelivery={delivery}
      />
    </>
  );
};

const McpChatHarness = () => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const { beginChat, completeChat, failChat } = useChatDeliveryHandlers({
    setConversations,
    fallbackTitle: '新的对话',
  });
  return (
    <ChatScreen
      notes={[]}
      followUps={[]}
      conversations={conversations}
      activeConversationId="mcp-thread"
      workspaceKey="real:user-a"
      onAnswerFollowUp={vi.fn()}
      onRevisitEmotion={vi.fn()}
      cloudAuth={{
        supabaseUrl: 'https://example.supabase.co',
        publishableKey: 'public-key',
        accessToken: 'access-token',
        userId: 'user-a',
      }}
      cloudRevision={7}
      cloudStatus="synced"
      onBeginChat={beginChat}
      onCompleteChat={completeChat}
      onFailChat={failChat}
      onNewConversation={vi.fn()}
      onExitToMap={vi.fn()}
      onToast={vi.fn()}
    />
  );
};

const dispatchWizardSwipe = (
  startTarget: Element,
  viewport: HTMLElement,
  direction: 'next' | 'previous',
) => {
  Object.defineProperty(viewport, 'clientWidth', {
    configurable: true,
    value: 360,
  });
  const startX = direction === 'next' ? 280 : 80;
  const endX = direction === 'next' ? 80 : 280;
  const pointer = {
    pointerId: 17,
    pointerType: 'touch',
    button: 0,
    clientY: 180,
  };
  fireEvent.pointerDown(startTarget, { ...pointer, clientX: startX });
  fireEvent.pointerMove(viewport, { ...pointer, clientX: endX });
  fireEvent.pointerUp(viewport, { ...pointer, clientX: endX });
};

const swipeWizard = (direction: 'next' | 'previous') => {
  const viewport = document.querySelector<HTMLElement>(
    '.note-wizard-viewport',
  );
  if (!viewport) throw new Error('Wizard viewport was not rendered.');
  dispatchWizardSwipe(viewport, viewport, direction);
};

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  window.sessionStorage.clear();
  vi.unstubAllGlobals();
});

describe('core component flows', () => {
  it('creates and saves a star through the three editor steps', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    renderWithLanguage(
      <NoteEditorSheet
        moment={draftMoment}
        note={draftNote}
        onSave={onSave}
        onClose={() => undefined}
        onToast={() => undefined}
      />,
    );

    await user.type(
      screen.getByRole('textbox', { name: '给这一刻起个名字' }),
      '图书馆下午',
    );
    await user.click(screen.getByRole('button', { name: '平静' }));
    await screen.findByRole('heading', {
      name: '这个地方给你的感觉',
    });
    await user.click(screen.getByTitle('很安心'));
    expect(
      screen.queryByRole('button', { name: '继续到引导问题' }),
    ).toBeNull();
    swipeWizard('next');
    await screen.findByRole('heading', { name: '你去这做什么？' });
    await user.click(screen.getByRole('button', { name: '跳过问答' }));
    await user.click(await screen.findByRole('button', { name: '点击保存' }));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][1]).toMatchObject({
      title: '图书馆下午',
      isDraft: false,
    });
    expect(onSave.mock.calls[0][2]).toBe('calm');
    expect(onSave.mock.calls[0][3]).toBe('safe');
  }, 10_000);

  it('removes an attached image in edit mode and hides image removal in preview mode', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const image = {
      provider: 'supabase' as const,
      bucket: 'emotion-note-images' as const,
      path: '00000000-0000-4000-8000-000000000001/notes/note-new/image-1.jpg',
      mimeType: 'image/jpeg' as const,
      size: 120_000,
      width: 900,
      height: 1200,
      createdAt: 1_786_000_000_000,
    };
    const existingMoment = {
      ...draftMoment,
      isNew: false,
      emotion: 'calm' as const,
      placeRating: 'safe' as const,
    };
    const existingNote = {
      ...draftNote,
      isDraft: false,
      emotion: 'calm' as const,
      placeRating: 'safe' as const,
      image,
    };
    const rendered = renderWithLanguage(
      <NoteEditorSheet
        moment={existingMoment}
        note={existingNote}
        onSave={onSave}
        onClose={() => undefined}
        onToast={() => undefined}
      />,
    );

    await user.click(screen.getByRole('button', { name: '平静' }));
    await screen.findByRole('heading', { name: '这个地方给你的感觉' });
    expect(screen.getByRole('button', { name: '移除图片' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: '移除图片' }));
    await user.click(screen.getByRole('button', { name: '关闭' }));
    await user.click(screen.getByRole('button', { name: '保存' }));
    expect(onSave.mock.calls[0][1].image).toBeUndefined();

    rendered.unmount();
    renderWithLanguage(
      <NoteViewSheet
        moment={existingMoment}
        note={existingNote}
        followUps={[]}
        revisits={[]}
        onClose={() => undefined}
        onEdit={() => undefined}
      />,
    );
    expect(screen.getByRole('img', { name: '这条星星记录的图片' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '移除图片' })).toBeNull();
  });

  it('swipes from a star without converting the gesture into a click', () => {
    renderWithLanguage(
      <NoteEditorSheet
        moment={draftMoment}
        note={draftNote}
        onSave={() => undefined}
        onClose={() => undefined}
        onToast={() => undefined}
      />,
    );
    const viewport = document.querySelector<HTMLElement>(
      '.note-wizard-viewport',
    );
    if (!viewport) throw new Error('Wizard viewport was not rendered.');
    const calm = screen.getByRole('button', { name: '平静' });
    dispatchWizardSwipe(calm, viewport, 'next');
    fireEvent.click(calm);
    expect(
      screen.getByRole('heading', { name: '这个地方给你的感觉' }),
    ).toBeInTheDocument();
    expect(calm).not.toHaveClass('is-selected');
  });

  it('changes pages with a fine-pointer wheel gesture', () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({
      matches: true,
      media: '(hover: hover) and (pointer: fine)',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })));
    renderWithLanguage(
      <NoteEditorSheet
        moment={draftMoment}
        note={draftNote}
        onSave={() => undefined}
        onClose={() => undefined}
        onToast={() => undefined}
      />,
    );
    const viewport = document.querySelector<HTMLElement>(
      '.note-wizard-viewport',
    );
    if (!viewport) throw new Error('Wizard viewport was not rendered.');
    fireEvent.wheel(viewport, { deltaY: 80, deltaMode: 0 });
    expect(
      screen.getByRole('heading', { name: '这个地方给你的感觉' }),
    ).toBeInTheDocument();
  });

  it('uses delete instead of a second skip control for optional questions', async () => {
    const user = userEvent.setup();
    renderWithLanguage(
      <NoteEditorSheet
        moment={draftMoment}
        note={draftNote}
        onSave={() => undefined}
        onClose={() => undefined}
        onToast={() => undefined}
      />,
    );

    await user.click(screen.getByRole('button', { name: '平静' }));
    await screen.findByRole('heading', {
      name: '这个地方给你的感觉',
    });
    await user.click(screen.getByTitle('很安心'));
    expect(
      screen.queryByRole('button', { name: '继续到引导问题' }),
    ).toBeNull();
    const followUpChoice = screen.getByRole('button', {
      name: '愿意不定期后续回访',
    });
    expect(followUpChoice).toBeVisible();
    expect(followUpChoice.closest('.place-rating-section')).not.toBeNull();
    swipeWizard('next');
    expect(screen.getByRole('button', { name: '跳过问答' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: '跳过这个问题' }));
    await screen.findByRole('heading', { name: '这里有什么让你注意到的？' });
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: '跳过问答' })).toBeNull();
      expect(screen.getByRole('button', { name: '删除当前问题' })).toBeVisible();
    });
    await user.click(screen.getByRole('button', { name: '跳过这个问题' }));
    await screen.findByRole('heading', { name: '你想为以后留下什么？' });
    const addButton = await screen.findByRole('button', { name: '新增问题' });
    const deleteButton = screen.getByRole('button', { name: '删除当前问题' });
    expect(deleteButton.closest('.prompt-center-actions')).toBe(
      addButton.closest('.prompt-center-actions'),
    );
  });

  it('discards dirty edits to an existing record without saving', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const onClose = vi.fn();
    renderWithLanguage(
      <NoteEditorSheet
        moment={{ ...draftMoment, isNew: false, emotion: 'mixed', placeRating: 'neutral' }}
        note={{ ...draftNote, isDraft: false, emotion: 'mixed', placeRating: 'neutral' }}
        onSave={onSave}
        onClose={onClose}
        onToast={() => undefined}
      />,
    );

    await user.type(
      screen.getByRole('textbox', { name: '给这一刻起个名字' }),
      '未保存',
    );
    await user.click(
      screen.getByRole('button', { name: '关闭' }),
    );
    await user.click(screen.getByRole('button', { name: '退出' }));
    expect(onSave).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('exits an untouched new draft without deleting its star', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const onClose = vi.fn();
    renderWithLanguage(
      <NoteEditorSheet
        moment={draftMoment}
        note={draftNote}
        onSave={onSave}
        onClose={onClose}
        onToast={() => undefined}
      />,
    );

    await user.click(
      screen.getByRole('button', { name: '关闭' }),
    );
    await user.click(screen.getByRole('button', { name: '退出' }));

    expect(onSave).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('saves a partially completed new record when explicitly selected', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    renderWithLanguage(
      <NoteEditorSheet
        moment={draftMoment}
        note={draftNote}
        onSave={onSave}
        onClose={vi.fn()}
        onToast={() => undefined}
      />,
    );

    await user.type(
      screen.getByRole('textbox', { name: '给这一刻起个名字' }),
      '还没写完',
    );
    await user.click(screen.getByRole('button', { name: '关闭' }));
    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][1]).toMatchObject({
      title: '还没写完',
      isDraft: false,
    });
  });

  it('saves dirty existing edits exactly once when explicitly selected', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    renderWithLanguage(
      <NoteEditorSheet
        moment={{ ...draftMoment, isNew: false }}
        note={{ ...draftNote, isDraft: false }}
        onSave={onSave}
        onClose={vi.fn()}
        onToast={() => undefined}
      />,
    );

    await user.type(
      screen.getByRole('textbox', { name: '给这一刻起个名字' }),
      '保存这次',
    );
    await user.click(screen.getByRole('button', { name: '关闭' }));
    await user.click(screen.getByRole('button', { name: '保存' }));
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('routes Escape and the editor backdrop through the same exit choices', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    renderWithLanguage(
      <NoteEditorSheet
        moment={{ ...draftMoment, isNew: false }}
        note={{ ...draftNote, isDraft: false }}
        onSave={onSave}
        onClose={vi.fn()}
        onToast={() => undefined}
      />,
    );
    await user.type(
      screen.getByRole('textbox', { name: '给这一刻起个名字' }),
      '暂存中的修改',
    );

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: '返回' }));

    const backdrop = document.querySelector('.note-editor-overlay');
    expect(backdrop).not.toBeNull();
    fireEvent.mouseDown(backdrop as Element);
    expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('does not let a late photo-assist result overwrite a user-edited title', async () => {
    const user = userEvent.setup();
    renderWithLanguage(<PhotoAssistHarness />);

    const titleInput = screen.getByRole('textbox', { name: '给这一刻起个名字' });
    await user.type(titleInput, '我自己写的标题');
    await user.click(screen.getByRole('button', { name: '模拟晚到结果' }));

    expect(titleInput).toHaveValue('我自己写的标题');
    expect(titleInput).not.toHaveValue('模型生成的标题');
  });

  it.each([
    ['zh', '关闭'],
    ['en', 'Close'],
    ['ko', '닫기'],
  ] as const)('localizes icon-button names in %s', (language, closeLabel) => {
    renderWithLanguage(
      <CalendarScreen
        notes={[]}
        onOpenNote={() => undefined}
        onClose={() => undefined}
      />,
      language,
    );
    expect(
      screen.getByRole('button', { name: closeLabel }),
    ).toBeInTheDocument();
  });

  it('anchors every calendar page to a fixed two-month pair', () => {
    expect(getCalendarPairAnchor(new Date(2026, 0, 18, 12))).toEqual({
      year: 2026,
      month: 0,
    });
    expect(getCalendarPairAnchor(new Date(2026, 1, 18, 12))).toEqual({
      year: 2026,
      month: 0,
    });
    expect(getCalendarPairAnchor(new Date(2026, 2, 18, 12))).toEqual({
      year: 2026,
      month: 2,
    });
    expect(getCalendarPairAnchor(new Date(2026, 11, 18, 12))).toEqual({
      year: 2026,
      month: 10,
    });
  });

  it('uses account and password login without exposing an email field', async () => {
    const user = userEvent.setup();
    const onAuthenticate = vi.fn().mockResolvedValue('signed_in');
    renderWithLanguage(
      <LoginScreen
        ready
        configured
        onAuthenticate={onAuthenticate}
      />,
    );

    expect(screen.queryByLabelText('邮箱')).not.toBeInTheDocument();
    expect(document.querySelector('.login-map-background svg')).toBeInTheDocument();
    expect(document.querySelector('.login-world-map-dot')).not.toBeInTheDocument();
    expect(
      document.querySelectorAll('.login-water-contour[data-water-group="flow"]'),
    ).toHaveLength(5);
    await user.type(screen.getByLabelText('账号'), 'student_01');
    await user.type(screen.getByLabelText('密码'), 'safe-pass-123');
    await user.click(screen.getByRole('button', { name: '登录' }));

    expect(onAuthenticate).toHaveBeenCalledWith(
      'login',
      'student_01',
      'safe-pass-123',
      '',
    );
  });

  it('does not expose a Demo bypass from the account login screen', () => {
    renderWithLanguage(
      <LoginScreen
        ready
        configured
        onAuthenticate={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: '预览演示' })).toBeNull();
    expect(screen.queryByRole('dialog', { name: '进入演示？' })).toBeNull();
  });

  it('closes settings through a discoverable button', async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    const onPreferenceChange = vi.fn();
    window.addEventListener(
      ACCOUNT_PREFERENCES_CHANGED_EVENT,
      onPreferenceChange,
    );
    window.localStorage.setItem(
      'my-emotion-map.user-preferences.00000000-0000-4000-8000-000000000001.v2',
      JSON.stringify({ profileName: 'student_01' }),
    );
    renderWithLanguage(
      <SettingsScreen
        themeTone="original"
        themePalette={DEFAULT_THEME}
        onThemeTone={() => undefined}
        onThemeColor={() => undefined}
        followUpIntervals={[3, 7, 14, 30]}
        onFollowUpIntervals={() => undefined}
        onExportData={() => undefined}
        locationRequestState="idle"
        onRequestLocation={() => undefined}
        onToast={() => undefined}
        cloudConfigured
        cloudUserId="00000000-0000-4000-8000-000000000001"
        cloudAccount="student_01"
        cloudStatus="synced"
        onSignOut={async () => undefined}
        onUpdatePassword={async () => 'success'}
        onConfirmInitialUpload={() => undefined}
        onUseRemoteVersion={() => undefined}
        onOverwriteRemote={() => undefined}
        onIssueMcpToken={async () => null}
        onGetMcpOutputStatus={async () => null}
        onRevokeAllMcpTokens={async () => true}
        onConnectMyLifeMemory={async () => null}
        onTestMyLifeMemory={async () => null}
        onGetMyLifeMemoryStatus={async () => ({
          state: 'disconnected', serverVersion: null, protocolVersion: null,
          manifestHash: null, connectedAt: null, lastTestAt: null,
          lastErrorCode: null,
        })}
        onDisconnectMyLifeMemory={async () => ({
          state: 'disconnected', serverVersion: null, protocolVersion: null,
          manifestHash: null, connectedAt: null, lastTestAt: null,
          lastErrorCode: null,
        })}
        onListMcpProposals={async () => []}
        onResolveMcpProposal={async () => true}
        onBack={onBack}
      />,
    );

    expect(screen.getByRole('heading', { name: 'student_01' })).toBeInTheDocument();
    expect(screen.getByText('ID:student_01')).toBeInTheDocument();
    expect(onPreferenceChange).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: '修改信息' }));
    expect(document.querySelector('.profile-account-id-row')).toBeNull();
    const profileNameInput = screen.getByRole('textbox', { name: '用户姓名' });
    expect(profileNameInput).toHaveValue('student_01');
    await user.clear(profileNameInput);
    await user.type(profileNameInput, 'Kaki');
    await waitFor(() => {
      expect(onPreferenceChange).toHaveBeenCalled();
    });
    await user.click(screen.getByRole('button', { name: '返回' }));
    await waitFor(() => {
      expect(screen.queryByRole('textbox', { name: '用户姓名' })).toBeNull();
    });
    await user.click(screen.getByRole('button', { name: '关闭' }));
    expect(onBack).toHaveBeenCalledTimes(1);
    window.removeEventListener(
      ACCOUNT_PREFERENCES_CHANGED_EVENT,
      onPreferenceChange,
    );
  });

  it('keeps My Life Memory and Emotion Map MCP credentials separate', async () => {
    const user = userEvent.setup();
    const onIssueToken = vi.fn(async () => ({
      token: 'output-access-once',
      expiresAt: '2026-08-03T00:00:00.000Z',
    }));
    const onConnectMyLifeMemory = vi.fn(async () => ({
      state: 'connected' as const,
      serverVersion: '2.0.0', protocolVersion: '2025-03-26',
      manifestHash: 'a'.repeat(64),
      connectedAt: '2026-08-02T00:00:00.000Z',
      lastTestAt: '2026-08-02T00:00:00.000Z', lastErrorCode: null,
    }));
    const commonAiProps = {
      userPrompt: '',
      contextMessageCount: 8,
      onUserPrompt: () => undefined,
      onContextMessageCount: () => undefined,
      onPanel: () => undefined,
      onConnectMyLifeMemory,
      onTestMyLifeMemory: async () => null,
      onGetMyLifeMemoryStatus: async () => ({
        state: 'disconnected' as const, serverVersion: null, protocolVersion: null,
        manifestHash: null, connectedAt: null, lastTestAt: null,
        lastErrorCode: null,
      }),
      onDisconnectMyLifeMemory: async () => ({
        state: 'disconnected' as const, serverVersion: null, protocolVersion: null,
        manifestHash: null, connectedAt: null, lastTestAt: null,
        lastErrorCode: null,
      }),
    };
    renderWithLanguage(
      <AiSettingsPanel
        {...commonAiProps}
        mode="my-life-memory-mcp"
      />,
    );

    expect(screen.getByRole('button', { name: '断开', exact: true }))
      .toBeDisabled();
    await user.type(
      screen.getByLabelText('My Life Memory MCP Token'),
      `mlm_${'s'.repeat(64)}`,
    );
    await user.click(screen.getByRole('button', { name: '连接' }));
    expect(onConnectMyLifeMemory).toHaveBeenCalledWith(`mlm_${'s'.repeat(64)}`);
    expect(screen.queryByText(`mlm_${'s'.repeat(64)}`)).toBeNull();

    cleanup();
    renderWithLanguage(
      <EmotionMapMcpPanel
        onIssueToken={onIssueToken}
        onGetStatus={async () => ({
          scope: 'records:read',
          expiresAt: '2026-08-03T00:00:00.000Z',
          lastUsedAt: '2026-08-02T12:00:00.000Z',
        })}
        onRevokeTokens={async () => true}
        onListProposals={async () => []}
        onResolveProposal={async () => true}
      />,
    );
    expect(await screen.findByText(/最近使用/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '生成 MCP Token' }));
    expect(screen.getByText('Bearer output-access-once')).toBeInTheDocument();
  });

  it('keeps draft input available before sign-in while preventing an unavailable send', async () => {
    const user = userEvent.setup();
    const onAnswer = vi.fn();
    renderWithLanguage(
      <ChatScreen
        notes={[]}
        conversations={[]}
        activeConversationId="thread-revisit"
        workspaceKey="real:user-a"
        onAnswerFollowUp={onAnswer}
        cloudAuth={null}
        cloudRevision={null}
        cloudStatus="signed_out"
        onBeginChat={vi.fn()}
        onCompleteChat={vi.fn()}
        onFailChat={vi.fn()}
        onNewConversation={vi.fn()}
        onExitToMap={vi.fn()}
        onToast={vi.fn()}
      />,
    );

    expect(document.querySelector('.message-bubble')).toBeNull();
    const composer = screen.getByRole('textbox', { name: '输入消息…' });
    expect(composer).toBeEnabled();
    await user.type(composer, '先保留这条输入');
    expect(composer).toHaveValue('先保留这条输入');
    expect(screen.getByRole('button', { name: '发送' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '新的对话' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '返回地图并打开导航' })).toBeEnabled();
    expect(onAnswer).not.toHaveBeenCalled();
  });

  it('sends with the last cloud revision while a new snapshot is syncing', async () => {
    const user = userEvent.setup();
    const onBeginChat = vi.fn();
    const onCompleteChat = vi.fn();
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as {
        operation?: string;
        requestId: string;
        clientRevision: number;
      };
      if (body.operation === 'plan') {
        return new Response(JSON.stringify({
          status: 'planned',
          requestId: body.requestId,
          serverRevision: body.clientRevision,
          source: 'emotion_map_local',
          tools: [],
          maxCalls: 0,
          routingPlanToken: 'signed-plan-token',
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({
        requestId: body.requestId,
        serverRevision: body.clientRevision,
        intent: 'reflection',
        retrievalStatus: 'supported',
        status: 'supported',
        answer: '我已根据你的记录完成回应。',
        evidence: [],
        externalEvidence: [],
        confidence: 'medium',
        limitations: [],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }));

    renderWithLanguage(
      <ChatScreen
        notes={[]}
        followUps={[]}
        conversations={[]}
        activeConversationId="send-thread"
        workspaceKey="real:user-a"
        onAnswerFollowUp={vi.fn()}
        onRevisitEmotion={vi.fn()}
        cloudAuth={{
          supabaseUrl: 'https://example.supabase.co',
          publishableKey: 'public-key',
          accessToken: 'access-token',
          userId: 'user-a',
        }}
        cloudRevision={7}
        cloudStatus="syncing"
        onBeginChat={onBeginChat}
        onCompleteChat={onCompleteChat}
        onFailChat={vi.fn()}
        onNewConversation={vi.fn()}
        onExitToMap={vi.fn()}
        onToast={vi.fn()}
      />,
    );

    await user.type(screen.getByRole('textbox', { name: '输入消息…' }), '请回应我');
    await user.click(screen.getByRole('button', { name: '发送' }));
    await waitFor(() => expect(onCompleteChat).toHaveBeenCalledTimes(1));
    expect(onBeginChat).toHaveBeenCalledTimes(1);
    expect(onCompleteChat.mock.calls[0][0]).toMatchObject({
      conversationId: 'send-thread',
      assistantBody: '我已根据你的记录完成回应。',
    });
  });

  it('shows the real MCP call while pending and keeps its completion marker', async () => {
    const user = userEvent.setup();
    let resolveRequest: ((response: Response) => void) | undefined;
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as {
        operation?: string;
        requestId: string;
        clientRevision: number;
      };
      if (body.operation === 'plan') {
        return Promise.resolve(new Response(JSON.stringify({
          status: 'planned',
          requestId: body.requestId,
          serverRevision: body.clientRevision,
          source: 'both',
          tools: ['research_memory_context'],
          maxCalls: 1,
          routingPlanToken: 'signed-mcp-plan-token',
        }), { status: 200 }));
      }
      return new Promise<Response>((resolve) => {
        resolveRequest = resolve;
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithLanguage(<McpChatHarness />);

    await user.type(
      screen.getByRole('textbox', { name: '输入消息…' }),
      '你调用mcp看看',
    );
    await user.click(screen.getByRole('button', { name: '发送' }));
    expect(await screen.findByText('正在调用 My Life Memory MCP…')).toBeVisible();

    const requestBody = JSON.parse(String(
      fetchMock.mock.calls[1][1]?.body,
    )) as { requestId: string; clientRevision: number };
    resolveRequest?.(new Response(JSON.stringify({
      requestId: requestBody.requestId,
      serverRevision: requestBody.clientRevision,
      intent: 'lookup',
      retrievalStatus: 'supported',
      status: 'supported',
      answer: '照片里能看到一片蓝色。',
      evidence: [],
      externalEvidence: [],
      mcpCalls: [{
        server: 'my_life_memory',
        toolName: 'get_memory_images',
        status: 'completed',
      }],
      confidence: 'low',
      limitations: [],
      clarificationOptions: [],
    }), { status: 200 }));

    expect(await screen.findByText('My Life Memory MCP · 调用完成')).toBeVisible();
    expect(screen.getByText('照片里能看到一片蓝色。')).toBeVisible();
    expect(document.querySelector('.ai-avatar')).toBeNull();
  });

  it('centers an editable conversation title and commits the rename', async () => {
    const user = userEvent.setup();
    const onRenameConversation = vi.fn();
    renderWithLanguage(
      <ChatScreen
        notes={[]}
        followUps={[]}
        conversations={[{
          id: 'rename-thread',
          title: '旧标题',
          preview: '',
          kind: 'regular',
          messages: [],
        }]}
        activeConversationId="rename-thread"
        workspaceKey="real:user-a"
        onAnswerFollowUp={vi.fn()}
        onRevisitEmotion={vi.fn()}
        cloudAuth={null}
        cloudRevision={null}
        cloudStatus="signed_out"
        onBeginChat={vi.fn()}
        onCompleteChat={vi.fn()}
        onFailChat={vi.fn()}
        onNewConversation={vi.fn()}
        onRenameConversation={onRenameConversation}
        onExitToMap={vi.fn()}
        onToast={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: '修改对话标题' }));
    const input = screen.getByRole('textbox', { name: '对话标题' });
    await user.clear(input);
    await user.type(input, '新标题{enter}');
    expect(onRenameConversation).toHaveBeenCalledWith('rename-thread', '新标题');
  });

  it('expands chat history from the primary row without opening a new chat', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    renderWithLanguage(
      <SideDrawer activeView="map" conversations={[]} onNavigate={onNavigate}
        onOpenConversation={vi.fn()} onNewConversation={vi.fn()}
        onDeleteConversation={vi.fn()} onClose={vi.fn()} />,
    );
    await user.click(screen.getByRole('button', { name: '交流回访' }));
    await waitFor(() => expect(
      screen.getByRole('button', { name: '新建对话' }),
    ).toBeVisible());
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('shows due revisit tasks in the star inbox and answers them there', async () => {
    const user = userEvent.setup();
    const onAnswerFollowUp = vi.fn();
    renderWithLanguage(
      <StarInboxScreen
        notes={[{ ...draftNote, id: 'inbox-note', title: '安静角落', isDraft: false }]}
        followUps={[{
          id: 'follow-up-inbox',
          noteId: 'inbox-note',
          intervalDays: 3,
          dueAt: '2026-08-01T00:00:00.000Z',
          status: 'queued',
          promptedAt: '2026-08-01T00:00:01.000Z',
        }]}
        onAnswerFollowUp={onAnswerFollowUp}
        onClose={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: /安静角落/ }));
    await waitFor(() => expect(
      screen.getByText('现在回看“安静角落”，感觉有变化吗？'),
    ).toBeVisible());
    await user.click(screen.getByRole('button', { name: '轻了' }));
    expect(onAnswerFollowUp).toHaveBeenCalledWith(
      'follow-up-inbox',
      '轻了',
      'lighter',
    );
  });

  it('scrolls a long existing conversation exactly once on entry', async () => {
    const scrollTo = vi.fn();
    const originalScrollTo = HTMLElement.prototype.scrollTo;
    const originalScrollHeight = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      'scrollHeight',
    );
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
      configurable: true, value: scrollTo,
    });
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
      configurable: true, get: () => 4_200,
    });
    try {
      renderWithLanguage(
        <ChatScreen
          notes={[]} followUps={[]}
          conversations={[{ id: 'long-thread', title: '长线程', preview: '', kind: 'regular',
            messages: Array.from({ length: 100 }, (_, index) => ({
              id: `message-${index}`,
              role: index % 2 ? 'assistant' as const : 'user' as const,
              body: `message ${index}`,
            })) }]}
          activeConversationId="long-thread" workspaceKey="real:user-a"
          onAnswerFollowUp={vi.fn()} onRevisitEmotion={vi.fn()}
          cloudAuth={null} cloudRevision={null} cloudStatus="signed_out"
          onBeginChat={vi.fn()} onCompleteChat={vi.fn()}
          onFailChat={vi.fn()} onNewConversation={vi.fn()}
          onExitToMap={vi.fn()} onToast={vi.fn()}
        />,
      );
      await waitFor(() => expect(scrollTo).toHaveBeenCalledTimes(1));
      expect(scrollTo).toHaveBeenCalledWith({ top: 4_200, behavior: 'instant' });
    } finally {
      Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
        configurable: true,
        value: originalScrollTo,
      });
      if (originalScrollHeight) {
        Object.defineProperty(
          HTMLElement.prototype,
          'scrollHeight',
          originalScrollHeight,
        );
      } else {
        delete (HTMLElement.prototype as { scrollHeight?: number }).scrollHeight;
      }
    }
  });

  it('does not expose account A chat drafts to account B', async () => {
    sessionStorage.clear();
    const user = userEvent.setup();
    const sharedProps = {
      notes: [],
      followUps: [],
      conversations: [],
      activeConversationId: 'thread-revisit',
      onAnswerFollowUp: vi.fn(),
      onRevisitEmotion: vi.fn(),
      cloudAuth: {
        supabaseUrl: 'https://example.supabase.co',
        publishableKey: 'public-key',
        accessToken: 'access-token',
        userId: 'user-a',
      },
      cloudRevision: 7,
      cloudStatus: 'synced' as const,
      dataMode: 'real' as const,
      onBeginChat: vi.fn(),
      onCompleteChat: vi.fn(),
      onFailChat: vi.fn(),
      onNewConversation: vi.fn(),
      onExitToMap: vi.fn(),
      onToast: vi.fn(),
    };
    renderWithLanguage(<ChatScreen {...sharedProps} workspaceKey="real:user-a" />);
    await user.type(
      screen.getByRole('textbox', { name: '输入消息…' }),
      '只属于账号 A',
    );
    expect(sessionStorage.getItem(
      'my-emotion-map.chat-draft.v2.real%3Auser-a.thread-revisit',
    )).toBe('只属于账号 A');

    cleanup();
    renderWithLanguage(
      <ChatScreen
        {...sharedProps}
        cloudAuth={{ ...sharedProps.cloudAuth, userId: 'user-b' }}
        workspaceKey="real:user-b"
      />,
    );
    expect(screen.getByRole('textbox', { name: '输入消息…' })).toHaveValue('');
  });
});
