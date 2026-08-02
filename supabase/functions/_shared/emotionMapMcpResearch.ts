import {
  normalized,
  queryTerms,
  retrieveAuthorizedEvidence,
  type AuthorizedEvidence,
} from './chatGrounding.ts';

type JsonObject = Record<string, unknown>;

const asObject = (value: unknown): JsonObject | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonObject
    : null;

const text = (value: unknown, max: number) =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

const hex = (bytes: ArrayBuffer) => [...new Uint8Array(bytes)]
  .map((byte) => byte.toString(16).padStart(2, '0')).join('');

const sha256 = async (value: string) => hex(await crypto.subtle.digest(
  'SHA-256', new TextEncoder().encode(value),
));

const hmac = async (secret: string, value: string) => {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  return hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value)));
};

const formalRecords = (snapshotValue: unknown) => {
  const snapshot = asObject(snapshotValue);
  if (!snapshot || snapshot.dataMode !== 'real' ||
    !Array.isArray(snapshot.notes) || !Array.isArray(snapshot.moments)) return [];
  const moments = new Set(snapshot.moments.flatMap((value) => {
    const moment = asObject(value);
    const noteId = text(moment?.noteId, 200);
    return moment && noteId && moment.isNew !== true && moment.isInboxDraft !== true
      ? [noteId]
      : [];
  }));
  return snapshot.notes.flatMap((value) => {
    const note = asObject(value);
    const noteId = text(note?.id, 200);
    if (!note || !noteId || note.isDraft === true || !moments.has(noteId)) return [];
    const answers = Array.isArray(note.answers)
      ? note.answers.flatMap((answer) => {
          const item = asObject(answer);
          const value = text(item?.answer, 600);
          return value ? [value] : [];
        }).slice(0, 3)
      : [];
    return [{
      noteId,
      title: text(note.title, 200),
      place: text(note.place, 160),
      date: text(note.localDate || note.date, 10),
      time: text(note.localTime || note.time, 5),
      emotion: typeof note.emotion === 'string' ? note.emotion.slice(0, 40) : null,
      excerpt: text(note.excerpt, 600),
      answers,
    }];
  });
};

const matchingRecordCount = (
  records: ReturnType<typeof formalRecords>,
  query: string,
) => {
  const terms = queryTerms(query);
  if (!terms.length) return 0;
  return records.filter((record) => {
    const haystack = normalized([
      record.title, record.place, record.date, record.time,
      record.emotion ?? 'unknown', record.excerpt, ...record.answers,
    ].join(' '));
    return terms.some((term) => haystack.includes(term));
  }).length;
};

const publicRecord = (record: AuthorizedEvidence) => ({
  referenceId: record.noteId,
  title: record.title,
  place: record.place,
  date: record.date,
  time: record.time,
  emotion: record.emotion,
  excerpt: record.excerpt,
  matchReason: record.matchReason,
});

const continuation = async ({
  secret,
  userId,
  query,
  evidence,
  now,
}: {
  secret: string;
  userId: string;
  query: string;
  evidence: AuthorizedEvidence[];
  now: Date;
}) => {
  if (secret.length < 32 || !evidence.length) return { options: [], token: null };
  const queryHash = await sha256(query.normalize('NFKC').trim());
  const choices = await Promise.all(evidence.map(async (record) => ({
    optionId: `opt_${(await hmac(secret, `${userId}|${queryHash}|${record.noteId}`)).slice(0, 20)}`,
    title: record.title,
    place: record.place,
    date: record.date,
    noteId: record.noteId,
  })));
  const expires = Math.floor(now.getTime() / 1_000) + 600;
  const signature = await hmac(
    secret,
    `${userId}|${expires}|${queryHash}|${choices.map((item) => `${item.optionId}:${item.noteId}`).join(',')}`,
  );
  return {
    options: choices.map(({ noteId: _noteId, ...option }) => option),
    token: `emc1.${expires}.${queryHash}.${signature}`,
  };
};

