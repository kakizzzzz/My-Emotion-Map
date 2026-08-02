import type { DataMode, EmotionMoment } from '../../types';

export type MomentBounds = [[number, number], [number, number]];

export const DEMO_FIT_PADDING = {
  portrait: { top: 88, right: 40, bottom: 132, left: 40 },
  landscape: { top: 42, right: 88, bottom: 42, left: 88 },
} as const;

export const getMomentBounds = (
  moments: EmotionMoment[],
): MomentBounds | null => {
  const valid = moments.filter((moment) =>
    Number.isFinite(moment.longitude) && Number.isFinite(moment.latitude)
  );
  if (!valid.length) return null;
  const west = Math.min(...valid.map((moment) => moment.longitude));
  const east = Math.max(...valid.map((moment) => moment.longitude));
  const south = Math.min(...valid.map((moment) => moment.latitude));
  const north = Math.max(...valid.map((moment) => moment.latitude));
  if (west === east && south === north) {
    const offset = 0.0006;
    return [[west - offset, south - offset], [east + offset, north + offset]];
  }
  return [[west, south], [east, north]];
};

export const getDemoFitPadding = (width: number, height: number) =>
  width > height ? DEMO_FIT_PADDING.landscape : DEMO_FIT_PADDING.portrait;

export const shouldFitDemoWorkspace = ({
  dataMode,
  workspaceKey,
  handledWorkspaceKey,
}: {
  dataMode: DataMode;
  workspaceKey: string;
  handledWorkspaceKey: string | null;
}) => dataMode === 'demo' && handledWorkspaceKey !== workspaceKey;
