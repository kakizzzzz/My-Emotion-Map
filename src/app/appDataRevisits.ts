import type {
  EmotionKey,
  FollowUpRecord,
  RevisitRecord,
} from '../types';

const EMOTIONS = new Set<EmotionKey>([
  'calm', 'joy', 'tender', 'curious', 'energized', 'connected',
  'heavy', 'restless', 'focused', 'overwhelmed', 'numb', 'mixed',
]);

const isEmotion = (value: unknown): value is EmotionKey =>
  typeof value === 'string' && EMOTIONS.has(value as EmotionKey);

const isTimestamp = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0 &&
  !Number.isNaN(new Date(value).getTime());

const sanitizeRevisit = (value: unknown): RevisitRecord | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  if (
    typeof source.id !== 'string' || !source.id || source.id.length > 200 ||
    typeof source.noteId !== 'string' || !source.noteId || source.noteId.length > 200 ||
    !(source.originalEmotion === null || isEmotion(source.originalEmotion)) ||
    !(
      source.changeDirection === 'lighter' ||
      source.changeDirection === 'stronger' ||
      source.changeDirection === 'different' ||
      source.changeDirection === 'same' ||
      isEmotion(source.revisitedEmotion)
    ) ||
    !isTimestamp(source.originalOccurredAt) || !isTimestamp(source.revisitedAt)
  ) return null;
  return {
    id: source.id,
    noteId: source.noteId,
    originalEmotion: source.originalEmotion as EmotionKey | null,
    changeDirection:
      source.changeDirection === 'lighter' ||
      source.changeDirection === 'stronger' ||
      source.changeDirection === 'same'
        ? source.changeDirection
        : 'different',
    currentEmotion: isEmotion(source.currentEmotion)
      ? source.currentEmotion
      : isEmotion(source.revisitedEmotion) ? source.revisitedEmotion : undefined,
    originalOccurredAt: source.originalOccurredAt,
    revisitedAt: source.revisitedAt,
    sourceFollowUpId: typeof source.sourceFollowUpId === 'string'
      ? source.sourceFollowUpId.slice(0, 200)
      : undefined,
  };
};

export const sanitizeRevisits = (
  value: unknown,
  issues: string[],
  noteIds: ReadonlySet<string>,
  followUpById: ReadonlyMap<string, FollowUpRecord>,
) => {
  const sanitized = Array.isArray(value)
    ? value.flatMap((item) => {
        const revisit = sanitizeRevisit(item);
        if (!revisit) {
          issues.push('revisit-dropped');
          return [];
        }
        return noteIds.has(revisit.noteId) ? [revisit] : [];
      })
    : [];
  const byFollowUp = new Map<string, RevisitRecord>();
  const withoutFollowUp: RevisitRecord[] = [];
  for (const revisit of sanitized) {
    if (!revisit.sourceFollowUpId) {
      withoutFollowUp.push(revisit);
      continue;
    }
    if (followUpById.get(revisit.sourceFollowUpId)?.responseOptionId === 'skip') continue;
    const current = byFollowUp.get(revisit.sourceFollowUpId);
    if (!current || current.revisitedAt < revisit.revisitedAt) {
      byFollowUp.set(revisit.sourceFollowUpId, revisit);
    }
  }
  return [...withoutFollowUp, ...byFollowUp.values()];
};