const resolveContinuation = async ({
  secret,
  userId,
  query,
  evidence,
  token,
  optionId,
  now,
}: {
  secret: string;
  userId: string;
  query: string;
  evidence: AuthorizedEvidence[];
  token: string;
  optionId: string;
  now: Date;
}) => {
  const parts = token.split('.');
  const expires = Number(parts[1]);
  const queryHash = await sha256(query.normalize('NFKC').trim());
  if (parts.length !== 4 || parts[0] !== 'emc1' ||
    !Number.isSafeInteger(expires) || expires < Math.floor(now.getTime() / 1_000) ||
    parts[2] !== queryHash || !/^[a-f0-9]{64}$/.test(parts[3] ?? '')) return null;
  const choices = await Promise.all(evidence.map(async (record) => ({
    optionId: `opt_${(await hmac(secret, `${userId}|${queryHash}|${record.noteId}`)).slice(0, 20)}`,
    noteId: record.noteId,
  })));
  const signature = await hmac(
    secret,
    `${userId}|${expires}|${queryHash}|${choices.map((item) => `${item.optionId}:${item.noteId}`).join(',')}`,
  );
  if (signature !== parts[3]) return null;
  return choices.find((item) => item.optionId === optionId)?.noteId ?? null;
};

export const researchEmotionContext = async ({
  snapshot,
  userId,
  query,
  limit,
  continuationSecret,
  continuationToken,
  optionId,
  now = new Date(),
}: {
  snapshot: unknown;
  userId: string;
  query: string;
  limit: number;
  continuationSecret: string;
  continuationToken?: string;
  optionId?: string;
  now?: Date;
}) => {
  const allRecords = formalRecords(snapshot);
  let retrieval = retrieveAuthorizedEvidence(snapshot, query);
  if (continuationToken && optionId) {
    const selectedNoteId = await resolveContinuation({
      secret: continuationSecret,
      userId,
      query,
      evidence: retrieval.evidence,
      token: continuationToken,
      optionId,
      now,
    });
    retrieval = selectedNoteId
      ? retrieveAuthorizedEvidence(snapshot, query, {
          explicitNoteIds: [selectedNoteId],
          restrictToExplicit: true,
        })
      : {
          intent: retrieval.intent,
          retrievalStatus: 'evidence_insufficient' as const,
          evidence: [] as AuthorizedEvidence[],
          computationSet: [] as AuthorizedEvidence[],
          allowedFacts: retrieval.allowedFacts,
        };
  }
  const evidence = retrieval.evidence.slice(0, limit);
  const ambiguity = retrieval.retrievalStatus === 'ambiguous'
    ? await continuation({
        secret: continuationSecret,
        userId,
        query,
        evidence,
        now,
      })
    : { options: [], token: null };
  const retrievalStatus = retrieval.retrievalStatus === 'ambiguous' &&
    !ambiguity.token
    ? 'evidence_insufficient' as const
    : retrieval.retrievalStatus;
  const dates = new Set(evidence.map((record) => record.date).filter(Boolean));
  const places = new Set(evidence.map((record) => record.place).filter(Boolean));
  const limitations = retrieval.retrievalStatus === 'ambiguous'
    ? [ambiguity.token ? 'multiple_close_matches' : 'continuation_unavailable']
    : retrieval.retrievalStatus === 'not_found'
      ? ['no_matching_records']
      : retrieval.retrievalStatus === 'evidence_insufficient'
        ? [continuationToken ? 'invalid_continuation' : 'evidence_insufficient']
        : [];
  return {
    status: retrievalStatus,
    retrievalStatus,
    records: evidence.map(publicRecord),
    aggregates: {
      totalAuthorized: allRecords.length,
      totalMatching: matchingRecordCount(allRecords, query),
      dateCount: dates.size,
      placeCount: places.size,
    },
    limitations,
    options: ambiguity.options,
    continuationToken: ambiguity.token,
  };
};

export const listFormalEmotionRecords = formalRecords;
export const toPublicEmotionRecord = publicRecord;
