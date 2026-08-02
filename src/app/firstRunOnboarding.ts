import { useCallback, useState } from 'react';
import type { DataMode } from '../types';

export const FIRST_RUN_ONBOARDING_VERSION = 1;

export const onboardingSeenKey = (
  dataMode: DataMode,
  userId: string | null,
) => dataMode === 'demo'
  ? 'my-emotion-map.demoOnboardingSeenVersion'
  : `my-emotion-map.user.${userId ?? 'signed-out'}.onboardingSeenVersion`;

export const shouldShowFirstRunOnboarding = (
  dataMode: DataMode,
  userId: string | null,
) => {
  try {
    const seenVersion = Number(
      window.localStorage.getItem(onboardingSeenKey(dataMode, userId)) ?? 0,
    );
    return !Number.isFinite(seenVersion) ||
      seenVersion < FIRST_RUN_ONBOARDING_VERSION;
  } catch {
    return true;
  }
};

export const markFirstRunOnboardingSeen = (
  dataMode: DataMode,
  userId: string | null,
) => {
  try {
    window.localStorage.setItem(
      onboardingSeenKey(dataMode, userId),
      String(FIRST_RUN_ONBOARDING_VERSION),
    );
    return true;
  } catch {
    return false;
  }
};

export type OnboardingTarget = { dataMode: DataMode; userId: string | null };

export const useFirstRunOnboarding = () => {
  const [onboardingTarget, setOnboardingTarget] =
    useState<OnboardingTarget | null>(null);
  const openOnboardingIfNeeded = useCallback(
    (dataMode: DataMode, userId: string | null) => {
      setOnboardingTarget(
        shouldShowFirstRunOnboarding(dataMode, userId)
          ? { dataMode, userId }
          : null,
      );
    },
    [],
  );
  const completeOnboarding = useCallback(() => {
    setOnboardingTarget((current) => {
      if (current) markFirstRunOnboardingSeen(current.dataMode, current.userId);
      return null;
    });
  }, []);
  return { onboardingTarget, openOnboardingIfNeeded, completeOnboarding };
};
