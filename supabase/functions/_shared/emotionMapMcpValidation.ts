import {
  EMOTION_MAP_ACTION_TOOLS,
  EMOTION_MAP_READ_TOOLS,
  type EmotionMapMcpTool,
} from './emotionMapMcpManifest.ts';

type JsonObject = Record<string, unknown>;
type ValidationResult =
  | { ok: true; value: JsonObject }
  | { ok: false; code: 'unknown_tool' | 'invalid_arguments' };

const tools = [...EMOTION_MAP_READ_TOOLS, ...EMOTION_MAP_ACTION_TOOLS];

const asObject = (value: unknown): JsonObject | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonObject
    : null;

const normalizedObject = (value: JsonObject) => Object.fromEntries(
  Object.entries(value).map(([key, item]) => [
    key,
    typeof item === 'string' ? item.normalize('NFKC').trim() : item,
  ]),
);

const typesMatch = (value: unknown, expected: unknown) => {
  const types = Array.isArray(expected) ? expected : [expected];
  return types.some((type) => {
    if (type === 'null') return value === null;
    if (type === 'array') return Array.isArray(value);
    if (type === 'object') return Boolean(asObject(value));
    if (type === 'integer') return Number.isSafeInteger(value);
    return typeof value === type;
  });
};

const matchesSchema = (value: unknown, schemaValue: unknown): boolean => {
  const schema = asObject(schemaValue);
  if (!schema) return false;
  if (Array.isArray(schema.enum) && !schema.enum.some((item) => item === value)) {
    return false;
  }
  if (schema.type !== undefined && !typesMatch(value, schema.type)) return false;
  if (value === null) return true;
  if (typeof value === 'string') {
    if (typeof schema.minLength === 'number' && value.length < schema.minLength) return false;
    if (typeof schema.maxLength === 'number' && value.length > schema.maxLength) return false;
    if (typeof schema.pattern === 'string' && !new RegExp(schema.pattern).test(value)) return false;
  }
  if (typeof value === 'number') {
    if (typeof schema.minimum === 'number' && value < schema.minimum) return false;
    if (typeof schema.maximum === 'number' && value > schema.maximum) return false;
  }
  if (Array.isArray(value)) {
    if (typeof schema.maxItems === 'number' && value.length > schema.maxItems) return false;
    if (schema.items && value.some((item) => !matchesSchema(item, schema.items))) return false;
  }
  const object = asObject(value);
  if (object) {
    const properties = asObject(schema.properties) ?? {};
    const required = Array.isArray(schema.required)
      ? schema.required.filter((item): item is string => typeof item === 'string')
      : [];
    if (required.some((key) => !(key in object))) return false;
    if (schema.additionalProperties === false &&
      Object.keys(object).some((key) => !(key in properties))) return false;
    for (const [key, item] of Object.entries(object)) {
      if (properties[key] && !matchesSchema(item, properties[key])) return false;
    }
  }
  return true;
};

const isRealDate = (value: unknown) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};

const datesAreValid = (input: JsonObject) => {
  for (const key of ['date', 'startDate', 'endDate', 'localDate']) {
    if (input[key] !== undefined && !isRealDate(input[key])) return false;
  }
  return !(typeof input.startDate === 'string' && typeof input.endDate === 'string' &&
    input.startDate > input.endDate);
};

const findTool = (name: string): EmotionMapMcpTool | undefined =>
  tools.find((tool) => tool.name === name);

export const validateEmotionMapToolInput = (
  name: string,
  input: unknown,
): ValidationResult => {
  const tool = findTool(name);
  if (!tool) return { ok: false, code: 'unknown_tool' };
  const object = asObject(input);
  if (!object) return { ok: false, code: 'invalid_arguments' };
  const value = normalizedObject(object);
  return matchesSchema(value, tool.inputSchema) && datesAreValid(value)
    ? { ok: true, value }
    : { ok: false, code: 'invalid_arguments' };
};

export const validateEmotionMapToolOutput = (
  name: string,
  output: unknown,
) => {
  const tool = findTool(name);
  return Boolean(tool && matchesSchema(output, tool.outputSchema));
};
