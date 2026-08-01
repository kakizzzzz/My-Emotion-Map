import { useState } from "react";
import { ChevronRight, X } from "lucide-react";
import { motion } from "motion/react";
import { EMOTION_ORDER } from "../../data";
import { EmotionStar } from "../../EmotionStar";
import { MOTION } from "../../motion";
import { useAppLanguage } from "../../i18n";
import type { EmotionKey, EmotionNote } from "../../types";
import {
  EMOTION_LABELS,
} from '../../domain/notePrompts';
import { useDialogFocus } from '../../app/useDialogFocus';

export function RevisitEmotionModal({
  note,
  onClose,
  onConfirm,
}: {
  note: EmotionNote;
  onClose: () => void;
  onConfirm: (noteId: string, emotion: EmotionKey) => void;
}) {
  const { copy, language } = useAppLanguage();
  const [selected, setSelected] = useState<EmotionKey | null>(null);
  const dialogRef = useDialogFocus<HTMLElement>({ onEscape: onClose });

  return (
    <motion.div
      className="overlay-layer revisit-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <motion.section
        ref={dialogRef}
        className="revisit-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="revisit-modal-title"
        tabIndex={-1}
        initial={{ opacity: 0, scale: 0.96, y: 14 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 10 }}
        transition={MOTION.sheet}
      >
        <header>
          <div className="revisit-stars">
            <EmotionStar
              emotion={note.emotion}
              size={46}
              colorOverride={note.color}
            />
            <ChevronRight size={19} strokeWidth={2.2} />
            <EmotionStar emotion={selected} size={56} selected />
          </div>
          <button
            className="icon-button popup-close-button"
            onClick={onClose}
            aria-label={copy.common.close}
          >
            <X size={19} strokeWidth={2.2} />
          </button>
        </header>
        <h2 id="revisit-modal-title">
          {copy.note.revisitPrompt(note.title)}
        </h2>
        <div className="revisit-emotions">
          {EMOTION_ORDER.map((emotion) => (
            <button
              key={emotion}
              className={selected === emotion ? 'is-selected' : ''}
              onClick={() => setSelected(emotion)}
            >
              <EmotionStar emotion={emotion} size={40} />
              <span>{EMOTION_LABELS[language][emotion]}</span>
            </button>
          ))}
        </div>
        <footer>
          <button className="secondary-button" onClick={onClose}>
            {copy.note.revisitLater}
          </button>
          <button
            className="primary-button"
            disabled={!selected}
            onClick={() => {
              if (selected) onConfirm(note.id, selected);
            }}
          >
            {copy.note.recordCurrentFeeling}
          </button>
        </footer>
      </motion.section>
    </motion.div>
  );
}
