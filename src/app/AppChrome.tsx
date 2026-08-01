import { useState } from "react";
import { Calendar, ChevronDown, ChevronRight, Inbox, Map as MapIcon, MessageCircle, PanelLeft, Settings as SettingsIcon, Sparkles } from "lucide-react";
import { motion } from "motion/react";
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

export function GlobalInboxButton({
  unreadCount,
  onClick,
}: {
  unreadCount: number;
  onClick: () => void;
}) {
  const { copy } = useAppLanguage();
  return (
    <motion.button
      className="global-inbox-button"
      whileTap={{ scale: 0.96 }}
      transition={MOTION.press}
      onClick={onClick}
      aria-label={
        unreadCount > 0
          ? copy.inbox.openUnread(unreadCount)
          : copy.inbox.open
      }
    >
      <Inbox size={24} strokeWidth={2.2} />
      {unreadCount > 0 ? <span className="global-inbox-button__unread" /> : null}
    </motion.button>
  );
}

export function SideDrawer({
  activeView,
  conversations,
  onNavigate,
  onOpenConversation,
  onClose,
}: {
  activeView: AppView;
  conversations: Conversation[];
  onNavigate: (view: AppView) => void;
  onOpenConversation: (id: string) => void;
  onClose: () => void;
}) {
  const { copy } = useAppLanguage();
  const [aiExpanded, setAiExpanded] = useState(activeView === 'chat');
  const hasCommunicationUnread = conversations.some(
    (conversation) => conversation.unread,
  );
  const dialogRef = useDialogFocus<HTMLElement>({ onEscape: onClose });
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
                  <button
                    className={`side-nav__item ${active ? 'is-active' : ''}`}
                    onClick={() => (isChat ? setAiExpanded((current) => !current) : onNavigate(item.key))}
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

                  {isChat && aiExpanded ? (
                    <div className="side-ai-accordion">
                      <div className="side-ai-list">
                        <p>{copy.navigation.pinned}</p>
                        {conversations.slice(0, 1).map((thread) => (
                          <button key={thread.id} onClick={() => onOpenConversation(thread.id)}>
                            <strong>
                              {thread.id === FOLLOW_UP_CONVERSATION_ID
                                ? copy.navigation.chat
                                : thread.title}
                            </strong>
                            {thread.badge ? <em>{thread.badge}</em> : null}
                          </button>
                        ))}
                        {conversations.length > 1 ? (
                          <p>{copy.navigation.today}</p>
                        ) : null}
                        {conversations.slice(1).map((thread) => (
                          <button key={thread.id} onClick={() => onOpenConversation(thread.id)}>
                            <strong>{thread.title}</strong>
                            {thread.badge ? <em>{thread.badge}</em> : null}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
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

export function CelebrationLayer() {
  const { copy } = useAppLanguage();
  const particles = [
    [-118, -112, '#D2936D'],
    [-78, -148, '#D9B94F'],
    [-32, -126, '#7F9E91'],
    [18, -154, '#7297AE'],
    [64, -130, '#D2936D'],
    [112, -100, '#D9B94F'],
    [132, -42, '#7F9E91'],
    [104, 10, '#7297AE'],
    [70, 54, '#D2936D'],
    [18, 76, '#D9B94F'],
    [-32, 68, '#7F9E91'],
    [-78, 48, '#7297AE'],
    [-116, 4, '#D2936D'],
    [-138, -50, '#D9B94F'],
  ];
  return (
    <motion.div
      className="celebration-layer"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="celebration-message"
        initial={{ opacity: 0, scale: 0.95, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ delay: 0.16, ...MOTION.nav }}
      >
        <Sparkles size={19} strokeWidth={2.2} />
        <span>
          <strong>{copy.feedback.celebration}</strong>
        </span>
      </motion.div>
      <div className="celebration-burst" aria-hidden="true">
        {particles.map(([x, y, color], index) => (
          <motion.i
            key={index}
            style={{ background: color }}
            initial={{ x: 0, y: 0, opacity: 0, scale: 0.4, rotate: 0 }}
            animate={{
              x,
              y,
              opacity: [0, 0.78, 0],
              scale: [0.4, 1, 0.72],
              rotate: index % 2 ? 120 : -100,
            }}
            transition={{
              duration: 1.45,
              delay: index * 0.025,
              ease: [0.16, 1, 0.3, 1],
            }}
          />
        ))}
      </div>
    </motion.div>
  );
}
