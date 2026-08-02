export const MCP_READ_SCOPE = 'records:read';
export const MCP_ACTION_SCOPE = 'proposals:write';
export const MCP_WRITE_SCOPE = MCP_ACTION_SCOPE;

export const isMcpOwner = (tokenUserId: string, rowUserId: unknown) =>
  typeof rowUserId === 'string' && rowUserId === tokenUserId;

export const canCallMcpTool = (scopes: readonly string[], toolName: string) => {
  if (toolName.startsWith('emotion_map.propose_') || toolName.startsWith('propose_')) {
    return scopes.includes(MCP_ACTION_SCOPE);
  }
  return scopes.includes(MCP_READ_SCOPE);
};
