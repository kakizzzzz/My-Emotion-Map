import { EMOTIONS } from './data';
import { StarMarkerGlyph } from './StarMarkerGlyph';
import type { EmotionKey } from './types';

type EmotionStarProps = {
  emotion: EmotionKey | null;
  size?: number;
  order?: number;
  selected?: boolean;
  className?: string;
  colorOverride?: string;
  outline?: boolean;
};

const facePaths: Record<EmotionKey, { eyes: React.ReactNode; mouth: React.ReactNode }> = {
  calm: {
    eyes: (
      <>
        <path d="M8.2 10.8c.8.65 1.65.65 2.45 0" />
        <path d="M13.8 10.8c.8.65 1.65.65 2.45 0" />
      </>
    ),
    mouth: <path d="M10 14.5c1.35.7 2.65.7 4 0" />,
  },
  joy: {
    eyes: (
      <>
        <path d="M8 11c.95-1 1.9-1 2.85 0" />
        <path d="M13.65 11c.95-1 1.9-1 2.85 0" />
      </>
    ),
    mouth: <path d="M9.5 14c1.25 1.8 3.75 1.8 5 0" />,
  },
  tender: {
    eyes: (
      <>
        <circle cx="9" cy="10.8" r=".65" fill="currentColor" stroke="none" />
        <circle cx="15" cy="10.8" r=".65" fill="currentColor" stroke="none" />
      </>
    ),
    mouth: <path d="M10 14.5c1.3 1.05 2.7 1.05 4 0" />,
  },
  curious: {
    eyes: (
      <>
        <circle cx="9" cy="10.5" r=".75" fill="currentColor" stroke="none" />
        <circle cx="15" cy="10.5" r=".75" fill="currentColor" stroke="none" />
      </>
    ),
    mouth: <circle cx="12" cy="14.4" r=".85" />,
  },
  energized: {
    eyes: (
      <>
        <path d="M8 10.8c.9-1.2 1.8-1.2 2.7 0" />
        <path d="M13.3 10.8c.9-1.2 1.8-1.2 2.7 0" />
      </>
    ),
    mouth: <path d="M9.6 13.7c1.2 2.1 3.6 2.1 4.8 0" />,
  },
  connected: {
    eyes: (
      <>
        <circle cx="9" cy="10.8" r=".6" fill="currentColor" stroke="none" />
        <circle cx="15" cy="10.8" r=".6" fill="currentColor" stroke="none" />
      </>
    ),
    mouth: <path d="M9.8 14.2c1.45 1.25 2.95 1.25 4.4 0" />,
  },
  focused: {
    eyes: (
      <>
        <path d="M8 10.3h2.6" />
        <path d="M13.4 10.3H16" />
      </>
    ),
    mouth: <path d="M10.3 14.5h3.5" />,
  },
  restless: {
    eyes: (
      <>
        <path d="M8 9.8l2.5 1" />
        <path d="M16 9.8l-2.5 1" />
      </>
    ),
    mouth: <path d="M9.8 15c1-1 2 1 3 0s1.75.5 1.75.5" />,
  },
  heavy: {
    eyes: (
      <>
        <path d="M8 11.3l2.5-.5" />
        <path d="M13.5 10.8l2.5.5" />
      </>
    ),
    mouth: <path d="M9.8 15.5c1.4-1.3 3.1-1.3 4.5 0" />,
  },
  overwhelmed: {
    eyes: (
      <>
        <path d="M8 9.3l2.5 2.5m0-2.5L8 11.8" />
        <path d="M13.5 9.3l2.5 2.5m0-2.5-2.5 2.5" />
      </>
    ),
    mouth: <path d="M9.8 15.5c.75-1.5 1.5 1 2.25 0s1.5.5 2.25-.5" />,
  },
  numb: {
    eyes: (
      <>
        <path d="M8.2 10.8h2.2" />
        <path d="M13.6 10.8h2.2" />
      </>
    ),
    mouth: <path d="M10 14.7h4" />,
  },
  mixed: {
    eyes: (
      <>
        <circle cx="9" cy="10.6" r=".6" fill="currentColor" stroke="none" />
        <path d="M13.6 10.8c.8-.8 1.55-.8 2.3 0" />
      </>
    ),
    mouth: <path d="M9.8 14.8c1-.8 1.7.7 2.6 0s1.3.4 1.8 0" />,
  },
};

export function EmotionStar({
  emotion,
  size = 48,
  order,
  selected = false,
  className = '',
  colorOverride,
  outline = false,
}: EmotionStarProps) {
  const definition = emotion ? EMOTIONS[emotion] : null;
  const color = colorOverride ?? definition?.color ?? '#5C5C5C';
  const face = emotion ? facePaths[emotion] : null;

  return (
    <span
      className={`emotion-star ${selected ? 'is-selected' : ''} ${className}`}
      style={{
        '--star-color': color,
        width: size,
        height: size,
      } as React.CSSProperties}
      aria-hidden="true"
    >
      <StarMarkerGlyph
        size={size}
        color={color}
        selected={selected}
        outline={outline || (emotion === null && !colorOverride)}
      />
      {face ? (
        <svg className="emotion-star__expression" viewBox="0 0 24 24" focusable="false">
          <g className="emotion-star__face">
            {face.eyes}
            {face.mouth}
          </g>
        </svg>
      ) : null}
      {order ? <span className="emotion-star__order">{order}</span> : null}
    </span>
  );
}
