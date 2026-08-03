import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getCompassHeading,
  type DeviceOrientationEventWithCompass,
} from '../../src/lib/sensorUtils';
import { useLocationController } from '../../src/useLocationController';

const originalOrientationDescriptor = Object.getOwnPropertyDescriptor(
  window,
  'DeviceOrientationEvent',
);
const originalSecureContextDescriptor = Object.getOwnPropertyDescriptor(
  window,
  'isSecureContext',
);
const originalGeolocationDescriptor = Object.getOwnPropertyDescriptor(
  navigator,
  'geolocation',
);
const originalVisibilityDescriptor = Object.getOwnPropertyDescriptor(
  document,
  'visibilityState',
);

const restoreProperty = (
  target: object,
  property: PropertyKey,
  descriptor: PropertyDescriptor | undefined,
) => {
  if (descriptor) {
    Object.defineProperty(target, property, descriptor);
  } else {
    Reflect.deleteProperty(target, property);
  }
};

const makePosition = ({
  latitude = 37.558,
  longitude = 126.998,
  heading = null,
  speed = null,
}: {
  latitude?: number;
  longitude?: number;
  heading?: number | null;
  speed?: number | null;
} = {}) => ({
  coords: {
    latitude,
    longitude,
    accuracy: 12,
    altitude: null,
    altitudeAccuracy: null,
    heading,
    speed,
  },
  timestamp: Date.now(),
}) satisfies GeolocationPosition;

const installOrientationPermission = () => {
  const requestPermission = vi.fn(async () => 'granted' as PermissionState);
  const OrientationEvent = Object.assign(function OrientationEvent() {}, {
    requestPermission,
  });
  Object.defineProperty(window, 'DeviceOrientationEvent', {
    configurable: true,
    value: OrientationEvent,
  });
  return requestPermission;
};

afterEach(() => {
  vi.restoreAllMocks();
  restoreProperty(window, 'DeviceOrientationEvent', originalOrientationDescriptor);
  restoreProperty(window, 'isSecureContext', originalSecureContextDescriptor);
  restoreProperty(navigator, 'geolocation', originalGeolocationDescriptor);
  restoreProperty(document, 'visibilityState', originalVisibilityDescriptor);
});

describe('location heading parity with My Life Memory', () => {
  it('uses the same compass heading fallbacks', () => {
    expect(
      getCompassHeading({
        webkitCompassHeading: -10,
      } as DeviceOrientationEventWithCompass),
    ).toBe(350);
    expect(
      getCompassHeading({
        alpha: 90,
      } as DeviceOrientationEventWithCompass),
    ).toBe(270);
  });

  it('requests iOS direction access from Allow and keeps compass heading through GPS updates', async () => {
    const requestPermission = installOrientationPermission();
    let watchSuccess: PositionCallback | undefined;
    const getCurrentPosition = vi.fn((success: PositionCallback) => {
      success(makePosition());
    });
    const watchPosition = vi.fn((success: PositionCallback) => {
      watchSuccess = success;
      return 1;
    });
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
    const addEventListener = vi.spyOn(window, 'addEventListener');

    const { result, unmount } = renderHook(() =>
      useLocationController({ isMapActive: true, isEnabled: true }),
    );
    await waitFor(() =>
      expect(result.current.isPermissionPromptOpen).toBe(true),
    );

    act(() => result.current.confirmLocationRequest());
    await waitFor(() =>
      expect(requestPermission).toHaveBeenCalledWith(true),
    );
    await waitFor(() => expect(result.current.requestState).toBe('ready'));
    await waitFor(() =>
      expect(addEventListener).toHaveBeenCalledWith(
        'deviceorientation',
        expect.any(Function),
        true,
      ),
    );

    const orientation = new Event('deviceorientation');
    Object.defineProperty(orientation, 'webkitCompassHeading', {
      value: 137,
    });
    act(() => window.dispatchEvent(orientation));
    await waitFor(() =>
      expect(result.current.userLocation?.heading).toBe(137),
    );

    await waitFor(() => expect(watchSuccess).toBeTypeOf('function'));
    const emitWatchPosition = watchSuccess;
    if (!emitWatchPosition) throw new Error('GPS watch did not start');
    act(() => {
      emitWatchPosition(
        makePosition({
          latitude: 37.55801,
          longitude: 126.99801,
        }),
      );
    });
    await waitFor(() =>
      expect(result.current.userLocation?.heading).toBe(137),
    );

    unmount();
  });
});
