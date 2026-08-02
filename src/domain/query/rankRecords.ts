import type { EmotionMoment, EmotionNote } from '../../types';
import { normalizeQueryText, tokenizeQuery } from './normalizeQuery';
import { parseQueryConstraints } from './parseConstraints';

export type RankedLocalRecord = {
  moment: EmotionMoment;
  score: number;
};

export type SearchDocument = {
  moment: EmotionMoment;
  title: string;
  place: string;
  userText: string;
  localDate: string;
  occurredAt: string;
};

export type LocalSearchIndex = { documents: SearchDocument[] };

let cachedMoments: EmotionMoment[] | null = null;
let cachedNotes: EmotionNote[] | null = null;
let cachedDocuments: SearchDocument[] = [];

export const createLocalSearchIndex = (
  moments: EmotionMoment[],
  notes: EmotionNote[],
): LocalSearchIndex => {
  const noteById = new Map(notes.map((note) => [note.id, note]));
  const documents = moments.flatMap((moment): SearchDocument[] => {
    const note = noteById.get(moment.noteId);
    if (!note || note.isDraft) return [];
    const localDate = note.localDate || note.date;
    return [{
      moment,
      title: normalizeQueryText(note.title),
      place: normalizeQueryText(note.place || moment.place),
      userText: normalizeQueryText(
        `${note.excerpt} ${note.answers.map((answer) => answer.answer).join(' ')}`,
      ),
      localDate,
      occurredAt: `${localDate}T${note.localTime || note.time}`,
    }];
  });
  return { documents };
};

const cachedSearchDocuments = (
  moments: EmotionMoment[],
  notes: EmotionNote[],
) => {
  if (moments === cachedMoments && notes === cachedNotes) return cachedDocuments;
  cachedDocuments = createLocalSearchIndex(moments, notes).documents;
  cachedMoments = moments;
  cachedNotes = notes;
  return cachedDocuments;
};

export const rankLocalSearch = (
  query: string,
  index: LocalSearchIndex,
): RankedLocalRecord[] => {
  const tokens = tokenizeQuery(query);
  const normalizedQuery = normalizeQueryText(query);
  const constraints = parseQueryConstraints(query);
  if (constraints.invalidDate) return [];
  const allowPartialTokens =
    !/^[\p{L}\p{N}]{1,2}$/u.test(normalizedQuery) ||
    Boolean(constraints.exactDate || constraints.dateRange);
  return index.documents
    .map((document) => {
      let score = 0;
      if (document.title === normalizedQuery) score += 80;
      if (document.place === normalizedQuery) score += 72;
      if (constraints.exactDate === document.localDate) score += 40;
      if (
        constraints.dateRange &&
        document.localDate >= constraints.dateRange.start &&
        document.localDate <= constraints.dateRange.end
      ) score += 30;
      for (const token of allowPartialTokens ? tokens : []) {
        if (document.title.includes(token)) score += 8;
        if (document.place.includes(token)) score += 7;
        if (document.userText.includes(token)) score += 3;
      }
      return score > 0
        ? { moment: document.moment, score, occurredAt: document.occurredAt }
        : null;
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .sort((left, right) =>
      right.score - left.score || right.occurredAt.localeCompare(left.occurredAt)
    )
    .map(({ moment, score }) => ({ moment, score }));
};

export const rankLocalRecords = (
  query: string,
  moments: EmotionMoment[],
  notes: EmotionNote[],
): RankedLocalRecord[] => {
  return rankLocalSearch(query, {
    documents: cachedSearchDocuments(moments, notes),
  });
};
