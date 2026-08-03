import { useRef, useState } from "react";
import { Calendar, ChevronDown, ChevronRight, Map as MapIcon, MessageCircle, PanelLeft, Settings as SettingsIcon, Trash2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { MOTION } from "../motion";
import { useAppLanguage } from "../i18n";
import type { AppView, Conversation } from "../types";
import {
  FOLLOW_UP_CONVERSATION_ID,
} from '../domain/followUps';
import { useDialogFocus } from './useDialogFocus';

export function GlobalMenuButton({
  hasUnread,
  onClick,
}: {
  hasUnread: boolean;
  onClick: () => void;
}) {
  const { copy } = useAppLanguage();
  return (
    <motion.button
      id="global-menu-button"
      className="global-menu-button"
      whileTap={{ scale: 0.96 }}
      transition={MOTION.press}
      onClick={onClick}
      aria-label={copy.navigation.open}
    >
      <PanelLeft size={25} strokeWidth={2.2} />
      {hasUnread ? <span className="global-menu-button__unread" /> : null}
    </motion.button>
  );
}

function SwipeConversationRow({
  conversation,
  onOpen,
  onDelete,
}: {
  conversation: Conversation;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const { copy } = useAppLanguage();
  const pointerRef = useRef<{
    id: number;
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    startOffset: number;
    dragging: boolean;
  } | null>(null);
  const suppressClickUntilRef = useRef(0);
  const [offset, setOffset] = useState(0);

  return (
    <div className="side-ai-swipe-row">
      <button
        type="button"
        className="side-ai-delete"
        aria-label={`${copy.common.delete} ${conversation.title}`}
        onClick={onDelete}
      >
        <Trash2 size={18} strokeWidth={2.2} />
        <span>{copy.common.delete}</span>
      </button>
      <button
        type="button"
        className="side-ai-thread"
        style={{ transform: `translate3d(${offset}px, 0, 0)` }}
        onClick={() => {
          if (performance.now() < suppressClickUntilRef.current) return;
          if (offset < 0) setOffset(0);
          else onOpen();
        }}
        onPointerDown={(event) => {
          if (event.pointerType === 'mouse' && event.button !== 0) return;
          pointerRef.current = {
            id: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            lastX: event.clientX,
            lastY: event.clientY,
            startOffset: offset,
            dragging: false,
          };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const pointer = pointerRef.current;
          if (!pointer || pointer.id !== event.pointerId) return;
          pointer.lastX = event.clientX;
          pointer.lastY = event.clientY;
          const dx = event.clientX - pointer.startX;
          const dy = event.clientY - pointer.startY;
          if (!pointer.dragging && Math.hypot(dx, dy) < 10) return;
          if (!pointer.dragging && Math.abs(dy) > Math.abs(dx)) return;
          pointer.dragging = true;
          event.preventDefault();
          setOffset(Math.max(-82, Math.min(0, pointer.startOffset + dx)));
        }}
        onPointerUp={(event) => {
          const pointer = pointerRef.current;
          if (!pointer || pointer.id !== event.pointerId) return;
          pointerRef.current = null;
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
          const dx = pointer.lastX - pointer.startX;
          const dy = pointer.lastY - pointer.startY;
          const completedHorizontalDrag = pointer.dragging || (
            Math.abs(dx) >= 10 && Math.abs(dx) > Math.abs(dy)
          );
          if (completedHorizontalDrag) {
            event.preventDefault();
            suppressClickUntilRef.current = performance.now() + 700;
            setOffset(pointer.startOffset + dx <= -40 ? -82 : 0);
          }
        }}
        onPointerCancel={() => {
          pointerRef.current = null;
          setOffset(0);
        }}
      >
        <strong>{conversation.title}</strong>
        {conversation.badge ? <em>{conversation.badge}</em> : null}
      </button>
    </div>
  );
}

export function SideDrawer({
  activeView,
  conversations,
  onNavigate,
  onOpenConversation,
  onNewConversation,
  onDeleteConversation,
  onClose,
}: {
  activeView: AppView;
  conversations: Conversation[];
  onNavigate: (view: AppView) => void;
  onOpenConversation: (id: string) => void;
  onNewConversation: () => void;
  onDeleteConversation: (id: string) => void;
  onClose: () => void;
}) {
  const { copy } = useAppLanguage();
  const [aiExpanded, setAiExpanded] = useState(activeView === 'chat');
  const hasCommunicationUnread = conversations.some(
    (conversation) => conversation.unread,
  );
  const companionConversation = conversations.find(
    (conversation) => conversation.id === FOLLOW_UP_CONVERSATION_ID,
  );
  const otherConversations = conversations.filter(
    (conversation) => conversation.id !== FOLLOW_UP_CONVERSATION_ID,
  );
  const dialogRef = useDialogFocus<HTMLElement>({
    onEscape: onClose,
    restoreFocusId: 'global-menu-button',
  });
  const navItems: Array<{
    key: AppView;
    label: string;
    icon: typeof MapIcon;
  }> = [
    { key: 'map', label: copy.navigation.map, icon: MapIcon },
    { key: 'calendar', label: copy.navigation.calendar, icon: Calendar },
    { key: 'chat', label: copy.navigation.chat, icon: MessageCircle },
  ];

  return (
    <motion.div
      className="overlay-layer side-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.17 }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <motion.aside
        ref={dialogRef}
        className="side-drawer"
        initial={{ x: -28, opacity: 0.8 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: -24, opacity: 0 }}
        transition={MOTION.sheet}
        aria-label={copy.navigation.label}
        aria-modal="true"
        role="dialog"
        tabIndex={-1}
      >
        <header className="side-drawer__header">
          <h2>{copy.appName}</h2>
        </header>

        <div className="side-drawer__body">
          <nav className="side-nav">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = activeView === item.key;
              const isChat = item.key === 'chat';
              return (
                <div key={item.key}>
                  <div className="side-nav__row">
                    <button
                      className={`side-nav__item ${active ? 'is-active' : ''}`}
                      onClick={() => {
                        if (isChat) setAiExpanded((current) => !current);
                        else onNavigate(item.key);
                      }}
                      aria-expanded={isChat ? aiExpanded : undefined}
                      aria-controls={isChat ? 'side-chat-history' : undefined}
                    >
                      <span className="side-nav__icon">
                        <Icon size={22} strokeWidth={2.2} />
                        {isChat && hasCommunicationUnread ? (
                          <i className="side-nav__dot" />
                        ) : null}
                      </span>
                      <span>
                        <strong>{item.label}</strong>
                      </span>
                      {isChat && aiExpanded ? (
                        <ChevronDown size={19} strokeWidth={2.2} />
                      ) : (
                        <ChevronRight size={19} strokeWidth={2.2} />
                      )}
                    </button>
                  </div>

                  <AnimatePresence initial={false}>
                    {isChat && aiExpanded ? (
                      <motion.div
                        id="side-chat-history"
                        className="side-ai-accordion"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.16 }}
                      >
                        <div className="side-ai-list">
                          <button
                            className="side-ai-new"
                            onClick={onNewConversation}
                          >
                            <strong>{copy.chat.createConversation}</strong>
                          </button>
                          {companionConversation ? (
                            <>
                              <p>{copy.navigation.pinned}</p>
                              <button
                                key={companionConversation.id}
                                onClick={() =>
                                  onOpenConversation(companionConversation.id)
                                }
                              >
                                <strong>{copy.navigation.chat}</strong>
                                {companionConversation.badge ? (
                                  <em>{companionConversation.badge}</em>
                                ) : null}
                              </button>
                            </>
                          ) : null}
                          {otherConversations.map((thread) => (
                            <SwipeConversationRow
                              key={thread.id}
                              conversation={thread}
                              onOpen={() => onOpenConversation(thread.id)}
                              onDelete={() => onDeleteConversation(thread.id)}
                            />
                          ))}
                        </div>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </div>
              );
            })}
          </nav>
        </div>

        <footer className="side-drawer__footer">
          <button
            className="side-settings-button"
            onClick={() => onNavigate('settings')}
            aria-label={copy.navigation.settings}
          >
            <SettingsIcon size={22} strokeWidth={2.2} />
          </button>
        </footer>
      </motion.aside>
    </motion.div>
  );
}
