import { useCallback, useState } from 'react';
export const FIRST_RUN_ONBOARDING_VERSION = 1;

export const onboardingSeenKey = (
  userId: string | null,
) => `my-emotion-map.user.${userId ?? 'signed-out'}.onboardingSeenVersion`;

export const shouldShowFirstRunOnboarding = (
  userId: string | null,
) => {
  try {
    const seenVersion = Number(
      window.localStorage.getItem(onboardingSeenKey(userId)) ?? 0,
    );
    return !Number.isFinite(seenVersion) ||
      seenVersion < FIRST_RUN_ONBOARDING_VERSION;
  } catch {
    return true;
  }
};

export const markFirstRunOnboardingSeen = (
  userId: string | null,
) => {
  try {
    window.localStorage.setItem(
      onboardingSeenKey(userId),
      String(FIRST_RUN_ONBOARDING_VERSION),
    );
    return true;
  } catch {
    return false;
  }
};

export type OnboardingTarget = { userId: string | null };

export const useFirstRunOnboarding = () => {
  const [onboardingTarget, setOnboardingTarget] =
    useState<OnboardingTarget | null>(null);
  const openOnboardingIfNeeded = useCallback(
    (userId: string | null) => {
      setOnboardingTarget(
        shouldShowFirstRunOnboarding(userId)
          ? { userId }
          : null,
      );
    },
    [],
  );
  const completeOnboarding = useCallback(() => {
    setOnboardingTarget((current) => {
      if (current) markFirstRunOnboardingSeen(current.userId);
      return null;
    });
  }, []);
  return { onboardingTarget, openOnboardingIfNeeded, completeOnboarding };
};
