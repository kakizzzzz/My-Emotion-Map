import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useNoteWizardGestures } from '../../src/features/notes/useNoteWizardGestures';

function NativeTouchHarness({ onTap }: { onTap: () => void }) {
  const [step, setStep] = useState(0);
  const gestureHandlers = useNoteWizardGestures((direction) => {
    const next = Math.max(0, Math.min(2, step + direction));
    if (next === step) return false;
    setStep(next);
    return true;
  });

  return (
    <div data-testid="wizard-viewport" {...gestureHandlers}>
      <button type="button" onClick={onTap}>tap target</button>
      <output aria-label="current step">{step}</output>
    </div>
  );
}

const touch = (identifier: number, clientX: number, clientY: number) => ({
  identifier,
  clientX,
  clientY,
});

describe('native note wizard touch gestures', () => {
  it('navigates through native touch events and preserves the next real tap', () => {
    const onTap = vi.fn();
    render(<NativeTouchHarness onTap={onTap} />);
    const viewport = screen.getByTestId('wizard-viewport');
    const tapTarget = screen.getByRole('button', { name: 'tap target' });

    fireEvent.touchStart(viewport, {
      touches: [touch(7, 280, 120)],
      changedTouches: [touch(7, 280, 120)],
    });
    fireEvent.touchMove(viewport, {
      touches: [touch(7, 90, 124)],
      changedTouches: [touch(7, 90, 124)],
    });
    fireEvent.touchEnd(viewport, {
      touches: [],
      changedTouches: [touch(7, 90, 124)],
    });

    expect(screen.getByRole('status', { name: 'current step' })).toHaveTextContent('1');

    // A browser-generated click attached to the completed swipe is ignored.
    fireEvent.click(tapTarget);
    expect(onTap).not.toHaveBeenCalled();

    // A genuine new press clears suppression immediately, even when it is fast.
    fireEvent.touchStart(tapTarget, {
      touches: [touch(8, 140, 120)],
      changedTouches: [touch(8, 140, 120)],
    });
    fireEvent.touchEnd(tapTarget, {
      touches: [],
      changedTouches: [touch(8, 140, 120)],
    });
    fireEvent.click(tapTarget);
    expect(onTap).toHaveBeenCalledTimes(1);
  });
});
