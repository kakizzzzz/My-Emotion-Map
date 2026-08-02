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
import { SettingsScreen } from '../../src/features/settings/SettingsScreen';
import type { EmotionMoment, EmotionNote } from '../../src/types';
import { renderWithLanguage } from '../renderWithLanguage';
import { createGuidedAnswers } from '../../src/domain/notePrompts';
import type { PhotoAssistDelivery } from '../../src/app/appTypes';
import { FirstRunOnboarding } from '../../src/features/onboarding/FirstRunOnboarding';
import { createDemoAppData } from '../../src/app/appDataRepository';
import { SideDrawer } from '../../src/app/AppChrome';
import { StarInboxScreen } from '../../src/features/inbox/StarInboxScreen';

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
        onSaveDraft={() => undefined}
        onDeleteDraft={() => undefined}
        onClose={() => undefined}
        onToast={() => undefined}
        photoAssistDelivery={delivery}
      />
    </>
  );
};

afterEach(() => {
  cleanup();
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
        onSaveDraft={() => undefined}
        onDeleteDraft={() => undefined}
        onClose={() => undefined}
        onToast={() => undefined}
      />,
    );

    await user.type(
      screen.getByRole('textbox', { name: '给这一刻起个名字' }),
      '图书馆下午',
    );
    await user.click(screen.getByRole('button', { name: '平静' }));
    await user.click(await screen.findByTitle('很安心'));
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: '继续到引导问题' }),
      ).toBeInTheDocument();
    });
    await user.click(
      screen.getByRole('button', { name: '继续到引导问题' }),
    );
    await screen.findByRole('heading', { name: '你去这做什么？' });
    await user.click(screen.getByRole('button', { name: '跳过引导' }));
    await user.click(await screen.findByRole('button', { name: '点击保存' }));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][1]).toMatchObject({
      title: '图书馆下午',
      isDraft: false,
    });
    expect(onSave.mock.calls[0][2]).toBe('calm');
    expect(onSave.mock.calls[0][3]).toBe('safe');
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
        onSaveDraft={vi.fn()}
        onDeleteDraft={vi.fn()}
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
    await user.click(screen.getByRole('button', { name: '放弃修改' }));
    expect(onSave).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('deletes an untouched new draft instead of finalizing it', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const onDeleteDraft = vi.fn();
    renderWithLanguage(
      <NoteEditorSheet
        moment={draftMoment}
        note={draftNote}
        onSave={onSave}
        onSaveDraft={vi.fn()}
        onDeleteDraft={onDeleteDraft}
        onClose={vi.fn()}
        onToast={() => undefined}
      />,
    );

    await user.click(
      screen.getByRole('button', { name: '关闭' }),
    );
    await user.click(screen.getByRole('button', { name: '删除草稿' }));

    expect(onSave).not.toHaveBeenCalled();
    expect(onDeleteDraft).toHaveBeenCalledTimes(1);
  });

  it('keeps a new record as a draft only when explicitly selected', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const onSaveDraft = vi.fn();
    renderWithLanguage(
      <NoteEditorSheet
        moment={draftMoment}
        note={draftNote}
        onSave={onSave}
        onSaveDraft={onSaveDraft}
        onDeleteDraft={vi.fn()}
        onClose={vi.fn()}
        onToast={() => undefined}
      />,
    );

    await user.type(
      screen.getByRole('textbox', { name: '给这一刻起个名字' }),
      '还没写完',
    );
    await user.click(screen.getByRole('button', { name: '关闭' }));
    await user.click(screen.getByRole('button', { name: '保留草稿' }));

    expect(onSave).not.toHaveBeenCalled();
    expect(onSaveDraft).toHaveBeenCalledTimes(1);
    expect(onSaveDraft.mock.calls[0][1]).toMatchObject({
      title: '还没写完',
      isDraft: true,
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
        onSaveDraft={vi.fn()}
        onDeleteDraft={vi.fn()}
        onClose={vi.fn()}
        onToast={() => undefined}
      />,
    );

    await user.type(
      screen.getByRole('textbox', { name: '给这一刻起个名字' }),
      '保存这次',
    );
    await user.click(screen.getByRole('button', { name: '关闭' }));
    await user.click(screen.getByRole('button', { name: '保存修改' }));
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
        onSaveDraft={vi.fn()}
        onDeleteDraft={vi.fn()}
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
    await user.click(screen.getByRole('button', { name: '继续编辑' }));

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
        onOpenDemo={vi.fn()}
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

  it('keeps Demo outside the auth card and requires confirmation without clearing login input', async () => {
    const user = userEvent.setup();
    const onOpenDemo = vi.fn();
    renderWithLanguage(
      <LoginScreen
        ready
        configured
        onAuthenticate={vi.fn()}
        onOpenDemo={onOpenDemo}
      />,
    );

    await user.type(screen.getByLabelText('账号'), 'student_01');
    const demoButton = screen.getByRole('button', { name: '预览演示' });
    expect(demoButton).toHaveClass('login-demo-icon');
    expect(document.querySelector('.login-card .login-demo-icon')).toBeNull();

    await user.click(demoButton);
    expect(onOpenDemo).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: '进入演示？' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '取消' }));
    expect(screen.getByLabelText('账号')).toHaveValue('student_01');
    expect(onOpenDemo).not.toHaveBeenCalled();

    await user.click(demoButton);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: '进入演示？' })).toBeNull();
    expect(screen.getByLabelText('账号')).toHaveValue('student_01');

    await user.click(demoButton);
    await user.click(screen.getByRole('button', { name: '进入演示' }));
    expect(onOpenDemo).toHaveBeenCalledTimes(1);
  });

  it('uses the same three-screen onboarding shell and skips without touching records', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    renderWithLanguage(
      <FirstRunOnboarding dataMode="real" onComplete={onComplete} />,
    );
    expect(screen.getByRole('dialog', { name: '留下一颗星星' })).toHaveAttribute(
      'data-onboarding-mode',
      'real',
    );
    expect(screen.getByText('第 1 页，共 3 页')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '跳过' }));
    expect(onComplete).toHaveBeenCalledTimes(1);

    cleanup();
    renderWithLanguage(
      <FirstRunOnboarding dataMode="demo" onComplete={vi.fn()} />,
    );
    expect(screen.getByRole('dialog', { name: '留下一颗星星' })).toHaveAttribute(
      'data-onboarding-mode',
      'demo',
    );
  });

  it('closes settings through a discoverable button', async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    renderWithLanguage(
      <SettingsScreen
        themeTone="original"
        themePalette={DEFAULT_THEME}
        onThemeTone={() => undefined}
        onThemeColor={() => undefined}
        dataMode="real"
        onExportData={() => undefined}
        onImportData={async () => undefined}
        onDeleteAllData={() => undefined}
        onLoadDemo={() => true}
        onExitDemo={() => true}
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
        onCreateAutomationTest={() => undefined}
        onIssueMcpToken={async () => null}
        onRevokeAllMcpTokens={async () => true}
        healthPreferences={{
          restingHeartRateMin: 60,
          restingHeartRateMax: 100,
          rangeConfirmed: false,
          singleSampleEnabled: false,
        }}
        onHealthPreferences={() => true}
        onIssueShortcutPairing={async () => null}
        onBack={onBack}
      />,
    );

    await user.click(screen.getByRole('button', { name: '关闭' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('keeps grounded chat disabled until the user is safely signed in and synced', async () => {
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
        dataMode="real"
        onBeginChat={vi.fn()}
        onCompleteChat={vi.fn()}
        onFailChat={vi.fn()}
        onNewConversation={vi.fn()}
        onExitToMap={vi.fn()}
        onToast={vi.fn()}
      />,
    );

    expect(document.querySelector('.message-bubble')).toBeNull();
    expect(
      screen.getByRole('textbox', { name: /请先在设置中登录/ }),
    ).toBeDisabled();
    expect(screen.getByRole('button', { name: '发送' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '新的对话' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '返回地图并打开导航' })).toBeEnabled();
    expect(onAnswer).not.toHaveBeenCalled();
  });

  it('answers Demo prompts deterministically without calling the Edge Function', async () => {
    const user = userEvent.setup();
    const onBeginChat = vi.fn();
    const onCompleteChat = vi.fn();
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const demo = createDemoAppData(new Date('2026-08-02T12:00:00'));
    renderWithLanguage(
      <ChatScreen
        notes={demo.notes}
        followUps={demo.followUps}
        conversations={[]}
        activeConversationId="demo-new-thread"
        workspaceKey="demo"
        onAnswerFollowUp={vi.fn()}
        onRevisitEmotion={vi.fn()}
        cloudAuth={null}
        cloudRevision={null}
        cloudStatus="signed_out"
        dataMode="demo"
        onBeginChat={onBeginChat}
        onCompleteChat={onCompleteChat}
        onFailChat={vi.fn()}
        onNewConversation={vi.fn()}
        onExitToMap={vi.fn()}
        onToast={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: '图书馆的记录是什么？' }));
    await waitFor(() => expect(onCompleteChat).toHaveBeenCalledTimes(1));
    expect(onBeginChat).toHaveBeenCalledTimes(1);
    expect(onCompleteChat.mock.calls[0][0].assistantBody).toContain('演示回答');
    expect(onCompleteChat.mock.calls[0][0].noteIds.every((id: string) =>
      id.startsWith('demo:synthetic:campus-day:')
    )).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('opens Chat from its primary row while disclosure only expands history', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    renderWithLanguage(
      <SideDrawer activeView="map" conversations={[]} onNavigate={onNavigate}
        onOpenConversation={vi.fn()} onNewConversation={vi.fn()} onClose={vi.fn()} />,
    );
    await user.click(screen.getByRole('button', { name: '交流回访' }));
    expect(onNavigate).toHaveBeenCalledWith('chat');
    cleanup();
    renderWithLanguage(
      <SideDrawer activeView="map" conversations={[]} onNavigate={onNavigate}
        onOpenConversation={vi.fn()} onNewConversation={vi.fn()} onClose={vi.fn()} />,
    );
    await user.click(screen.getByRole('button', { name: '展开交流回访历史' }));
    await waitFor(() => expect(
      screen.getByRole('button', { name: '新建对话' }),
    ).toBeVisible());
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it('shows every pending inbox item and marks only the expanded item seen', async () => {
    const user = userEvent.setup();
    const onMarkSeen = vi.fn();
    renderWithLanguage(
      <StarInboxScreen
        items={[
          { id: 'inbox-1', source: 'heart-rate', sourceEventId: 'event-1',
            eventAt: '2026-08-02T10:00:00.000Z', receivedAt: '2026-08-02T10:01:00.000Z',
            heartRate: 75, status: 'pending', decisionReason: 'low_signal_review',
            thresholdSnapshot: { restingMin: 60, restingMax: 100 },
            algorithmVersion: 'shortcut-heart-v2', signalLevel: 'low' },
          { id: 'inbox-2', source: 'heart-rate', sourceEventId: 'event-2',
            eventAt: '2026-08-02T11:00:00.000Z', receivedAt: '2026-08-02T11:01:00.000Z',
            heartRate: 76, status: 'pending', decisionReason: 'test_event',
            thresholdSnapshot: { restingMin: 60, restingMax: 100 },
            algorithmVersion: 'shortcut-heart-v2', signalLevel: 'standard' },
        ]}
        onReviewItem={vi.fn()} onDismissItem={vi.fn()}
        onMarkSeen={onMarkSeen} onClose={vi.fn()}
      />,
    );
    expect(screen.getAllByText('新发现一颗星')).toHaveLength(2);
    await user.click(document.querySelectorAll('.star-inbox-card')[0] as HTMLElement);
    expect(onMarkSeen).toHaveBeenCalledWith('inbox-1');
    expect(onMarkSeen).toHaveBeenCalledTimes(1);
  });

  it('scrolls a long existing conversation exactly once on entry', async () => {
    const scrollIntoView = vi.fn();
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true, value: scrollIntoView,
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
          dataMode="real" onBeginChat={vi.fn()} onCompleteChat={vi.fn()}
          onFailChat={vi.fn()} onNewConversation={vi.fn()}
          onExitToMap={vi.fn()} onToast={vi.fn()}
        />,
      );
      await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(1));
    } finally {
      Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
        configurable: true,
        value: originalScrollIntoView,
      });
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
