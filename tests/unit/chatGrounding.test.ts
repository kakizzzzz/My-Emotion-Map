import { describe, expect, it } from 'vitest';
import {
  parseGeneratedDraft,
  selectAuthorizedEvidence,
  validateGeneratedDraft,
} from '../../supabase/functions/_shared/chatGrounding';

const snapshot = {
  schemaVersion: 3,
  dataMode: 'real',
  moments: [
    { id: 'm1', noteId: 'n1', isNew: false, isInboxDraft: false },
    { id: 'm2', noteId: 'n2', isNew: true, isInboxDraft: false },
    { id: 'm3', noteId: 'n3', isNew: false, isInboxDraft: true },
  ],
  notes: [
    { id: 'n1', title: '图书馆窗边的桌子', place: '图书馆', date: '2026-08-01', time: '14:00', emotion: null, excerpt: '桌上有一本书', answers: [], isDraft: false },
    { id: 'n2', title: 'hidden', place: 'x', date: '2026-08-01', time: '15:00', emotion: 'joy', excerpt: '', answers: [], isDraft: false },
    { id: 'n3', title: 'inbox', place: 'x', date: '2026-08-01', time: '16:00', emotion: 'calm', excerpt: '', answers: [], isDraft: false },
  ],
};

describe('grounded chat boundary', () => {
  it('selects only formal records and assigns server evidence keys', () => {
    const evidence = selectAuthorizedEvidence(snapshot, '图书馆', []);
    expect(evidence).toHaveLength(1);
    expect(evidence[0]).toMatchObject({ key: 'E1', noteId: 'n1', emotion: null });
  });

  it('rejects unknown-to-emotion inference and causal language', () => {
    const evidence = selectAuthorizedEvidence(snapshot, '图书馆', []);
    const draft = parseGeneratedDraft({
      claims: [{ claimId: 'c1', kind: 'record_fact', text: '这说明你因为图书馆而焦虑。', evidenceKeys: ['E1'], allowedFactKeys: [] }],
      limitations: [],
    });
    const validation = validateGeneratedDraft(draft!, evidence);
    expect(validation.validClaims).toHaveLength(0);
    expect(validation.retry).toBe(true);
  });

  it('accepts a bounded record fact tied to one authorized key', () => {
    const evidence = selectAuthorizedEvidence(snapshot, '图书馆', []);
    const draft = parseGeneratedDraft({
      claims: [{ claimId: 'c1', kind: 'record_fact', text: '这条记录写到图书馆窗边的桌子。', evidenceKeys: ['E1'], allowedFactKeys: [] }],
      limitations: ['情绪未填写'],
    });
    const validation = validateGeneratedDraft(draft!, evidence);
    expect(validation.validClaims).toHaveLength(1);
    expect(validation.validLimitations).toEqual(['情绪未填写']);
    expect(validation.retry).toBe(false);
  });

  it('rejects unsafe limitation text instead of exposing it', () => {
    const evidence = selectAuthorizedEvidence(snapshot, '图书馆', []);
    const draft = parseGeneratedDraft({
      claims: [{ claimId: 'c1', kind: 'record_fact', text: '这条记录写到图书馆窗边的桌子。', evidenceKeys: ['E1'], allowedFactKeys: [] }],
      limitations: ['这说明你有焦虑症。'],
    });
    const validation = validateGeneratedDraft(draft!, evidence);
    expect(validation.validLimitations).toEqual([]);
    expect(validation.retry).toBe(true);
  });

  it('rejects invented current-state claims and unsolicited advice', () => {
    const evidence = selectAuthorizedEvidence(snapshot, '图书馆', []);
    const draft = parseGeneratedDraft({
      claims: [
        { claimId: 'c1', kind: 'record_fact', text: '你现在很平静。', evidenceKeys: ['E1'], allowedFactKeys: [] },
        { claimId: 'c2', kind: 'record_fact', text: '你可以试试下次早点离开图书馆。', evidenceKeys: ['E1'], allowedFactKeys: [] },
      ],
      limitations: [],
    });
    const validation = validateGeneratedDraft(draft!, evidence);
    expect(validation.validClaims).toHaveLength(0);
    expect(validation.retry).toBe(true);
  });

  it('rejects model output that adds public evidence fields', () => {
    expect(parseGeneratedDraft({
      claims: [],
      limitations: [],
      evidence: [{ noteId: 'n1' }],
    })).toBeNull();
  });

  it('requires three different dates for repeated observations', () => {
    const evidence = [1, 2, 3].map((index) => ({
      key: `E${index}`, noteId: `n${index}`, title: '晚餐', place: '餐厅',
      date: index === 3 ? '2026-08-02' : '2026-08-01', time: '18:00',
      emotion: null, excerpt: '晚餐', answers: [], matchReason: 'title_match',
    }));
    const draft = parseGeneratedDraft({
      claims: [{ claimId: 'c1', kind: 'repeated_observation', text: '晚餐在这些记录中重复出现。', evidenceKeys: ['E1', 'E2', 'E3'], allowedFactKeys: ['recordCount'] }],
      limitations: [],
    });
    expect(validateGeneratedDraft(draft!, evidence).validClaims).toHaveLength(0);
  });
});
