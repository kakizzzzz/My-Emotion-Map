export type EditorExitView =
  | 'editing'
  | 'confirm_new'
  | 'confirm_existing'
  | 'closed';

export type EditorExitOutcome =
  | 'close'
  | 'save'
  | 'discard'
  | 'keep_draft'
  | 'delete_draft'
  | null;

export type EditorExitState = {
  view: EditorExitView;
  outcome: EditorExitOutcome;
};

export type EditorExitAction =
  | { type: 'request_close'; isNew: boolean; dirty: boolean }
  | { type: 'continue_editing' }
  | { type: 'save' }
  | { type: 'discard' }
  | { type: 'keep_draft' }
  | { type: 'delete_draft' };

export const initialEditorExitState: EditorExitState = {
  view: 'editing',
  outcome: null,
};

export const reduceEditorExit = (
  state: EditorExitState,
  action: EditorExitAction,
): EditorExitState => {
  if (state.view === 'closed') return state;
  if (action.type === 'request_close') {
    if (action.isNew) return { view: 'confirm_new', outcome: null };
    return action.dirty
      ? { view: 'confirm_existing', outcome: null }
      : { view: 'closed', outcome: 'close' };
  }
  if (action.type === 'continue_editing') return initialEditorExitState;
  if (state.view === 'confirm_existing') {
    if (action.type === 'save') return { view: 'closed', outcome: 'save' };
    if (action.type === 'discard') return { view: 'closed', outcome: 'discard' };
  }
  if (state.view === 'confirm_new') {
    if (action.type === 'keep_draft') return { view: 'closed', outcome: 'keep_draft' };
    if (action.type === 'delete_draft') return { view: 'closed', outcome: 'delete_draft' };
  }
  return state;
};
