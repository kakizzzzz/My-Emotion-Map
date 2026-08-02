import { beforeEach, describe, expect, it } from 'vitest';
import {
  FIRST_RUN_ONBOARDING_VERSION,
  markFirstRunOnboardingSeen,
  onboardingSeenKey,
  shouldShowFirstRunOnboarding,
} from '../../src/app/firstRunOnboarding';

describe('first-run onboarding state', () => {
  beforeEach(() => localStorage.clear());

  it('keeps each signed-in account in a separate versioned key', () => {
    expect(onboardingSeenKey('user-a')).toBe(
      'my-emotion-map.user.user-a.onboardingSeenVersion',
    );
    expect(onboardingSeenKey('user-b')).not.toBe(
      onboardingSeenKey('user-a'),
    );
  });

  it('replays only when the product onboarding version increases', () => {
    expect(shouldShowFirstRunOnboarding('user-a')).toBe(true);
    markFirstRunOnboardingSeen('user-a');
    expect(shouldShowFirstRunOnboarding('user-a')).toBe(false);
    localStorage.setItem(
      onboardingSeenKey('user-a'),
      String(FIRST_RUN_ONBOARDING_VERSION - 1),
    );
    expect(shouldShowFirstRunOnboarding('user-a')).toBe(true);
  });
});
