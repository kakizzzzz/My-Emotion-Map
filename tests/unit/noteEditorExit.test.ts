import { describe, expect, it } from 'vitest';
import {
  initialEditorExitState,
  reduceEditorExit,
} from '../../src/features/notes/noteEditorExit';

describe('note editor exit state machine', () => {
  it('asks how to handle every new draft instead of finalizing it', () => {
    expect(reduceEditorExit(initialEditorExitState, {
      type: 'request_close',
      isNew: true,
      dirty: false,
    })).toEqual({ view: 'confirm_new', outcome: null });
  });

  it('closes an unchanged existing record without saving', () => {
    expect(reduceEditorExit(initialEditorExitState, {
      type: 'request_close',
      isNew: false,
      dirty: false,
    })).toEqual({ view: 'closed', outcome: 'close' });
  });

  it('asks before leaving a dirty existing record', () => {
    const confirming = reduceEditorExit(initialEditorExitState, {
      type: 'request_close',
      isNew: false,
      dirty: true,
    });
    expect(confirming).toEqual({ view: 'confirm_existing', outcome: null });
    expect(reduceEditorExit(confirming, { type: 'continue_editing' }))
      .toEqual(initialEditorExitState);
    expect(reduceEditorExit(confirming, { type: 'discard' }))
      .toEqual({ view: 'closed', outcome: 'discard' });
    expect(reduceEditorExit(confirming, { type: 'save' }))
      .toEqual({ view: 'closed', outcome: 'save' });
  });

  it('keeps or deletes a new record only through explicit choices', () => {
    const confirming = { view: 'confirm_new', outcome: null } as const;
    expect(reduceEditorExit(confirming, { type: 'keep_draft' }))
      .toEqual({ view: 'closed', outcome: 'keep_draft' });
    expect(reduceEditorExit(confirming, { type: 'delete_draft' }))
      .toEqual({ view: 'closed', outcome: 'delete_draft' });
  });
});
