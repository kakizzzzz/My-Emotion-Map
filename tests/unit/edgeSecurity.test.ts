import { describe, expect, it } from 'vitest';
import { corsHeaders } from '../../supabase/functions/_shared/security';

describe('Edge Function CORS headers', () => {
  it('allows the Supabase browser client headers used during registration', () => {
    const headers = corsHeaders('http://127.0.0.1:3000');

    expect(headers['access-control-allow-headers'])
      .toBe('authorization, x-client-info, apikey, content-type');
  });
});
