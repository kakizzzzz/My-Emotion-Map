import type { QueryIntent } from './routeIntent';

export type RetrievalStatus =
  | 'supported'
  | 'ambiguous'
  | 'not_found'
  | 'evidence_insufficient'
  | 'clarification_required'
  | 'unsupported'
  | 'unavailable';

export const resolveRetrievalStatus = ({
  intent,
  scores,
  dateCount,
}: {
  intent: QueryIntent;
  scores: number[];
  dateCount: number;
}): RetrievalStatus => {
  if (intent === 'unsupported') return 'unsupported';
  if (intent === 'clarification_required') return 'clarification_required';
  if (!scores.length) return 'not_found';
  if (intent === 'comparison' && scores.length < 2) return 'evidence_insufficient';
  if (intent === 'pattern' && (scores.length < 3 || dateCount < 3)) {
    return 'evidence_insufficient';
  }
  if (
    (intent === 'lookup' || intent === 'reflection') &&
    scores.length > 1 && scores[0] - scores[1] < 8
  ) return 'ambiguous';
  return 'supported';
};
