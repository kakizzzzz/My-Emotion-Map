type Point = { x: number; y: number };
type PointPair = readonly [number, number];

type WaterFlow = {
  start: PointPair;
  c1: PointPair;
  c2: PointPair;
  end: PointPair;
  phase: number;
  amplitude: number;
  opacity: number;
  color: string;
};

const VIEWBOX_WIDTH = 430;
const VIEWBOX_HEIGHT = 932;
const DOT_SPACING = 7;
const DOT_RADIUS = 1.25;
const STATIC_PATH_TIME = Math.PI * 0.56;

const FLOWS: readonly WaterFlow[] = [
  {
    start: [-0.10, 0.23], c1: [0.24, 0.17], c2: [0.31, 0.58], end: [1.10, 0.49],
    phase: 1.1, amplitude: 0.013, opacity: 0.80, color: 'var(--em-restless)',
  },
  {
    start: [-0.14, 0.29], c1: [0.20, 0.32], c2: [0.48, 0.60], end: [1.14, 0.58],
    phase: 2.2, amplitude: 0.011, opacity: 0.82, color: 'var(--em-calm)',
  },
  {
    start: [-0.11, 0.36], c1: [0.29, 0.48], c2: [0.18, 0.71], end: [1.12, 0.65],
    phase: 3.3, amplitude: 0.014, opacity: 0.84, color: 'var(--em-tender)',
  },
  {
    start: [-0.13, 0.44], c1: [0.22, 0.39], c2: [0.39, 0.79], end: [1.11, 0.73],
    phase: 4.4, amplitude: 0.012, opacity: 0.92, color: 'var(--em-joy)',
  },
  {
    start: [-0.10, 0.19], c1: [0.37, 0.36], c2: [0.24, 0.83], end: [1.13, 0.81],
    phase: 5.5, amplitude: 0.016, opacity: 0.74, color: 'var(--em-heavy)',
  },
];

const projectControlPoint = (
  pair: PointPair,
  flow: WaterFlow,
  order: number,
): Point => {
  const amplitude = flow.amplitude * (order === 0 || order === 3 ? 0.35 : 1);
  return {
    x: (
      pair[0]
      + Math.sin(STATIC_PATH_TIME + flow.phase + order * 0.9) * amplitude
    ) * VIEWBOX_WIDTH,
    y: (
      pair[1]
      + Math.cos(STATIC_PATH_TIME + flow.phase * 1.17 + order * 0.7)
      * amplitude
      * 0.48
    ) * VIEWBOX_HEIGHT,
  };
};

const buildFlowPath = (flow: WaterFlow) => {
  const start = projectControlPoint(flow.start, flow, 0);
  const c1 = projectControlPoint(flow.c1, flow, 1);
  const c2 = projectControlPoint(flow.c2, flow, 2);
  const end = projectControlPoint(flow.end, flow, 3);

  return [
    `M${start.x.toFixed(2)} ${start.y.toFixed(2)}`,
    `C${c1.x.toFixed(2)} ${c1.y.toFixed(2)}`,
    `${c2.x.toFixed(2)} ${c2.y.toFixed(2)}`,
    `${end.x.toFixed(2)} ${end.y.toFixed(2)}`,
  ].join(' ');
};

// The water contours stay still. Only the dots move through these fixed paths.
const STATIC_PATHS = FLOWS.map((flow) => buildFlowPath(flow));

export function LoginWaterBackground() {
  return (
    <div className="login-map-background" aria-hidden="true">
      <svg
        viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <linearGradient id="login-water-fade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="white" stopOpacity="0.48" />
            <stop offset="12%" stopColor="white" stopOpacity="0.92" />
            <stop offset="82%" stopColor="white" stopOpacity="0.88" />
            <stop offset="100%" stopColor="white" stopOpacity="0.36" />
          </linearGradient>
          <mask id="login-water-mask">
            <rect width={VIEWBOX_WIDTH} height={VIEWBOX_HEIGHT} fill="url(#login-water-fade)" />
          </mask>
        </defs>

        <g className="login-water-flows" mask="url(#login-water-mask)">
          {FLOWS.map((flow, flowIndex) => (
            <path
              key={flow.color}
              className="login-water-contour"
              data-water-group="flow"
              d={STATIC_PATHS[flowIndex]}
              fill="none"
              stroke={flow.color}
              strokeWidth={DOT_RADIUS * 2}
              strokeDasharray={`0.01 ${DOT_SPACING - 0.01}`}
              strokeLinecap="round"
              opacity={flow.opacity}
            />
          ))}
        </g>
      </svg>
    </div>
  );
}
