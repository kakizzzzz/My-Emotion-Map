import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const readSource = (path: string) => readFile(path, 'utf8');

function extractRule(css: string, selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\}`));
  expect(match, `missing CSS rule: ${selector}`).not.toBeNull();
  return match?.[1] ?? '';
}

describe('typography parity with My Life Memory', () => {
  it('prevents Safari text inflation and uses the same CJK optical scale', async () => {
    const [typography, i18n] = await Promise.all([
      readSource('src/styles/typography.css'),
      readSource('src/i18n.ts'),
    ]);

    expect(typography).toContain('-webkit-text-size-adjust: 100%;');
    expect(typography).toContain('text-size-adjust: 100%;');
    expect(typography).toContain('html:lang(zh),');
    expect(typography).toContain('html:lang(ko)');
    expect(typography).toContain('--em-language-font-scale: 0.9;');
    expect(i18n).toContain('zh: 0.9');
    expect(i18n).toContain('ko: 0.9');
  });

  it('scales secondary login and settings copy without shrinking titles or inputs', async () => {
    const [auth, feedback, typography] = await Promise.all([
      readSource('src/styles/auth.css'),
      readSource('src/styles/feedback.css'),
      readSource('src/styles/typography.css'),
    ]);

    expect(extractRule(auth, '.login-centered-content > h1')).toContain(
      'font-size: 36px;',
    );
    expect(extractRule(auth, '.login-fields input')).toContain(
      'font-size: 16px;',
    );
    expect(extractRule(feedback, '.toast')).toContain('font-size: 13px;');

    expect(typography).toContain('.login-card > header h2,');
    expect(typography).toContain('.login-restoring,');
    expect(typography).toContain('.login-actions button {');
    expect(typography).toContain('.settings-list strong,');
    expect(typography).toContain(
      'font-size: calc(18px * var(--em-language-font-scale));',
    );
    expect(typography).toContain(
      'font-size: calc(15px * var(--em-language-font-scale));',
    );
    expect(typography).toContain(
      'font-size: calc(16px * var(--em-language-font-scale));',
    );
  });
});
