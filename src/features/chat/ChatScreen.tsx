import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import {
  ChevronDown,
  ChevronLeft,
  Heart,
  MessageSquarePlus,
  RotateCcw,
  Send,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { EmotionStar } from '../../EmotionStar';
import { MOTION } from '../../motion';
import { useAppLanguage } from '../../i18n';
import type {
  ChatOption,
  Conversation,
  DataMode,
  EmotionNote,
  FollowUpRecord,
} from '../../types';
import {
  FOLLOW_UP_CONVERSATION_ID,
  getFollowUpOptions,
  getFollowUpPrompt,
} from '../../domain/followUps';
import { useDialogFocus } from '../../app/useDialogFocus';
import type { CloudAuth } from '../../services/supabaseClient';
import type { CloudSyncStatus } from '../../services/useCloudSync';
import { requestEmotionChat } from '../../services/emotionChat';
import type { ToastHandler } from '../../app/appTypes';
import { loadLocalSettings } from '../../app/profilePreferences';

function AiAvatar() {
  return (
    <span className="ai-avatar" aria-hidden="true">
      AI
    </span>
  );
}

const draftKey = (conversationId: string) =>
  `my-emotion-map.chat-draft.${conversationId}`;

export function ChatScreen({
  notes,
  followUps,
  conversations,
  activeConversationId,
  onAnswerFollowUp,
  onRevisitEmotion,
  cloudAuth,
  cloudRevision,
  cloudStatus,
  dataMode,
  onGroundedChat,
  onNewConversation,
  onExitToMap,
  onToast,
}: {
  notes: EmotionNote[];
  followUps: FollowUpRecord[];
  conversations: Conversation[];
  activeConversationId: string;
  onAnswerFollowUp: (
    followUpId: string,
    label: string,
    kind: ChatOption['responseKind'],
  ) => void;
  onRevisitEmotion: (noteId: string) => void;
  cloudAuth: CloudAuth | null;
  cloudRevision: number | null;
  cloudStatus: CloudSyncStatus;
  dataMode: DataMode;
  onGroundedChat: (
    conversationId: string,
    userBody: string,
    assistantBody: string,
    noteIds: string[],
  ) => void;
  onNewConversation: () => void;
  onExitToMap: () => void;
  onToast: ToastHandler;
}) {
  const { copy, language } = useAppLanguage();
  const [previewNoteId, setPreviewNoteId] = useState<string | null>(null);
  const [draft, setDraft] = useState(() => {
    try {
      return sessionStorage.getItem(draftKey(activeConversationId)) ?? '';
    } catch {
      return '';
    }
  });
  const [sending, setSending] = useState(false);
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  const [failedMessage, setFailedMessage] = useState<string | null>(null);
  const [showJumpToEnd, setShowJumpToEnd] = useState(false);
  const [unreadBelow, setUnreadBelow] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const nearBottomRef = useRef(true);
  const previousMessageCountRef = useRef(0);
  const savedConversation = conversations.find(
    (item) => item.id === activeConversationId,
  );
  const conversation = savedConversation ?? {
    id: activeConversationId,
    title: copy.chat.newConversation,
    preview: '',
    kind: 'regular' as const,
    messages: [],
  };
  const previewNote = notes.find((note) => note.id === previewNoteId) ?? null;
  const previewDialogRef = useDialogFocus<HTMLDivElement>({
    isOpen: Boolean(previewNote),
    onEscape: () => setPreviewNoteId(null),
  });
  const isFollowUp = Boolean(
    savedConversation &&
      (conversation.id === FOLLOW_UP_CONVERSATION_ID ||
        conversation.kind === 'companion'),
  );
  const available = Boolean(
    cloudAuth &&
      cloudRevision !== null &&
      cloudStatus === 'synced' &&
      dataMode === 'real',
  );
  const unavailableMessage = !cloudAuth
    ? copy.chat.signInRequired
    : copy.chat.syncRequired;
  const followUpOptions = useMemo(
    () => getFollowUpOptions(language),
    [language],
  );
  const responseStyle = useMemo(
    () => {
      if (!cloudAuth) return [];
      const allowlist = new Set(['concise', 'direct', 'gentle']);
      return loadLocalSettings(cloudAuth.userId).aiToneTags
        .filter((item): item is 'concise' | 'direct' | 'gentle' =>
          allowlist.has(item),
        )
        .slice(0, 3);
    },
    [cloudAuth],
  );

  const scrollToEnd = useCallback((behavior: ScrollBehavior) => {
    const target = endRef.current;
    if (target && typeof target.scrollIntoView === 'function') {
      target.scrollIntoView({ behavior, block: 'end' });
    }
    nearBottomRef.current = true;
    setShowJumpToEnd(false);
    setUnreadBelow(0);
  }, []);

  useLayoutEffect(() => {
    scrollToEnd('instant');
    previousMessageCountRef.current = 0;
  }, [activeConversationId, scrollToEnd]);

  useEffect(() => {
    const previous = previousMessageCountRef.current;
    const next = conversation.messages.length;
    if (next <= previous) {
      previousMessageCountRef.current = next;
      return;
    }
    const appended = conversation.messages.slice(previous);
    const includesUserMessage = appended.some((message) => message.role === 'user');
    if (includesUserMessage || nearBottomRef.current) {
      scrollToEnd('smooth');
    } else {
      setUnreadBelow((current) => current + appended.length);
      setShowJumpToEnd(true);
    }
    previousMessageCountRef.current = next;
  }, [conversation.messages, scrollToEnd]);

  useEffect(() => {
    try {
      if (draft) sessionStorage.setItem(draftKey(activeConversationId), draft);
      else sessionStorage.removeItem(draftKey(activeConversationId));
    } catch {
      // Session-only drafts can remain in React state when storage is blocked.
    }
  }, [activeConversationId, draft]);

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 104)}px`;
    textarea.style.overflowY = textarea.scrollHeight > 104 ? 'auto' : 'hidden';
  }, [draft]);

  const sendMessage = async (message: string) => {
    if (
      !available ||
      !cloudAuth ||
      cloudRevision === null ||
      !message ||
      sending ||
      message.length > 1_200
    ) {
      return;
    }
    setSending(true);
    setPendingMessage(message);
    setFailedMessage(null);
    setDraft('');
    window.requestAnimationFrame(() => scrollToEnd('smooth'));
    const controller = new AbortController();
    abortRef.current = controller;
    const timer = window.setTimeout(() => controller.abort(), 22_000);
    try {
      const recentNoteIds = conversation.messages
        .flatMap((item) => item.noteIds ?? [])
        .slice(-6);
      const result = await requestEmotionChat({
        auth: cloudAuth,
        message,
        language,
        conversationId: conversation.id,
        selectedNoteIds: recentNoteIds,
        responseStyle,
        clientRevision: cloudRevision,
        signal: controller.signal,
      });
      if (!result || !result.answer.trim()) throw new Error('Unavailable');
      onGroundedChat(
        conversation.id,
        message,
        result.answer,
        result.evidence.map((item) => item.noteId),
      );
      setPendingMessage(null);
    } catch {
      setPendingMessage(null);
      if (controller.signal.aborted) {
        setDraft(message);
      } else {
        setFailedMessage(message);
        onToast(copy.chat.chatUnavailable, { durationMs: 2800 });
      }
    } finally {
      window.clearTimeout(timer);
      abortRef.current = null;
      setSending(false);
    }
  };

  const send = () => void sendMessage(draft.trim());

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      event.key !== 'Enter' ||
      event.shiftKey ||
      event.nativeEvent.isComposing
    ) {
      return;
    }
    event.preventDefault();
    send();
  };

  return (
    <section className="paper-screen chat-screen" aria-busy={sending}>
      <header className="chat-header chat-header--thread">
        <div>
          <h1>{isFollowUp ? copy.navigation.chat : conversation.title}</h1>
        </div>
        <div className="chat-header-actions">
          <button
            className="round-back-button"
            aria-label={copy.chat.exitToMap}
            onClick={onExitToMap}
          >
            <ChevronLeft size={23} strokeWidth={2.2} />
          </button>
          <button
            className="round-back-button"
            aria-label={
              sending ? copy.chat.stopGenerating : copy.chat.newConversation
            }
            onClick={() => {
              if (sending) {
                abortRef.current?.abort();
                return;
              }
              onNewConversation();
            }}
          >
            {sending ? (
              <X size={22} strokeWidth={2.2} />
            ) : (
              <MessageSquarePlus size={22} strokeWidth={2.2} />
            )}
          </button>
        </div>
      </header>

      <div
        ref={scrollRef}
        className="message-scroll"
        onScroll={(event) => {
          const element = event.currentTarget;
          const distance =
            element.scrollHeight - element.scrollTop - element.clientHeight;
          nearBottomRef.current = distance < 96;
          setShowJumpToEnd(distance >= 96);
          if (distance < 96) setUnreadBelow(0);
        }}
      >
        {conversation.messages.length ? (
          conversation.messages.map((message) => {
            const followUp = message.followUpId
              ? followUps.find((record) => record.id === message.followUpId)
              : null;
            const followUpNote = followUp
              ? notes.find((note) => note.id === followUp.noteId)
              : null;
            const isPrompt = message.kind === 'followup_prompt';
            const body =
              isPrompt && followUp && followUpNote
                ? getFollowUpPrompt(followUp, followUpNote, language)
                : message.body;
            const showOptions = Boolean(
              isPrompt && followUp?.status === 'active',
            );
            const canRevisit = Boolean(
              message.kind === 'followup_reply' &&
                followUp &&
                followUp.responseOptionId !== 'skip',
            );
            return (
              <article
                key={message.id}
                className={`message-row message-row--${message.role}`}
              >
                {message.role === 'assistant' ? <AiAvatar /> : null}
                <div className="message-stack">
                  {message.noteIds?.length ? (
                    <div className="message-note-links">
                      {message.noteIds.map((noteId) => {
                        const note = notes.find((item) => item.id === noteId);
                        if (!note) return null;
                        return (
                          <button
                            key={noteId}
                            onClick={() => setPreviewNoteId(noteId)}
                          >
                            <EmotionStar
                              emotion={note.emotion}
                              size={25}
                              colorOverride={note.color}
                            />
                            @{note.title}
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                  {body ? <div className="message-bubble">{body}</div> : null}
                  {showOptions && followUp ? (
                    <div className="message-options">
                      {followUpOptions.map((option) => (
                        <button
                          key={option.id}
                          onClick={() =>
                            onAnswerFollowUp(
                              followUp.id,
                              option.label,
                              option.responseKind,
                            )
                          }
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {canRevisit && followUp ? (
                    <button
                      type="button"
                      className="message-revisit-action"
                      aria-label={copy.note.recordCurrentFeeling}
                      onClick={() => onRevisitEmotion(followUp.noteId)}
                    >
                      <Heart size={18} strokeWidth={2.2} />
                    </button>
                  ) : null}
                </div>
              </article>
            );
          })
        ) : isFollowUp ? (
          <div className="chat-disabled-empty">
            <strong>{copy.chat.noFollowUpTitle}</strong>
            <p>{copy.chat.noFollowUpBody}</p>
          </div>
        ) : null}

        {pendingMessage ? (
          <>
            <article className="message-row message-row--user is-transient">
              <div className="message-stack">
                <div className="message-bubble">{pendingMessage}</div>
              </div>
            </article>
            <article className="message-row message-row--assistant is-pending">
              <AiAvatar />
              <div className="message-stack">
                <div className="message-bubble" aria-label={copy.common.loading}>
                  <i />
                  <i />
                  <i />
                </div>
              </div>
            </article>
          </>
        ) : null}

        {failedMessage ? (
          <article className="message-row message-row--user is-retryable">
            <div className="message-stack">
              <div className="message-bubble">{failedMessage}</div>
              <button
                type="button"
                className="message-retry-action"
                aria-label={copy.common.retry}
                onClick={() => void sendMessage(failedMessage)}
              >
                <RotateCcw size={18} strokeWidth={2.2} />
              </button>
            </div>
          </article>
        ) : null}
        <div ref={endRef} className="message-end-anchor" />
      </div>

      {showJumpToEnd ? (
        <button
          type="button"
          className="chat-jump-to-end"
          aria-label={copy.common.latest}
          onClick={() => scrollToEnd('smooth')}
        >
          <ChevronDown size={20} strokeWidth={2.2} />
          {unreadBelow > 0 ? <span>{unreadBelow}</span> : null}
        </button>
      ) : null}

      <form
        className={`chat-composer ${available ? '' : 'chat-composer--disabled'}`}
        onSubmit={(event) => {
          event.preventDefault();
          send();
        }}
      >
        <div className="composer-row">
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value.slice(0, 1_200))}
            onKeyDown={handleComposerKeyDown}
            readOnly={!available}
            disabled={!available}
            placeholder={
              available ? copy.chat.messagePlaceholder : unavailableMessage
            }
            rows={1}
            enterKeyHint="send"
            aria-label={
              available ? copy.chat.messagePlaceholder : unavailableMessage
            }
          />
          <button
            className="send-button"
            type="submit"
            aria-label={copy.chat.send}
            disabled={!available || sending || !draft.trim()}
          >
            <Send size={19} strokeWidth={2.2} />
          </button>
        </div>
      </form>

      <AnimatePresence>
        {previewNote ? (
          <motion.div
            ref={previewDialogRef}
            className="inline-note-preview"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={MOTION.sheet}
            role="dialog"
            aria-modal="true"
            aria-label={previewNote.title}
            tabIndex={-1}
          >
            <header>
              <EmotionStar
                emotion={previewNote.emotion}
                size={42}
                colorOverride={previewNote.color}
              />
              <div>
                <p className="eyebrow">{copy.chat.mentionedNotes}</p>
                <h2>{previewNote.title}</h2>
              </div>
              <button
                className="icon-button popup-close-button"
                onClick={() => setPreviewNoteId(null)}
                aria-label={copy.common.close}
              >
                <X size={19} strokeWidth={2.2} />
              </button>
            </header>
            <p>{previewNote.excerpt}</p>
            <small>
              {previewNote.date} · {previewNote.time} · {previewNote.place}
            </small>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}
