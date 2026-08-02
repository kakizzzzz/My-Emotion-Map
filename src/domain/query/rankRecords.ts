import type { EmotionMoment, EmotionNote } from '../../types';
import { normalizeQueryText, tokenizeQuery } from './normalizeQuery';
import { parseQueryConstraints } from './parseConstraints';

export type RankedLocalRecord = {
  moment: EmotionMoment;
  score: number;
};

export const rankLocalRecords = (
  query: string,
  moments: EmotionMoment[],
  notes: EmotionNote[],
): RankedLocalRecord[] => {
  const tokens = tokenizeQuery(query);
  const normalizedQuery = normalizeQueryText(query);
  const constraints = parseQueryConstraints(query);
  const allowPartialTokens =
    !/^[\p{L}\p{N}]{1,2}$/u.test(normalizedQuery) ||
    Boolean(constraints.exactDate || constraints.dateRange);
  return moments
    .map((moment) => {
      const note = notes.find((item) => item.id === moment.noteId);
      if (!note || note.isDraft) return null;
      const title = normalizeQueryText(note.title);
      const place = normalizeQueryText(note.place || moment.place);
      const answers = normalizeQueryText(
        `${note.excerpt} ${note.answers.map((answer) => `${answer.question} ${answer.answer}`).join(' ')}`,
      );
      const localDate = note.localDate || note.date;
      let score = 0;
      if (title === normalizedQuery) score += 80;
      if (place === normalizedQuery) score += 72;
      if (constraints.exactDate === localDate) score += 40;
      if (
        constraints.dateRange &&
        localDate >= constraints.dateRange.start &&
        localDate <= constraints.dateRange.end
      ) {
        score += 30;
      }
      for (const token of allowPartialTokens ? tokens : []) {
        if (title.includes(token)) score += 8;
        if (place.includes(token)) score += 7;
        if (answers.includes(token)) score += 3;
      }
      return score > 0
        ? { moment, score, occurredAt: `${localDate}T${note.localTime || note.time}` }
        : null;
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .sort(
      (left, right) =>
        right.score - left.score ||
        right.occurredAt.localeCompare(left.occurredAt),
    )
    .map(({ moment, score }) => ({ moment, score }));
};
