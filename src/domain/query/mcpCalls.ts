import type { McpCallReference } from '../../types';

const MCP_TOOL_NAMES = new Set<McpCallReference['toolName']>([
  'research_memory_context',
  'search_memories',
  'list_locations',
  'get_location_memory',
  'get_day_memory',
  'summarize_memory_range',
  'get_memory_images',
  'get_routes',
]);

const object = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

export const sanitizeMcpCalls = (
  value: unknown,
): McpCallReference[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  return value.flatMap((raw) => {
    const item = object(raw);
    if (!item || item.server !== 'my_life_memory' ||
      typeof item.toolName !== 'string' ||
      !MCP_TOOL_NAMES.has(item.toolName as McpCallReference['toolName']) ||
      (item.status !== 'completed' && item.status !== 'not_found' &&
        item.status !== 'unavailable')) return [];
    return [{
      server: 'my_life_memory' as const,
      toolName: item.toolName as McpCallReference['toolName'],
      status: item.status as McpCallReference['status'],
    }];
  }).slice(0, 2);
};
