import React from 'react';

export function StarMarkerGlyph({
  size = 36,
  color = '#EDC727',
  selected = false,
  outline = false,
}: {
  size?: number;
  color?: string;
  selected?: boolean;
  outline?: boolean;
}) {
  const gradientId = React.useId().replace(/:/g, '');
  const outlineMaskId = React.useId().replace(/:/g, '');

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      className="star-marker-glyph"
    >
      <defs>
        <linearGradient
          id={gradientId}
          x1="0"
          y1="0"
          x2="0"
          y2="24"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="15%" stopColor={color} />
          <stop offset="100%" stopColor="#ffffff" />
        </linearGradient>
        <mask
          id={outlineMaskId}
          x="-4"
          y="-4"
          width="32"
          height="32"
          maskUnits="userSpaceOnUse"
        >
          <rect x="-4" y="-4" width="32" height="32" fill="white" />
          <polygon
            points="12 4 14.35 8.76 19.61 9.53 15.8 13.24 16.7 18.47 12 16 7.3 18.47 8.2 13.24 4.39 9.53 9.65 8.76"
            fill="black"
            stroke="black"
            strokeWidth="2.7"
            strokeLinejoin="round"
          />
        </mask>
      </defs>
      <polygon
        points="12 4 14.35 8.76 19.61 9.53 15.8 13.24 16.7 18.47 12 16 7.3 18.47 8.2 13.24 4.39 9.53 9.65 8.76"
        fill={selected ? '#000000' : color}
        stroke={selected ? '#000000' : color}
        strokeWidth="5.5"
        strokeLinejoin="round"
        mask={outline ? `url(#${outlineMaskId})` : undefined}
      />
      {!outline ? (
        <polygon
          points="12 4 14.35 8.76 19.61 9.53 15.8 13.24 16.7 18.47 12 16 7.3 18.47 8.2 13.24 4.39 9.53 9.65 8.76"
          fill={`url(#${gradientId})`}
          stroke={`url(#${gradientId})`}
          strokeWidth="4.5"
          strokeLinejoin="round"
        />
      ) : null}
    </svg>
  );
}
