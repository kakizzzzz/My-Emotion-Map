import React from 'react';

export function MapLocationMarker({
  size = 80,
  color = '#c3c3c3',
  heading = null,
}: {
  size?: number;
  color?: string;
  heading?: number | null;
}) {
  const gradientId = React.useId().replace(/:/g, '');
  const coneRotation =
    typeof heading === 'number' && Number.isFinite(heading)
      ? heading + 90
      : 90;

  return (
    <div className="map-location-marker" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 80 80"
        style={{ transform: `rotate(${coneRotation}deg)` }}
        aria-hidden="true"
      >
        <defs>
          <linearGradient
            id={gradientId}
            gradientUnits="userSpaceOnUse"
            x1="40"
            y1="40"
            x2="8"
            y2="40"
          >
            <stop offset="0%" stopColor={color} stopOpacity="0.85" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d="M 8 27 L 40 40 L 8 53 Z" fill={`url(#${gradientId})`} />
      </svg>
      <i style={{ borderColor: color }} />
    </div>
  );
}
