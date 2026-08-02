import { useEffect, useMemo, useRef, useState } from "react";
import { Bell, Check, ChevronLeft, ChevronRight, Mic, Plus, Trash2, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { EMOTION_ORDER } from "../../data";
import { EmotionStar } from "../../EmotionStar";
import { MOTION } from "../../motion";
import { useAppLanguage } from "../../i18n";
import type { EmotionKey, EmotionMoment, EmotionNote, PlaceRating } from "../../types";
import {
  EMOTION_LABELS,
  getPlaceRatings,
  getQuestionPresets,
  normalizeGuidedAnswers,
  normalizeNewRecordPrompts,
  isPurposePrompt,
  applyAiOptionalQuestions,
} from '../../domain/notePrompts';
import { getSpeechRecognitionConstructor } from './speechRecognition';
import { createRecordId as createId } from '../../app/createRecordId';
import type {
  PhotoAssistDelivery,
  ToastHandler,
} from '../../app/appTypes';
import type {
  SpeechRecognitionLike,
} from './speechRecognition';
import { useDialogFocus } from '../../app/useDialogFocus';

export function NoteEditorSheet({
  moment,
  note,
  onClose,
  onSave,
  onToast,
  photoAssistDelivery = null,
}: {
  moment: EmotionMoment;
  note: EmotionNote;
  onClose: () => void;
  onSave: (
    momentId: string,
    note: EmotionNote,
    emotion: EmotionKey | null,
    rating: PlaceRating | null,
    color?: string,
    place?: string,
  ) => void;
  onToast: ToastHandler;
  photoAssistDelivery?: PhotoAssistDelivery | null;
}) {
  const { copy, language, speechLocale } = useAppLanguage();
  const placeRatings = getPlaceRatings(language);
  const questionPresets = getQuestionPresets(language);
  const initialTitle = moment.isNew && note.titleSource === 'fallback' ? '' : note.title;
  const [title, setTitle] = useState(initialTitle);
  const [titleSource, setTitleSource] = useState(note.titleSource ?? 'user');
  const [place, setPlace] = useState(note.place || moment.place);
  const [emotion, setEmotion] = useState<EmotionKey | null>(note.emotion);
  const starColor = note.color ?? moment.color;
  const [placeRating, setPlaceRating] = useState<PlaceRating | null>(note.placeRating);
  const [answers, setAnswers] = useState(() =>
    moment.isNew
      ? normalizeNewRecordPrompts(note.answers, language)
      : normalizeGuidedAnswers(note.answers),
  );
  const [followUp, setFollowUp] = useState(note.followUpEnabled ?? false);
  const [currentStep, setCurrentStep] = useState(0);
  const [highestStep, setHighestStep] = useState(0);
  const [placeChosen, setPlaceChosen] = useState(true);
  const [promptIndex, setPromptIndex] = useState(0);
  const [questionsComplete, setQuestionsComplete] = useState(false);
  const [voiceActive, setVoiceActive] = useState(false);
  const speechRecognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const titleEditedRef = useRef(false);
  const questionsTouchedRef = useRef(false);
  const appliedPhotoAssistRef = useRef<string | null>(null);
  const [addQuestionOpen, setAddQuestionOpen] = useState(false);
  const [customQuestion, setCustomQuestion] = useState('');
  const prompts = answers;
  const currentPrompt = prompts[promptIndex];
  const isLastPrompt = promptIndex === prompts.length - 1;
  const isPromptComplete = questionsComplete || !currentPrompt;
  const hasUnsavedChanges = useMemo(
    () =>
      title !== initialTitle ||
      place !== (note.place || moment.place) ||
      emotion !== note.emotion ||
      placeRating !== note.placeRating ||
      followUp !== (note.followUpEnabled ?? false) ||
      JSON.stringify(answers) !==
        JSON.stringify(normalizeGuidedAnswers(note.answers)),
    [
      answers,
      emotion,
      followUp,
      moment.place,
      note,
      initialTitle,
      place,
      placeRating,
      title,
    ],
  );

  const requestClose = () => {
    if (moment.isNew) {
      save();
      return;
    }
    if (
      hasUnsavedChanges &&
      !window.confirm(copy.note.discardConfirm)
    ) {
      return;
    }
    onClose();
  };
  const editorDialogRef = useDialogFocus<HTMLElement>({
    isOpen: !addQuestionOpen,
    onEscape: requestClose,
  });
  const addQuestionDialogRef = useDialogFocus<HTMLElement>({
    isOpen: addQuestionOpen,
    onEscape: () => setAddQuestionOpen(false),
  });

  useEffect(
    () => () => {
      speechRecognitionRef.current?.abort();
      speechRecognitionRef.current = null;
    },
    [],
  );

  useEffect(() => {
    if (
      !photoAssistDelivery ||
      photoAssistDelivery.requestId === appliedPhotoAssistRef.current ||
      !moment.isNew ||
      moment.source !== 'photo'
    ) return;
    appliedPhotoAssistRef.current = photoAssistDelivery.requestId;
    if (
      !titleEditedRef.current &&
      titleSource === 'fallback' &&
      !title.trim() &&
      photoAssistDelivery.result.titleSuggestion
    ) {
      setTitle(photoAssistDelivery.result.titleSuggestion);
      setTitleSource('ai');
    }
    if (!questionsTouchedRef.current && currentStep < 2) {
      setAnswers((current) => applyAiOptionalQuestions(
        current,
        photoAssistDelivery.result.optionalQuestions,
        language,
      ));
      setPromptIndex(0);
      setQuestionsComplete(false);
    }
  }, [currentStep, language, moment.isNew, moment.source, photoAssistDelivery, title, titleSource]);

  const goToStep = (step: number) => {
    if (step <= highestStep) setCurrentStep(step);
  };
  const goToPlaceStep = () => {
    window.setTimeout(() => {
      setHighestStep((current) => Math.max(current, 1));
      setCurrentStep(1);
    }, 160);
  };
  const goToPromptStep = () => {
    questionsTouchedRef.current = true;
    setHighestStep((current) => Math.max(current, 2));
    setCurrentStep(2);
  };

  const advancePrompt = () => {
    questionsTouchedRef.current = true;
    if (!currentPrompt) {
      setQuestionsComplete(true);
      return;
    }
    if (promptIndex < prompts.length - 1) {
      setPromptIndex((current) => current + 1);
      return;
    }
    setQuestionsComplete(true);
  };
  const returnFromPrompt = () => {
    if (promptIndex > 0) {
      setPromptIndex((current) => current - 1);
      return;
    }
    setCurrentStep(1);
  };
  const deleteCurrentPrompt = () => {
    questionsTouchedRef.current = true;
    if (!currentPrompt || isPurposePrompt(currentPrompt)) return;
    const nextPromptCount = prompts.length - 1;
    setAnswers((current) => current.filter((answer) => answer.id !== currentPrompt.id));
    if (nextPromptCount <= 0) {
      setPromptIndex(0);
      setQuestionsComplete(true);
      return;
    }
    if (promptIndex >= nextPromptCount) {
      setPromptIndex(nextPromptCount - 1);
    }
  };
  const editCompletedQuestions = () => {
    setQuestionsComplete(false);
    setPromptIndex(Math.max(0, prompts.length - 1));
  };
  const addQuestion = (question: string) => {
    questionsTouchedRef.current = true;
    const nextQuestion = question.trim();
    if (!nextQuestion || (moment.isNew && prompts.length >= 3)) return;
    if (
      prompts.some(
        (prompt) => prompt.question.trim().toLowerCase() === nextQuestion.toLowerCase(),
      )
    ) {
      return;
    }
    const nextPromptIndex = prompts.length;
    setAnswers((current) => [
      ...current,
      {
        id: createId('prompt'),
        question: nextQuestion,
        answer: '',
      },
    ]);
    setPromptIndex(nextPromptIndex);
    setQuestionsComplete(false);
    setCustomQuestion('');
    setAddQuestionOpen(false);
  };

  const applyVoiceTranscript = (transcript: string) => {
    const text = transcript.trim();
    if (!text) return;
    if (currentStep === 0) {
      titleEditedRef.current = true;
      setTitleSource('user');
      setTitle((current) => `${current}${current.trim() ? ' ' : ''}${text}`);
      return;
    }
    if (currentStep === 1) {
      const normalized = text.toLocaleLowerCase();
      const rating =
        placeRatings.find(
          (option) =>
            normalized.includes(option.label.toLocaleLowerCase()) ||
            normalized.includes(option.short.toLocaleLowerCase()),
        )?.key ?? null;
      if (!rating) {
        onToast(copy.feedback.feelingOptionNotRecognized);
        return;
      }
      setPlaceRating(rating);
      setPlaceChosen(true);
      return;
    }
    if (!currentPrompt) return;
    setAnswers((current) =>
      current.map((item) =>
        item.id === currentPrompt.id
          ? {
              ...item,
              answer: `${item.answer}${item.answer.trim() ? ' ' : ''}${text}`,
            }
          : item,
      ),
    );
  };

  const toggleVoiceInput = () => {
    if (voiceActive) {
      speechRecognitionRef.current?.stop();
      return;
    }
    if (!window.isSecureContext) {
      onToast(copy.feedback.voiceRequiresSecureContext);
      return;
    }
    const SpeechRecognition = getSpeechRecognitionConstructor();
    if (!SpeechRecognition) {
      onToast(copy.feedback.voiceUnsupported);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = speechLocale;
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .filter((result) => result.isFinal)
        .map((result) => result[0]?.transcript ?? '')
        .join('');
      applyVoiceTranscript(transcript);
    };
    recognition.onerror = (event) => {
      if (event.error !== 'aborted' && event.error !== 'no-speech') {
        onToast(
          event.error === 'not-allowed'
            ? copy.feedback.microphonePermissionRequired
            : copy.feedback.voiceIncomplete,
        );
      }
      setVoiceActive(false);
    };
    recognition.onend = () => {
      setVoiceActive(false);
      speechRecognitionRef.current = null;
    };
    speechRecognitionRef.current = recognition;
    setVoiceActive(true);
    try {
      recognition.start();
    } catch {
      speechRecognitionRef.current = null;
      setVoiceActive(false);
      onToast(copy.feedback.voiceStartFailed);
    }
  };

  function save() {
    const savedPlace = place.trim() || copy.map.selectedLocation;
    const enteredTitle = title.trim();
    const savedTitle = enteredTitle || (savedPlace
      ? `${savedPlace} · ${moment.date}`
      : copy.note.untitled);
    const excerpt =
      answers.find((answer) => answer.answer.trim())?.answer.trim() ||
      note.excerpt ||
      copy.note.notFilledExcerpt;
    onSave(
      moment.id,
      {
        ...note,
        title: savedTitle,
        titleSource: enteredTitle ? titleSource : 'fallback',
        place: savedPlace,
        emotion,
        color: starColor,
        placeRating,
        answers,
        excerpt,
        isDraft: false,
        followUpEnabled: followUp,
      },
      emotion,
      placeRating,
      starColor,
      savedPlace,
    );
  }

  return (
    <motion.div
      className="overlay-layer note-editor-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, pointerEvents: 'none' }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !addQuestionOpen) requestClose();
      }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
    >
      <motion.section
        ref={editorDialogRef}
        className="note-editor-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="note-editor-title"
        tabIndex={-1}
        initial={{ y: 38, opacity: 0.92 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 30, opacity: 0 }}
        transition={MOTION.sheet}
      >
        <header className="sheet-header note-editor-header">
          <small>
            {moment.date} · {moment.time}
            {typeof moment.heartRate === 'number'
              ? ` · ${copy.health.heartRate} ${moment.heartRate} bpm`
              : ''}
          </small>
          <div className="note-editor-header-actions">
            <button
              className="note-header-action popup-close-button"
              onClick={requestClose}
              aria-label={moment.isNew ? copy.note.closeAndSave : copy.note.discard}
            >
              <X size={19} strokeWidth={2.2} />
            </button>
          </div>
        </header>

        <div className="note-editor-scroll note-wizard-viewport">
          <motion.div
            className="note-wizard-track"
            animate={{ x: `-${currentStep * 100}%` }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          >
            <section
              className="note-wizard-page"
              aria-hidden={currentStep !== 0}
              inert={currentStep !== 0}
            >
              <section className="editor-section editor-step identity-step">
                <label className="title-input">
                  <span id="note-editor-title">{copy.note.titlePrompt}</span>
                  <input
                    value={title}
                    onChange={(event) => {
                      titleEditedRef.current = true;
                      setTitleSource('user');
                      setTitle(event.target.value);
                    }}
                  />
                </label>
                <label className="title-input place-name-input">
                  <span>{copy.note.placeNamePrompt}</span>
                  <input value={place} onChange={(event) => setPlace(event.target.value)} />
                </label>
                <header className="editor-step-heading">
                  <h3>{copy.note.emotionPrompt}</h3>
                </header>
                <div className="emotion-toolbar">
                  {EMOTION_ORDER.map((key) => (
                    <button
                      key={key}
                      className={emotion === key ? 'is-selected' : ''}
                      onClick={() => {
                        setEmotion(key);
                        goToPlaceStep();
                      }}
                      aria-label={EMOTION_LABELS[language][key]}
                    >
                      <EmotionStar
                        emotion={key}
                        size={42}
                        colorOverride={emotion === key && starColor ? starColor : '#5C5C5C'}
                        outline={emotion !== key || !starColor}
                      />
                      <small>{EMOTION_LABELS[language][key]}</small>
                    </button>
                  ))}
                </div>
                <button className="wizard-skip-button" onClick={goToPlaceStep}>
                  {copy.note.skipEmotion}
                </button>
              </section>
            </section>

            <section
              className="note-wizard-page"
              aria-hidden={currentStep !== 1}
              inert={currentStep !== 1}
            >
              <section className="editor-section editor-step place-rating-section">
                <header className="editor-step-heading">
                  <h3>{copy.note.placeRatingPrompt}</h3>
                </header>
                <div className="place-rating">
                  {placeRatings.map((rating) => (
                    <button
                      key={rating.key}
                      className={placeRating === rating.key ? 'is-selected' : ''}
                      onClick={() => {
                        setPlaceRating(rating.key);
                        setPlaceChosen(true);
                      }}
                      title={rating.label}
                    >
                      <i />
                      <span>{rating.short}</span>
                    </button>
                  ))}
                </div>
                <button
                  className="wizard-skip-button"
                  onClick={() => {
                    setPlaceChosen(true);
                    goToPromptStep();
                  }}
                >
                  {copy.note.skipPlaceRating}
                </button>
                <div className="follow-up-choice">
                    <button
                      className={`follow-up-toggle ${followUp ? 'is-active' : ''}`}
                      onClick={() => setFollowUp((current) => !current)}
                    >
                      <span>
                        <Bell size={19} strokeWidth={2.2} />
                        <strong>{copy.note.followUpConsent}</strong>
                      </span>
                      <i>
                        {followUp ? (
                          <Check size={15} strokeWidth={2.2} />
                        ) : null}
                      </i>
                    </button>
                    <p>{copy.note.followUpConsentHint}</p>
                  </div>
                <div className="wizard-step-actions">
                  <button
                    className="wizard-arrow-button"
                    onClick={() => goToStep(0)}
                    aria-label={copy.note.backToEmotionStep}
                  >
                    <ChevronLeft size={22} strokeWidth={2.2} />
                  </button>
                  <AnimatePresence>
                    {placeChosen ? (
                      <motion.button
                        className="wizard-arrow-button is-primary"
                        onClick={goToPromptStep}
                        aria-label={copy.note.continueToQuestions}
                        initial={{ opacity: 0, scale: 0.94 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.94 }}
                        transition={{ duration: 0.14 }}
                      >
                        <ChevronRight size={22} strokeWidth={2.2} />
                      </motion.button>
                    ) : null}
                  </AnimatePresence>
                </div>
              </section>
            </section>

            <section
              className="note-wizard-page"
              aria-hidden={currentStep !== 2}
              inert={currentStep !== 2}
            >
              <section
                className={`editor-section editor-step prompt-step ${
                  isPromptComplete ? 'is-complete' : ''
                }`}
              >
                {isPromptComplete ? (
                  <div className="prompt-complete-state">
                    <span role="status">{copy.common.done}</span>
                    <div className="prompt-complete-actions">
                      {prompts.length > 0 ? (
                        <button
                          className="prompt-complete-secondary"
                          onClick={editCompletedQuestions}
                          aria-label={copy.note.returnToEdit}
                        >
                          {copy.note.returnToEdit}
                        </button>
                      ) : null}
                      {prompts.length === 0 ? (
                        <button
                          className="prompt-complete-add"
                          onClick={() => setAddQuestionOpen(true)}
                          aria-label={copy.note.addQuestion}
                        >
                          <Plus size={18} strokeWidth={2.2} />
                        </button>
                      ) : null}
                      <button
                        className="prompt-complete-primary"
                        onClick={save}
                        aria-label={copy.note.saveStar}
                      >
                        {copy.note.saveStar}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <header className="editor-step-heading">
                      <h3>{currentPrompt.question}</h3>
                      <span>{Math.min(promptIndex + 1, prompts.length)} / {prompts.length}</span>
                    </header>
                    <AnimatePresence mode="wait" initial={false}>
                      <motion.div
                        key={currentPrompt.id}
                        className="guided-prompt-single"
                        initial={{ opacity: 0, x: 10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -8 }}
                        transition={{ duration: 0.14 }}
                      >
                        <textarea
                          rows={3}
                          value={currentPrompt.answer}
                          placeholder={copy.note.notePlaceholder}
                          aria-label={currentPrompt.question}
                          onChange={(event) => {
                            questionsTouchedRef.current = true;
                            setAnswers((current) =>
                              current.map((item) =>
                                item.id === currentPrompt.id
                                  ? { ...item, answer: event.target.value }
                                  : item,
                              ),
                            );
                          }}
                        />
                        <div className="prompt-step-actions">
                          <button
                            className="prompt-arrow-button"
                            onClick={returnFromPrompt}
                            aria-label={
                              promptIndex > 0
                                ? copy.note.previousQuestion
                                : copy.note.backToPlaceStep
                            }
                          >
                            <ChevronLeft size={20} strokeWidth={2.2} />
                          </button>
                          <div className="prompt-question-actions">
                            {isLastPrompt && !moment.isNew ? (
                              <button
                                className="prompt-add-button"
                                onClick={() => setAddQuestionOpen(true)}
                                aria-label={copy.note.addQuestion}
                                title={copy.note.addQuestion}
                              >
                                <Plus size={18} strokeWidth={2.2} />
                              </button>
                            ) : null}
                            {!isPurposePrompt(currentPrompt) ? (
                              <button
                                className="prompt-delete-button"
                                onClick={deleteCurrentPrompt}
                                aria-label={copy.note.deleteQuestion}
                                title={copy.note.deleteQuestion}
                              >
                                <Trash2 size={18} strokeWidth={2.2} />
                              </button>
                            ) : null}
                          </div>
                          <button
                            className="prompt-arrow-button"
                            onClick={advancePrompt}
                            aria-label={
                              !currentPrompt.answer.trim()
                                ? copy.note.skipQuestion
                                : isLastPrompt
                                ? copy.note.finishQuestions
                                : copy.note.nextQuestion
                            }
                          >
                            <ChevronRight size={20} strokeWidth={2.2} />
                          </button>
                        </div>
                      </motion.div>
                    </AnimatePresence>
                  </>
                )}
              </section>
            </section>
          </motion.div>
        </div>

        {currentStep === 2 && isPromptComplete ? null : (
          <footer className="voice-input-dock">
            <div
              className="note-page-indicator note-page-indicator--dock"
              aria-label={copy.note.pageProgress(currentStep + 1, 3)}
            >
              <div>
                {[0, 1, 2].map((step) => (
                  <button
                    key={step}
                    className={currentStep === step ? 'is-current' : ''}
                    onClick={() => goToStep(step)}
                    disabled={step > highestStep}
                    aria-label={copy.note.goToPage(step + 1)}
                    aria-current={currentStep === step ? 'step' : undefined}
                  />
                ))}
              </div>
            </div>
            <button
              className={`voice-input-button ${voiceActive ? 'is-active' : ''}`}
              onClick={toggleVoiceInput}
              aria-label={
                voiceActive ? copy.note.voiceStop : copy.note.voiceStart
              }
              aria-pressed={voiceActive}
            >
              <Mic size={25} strokeWidth={2.2} />
            </button>
          </footer>
        )}

        <AnimatePresence>
          {addQuestionOpen ? (
            <motion.div
              className="add-question-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) setAddQuestionOpen(false);
              }}
            >
              <motion.section
                ref={addQuestionDialogRef}
                className="add-question-sheet"
                initial={{ y: 24, opacity: 0.94 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 18, opacity: 0 }}
                transition={MOTION.sheet}
                onMouseDown={(event) => event.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-label={copy.note.addQuestion}
                tabIndex={-1}
              >
                <h3>{copy.note.addQuestion}</h3>
                <div className="add-question-presets">
                  {questionPresets.map((question) => {
                    const alreadyAdded = prompts.some(
                      (prompt) => prompt.question === question,
                    );
                    return (
                      <button
                        key={question}
                        disabled={alreadyAdded}
                        onClick={() => addQuestion(question)}
                      >
                        {question}
                      </button>
                    );
                  })}
                </div>
                <form
                  className="add-question-custom"
                  onSubmit={(event) => {
                    event.preventDefault();
                    addQuestion(customQuestion);
                  }}
                >
                  <input
                    value={customQuestion}
                    onChange={(event) => setCustomQuestion(event.target.value)}
                    placeholder={copy.note.customQuestionPlaceholder}
                    aria-label={copy.note.customQuestionPlaceholder}
                  />
                  <button
                    type="submit"
                    disabled={!customQuestion.trim()}
                    aria-label={copy.note.addQuestion}
                  >
                    <Plus size={20} strokeWidth={2.2} />
                  </button>
                </form>
              </motion.section>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </motion.section>
    </motion.div>
  );
}
