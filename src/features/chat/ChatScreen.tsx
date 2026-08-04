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
  Link2,
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
  ChatDeliveryState,
  Conversation,
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
import {
  requestEmotionChat,
  requestEmotionChatPlan,
} from '../../services/emotionChat';
import type { ToastHandler } from '../../app/appTypes';
import { loadLocalSettings } from '../../app/profilePreferences';
import { chatDraftKey } from '../../app/workspace/chatDraftStorage';
import { createRecordId } from '../../app/createRecordId';
import type {
  BeginChatInput,
  CompleteChatInput,
} from '../../app/useChatDeliveryHandlers';

export function ChatScreen({
  notes,
  followUps,
  conversations,
  activeConversationId,
  workspaceKey,
  onAnswerFollowUp,
  onRevisitEmotion,
  cloudAuth,
  cloudRevision,
  onBeginChat,
  onCompleteChat,
  onFailChat,
  onNewConversation,
  onRenameConversation = () => undefined,
  onExitToMap,
  onToast,
}: {
  notes: EmotionNote[];
  followUps: FollowUpRecord[];
  conversations: Conversation[];
  activeConversationId: string;
  workspaceKey: string;
  onAnswerFollowUp: (
    followUpId: string,
    label: string,
    kind: ChatOption['responseKind'],
  ) => void;
  onRevisitEmotion: (noteId: string, followUpId: string) => void;
  cloudAuth: CloudAuth | null;
  cloudRevision: number | null;
  cloudStatus: CloudSyncStatus;
  onBeginChat: (input: BeginChatInput) => void;
  onCompleteChat: (input: CompleteChatInput) => void;
  onFailChat: (
    requestId: string,
    state: Extract<ChatDeliveryState, 'failed' | 'stopped'>,
  ) => void;
  onNewConversation: () => void;
  onRenameConversation?: (conversationId: string, title: string) => void;
  onExitToMap: () => void;
  onToast: ToastHandler;
}) {
  const { copy, language } = useAppLanguage();
  const [previewNoteId, setPreviewNoteId] = useState<string | null>(null);
  const activeDraftKey = chatDraftKey(workspaceKey, activeConversationId);
  const readDraft = (key: string) => {
    try {
      return sessionStorage.getItem(key) ?? '';
    } catch {
      return '';
    }
  };
  const [draftState, setDraftState] = useState(() => ({
    key: activeDraftKey,
    value: readDraft(activeDraftKey),
  }));
  const draft = draftState.key === activeDraftKey ? draftState.value : '';
  const setDraft = (value: string) => {
    setDraftState({ key: activeDraftKey, value });
  };
  const [sending, setSending] = useState(false);
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null);
  const [activeMcpRequestId, setActiveMcpRequestId] = useState<string | null>(null);
  const [showJumpToEnd, setShowJumpToEnd] = useState(false);
  const [unreadBelow, setUnreadBelow] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const nearBottomRef = useRef(true);
  const resizeReadyRef = useRef(false);
  const observedMessageCountRef = useRef(0);
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
  const renderedMessageCountRef = useRef(conversation.messages.length);
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
  const displayedTitle = isFollowUp
    ? copy.navigation.chat
    : conversation.title;
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(displayedTitle);
  useEffect(() => {
    if (!editingTitle) setTitleDraft(displayedTitle);
  }, [displayedTitle, editingTitle]);
  const commitTitle = () => {
    const nextTitle = titleDraft.trim().slice(0, 60);
    setEditingTitle(false);
    if (nextTitle && nextTitle !== conversation.title) {
      onRenameConversation(conversation.id, nextTitle);
    } else {
      setTitleDraft(displayedTitle);
    }
  };
  const available = Boolean(
    cloudAuth &&
      cloudRevision !== null,
  );
  const followUpOptions = useMemo(
    () => getFollowUpOptions(language),
    [language],
  );
  const aiPreferences = useMemo(
    () => loadLocalSettings(cloudAuth?.userId ?? null),
    [cloudAuth],
  );

  const scrollToEnd = useCallback((behavior: ScrollBehavior) => {
    const scroller = scrollRef.current;
    if (scroller && typeof scroller.scrollTo === 'function') {
      scroller.scrollTo({ top: scroller.scrollHeight, behavior });
    } else if (scroller) {
      scroller.scrollTop = scroller.scrollHeight;
    } else {
      endRef.current?.scrollIntoView({ behavior, block: 'end' });
    }
    nearBottomRef.current = true;
    setShowJumpToEnd(false);
    setUnreadBelow(0);
  }, []);

  useLayoutEffect(() => {
    if (draftState.key !== activeDraftKey) {
      setDraftState({ key: activeDraftKey, value: readDraft(activeDraftKey) });
    }
  }, [activeDraftKey, draftState.key]);

  useLayoutEffect(() => {
    renderedMessageCountRef.current = conversation.messages.length;
  });

  useLayoutEffect(() => {
    previousMessageCountRef.current = renderedMessageCountRef.current;
    resizeReadyRef.current = false;
    const frame = window.requestAnimationFrame(() => scrollToEnd('instant'));
    return () => window.cancelAnimationFrame(frame);
  }, [activeConversationId, scrollToEnd]);

  useEffect(() => {
    const element = contentRef.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      if (!resizeReadyRef.current) {
        resizeReadyRef.current = true;
        observedMessageCountRef.current = renderedMessageCountRef.current;
        return;
      }
      if (observedMessageCountRef.current !== renderedMessageCountRef.current) {
        observedMessageCountRef.current = renderedMessageCountRef.current;
        return;
      }
      if (nearBottomRef.current) scrollToEnd('instant');
    });
    observer.observe(element);
    return () => observer.disconnect();
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
    if (draftState.key !== activeDraftKey) return;
    try {
      if (draft) sessionStorage.setItem(activeDraftKey, draft);
      else sessionStorage.removeItem(activeDraftKey);
    } catch {
      // Session-only drafts can remain in React state when storage is blocked.
    }
  }, [activeDraftKey, draft, draftState.key]);

  useEffect(() => {
    if (activeRequestId) return;
    conversation.messages.forEach((message) => {
      if (message.deliveryState === 'pending' && message.requestId) {
        onFailChat(message.requestId, 'stopped');
      }
    });
  }, [activeRequestId, conversation.messages, onFailChat]);

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 104)}px`;
    textarea.style.overflowY = textarea.scrollHeight > 104 ? 'auto' : 'hidden';
  }, [draft]);

  const sendMessage = async (
    message: string,
    retryRequestId?: string,
    referenceConfirmation?: {
      optionId: string;
      continuationToken: string;
    },
  ) => {
    if (
      !available ||
      !message ||
      sending ||
      message.length > 1_200
    ) {
      return;
    }
    const requestId = retryRequestId ?? createRecordId('chat-request');
    const recentMessages = conversation.messages
      .filter((item) =>
        (item.role === 'user' || item.role === 'assistant') &&
        item.body.trim() &&
        item.deliveryState !== 'failed' &&
        item.deliveryState !== 'stopped',
      )
      .slice(-aiPreferences.aiContextMessageCount)
      .map((item) => ({ role: item.role, body: item.body }));
    setSending(true);
    setActiveRequestId(requestId);
    setActiveMcpRequestId(null);
    onBeginChat({
      conversationId: conversation.id,
      requestId,
      body: message,
      createdAt: new Date().toISOString(),
      referenceConfirmation,
    });
    setDraft('');
    window.requestAnimationFrame(() => scrollToEnd('smooth'));
    const controller = new AbortController();
    abortRef.current = controller;
    const timer = window.setTimeout(() => controller.abort(), 65_000);
    try {
      const result = cloudAuth && cloudRevision !== null
        ? await (async () => {
            const plan = await requestEmotionChatPlan({
              auth: cloudAuth,
              requestId,
              message,
              language,
              conversationId: conversation.id,
              recentMessages,
              clientRevision: cloudRevision,
              signal: controller.signal,
            });
            if (plan.source === 'my_life_memory' || plan.source === 'both') {
              setActiveMcpRequestId(requestId);
            }
            return requestEmotionChat({
              auth: cloudAuth,
              requestId,
              message,
              language,
              conversationId: conversation.id,
              explicitNoteIds: [],
              conversationAnchorNoteIds: conversation.messages
                .flatMap((item) => item.noteIds ?? [])
                .slice(-6),
              stylePrompt: aiPreferences.aiUserPrompt,
              recentMessages,
              clientRevision: cloudRevision,
              routingPlanToken: plan.routingPlanToken,
              referenceConfirmation,
              signal: controller.signal,
            });
          })()
        : null;
      if (!result || !result.answer.trim()) throw new Error('Unavailable');
      onCompleteChat({
        conversationId: conversation.id,
        requestId,
        assistantBody: result.answer,
        noteIds: result.evidence.map((item) => item.noteId),
        externalEvidence: result.externalEvidence,
        mcpCalls: result.mcpCalls,
        clarificationOptions: result.clarificationOptions ?? [],
        retryable: result.status === 'generation_rejected',
        createdAt: new Date().toISOString(),
      });
    } catch {
      if (controller.signal.aborted) {
        onFailChat(requestId, 'stopped');
      } else {
        onFailChat(requestId, 'failed');
        onToast(copy.chat.chatUnavailable, { durationMs: 2800 });
      }
    } finally {
      window.clearTimeout(timer);
      abortRef.current = null;
      setSending(false);
      setActiveRequestId(null);
      setActiveMcpRequestId(null);
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
        <button
          className="round-back-button chat-header-back"
          aria-label={copy.chat.exitToMap}
          onClick={onExitToMap}
        >
          <ChevronLeft size={23} strokeWidth={2.2} />
        </button>
        <div className="chat-thread-title">
          {editingTitle ? (
            <input
              autoFocus
              value={titleDraft}
              maxLength={60}
              aria-label={copy.chat.conversationTitle}
              onChange={(event) => setTitleDraft(event.target.value)}
              onBlur={commitTitle}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  commitTitle();
                } else if (event.key === 'Escape') {
                  setTitleDraft(displayedTitle);
                  setEditingTitle(false);
                }
              }}
            />
          ) : isFollowUp ? (
            <h1>{displayedTitle}</h1>
          ) : (
            <button
              type="button"
              className="chat-title-button"
              aria-label={copy.chat.renameConversation}
              onClick={() => {
                setTitleDraft(displayedTitle);
                setEditingTitle(true);
              }}
            >
              <h1>{displayedTitle}</h1>
            </button>
          )}
        </div>
        <button
          className="round-back-button chat-header-new"
          aria-label={
            sending ? copy.chat.stopGenerating : copy.chat.newConversation
          }
          onClick={() => {
            if (sending) {
              abortRef.current?.abort();
              if (activeRequestId) onFailChat(activeRequestId, 'stopped');
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
        <div ref={contentRef} className="message-scroll__content">
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
                  {message.externalEvidence?.length ? (
                    <div
                      className="message-external-evidence"
                      aria-label={copy.settings.myLifeMemory}
                    >
                      {message.externalEvidence.map((item) => (
                        <span key={`${item.referenceId}:${item.matchReason}`}>
                          <small>{copy.settings.myLifeMemory}</small>
                          {item.title}
                          {item.date ? ` · ${item.date}` : ''}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {message.mcpCalls?.length ? (
                    <div className="message-mcp-call" role="status">
                      <Link2 size={13} strokeWidth={2.2} aria-hidden="true" />
                      <span>
                        {message.mcpCalls.some((call) => call.status === 'completed')
                          ? copy.chat.mcpCallCompleted
                          : message.mcpCalls.every((call) => call.status === 'not_found')
                            ? copy.chat.mcpCallNoMatch
                            : copy.chat.mcpCallUnavailable}
                      </span>
                    </div>
                  ) : null}
                  {body ? <div className="message-bubble">{body}</div> : null}
                  {showOptions && followUp ? (
                    <div className="message-options">
                      {followUpOptions.map((option) => (
                        <button
                          key={option.id}
                          data-option={option.id}
                          onClick={() => {
                            onAnswerFollowUp(
                              followUp.id,
                              option.label,
                              option.responseKind,
                            );
                            onToast(copy.chat.followUpSaved);
                          }}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {message.clarificationOptions?.length ? (
                    <div className="message-options message-options--clarification">
                      {message.clarificationOptions.slice(0, 3).map((option) => (
                        <button
                          key={option.optionId}
                          type="button"
                          disabled={sending}
                          onClick={() => void sendMessage(
                            option.label,
                            undefined,
                            {
                              optionId: option.optionId,
                              continuationToken: option.continuationToken,
                            },
                          )}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {message.role === 'user' &&
                  (message.deliveryState === 'failed' ||
                    message.deliveryState === 'stopped') ? (
                    <button
                      type="button"
                      className="message-retry-action"
                      aria-label={copy.common.retry}
                      disabled={sending || !message.requestId}
                      onClick={() => void sendMessage(
                        message.body,
                        message.requestId,
                        message.referenceConfirmation,
                      )}
                    >
                      <RotateCcw size={18} strokeWidth={2.2} />
                    </button>
                  ) : null}
                  {message.role === 'assistant' && message.retryable ? (
                    <button
                      type="button"
                      className="message-retry-action"
                      aria-label={copy.common.retry}
                      disabled={sending || !message.replyToRequestId}
                      onClick={() => {
                        const original = conversation.messages.find((item) =>
                          item.requestId === message.replyToRequestId
                        );
                        if (original) void sendMessage(
                          original.body,
                          undefined,
                          original.referenceConfirmation,
                        );
                      }}
                    >
                      <RotateCcw size={18} strokeWidth={2.2} />
                    </button>
                  ) : null}
                  {canRevisit && followUp ? (
                    <button
                      type="button"
                      className="message-revisit-action"
                      aria-label={copy.note.recordCurrentFeeling}
                      onClick={() => onRevisitEmotion(followUp.noteId, followUp.id)}
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

        {conversation.messages.some(
          (message) => message.deliveryState === 'pending',
        ) ? (
            <article className="message-row message-row--assistant is-pending">
              <div className="message-stack">
                {activeMcpRequestId ? (
                  <div className="message-mcp-call message-mcp-call--pending" role="status">
                    <Link2 size={14} strokeWidth={2.2} aria-hidden="true" />
                    <span>{copy.chat.mcpCalling}</span>
                  </div>
                ) : (
                  <div className="message-bubble" aria-label={copy.common.loading}>
                    <i />
                    <i />
                    <i />
                  </div>
                )}
              </div>
            </article>
        ) : null}
        <div ref={endRef} className="message-end-anchor" />
        </div>
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
            placeholder={copy.chat.messagePlaceholder}
            rows={1}
            enterKeyHint="send"
            aria-label={copy.chat.messagePlaceholder}
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
