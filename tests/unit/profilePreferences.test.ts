import { describe, expect, it } from 'vitest';
import {
  buildDefaultProfileName,
  DEFAULT_AI_CONTEXT_MESSAGE_COUNT,
  normalizeAvatarSrc,
  normalizeAiContextMessageCount,
} from '../../src/app/profilePreferences';

describe('profile and AI preference boundaries', () => {
  it('uses the My Life Memory account-based default nickname pattern', () => {
    expect(buildDefaultProfileName('  Kaki  ', 'zh')).toBe('用户kaki');
    expect(buildDefaultProfileName('Kaki', 'en')).toBe('User kaki');
    expect(buildDefaultProfileName('Kaki', 'ko')).toBe('사용자 kaki');
  });

  it('keeps the configurable conversation context between 2 and 20 messages', () => {
    expect(normalizeAiContextMessageCount(undefined)).toBe(
      DEFAULT_AI_CONTEXT_MESSAGE_COUNT,
    );
    expect(normalizeAiContextMessageCount(1)).toBe(2);
    expect(normalizeAiContextMessageCount(12)).toBe(12);
    expect(normalizeAiContextMessageCount(30)).toBe(20);
  });

  it('accepts only bounded image data URLs for synchronized avatars', () => {
    expect(normalizeAvatarSrc('data:image/webp;base64,YXZhdGFy'))
      .toBe('data:image/webp;base64,YXZhdGFy');
    expect(normalizeAvatarSrc('https://example.com/avatar.png')).toBe('');
    expect(normalizeAvatarSrc(`data:image/png;base64,${'a'.repeat(165_000)}`))
      .toBe('');
  });
});
