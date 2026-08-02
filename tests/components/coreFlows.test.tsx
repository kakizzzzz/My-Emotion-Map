import { useState } from 'react';
import { cleanup, screen, waitFor } from '@testing-library/react';
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

  it('saves partial changes when an existing record is closed', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    renderWithLanguage(
      <NoteEditorSheet
        moment={{ ...draftMoment, isNew: false, emotion: 'mixed', placeRating: 'neutral' }}
        note={{ ...draftNote, isDraft: false, emotion: 'mixed', placeRating: 'neutral' }}
        onSave={onSave}
        onToast={() => undefined}
      />,
    );

    await user.type(
      screen.getByRole('textbox', { name: '给这一刻起个名字' }),
      '未保存',
    );
    await user.click(
      screen.getByRole('button', { name: '关闭并保存为正式记录' }),
    );
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][1]).toMatchObject({
      title: '未保存',
      emotion: 'mixed',
      placeRating: 'neutral',
    });
  });

  it('finalizes a new record with unknown values when it is closed', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    renderWithLanguage(
      <NoteEditorSheet
        moment={draftMoment}
        note={draftNote}
        onSave={onSave}
        onToast={() => undefined}
      />,
    );

    await user.click(
      screen.getByRole('button', { name: '关闭并保存为正式记录' }),
    );

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][1]).toMatchObject({
      emotion: null,
      placeRating: null,
      isDraft: false,
    });
    expect(onSave.mock.calls[0][2]).toBeNull();
    expect(onSave.mock.calls[0][3]).toBeNull();
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
        onAnswerFollowUp={onAnswer}
        cloudAuth={null}
        cloudRevision={null}
        cloudStatus="signed_out"
        dataMode="real"
        onGroundedChat={vi.fn()}
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
});
