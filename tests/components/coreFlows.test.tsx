import { useState } from 'react';
import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_THEME } from '../../src/app/themePreferences';
import { CalendarScreen } from '../../src/features/calendar/CalendarScreen';
import { ChatScreen } from '../../src/features/chat/ChatScreen';
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
        onClose={() => undefined}
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
        onClose={() => undefined}
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
    await user.click(screen.getByRole('button', { name: '跳过这个问题' }));
    await user.click(screen.getByRole('button', { name: '跳过这个问题' }));
    await user.click(screen.getByRole('button', { name: '跳过这个问题' }));
    await user.click(screen.getByRole('button', { name: '点击保存' }));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][1]).toMatchObject({
      title: '图书馆下午',
      isDraft: false,
    });
    expect(onSave.mock.calls[0][2]).toBe('calm');
    expect(onSave.mock.calls[0][3]).toBe('safe');
  });

  it('confirms before discarding changes to an existing record', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderWithLanguage(
      <NoteEditorSheet
        moment={{ ...draftMoment, isNew: false, emotion: 'mixed', placeRating: 'neutral' }}
        note={{ ...draftNote, isDraft: false, emotion: 'mixed', placeRating: 'neutral' }}
        onClose={onClose}
        onSave={() => undefined}
        onToast={() => undefined}
      />,
    );

    await user.type(
      screen.getByRole('textbox', { name: '给这一刻起个名字' }),
      '未保存',
    );
    await user.click(screen.getByRole('button', { name: '先不保存' }));
    expect(confirm).toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();

    confirm.mockReturnValue(true);
    await user.click(screen.getByRole('button', { name: '先不保存' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('finalizes a new record with unknown values when it is closed', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    renderWithLanguage(
      <NoteEditorSheet
        moment={draftMoment}
        note={draftNote}
        onClose={() => undefined}
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
      />,
    );

    expect(screen.getByText('有证据边界的 AI 对话')).toBeInTheDocument();
    expect(screen.getByText(/请先在设置中登录/)).toBeInTheDocument();
    expect(
      screen.getByRole('textbox', { name: /请先在设置中登录/ }),
    ).toBeDisabled();
    expect(screen.getByRole('button', { name: '发送' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '新的对话' })).toBeDisabled();
    expect(onAnswer).not.toHaveBeenCalled();
  });
});
