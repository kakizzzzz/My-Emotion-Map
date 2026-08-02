import { beforeEach, describe, expect, it } from 'vitest';
import {
  FIRST_RUN_ONBOARDING_VERSION,
  markFirstRunOnboardingSeen,
  onboardingSeenKey,
  shouldShowFirstRunOnboarding,
} from '../../src/app/firstRunOnboarding';

describe('first-run onboarding state', () => {
  beforeEach(() => localStorage.clear());

  it('keeps Demo and each real account in separate versioned keys', () => {
    expect(onboardingSeenKey('demo', null)).toBe(
      'my-emotion-map.demoOnboardingSeenVersion',
    );
    expect(onboardingSeenKey('real', 'user-a')).toBe(
      'my-emotion-map.user.user-a.onboardingSeenVersion',
    );
    expect(onboardingSeenKey('real', 'user-b')).not.toBe(
      onboardingSeenKey('real', 'user-a'),
    );
  });

  it('replays only when the product onboarding version increases', () => {
    expect(shouldShowFirstRunOnboarding('demo', null)).toBe(true);
    markFirstRunOnboardingSeen('demo', null);
    expect(shouldShowFirstRunOnboarding('demo', null)).toBe(false);
    localStorage.setItem(
      onboardingSeenKey('demo', null),
      String(FIRST_RUN_ONBOARDING_VERSION - 1),
    );
    expect(shouldShowFirstRunOnboarding('demo', null)).toBe(true);
  });
});
