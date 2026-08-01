type DenoRuntime = {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};

export const runtime = (globalThis as unknown as { Deno: DenoRuntime }).Deno;

export const env = (name: string) => runtime.env.get(name)?.trim() ?? '';

export const jsonResponse = (
  body: unknown,
  status = 200,
  headers: HeadersInit = {},
) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
});

export const readJsonBody = async (request: Request, maxBytes: number) => {
  const declaredLength = Number(request.headers.get('content-length') ?? 0);
  if (declaredLength > maxBytes) throw new Error('request_too_large');
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    throw new Error('request_too_large');
  }
  return JSON.parse(text) as unknown;
};
