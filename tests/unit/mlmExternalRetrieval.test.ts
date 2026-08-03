import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  extractMlmModelImages,
  retrieveMyLifeMemory,
} from '../../supabase/functions/_shared/mlmExternalRetrieval';
import { encryptMlmCredential } from '../../supabase/functions/_shared/mlmCredentialCrypto';

const plan = {
  source: 'my_life_memory' as const,
  tools: ['research_memory_context' as const],
  maxCalls: 1,
  searchQuery: '校园',
};

const input = {
  supabaseUrl: 'https://emotion-map.supabase.co',
  serviceRoleKey: 'service-role-server-only',
  credentialKey: btoa('k'.repeat(32)),
  endpoint: 'https://my-life-memory.supabase.co/functions/v1/mcp',
  expectedManifestHash: 'a'.repeat(64),
  userId: 'account-a',
  query: '查看 My Life Memory 的校园记录',
  plan,
};

afterEach(() => vi.unstubAllGlobals());

describe('My Life Memory external retrieval boundary', () => {
  it('accepts only bounded image pixels authorized by the research result', () => {
    const result = extractMlmModelImages({
      selectedImageNoteIds: ['memory-1'],
      evidence: [{
        key: 'M1', source: 'my_life_memory_external', trust: 'untrusted_tool_data',
        referenceId: 'memory-1', title: 'Campus photo', date: '2026-08-01',
        place: '', excerpt: '', matchReason: 'my_life_memory:research_memory_context',
      }],
      result: {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              images: [
                { noteIds: ['memory-1'] },
                { noteIds: ['other-user-memory'] },
              ],
            }),
          },
          { type: 'image', mimeType: 'image/png', data: 'AQID' },
          { type: 'image', mimeType: 'image/png', data: 'AQID' },
        ],
      },
    });

    expect(result).toEqual([{
      dataUrl: 'data:image/png;base64,AQID',
      evidenceKeys: ['M1'],
    }]);
  });

  it('queries only the authenticated owner connection', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('[]', {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await retrieveMyLifeMemory(input);

    const requestUrl = String(fetchMock.mock.calls[0]?.[0]);
    expect(requestUrl).toContain('user_id=eq.account-a');
    expect(requestUrl).not.toContain('account-b');
    expect(result).toMatchObject({
      status: 'unavailable',
      limitation: 'my_life_memory_not_connected',
    });
  });

  it('turns an invalid owner-connection response into a safe fallback', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('not-json', {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })));

    await expect(retrieveMyLifeMemory(input)).resolves.toEqual({
      status: 'unavailable',
      evidence: [],
      modelContexts: [],
      modelImages: [],
      calls: [{
        server: 'my_life_memory',
        toolName: 'research_memory_context',
        status: 'unavailable',
      }],
      limitation: 'my_life_memory_unavailable',
    });
  });

  it('recovers a failed semantic research call with the AI-planned exact query', async () => {
    const encrypted = await encryptMlmCredential(
      `mlm_${'1'.repeat(64)}`,
      input.credentialKey,
    );
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([{
        credential_ciphertext: encrypted.ciphertext,
        credential_iv: encrypted.iv,
        credential_key_version: encrypted.keyVersion,
        manifest_hash: input.expectedManifestHash,
        status: 'connected',
      }]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        jsonrpc: '2.0', id: 'research',
        error: { code: -32603, message: 'Internal server error' },
      }), { status: 500 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        jsonrpc: '2.0', id: 'search',
        result: {
          content: [{
            type: 'text',
            text: JSON.stringify({
              status: 'supported',
              records: [{
                id: 'memory-fuji',
                title: '窗外的富士山',
                date: '2026-01-10',
                place: '日本',
                excerpt: '从窗边看到了富士山。',
              }],
            }),
          }],
        },
      }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await retrieveMyLifeMemory({
      ...input,
      query: '你还记得我在哪看到富士山吗',
      plan: { ...plan, searchQuery: '富士山' },
    });

    expect(result).toMatchObject({
      status: 'supported',
      evidence: [expect.objectContaining({ title: '窗外的富士山' })],
      calls: [
        { toolName: 'research_memory_context', status: 'unavailable' },
        { toolName: 'search_memories', status: 'completed' },
      ],
    });
    expect(JSON.parse(String(fetchMock.mock.calls[2][1]?.body)))
      .toMatchObject({ params: { name: 'search_memories', arguments: {
        query: '富士山', limit: 6,
      } } });
  });

  it('reads the newest saved location through a model-planned two-tool chain', async () => {
    const encrypted = await encryptMlmCredential(
      `mlm_${'2'.repeat(64)}`,
      input.credentialKey,
    );
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([{
        credential_ciphertext: encrypted.ciphertext,
        credential_iv: encrypted.iv,
        credential_key_version: encrypted.keyVersion,
        manifest_hash: input.expectedManifestHash,
        status: 'connected',
      }]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        jsonrpc: '2.0', id: 'locations', result: {
          content: [{ type: 'text', text: JSON.stringify({
            status: 'supported',
            locations: [
              { id: 'older', createdAt: 1_735_689_600_000, lat: 35.1, lng: 139.1 },
              { id: 'newest', createdAt: 1_767_225_600_000, lat: 35.2, lng: 139.2 },
            ],
          }) }],
        },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        jsonrpc: '2.0', id: 'location-memory', result: {
          content: [{ type: 'text', text: JSON.stringify({
            status: 'supported',
            records: [{
              id: 'latest-note', starId: 'newest', title: '最近一次散步',
              text: '在河边慢慢走了一会。', createdAt: 1_767_225_600_000,
              coordinates: { lat: 35.2, lng: 139.2 },
            }],
          }) }],
        },
      }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await retrieveMyLifeMemory({
      ...input,
      query: '我最近在哪里玩',
      plan: {
        source: 'my_life_memory',
        tools: ['list_locations', 'get_location_memory'],
        maxCalls: 2,
        searchQuery: '最近游玩的地点',
      },
    });

    expect(result).toMatchObject({
      status: 'supported',
      calls: [
        { toolName: 'list_locations', status: 'completed' },
        { toolName: 'get_location_memory', status: 'completed' },
      ],
      evidence: [
        expect.objectContaining({ title: '最近一次散步' }),
      ],
    });
    expect(JSON.parse(String(fetchMock.mock.calls[2][1]?.body)))
      .toMatchObject({ params: { name: 'get_location_memory', arguments: {
        starId: 'newest',
      } } });
  });
});
