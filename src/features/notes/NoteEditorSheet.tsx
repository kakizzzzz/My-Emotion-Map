import { useEffect, useReducer, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, LoaderCircle, Mic, Plus, Trash2, X } from "lucide-react";
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
import {
  getSpeechRecognitionConstructor,
  requestMicrophoneAccess,
} from './speechRecognition';
import { createRecordId as createId } from '../../app/createRecordId';
import type {
  PhotoAssistDelivery,
  ToastHandler,
} from '../../app/appTypes';
import type {
  SpeechRecognitionLike,
} from './speechRecognition';
import { useDialogFocus } from '../../app/useDialogFocus';
import { useNoteWizardGestures } from './useNoteWizardGestures';
import {
  initialEditorExitState,
  reduceEditorExit,
  type EditorExitAction,
} from './noteEditorExit';
import type { CloudAuth } from '../../services/supabaseClient';
import {
  requestVoiceSummary,
  type VoiceSummaryTarget,
} from '../../services/voiceSummary';

type SaveNoteHandler = (
  momentId: string,
  note: EmotionNote,
  emotion: EmotionKey | null,
  rating: PlaceRating | null,
  color?: string,
  place?: string,
) => void;

export function NoteEditorSheet({
  moment,
  note,
  onSave,
  onClose,
  onToast,
  cloudAuth = null,
  photoAssistDelivery = null,
}: {
  moment: EmotionMoment;
  note: EmotionNote;
  onSave: SaveNoteHandler;
  onClose: () => void;
  onToast: ToastHandler;
  cloudAuth?: CloudAuth | null;
  photoAssistDelivery?: PhotoAssistDelivery | null;
}) {
  const { copy, language, speechLocale } = useAppLanguage();
  const placeRatings = getPlaceRatings(language);
  const questionPresets = getQuestionPresets(language);
  const initialTitle = moment.isNew && note.titleSource === 'fallback' ? '' : note.title;
  const [title, setTitle] = useState(initialTitle);
  const [titleSource, setTitleSource] = useState(note.titleSource ?? 'user');
  const place = note.place || moment.place;
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
  const [promptIndex, setPromptIndex] = useState(0);
  const [questionsComplete, setQuestionsComplete] = useState(false);
  const [voiceActive, setVoiceActive] = useState(false);
  const [voicePending, setVoicePending] = useState(false);
  const [voiceSummarizing, setVoiceSummarizing] = useState(false);
  const speechRecognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const voiceSummaryAbortRef = useRef<AbortController | null>(null);
  const titleEditedRef = useRef(false);
  const questionsTouchedRef = useRef(false);
  const appliedPhotoAssistRef = useRef<string | null>(null);
  const [addQuestionOpen, setAddQuestionOpen] = useState(false);
  const [customQuestion, setCustomQuestion] = useState('');
  const [exitState, dispatchExit] = useReducer(
    reduceEditorExit,
    initialEditorExitState,
  );
  const prompts = answers;
  const currentPrompt = prompts[promptIndex];
  const isLastPrompt = promptIndex === prompts.length - 1;
  const isPromptComplete = questionsComplete || !currentPrompt;
  const [initialEditorDigest] = useState(() => JSON.stringify({
    title: initialTitle,
    titleSource: note.titleSource ?? 'user',
    place: note.place || moment.place,
    emotion: note.emotion,
    placeRating: note.placeRating,
    answers: moment.isNew
      ? normalizeNewRecordPrompts(note.answers, language)
      : normalizeGuidedAnswers(note.answers),
    followUp: note.followUpEnabled ?? false,
  }));
  const editorDigest = JSON.stringify({
    title,
    titleSource,
    place,
    emotion,
    placeRating,
    answers,
    followUp,
  });
  const isDirty = editorDigest !== initialEditorDigest;

  const applyExitAction = (action: EditorExitAction) => {
    const next = reduceEditorExit(exitState, action);
    dispatchExit(action);
    if (next.outcome === 'save') save();
    if (next.outcome === 'close' || next.outcome === 'discard') onClose();
  };
  const requestClose = () => applyExitAction({
    type: 'request_close',
    isNew: Boolean(moment.isNew),
    dirty: isDirty,
  });
  const editorDialogRef = useDialogFocus<HTMLElement>({
    isOpen: !addQuestionOpen && exitState.view === 'editing',
    onEscape: requestClose,
  });
  const addQuestionDialogRef = useDialogFocus<HTMLElement>({
    isOpen: addQuestionOpen,
    onEscape: () => setAddQuestionOpen(false),
  });
  const exitDialogRef = useDialogFocus<HTMLElement>({
    isOpen: exitState.view === 'confirm_new' || exitState.view === 'confirm_existing',
    onEscape: () => applyExitAction({ type: 'continue_editing' }),
  });

  useEffect(
    () => () => {
      speechRecognitionRef.current?.abort();
      speechRecognitionRef.current = null;
      voiceSummaryAbortRef.current?.abort();
      voiceSummaryAbortRef.current = null;
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
  const navigateWizard = (direction: -1 | 1) => {
    const nextStep = Math.max(0, Math.min(2, currentStep + direction));
    if (nextStep === currentStep) return false;
    if (nextStep === 2 && direction > 0) {
      goToPromptStep();
      return true;
    }
    if (nextStep > currentStep) {
      setHighestStep((current) => Math.max(current, nextStep));
    }
    setCurrentStep(nextStep);
    return true;
  };
  const wizardGestureHandlers = useNoteWizardGestures(navigateWizard);

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
    if (!nextQuestion || prompts.length >= 8) return;
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

  const applyVoiceText = (
    text: string,
    target: VoiceSummaryTarget,
    promptId: string | null,
    aiPlaceRating: PlaceRating | null = null,
  ) => {
    if (target === 'title') {
      titleEditedRef.current = true;
      setTitleSource('user');
      setTitle(text);
      return;
    }
    if (target === 'place_rating') {
      if (aiPlaceRating) {
        setPlaceRating(aiPlaceRating);
        return;
      }
      const normalized = text.toLocaleLowerCase();
      const rating = placeRatings.find(
        (option) =>
          normalized.includes(option.label.toLocaleLowerCase()) ||
          normalized.includes(option.short.toLocaleLowerCase()),
      )?.key ?? null;
      if (rating) {
        setPlaceRating(rating);
      } else {
        onToast(copy.feedback.feelingOptionNotRecognized);
      }
      return;
    }
    if (!promptId) return;
    setAnswers((current) =>
      current.map((item) =>
        item.id === promptId
          ? {
              ...item,
              answer: `${item.answer}${item.answer.trim() ? ' ' : ''}${text}`,
            }
          : item,
      ),
    );
  };

  const applyVoiceTranscript = async (
    transcript: string,
    target: VoiceSummaryTarget,
    promptId: string | null,
  ) => {
    const text = transcript.trim();
    if (!text) return;
    if (!cloudAuth) {
      applyVoiceText(text, target, promptId);
      onToast(copy.feedback.voiceSummaryFallback);
      return;
    }
    voiceSummaryAbortRef.current?.abort();
    const controller = new AbortController();
    voiceSummaryAbortRef.current = controller;
    setVoiceSummarizing(true);
    try {
      const result = await requestVoiceSummary({
        auth: cloudAuth,
        transcript: text,
        language,
        target,
        signal: controller.signal,
      });
      applyVoiceText(result.summary, target, promptId, result.placeRating);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      applyVoiceText(text, target, promptId);
      onToast(copy.feedback.voiceSummaryFallback);
    } finally {
      if (voiceSummaryAbortRef.current === controller) {
        voiceSummaryAbortRef.current = null;
        setVoiceSummarizing(false);
      }
    }
  };

  const toggleVoiceInput = async () => {
    if (voicePending || voiceSummarizing) return;
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

    setVoicePending(true);
    const microphoneAccess = await requestMicrophoneAccess();
    setVoicePending(false);
    if (microphoneAccess !== 'granted') {
      onToast(
        microphoneAccess === 'denied'
          ? copy.feedback.microphonePermissionRequired
          : copy.feedback.voiceUnsupported,
      );
      return;
    }

    const recognition = new SpeechRecognition();
    const target: VoiceSummaryTarget = currentStep === 0
      ? 'title'
      : currentStep === 1
        ? 'place_rating'
        : 'answer';
    const promptId = target === 'answer' ? currentPrompt?.id ?? null : null;
    recognition.lang = speechLocale;
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .filter((result) => result.isFinal)
        .map((result) => result[0]?.transcript ?? '')
        .join('');
      void applyVoiceTranscript(transcript, target, promptId);
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

  function buildNote(isDraft: boolean) {
    const savedPlace = place.trim() || copy.map.selectedLocation;
    const enteredTitle = title.trim();
    const savedTitle = enteredTitle || (savedPlace
      ? `${savedPlace} · ${moment.date}`
      : copy.note.untitled);
    const excerpt =
      answers.find((answer) => answer.answer.trim())?.answer.trim() ||
      note.excerpt ||
      copy.note.notFilledExcerpt;
    return {
      savedPlace,
      savedNote: {
        ...note,
        title: savedTitle,
        titleSource: enteredTitle ? titleSource : 'fallback',
        place: savedPlace,
        emotion,
        color: starColor,
        placeRating,
        answers,
        excerpt,
        isDraft,
        followUpEnabled: followUp,
      },
    };
  }

  function save() {
    const { savedPlace, savedNote } = buildNote(false);
    onSave(
      moment.id,
      savedNote,
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
        aria-hidden={exitState.view !== 'editing' ? true : undefined}
        inert={exitState.view !== 'editing' ? true : undefined}
        tabIndex={-1}
        initial={{ y: 38, opacity: 0.92 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 30, opacity: 0 }}
        transition={MOTION.sheet}
      >
        <header className="sheet-header note-editor-header">
          <small>
            {moment.date} · {moment.time}
          </small>
          <div className="note-editor-header-actions">
            <button
              className="note-header-action popup-close-button"
              onClick={requestClose}
              aria-label={copy.note.closeEditor}
            >
              <X size={19} strokeWidth={2.2} />
            </button>
          </div>
        </header>

        <div
          className="note-editor-scroll note-wizard-viewport"
          {...wizardGestureHandlers}
        >
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
                      }}
                      title={rating.label}
                    >
                      <i />
                      <span>{rating.short}</span>
                    </button>
                  ))}
                </div>
                <div className="wizard-step-actions">
                  <button
                    className={`follow-up-toggle ${followUp ? 'is-active' : ''}`}
                    onClick={() => setFollowUp((current) => !current)}
                  >
                    <strong>{copy.note.followUpConsent}</strong>
                    <i>
                      {followUp ? <Check size={11} strokeWidth={2.5} /> : null}
                    </i>
                  </button>
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
                          {isPurposePrompt(currentPrompt) ? (
                            <button
                              type="button"
                              className="prompt-skip-guide-button"
                              onClick={() => {
                                questionsTouchedRef.current = true;
                                setQuestionsComplete(true);
                              }}
                            >
                              {copy.note.skipGuidedQuestions}
                            </button>
                          ) : (
                            <div className="prompt-center-actions">
                              <button
                                className="prompt-delete-button"
                                onClick={deleteCurrentPrompt}
                                aria-label={copy.note.deleteQuestion}
                                title={copy.note.deleteQuestion}
                              >
                                <Trash2 size={18} strokeWidth={2.2} />
                              </button>
                              {isLastPrompt ? (
                                <button
                                  className="prompt-add-button"
                                  onClick={() => setAddQuestionOpen(true)}
                                  aria-label={copy.note.addQuestion}
                                  title={copy.note.addQuestion}
                                >
                                  <Plus size={18} strokeWidth={2.2} />
                                </button>
                              ) : null}
                            </div>
                          )}
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
              className={`voice-input-button ${voiceActive ? 'is-active' : ''} ${
                voicePending || voiceSummarizing ? 'is-processing' : ''
              }`}
              onClick={() => void toggleVoiceInput()}
              disabled={voicePending || voiceSummarizing}
              aria-label={
                voiceSummarizing
                  ? copy.note.voiceSummarizing
                  : voicePending
                    ? copy.note.voiceRequestingPermission
                    : voiceActive
                      ? copy.note.voiceStop
                      : copy.note.voiceStart
              }
              aria-pressed={voiceActive}
            >
              {voicePending || voiceSummarizing ? (
                <LoaderCircle size={25} strokeWidth={2.2} />
              ) : (
                <Mic size={25} strokeWidth={2.2} />
              )}
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
      <AnimatePresence>
        {exitState.view === 'confirm_new' || exitState.view === 'confirm_existing' ? (
          <motion.div
            className="note-editor-exit-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                applyExitAction({ type: 'continue_editing' });
              }
            }}
          >
            <motion.section
              ref={exitDialogRef}
              className="note-editor-exit-sheet"
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="note-editor-exit-title"
              tabIndex={-1}
              initial={{ y: 18, opacity: 0.96 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 12, opacity: 0 }}
              transition={MOTION.sheet}
              onMouseDown={(event) => event.stopPropagation()}
            >
              <h2 id="note-editor-exit-title">
                {exitState.view === 'confirm_new'
                  ? copy.note.exitNewTitle
                  : copy.note.exitExistingTitle}
              </h2>
              <div className="note-editor-exit-actions">
                <button
                  className="is-primary"
                  onClick={() => applyExitAction({ type: 'save' })}
                >
                  {copy.common.save}
                </button>
                <button onClick={() => applyExitAction({ type: 'exit' })}>
                  {copy.note.exitEditor}
                </button>
                <button onClick={() => applyExitAction({ type: 'continue_editing' })}>
                  {copy.common.back}
                </button>
              </div>
            </motion.section>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.div>
  );
}
