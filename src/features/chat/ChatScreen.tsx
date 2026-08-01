import { useRef, useState } from 'react';
import { MessageSquarePlus, Send, Sparkles, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { EmotionStar } from '../../EmotionStar';
import { MOTION } from '../../motion';
import { useAppLanguage } from '../../i18n';
import type { ChatOption, Conversation, DataMode, EmotionNote } from '../../types';
import { FOLLOW_UP_CONVERSATION_ID } from '../../domain/followUps';
import { useDialogFocus } from '../../app/useDialogFocus';
import type { CloudAuth } from '../../services/supabaseClient';
import type { CloudSyncStatus } from '../../services/useCloudSync';
import { requestEmotionChat } from '../../services/emotionChat';

function AiAvatar() {
  return <span className="ai-avatar" aria-hidden="true"><Sparkles size={17} strokeWidth={2.2} /></span>;
}

export function ChatScreen({
  notes,
  conversations,
  activeConversationId,
  onAnswerFollowUp,
  cloudAuth,
  cloudRevision,
  cloudStatus,
  dataMode,
  onGroundedChat,
}: {
  notes: EmotionNote[];
  conversations: Conversation[];
  activeConversationId: string;
  onAnswerFollowUp: (followUpId: string, label: string, kind: ChatOption['responseKind']) => void;
  cloudAuth: CloudAuth | null;
  cloudRevision: number | null;
  cloudStatus: CloudSyncStatus;
  dataMode: DataMode;
  onGroundedChat: (conversationId: string, userBody: string, assistantBody: string, noteIds: string[]) => void;
}) {
  const { copy, language } = useAppLanguage();
  const [previewNoteId, setPreviewNoteId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const conversation = conversations.find((item) => item.id === activeConversationId) ??
    conversations.find((item) => item.id === FOLLOW_UP_CONVERSATION_ID) ?? {
      id: FOLLOW_UP_CONVERSATION_ID, title: copy.navigation.chat, preview: '', kind: 'companion' as const, messages: [],
    };
  const previewNote = notes.find((note) => note.id === previewNoteId) ?? null;
  const previewDialogRef = useDialogFocus<HTMLDivElement>({ isOpen: Boolean(previewNote), onEscape: () => setPreviewNoteId(null) });
  const isFollowUp = conversation.id === FOLLOW_UP_CONVERSATION_ID || conversation.kind === 'companion';
  const available = Boolean(cloudAuth && cloudRevision !== null && cloudStatus === 'synced' && dataMode === 'real');
  const unavailableMessage = !cloudAuth ? copy.chat.signInRequired : copy.chat.syncRequired;

  const send = async () => {
    const message = draft.trim();
    if (!available || !cloudAuth || cloudRevision === null || !message || sending || message.length > 1_200) return;
    setSending(true);
    setError('');
    const controller = new AbortController();
    abortRef.current = controller;
    const timer = window.setTimeout(() => controller.abort(), 22_000);
    try {
      const result = await requestEmotionChat({
        auth: cloudAuth, message, language, conversationId: conversation.id,
        clientRevision: cloudRevision, signal: controller.signal,
      });
      if (!result || !result.answer.trim()) {
        setError(copy.chat.chatUnavailable);
        return;
      }
      onGroundedChat(conversation.id, message, result.answer, result.evidence.map((item) => item.noteId));
      setDraft('');
    } catch {
      if (!controller.signal.aborted) setError(copy.chat.chatUnavailable);
    } finally {
      window.clearTimeout(timer);
      abortRef.current = null;
      setSending(false);
    }
  };

  return (
    <section className="paper-screen chat-screen" aria-busy={sending}>
      <header className="chat-header chat-header--thread">
        <div><h1>{isFollowUp ? copy.navigation.chat : conversation.title}</h1></div>
        <button
          className="round-back-button"
          aria-label={sending ? copy.chat.stopGenerating : copy.chat.newConversation}
          disabled={!sending}
          onClick={() => abortRef.current?.abort()}
        >
          {sending ? <X size={22} strokeWidth={2.2} /> : <MessageSquarePlus size={22} strokeWidth={2.2} />}
        </button>
      </header>

      <div className="message-scroll">
        <section className="ai-preview-notice" aria-label={copy.chat.aiPreviewTitle}>
          <Sparkles size={20} strokeWidth={2.2} />
          <div><strong>{copy.chat.aiPreviewTitle}</strong><p>{available ? copy.chat.aiPreviewBody : unavailableMessage}</p></div>
        </section>

        {conversation.messages.length ? conversation.messages.map((message) => (
          <article key={message.id} className={`message-row message-row--${message.role}`}>
            {message.role === 'assistant' ? <AiAvatar /> : null}
            <div className="message-stack">
              {message.noteIds?.length ? (
                <div className="message-note-links">
                  {message.noteIds.map((noteId) => {
                    const note = notes.find((item) => item.id === noteId);
                    if (!note) return null;
                    return (
                      <button key={noteId} onClick={() => setPreviewNoteId(noteId)}>
                        <EmotionStar emotion={note.emotion} size={25} colorOverride={note.color} />@{note.title}
                      </button>
                    );
                  })}
                </div>
              ) : null}
              <div className="message-bubble">{message.body}</div>
              {message.options?.length && message.followUpId ? (
                <div className="message-options">
                  {message.options.map((option) => (
                    <button key={option.id} onClick={() => onAnswerFollowUp(message.followUpId!, option.label, option.responseKind)}>{option.label}</button>
                  ))}
                </div>
              ) : null}
            </div>
          </article>
        )) : (
          <div className="chat-disabled-empty"><strong>{copy.chat.noFollowUpTitle}</strong><p>{copy.chat.noFollowUpBody}</p></div>
        )}
        {sending ? <p className="chat-request-status" role="status" aria-live="polite">{copy.chat.sending}</p> : null}
        {error ? <p className="chat-request-error" role="alert">{error}</p> : null}
      </div>

      <form className={`chat-composer ${available ? '' : 'chat-composer--disabled'}`} onSubmit={(event) => { event.preventDefault(); void send(); }}>
        <div className="composer-row">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value.slice(0, 1_200))}
            readOnly={!available}
            disabled={!available}
            placeholder={available ? copy.chat.messagePlaceholder : unavailableMessage}
            rows={1}
            aria-label={available ? copy.chat.messagePlaceholder : unavailableMessage}
          />
          <button className="send-button" type="submit" aria-label={copy.chat.send} disabled={!available || sending || !draft.trim()}>
            <Send size={19} strokeWidth={2.2} />
          </button>
        </div>
      </form>

      <AnimatePresence>
        {previewNote ? (
          <motion.div
            ref={previewDialogRef}
            className="inline-note-preview"
            initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }}
            transition={MOTION.sheet} role="dialog" aria-modal="true" aria-label={previewNote.title} tabIndex={-1}
          >
            <header>
              <EmotionStar emotion={previewNote.emotion} size={42} colorOverride={previewNote.color} />
              <div><p className="eyebrow">{copy.chat.mentionedNotes}</p><h2>{previewNote.title}</h2></div>
              <button className="icon-button popup-close-button" onClick={() => setPreviewNoteId(null)} aria-label={copy.common.close}><X size={19} strokeWidth={2.2} /></button>
            </header>
            <p>{previewNote.excerpt}</p>
            <small>{previewNote.date} · {previewNote.time} · {previewNote.place}</small>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}
