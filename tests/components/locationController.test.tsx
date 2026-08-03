import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useLocationController } from '../../src/useLocationController';

const position = {
  coords: {
    latitude: 37.558,
    longitude: 126.998,
    accuracy: 12,
    altitude: null,
    altitudeAccuracy: null,
    heading: null,
    speed: null,
  },
  timestamp: 1_785_727_200_000,
} satisfies GeolocationPosition;

describe('location controller lifecycle', () => {
  afterEach(() => vi.restoreAllMocks());

  it('asks on signed-in entry and resumes watching after browser visibility returns', async () => {
    const getCurrentPosition = vi.fn((success: PositionCallback) => success(position));
    const watchPosition = vi.fn(() => watchPosition.mock.calls.length);
    const clearWatch = vi.fn();
    Object.defineProperty(window, 'isSecureContext', {
      configurable: true,
      value: true,
    });
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition, watchPosition, clearWatch },
    });
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });

    const { result } = renderHook(() => useLocationController({
      isMapActive: true,
      isEnabled: true,
    }));
    await waitFor(() => expect(result.current.isPermissionPromptOpen).toBe(true));

    act(() => result.current.confirmLocationRequest());
    await waitFor(() => expect(result.current.requestState).toBe('ready'));
    expect(result.current.userLocation).toMatchObject({
      lat: 37.558,
      lng: 126.998,
    });
    await waitFor(() => expect(watchPosition).toHaveBeenCalledTimes(1));

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden',
    });
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    await waitFor(() => expect(clearWatch).toHaveBeenCalled());
    expect(result.current.userLocation).toMatchObject({
      lat: 37.558,
      lng: 126.998,
    });

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    await waitFor(() => expect(watchPosition).toHaveBeenCalledTimes(2));
  });

  it('does not reopen the entry prompt after the user dismisses it', async () => {
    const { result, rerender } = renderHook(
      ({ isEnabled }) => useLocationController({
        isMapActive: true,
        isEnabled,
      }),
      { initialProps: { isEnabled: true } },
    );

    await waitFor(() => expect(result.current.isPermissionPromptOpen).toBe(true));
    act(() => result.current.closePermissionPrompt());
    await waitFor(() => expect(result.current.isPermissionPromptOpen).toBe(false));

    rerender({ isEnabled: false });
    rerender({ isEnabled: true });
    await waitFor(() => expect(result.current.isPermissionPromptOpen).toBe(false));
  });
});
