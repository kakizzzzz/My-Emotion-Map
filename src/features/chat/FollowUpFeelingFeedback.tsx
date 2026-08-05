import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import type { ChatOption } from '../../types';

export type FollowUpFeelingFeedbackState = {
  id: number;
  kind: ChatOption['responseKind'];
  x: number;
  y: number;
};

export const FOLLOW_UP_FEEDBACK_DURATION_MS = 2_050;

export const FOLLOW_UP_FEEDBACK_PARTS: Record<
  ChatOption['responseKind'],
  number
> = {
  lighter: 2,
  stronger: 2,
  different: 4,
  same: 2,
  skip: 2,
};

export function useFollowUpFeelingFeedback() {
  const [feedback, setFeedback] =
    useState<FollowUpFeelingFeedbackState | null>(null);
  const feedbackIdRef = useRef(0);
  const showFeedback = useCallback((
    kind: ChatOption['responseKind'],
    contentArea: HTMLElement | null,
  ) => {
    const bounds = contentArea?.getBoundingClientRect();
    feedbackIdRef.current += 1;
    setFeedback({
      id: feedbackIdRef.current,
      kind,
      x: bounds ? bounds.left + bounds.width / 2 : window.innerWidth / 2,
      y: bounds ? bounds.top + bounds.height / 2 : window.innerHeight / 2,
    });
  }, []);
  const clearFeedback = useCallback(() => setFeedback(null), []);
  return { feedback, showFeedback, clearFeedback };
}

export function FollowUpFeelingFeedback({
  feedback,
  onFinish,
}: {
  feedback: FollowUpFeelingFeedbackState | null;
  onFinish: () => void;
}) {
  useEffect(() => {
    if (!feedback) return undefined;
    const timer = window.setTimeout(onFinish, FOLLOW_UP_FEEDBACK_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [feedback, onFinish]);

  if (!feedback) return null;

  return (
    <div
      key={feedback.id}
      className="follow-up-feeling-feedback"
      data-kind={feedback.kind}
      style={{ left: feedback.x, top: feedback.y }}
      aria-hidden="true"
    >
      <span className="follow-up-feedback__halo" />
      <span className="follow-up-feedback__shape">
        {Array.from(
          { length: FOLLOW_UP_FEEDBACK_PARTS[feedback.kind] },
          (_, index) => (
            <i
              key={index}
              className="follow-up-feedback__part"
              style={{
                '--feedback-part-angle': `${index * 90}deg`,
              } as CSSProperties}
            />
          ),
        )}
      </span>
    </div>
  );
}
