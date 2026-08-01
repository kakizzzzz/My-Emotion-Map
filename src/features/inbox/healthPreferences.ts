import type { HealthPreferences } from '../../types';
import type { getAppCopy } from '../../i18n';

export const HEALTH_PREFERENCES_STORAGE_KEY =
  'my-emotion-map.health-preferences.v1';

export const DEFAULT_HEALTH_PREFERENCES: HealthPreferences = {
  restingHeartRateMin: 60,
  restingHeartRateMax: 100,
};

export const loadHealthPreferences = (): HealthPreferences => {
  try {
    const stored = window.localStorage.getItem(
      HEALTH_PREFERENCES_STORAGE_KEY,
    );
    if (!stored) return DEFAULT_HEALTH_PREFERENCES;
    const parsed = JSON.parse(stored) as Partial<HealthPreferences>;
    const min = Number(parsed.restingHeartRateMin);
    const max = Number(parsed.restingHeartRateMax);
    if (
      !Number.isFinite(min) ||
      !Number.isFinite(max) ||
      min < 35 ||
      max > 220 ||
      min >= max
    ) {
      return DEFAULT_HEALTH_PREFERENCES;
    }
    return {
      restingHeartRateMin: Math.round(min),
      restingHeartRateMax: Math.round(max),
    };
  } catch {
    return DEFAULT_HEALTH_PREFERENCES;
  }
};

export const isOutsideRestingHeartRateRange = (
  heartRate: number,
  preferences: HealthPreferences,
) =>
  heartRate < preferences.restingHeartRateMin ||
  heartRate > preferences.restingHeartRateMax;

export const describeHeartRateObservation = (
  heartRate: number,
  preferences: HealthPreferences,
  copy: ReturnType<typeof getAppCopy>,
) => {
  if (heartRate > preferences.restingHeartRateMax) {
    return copy.health.observationHigh(heartRate);
  }
  if (heartRate < preferences.restingHeartRateMin) {
    return copy.health.observationLow(heartRate);
  }
  return copy.health.observationWithin(heartRate);
};
