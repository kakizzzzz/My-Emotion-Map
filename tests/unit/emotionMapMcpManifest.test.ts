import { describe, expect, it } from 'vitest';
import {
  EMOTION_MAP_ACTION_TOOLS,
  EMOTION_MAP_READ_TOOLS,
  listEmotionMapReadTools,
} from '../../supabase/functions/_shared/emotionMapMcpManifest';

const READ_TOOL_NAMES = [
  'research_emotion_context',
  'search_emotion_records',
  'list_emotion_locations',
  'get_location_emotion_context',
  'get_day_emotion_context',
  'summarize_emotion_range',
  'export_emotion_report',
];

describe('Emotion Map MCP manifests', () => {
  it('locks the default output manifest to seven read-only research tools', () => {
    expect(EMOTION_MAP_READ_TOOLS.map((tool) => tool.name))
      .toEqual(READ_TOOL_NAMES);
    expect(JSON.stringify(EMOTION_MAP_READ_TOOLS)).not.toMatch(/propose_|open_record/);
    for (const tool of EMOTION_MAP_READ_TOOLS) {
      expect(tool.title).toBeTruthy();
      expect(tool.inputSchema.additionalProperties).toBe(false);
      expect(tool.outputSchema.additionalProperties).toBe(false);
      expect(tool.annotations).toEqual({
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      });
    }
  });

  it('shows read tools only to a records-read token', () => {
    expect(listEmotionMapReadTools(['records:read']).map((tool) => tool.name))
      .toEqual(READ_TOOL_NAMES);
    expect(listEmotionMapReadTools(['proposals:write'])).toEqual([]);
  });

  it('keeps proposal tools in a separate action manifest', () => {
    expect(EMOTION_MAP_ACTION_TOOLS.map((tool) => tool.name)).toEqual([
      'propose_create_draft',
      'propose_append_note',
      'propose_schedule_followup',
    ]);
    expect(EMOTION_MAP_ACTION_TOOLS.every(
      (tool) => tool.annotations.readOnlyHint === false,
    )).toBe(true);
  });
});
