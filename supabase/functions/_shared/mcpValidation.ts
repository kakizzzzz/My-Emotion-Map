export const MCP_READ_SCOPE = 'records:read';
export const MCP_WRITE_SCOPE = 'proposals:write';

export const isMcpOwner = (tokenUserId: string, rowUserId: unknown) =>
  typeof rowUserId === 'string' && rowUserId === tokenUserId;

export const canCallMcpTool = (scopes: readonly string[], toolName: string) => {
  if (toolName === 'emotion_map.get_capabilities') return true;
  if (toolName.startsWith('emotion_map.propose_')) {
    return scopes.includes(MCP_WRITE_SCOPE);
  }
  if (toolName === 'emotion_map.open_record') {
    return scopes.includes(MCP_READ_SCOPE) || scopes.includes(MCP_WRITE_SCOPE);
  }
  return scopes.includes(MCP_READ_SCOPE);
};
