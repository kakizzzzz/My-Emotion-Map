import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

// Guard map widgets whose square geometry depends on shared CSS contracts.
async function readSource(path: string) {
  return readFile(path, 'utf8');
}

function extractRule(css: string, selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\}`));
  expect(match, `missing CSS rule: ${selector}`).not.toBeNull();
  return match?.[1] ?? '';
}

describe('map visual geometry contracts', () => {
  it('keeps the current-location origin centered and circular', async () => {
    const mapCss = await readSource('src/styles/map.css');
    const dot = extractRule(mapCss, '.map-location-marker > i');

    expect(dot).toContain('width: 16px;');
    expect(dot).toContain('height: 16px;');
    expect(dot).toContain('box-sizing: content-box;');
    expect(dot).toContain('border: 5px solid #c3c3c3;');
    expect(dot).toContain('border-radius: 50%;');
    expect(dot).toContain('transform: translate(-50%, -50%);');
  });

  it('lets nearby stars receive taps through the current-location marker', async () => {
    const markerSource = await readSource('src/features/map/MapMarkers.tsx');
    const currentLocationBlock = markerSource.match(
      /\{userLocation \? \([\s\S]*?\) : null\}/,
    )?.[0] ?? '';

    expect(currentLocationBlock).toContain("style={{ pointerEvents: 'none' }}");
    expect(currentLocationBlock).toContain('<MapLocationMarker');
    expect(currentLocationBlock).toContain('size={80}');
  });

  it('keeps visible map controls and badges square and non-shrinking', async () => {
    const [shellCss, mapCss] = await Promise.all([
      readSource('src/styles/shell.css'),
      readSource('src/styles/map.css'),
    ]);
    const sharedControls = shellCss.match(
      /\.round-back-button,[\s\S]*?\.global-menu-button\s*\{([\s\S]*?)\}/,
    )?.[1] ?? '';
    const styleThumb = extractRule(mapCss, '.map-style-thumb');
    const orderBadge = extractRule(shellCss, '.emotion-star__order');

    expect(sharedControls).toContain('flex: 0 0 auto;');
    expect(sharedControls).toContain('width: 48px;');
    expect(sharedControls).toContain('height: 48px;');
    expect(sharedControls).toContain('border-radius: 50%;');
    expect(styleThumb).toContain('width: 36px;');
    expect(styleThumb).toContain('height: 36px;');
    expect(styleThumb).toContain('border-radius: 50%;');
    expect(orderBadge).toContain('width: 16px;');
    expect(orderBadge).toContain('height: 16px;');
    expect(orderBadge).toContain('box-sizing: border-box;');
    expect(orderBadge).toContain('border-radius: 50%;');
  });

  it('keeps selected map stars at the My Life Memory shadow depth', async () => {
    const shellCss = await readSource('src/styles/shell.css');

    expect(shellCss).toContain(
      'drop-shadow(0 4px 6px rgba(0, 0, 0, 0.15))',
    );
    expect(shellCss).not.toContain('.emotion-star.is-selected');
  });

  it('centers the recoverable map loading error in the viewport', async () => {
    const mapCss = await readSource('src/styles/map.css');
    const loadError = extractRule(mapCss, '.map-load-error');

    expect(loadError).toContain('top: 50%;');
    expect(loadError).toContain('left: 50%;');
    expect(loadError).toContain('translate: -50% -50%;');
  });

  it('keeps general notices clear of bottom chrome and cloud sync at the top', async () => {
    const feedbackCss = await readSource('src/styles/feedback.css');

    expect(feedbackCss).toContain(
      'max-width: min(18rem, calc(100% - 152px));',
    );
    expect(feedbackCss).toMatch(
      /\.toast--top,\s*\.toast--bottom\s*\{[^}]*bottom: var\(--em-chrome-bottom\);/s,
    );
    expect(feedbackCss).toMatch(
      /\.cloud-sync-toast\s*\{[^}]*top: max\([\s\S]*?env\(safe-area-inset-top\)[\s\S]*?bottom: auto;/s,
    );
  });

  it('copies the My Life Memory location descriptions in all languages', async () => {
    const [zh, en, ko] = await Promise.all([
      readSource('src/i18n/zh.ts'),
      readSource('src/i18n/en.ts'),
      readSource('src/i18n/ko.ts'),
    ]);

    expect(zh.match(/用于地图定位和路线记录。/g)).toHaveLength(2);
    expect(
      en.match(/Used for map location and route recording\./g),
    ).toHaveLength(2);
    expect(
      ko.match(/지도 위치와 경로 기록에 사용합니다\./g),
    ).toHaveLength(2);
  });
});
