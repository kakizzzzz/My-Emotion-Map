import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const functionSource = readFileSync(
  resolve(process.cwd(), 'supabase/functions/photo-assist/index.ts'),
  'utf8',
);
const providerSource = readFileSync(
  resolve(process.cwd(), 'supabase/functions/_shared/siliconflow.ts'),
  'utf8',
);

describe('photo assist server contract', () => {
  it('keeps image and model limits on the server', () => {
    expect(functionSource).toContain('const MAX_IMAGE_BYTES = 700 * 1024');
    expect(functionSource).toContain('const MAX_DIMENSION = 672');
    expect(providerSource).toContain("const PHOTO_MODEL = 'zai-org/GLM-4.5V'");
    expect(providerSource).toContain(
      "maxTokens = task === 'photo' ? 220 : task === 'plan' ? 180 : 500",
    );
  });

  it('uses one bounded retry inside a single 15 second deadline', () => {
    expect(functionSource).toContain('const REQUEST_TIMEOUT_MS = 15_000');
    expect(functionSource).toContain('attempt < 2');
    expect(functionSource).toContain('timeoutMs: remainingMs');
  });

  it('authenticates, rate-limits and prevents response caching', () => {
    expect(functionSource).toContain('requireAllowedOrigin(request)');
    expect(functionSource).toContain("authenticate(request)");
    expect(functionSource).toContain("claimAiQuota(session, 'photo-assist')");
    expect(functionSource).toContain("'cache-control': 'no-store'");
  });
});
