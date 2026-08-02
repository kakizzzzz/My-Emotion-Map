import { normalized, queryTerms } from './chatGrounding.ts';
import {
  listFormalEmotionRecords,
  researchEmotionContext,
} from './emotionMapMcpResearch.ts';
import type { EmotionMapMcpToken } from './emotionMapMcpAuth.ts';
import { supportsEmotionMapSnapshot } from './emotionMapSnapshotBoundary.ts';

type JsonObject = Record<string, unknown>;
type FormalRecord = ReturnType<typeof listFormalEmotionRecords>[number];

const text = (value: unknown, max: number) =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

const positiveInteger = (value: unknown, fallback: number, max: number) =>
  Number.isSafeInteger(value) ? Math.min(max, Math.max(1, Number(value))) : fallback;

const publicRecord = (record: FormalRecord, matchReason: string) => ({
  referenceId: record.noteId,
  title: record.title,
  place: record.place,
  date: record.date,
  time: record.time,
  emotion: record.emotion,
  excerpt: record.excerpt,
  matchReason,
});

const withinRange = (record: FormalRecord, input: JsonObject) => {
  const startDate = text(input.startDate, 10);
  const endDate = text(input.endDate, 10);
  return (!startDate || record.date >= startDate) &&
    (!endDate || record.date <= endDate);
};

const filteredRecords = (
  records: FormalRecord[],
  input: JsonObject,
) => {
  const query = text(input.query, 300);
  const terms = query ? queryTerms(query) : [];
  const place = normalized(text(input.place, 160));
  const emotion = text(input.emotion, 40);
  return records.filter((record) => {
    const haystack = normalized([
      record.title, record.place, record.excerpt, ...record.answers,
    ].join(' '));
    return withinRange(record, input) &&
      (!place || normalized(record.place) === place) &&
      (!emotion || record.emotion === emotion) &&
      (!terms.length || terms.some((term) => haystack.includes(term)));
  });
};

const recordList = (
  records: FormalRecord[],
  input: JsonObject,
  fallbackLimit = 6,
  matchReason = 'filter_match',
) => {
  const filtered = filteredRecords(records, input);
  const limit = positiveInteger(input.limit, fallbackLimit, 20);
  return {
    status: filtered.length ? 'supported' as const : 'not_found' as const,
    count: filtered.length,
    records: filtered.slice(0, limit).map((record) => publicRecord(record, matchReason)),
    limitations: filtered.length > limit ? ['result_limit_applied'] : [],
  };
};

export const executeEmotionMapReadTool = async ({
  token,
  snapshot,
  name,
  input,
  continuationSecret,
  now = new Date(),
}: {
  token: EmotionMapMcpToken;
  snapshot: unknown;
  name: string;
  input: JsonObject;
  continuationSecret: string;
  now?: Date;
}) => {
  if (!supportsEmotionMapSnapshot(snapshot)) return null;
  const records = listFormalEmotionRecords(snapshot);
  if (name === 'research_emotion_context') {
    return researchEmotionContext({
      snapshot,
      userId: token.userId,
      query: text(input.query, 1_200),
      limit: positiveInteger(input.limit, 6, 6),
      continuationSecret,
      continuationToken: text(input.continuationToken, 4_096) || undefined,
      optionId: text(input.optionId, 120) || undefined,
      now,
    });
  }
  if (name === 'search_emotion_records') return recordList(records, input);
  if (name === 'get_location_emotion_context') {
    return recordList(records, input, 20, 'exact_place_match');
  }
  if (name === 'get_day_emotion_context') {
    return recordList(records, {
      startDate: input.date,
      endDate: input.date,
      limit: input.limit,
    }, 20, 'exact_date_match');
  }
  if (name === 'list_emotion_locations') {
    const counts = new Map<string, number>();
    records.filter((record) => withinRange(record, input)).forEach((record) => {
      if (record.place) counts.set(record.place, (counts.get(record.place) ?? 0) + 1);
    });
    const locations = [...counts].map(([place, count]) => ({ place, count }))
      .sort((left, right) => right.count - left.count || left.place.localeCompare(right.place));
    const limit = positiveInteger(input.limit, 20, 50);
    return {
      status: locations.length ? 'supported' as const : 'not_found' as const,
      count: locations.length,
      locations: locations.slice(0, limit),
      limitations: locations.length > limit ? ['result_limit_applied'] : [],
    };
  }
  if (name === 'summarize_emotion_range') {
    const ranged = records.filter((record) => withinRange(record, input));
    const groupBy = text(input.groupBy, 10) as 'date' | 'place' | 'emotion';
    const counts = new Map<string, number>();
    ranged.forEach((record) => {
      const key = groupBy === 'date'
        ? record.date
        : groupBy === 'place'
          ? record.place
          : record.emotion ?? 'unknown';
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
    return {
      status: ranged.length ? 'supported' as const : 'not_found' as const,
      count: ranged.length,
      range: {
        startDate: text(input.startDate, 10),
        endDate: text(input.endDate, 10),
      },
      groups: [...counts].map(([key, count]) => ({ key, count }))
        .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key)),
      limitations: [],
    };
  }
  if (name === 'export_emotion_report') {
    const filtered = records.filter((record) => withinRange(record, input));
    const limit = positiveInteger(input.limit, 50, 50);
    return {
      status: filtered.length ? 'supported' as const : 'not_found' as const,
      count: Math.min(filtered.length, limit),
      format: 'json' as const,
      generatedAt: now.toISOString(),
      records: filtered.slice(0, limit).map((record) => publicRecord(record, 'range_export')),
      limitations: filtered.length > limit ? ['result_limit_applied'] : [],
    };
  }
  return null;
};
