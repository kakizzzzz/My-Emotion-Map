import { act, cleanup, render, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FOLLOW_UP_FEEDBACK_DURATION_MS,
  FOLLOW_UP_FEEDBACK_PARTS,
  FollowUpFeelingFeedback,
  useFollowUpFeelingFeedback,
} from '../../src/features/chat/FollowUpFeelingFeedback';
import type { ChatOption } from '../../src/types';

const feedbackKinds: ChatOption['responseKind'][] = [
  'lighter',
  'stronger',
  'different',
  'same',
  'skip',
];

describe('follow-up feeling feedback', () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it.each(feedbackKinds)(
    'gives %s its own calm local animation',
    (kind) => {
      vi.useFakeTimers();
      const onFinish = vi.fn();
      const { container } = render(
        <FollowUpFeelingFeedback
          feedback={{ id: 1, kind, x: 120, y: 240 }}
          onFinish={onFinish}
        />,
      );

      const animation = container.querySelector(
        `.follow-up-feeling-feedback[data-kind="${kind}"]`,
      );
      expect(animation).toHaveStyle({ left: '120px', top: '240px' });
      expect(animation?.querySelectorAll('.follow-up-feedback__part'))
        .toHaveLength(FOLLOW_UP_FEEDBACK_PARTS[kind]);
      expect(container.querySelector('.positive-confetti')).toBeNull();

      act(() => vi.advanceTimersByTime(FOLLOW_UP_FEEDBACK_DURATION_MS));
      expect(onFinish).toHaveBeenCalledTimes(1);
    },
  );

  it('anchors feedback to the center of the chat content area', () => {
    const contentArea = document.createElement('div');
    vi.spyOn(contentArea, 'getBoundingClientRect').mockReturnValue({
      x: 20,
      y: 80,
      left: 20,
      top: 80,
      right: 380,
      bottom: 680,
      width: 360,
      height: 600,
      toJSON: () => ({}),
    });
    const { result } = renderHook(() => useFollowUpFeelingFeedback());

    act(() => result.current.showFeedback('lighter', contentArea));

    expect(result.current.feedback).toMatchObject({
      kind: 'lighter',
      x: 200,
      y: 380,
    });
  });
});
