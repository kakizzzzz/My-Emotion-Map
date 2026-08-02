import type { ExternalEvidenceReference } from '../types';

const object = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

const text = (value: unknown, max: number) =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

export const sanitizeExternalEvidence = (
  value: unknown,
): ExternalEvidenceReference[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  return value.flatMap((raw) => {
    const item = object(raw);
    const referenceId = text(item?.referenceId, 200);
    const title = text(item?.title, 200);
    if (!item || !referenceId || !title ||
      item.source !== 'my_life_memory_external') return [];
    return [{
      referenceId,
      title,
      date: text(item.date, 10),
      place: text(item.place, 160),
      matchReason: text(item.matchReason, 80),
      source: 'my_life_memory_external' as const,
    }];
  }).slice(0, 6);
};

