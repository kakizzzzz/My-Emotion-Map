import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getCompassHeading,
  type DeviceOrientationEventConstructorWithPermission,
  type DeviceOrientationEventWithCompass,
} from './lib/sensorUtils';

export type LocationRequestState =
  | 'idle'
  | 'requesting'
  | 'ready'
  | 'insecure'
  | 'unsupported'
  | 'denied'
  | 'unavailable'
  | 'timeout';

export type LocationRequestIntent = 'center' | 'place' | 'settings';

export type UserLocation = {
  lat: number;
  lng: number;
  accuracy: number | null;
  heading: number | null;
  timestamp: number;
};

export type ResolvedLocationRequest = {
  id: number;
  intent: LocationRequestIntent;
  location: UserLocation;
};

const PASSIVE_OPTIONS: PositionOptions = {
  enableHighAccuracy: false,
  maximumAge: 30_000,
  timeout: 10_000,
};

const PRECISE_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 0,
  timeout: 15_000,
};

const getCapabilityFailure = (): LocationRequestState | null => {
  if (typeof window === 'undefined' || !window.isSecureContext) return 'insecure';
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return 'unsupported';
  }
  return null;
};

const getFailureState = (error: GeolocationPositionError): LocationRequestState => {
  if (error.code === error.PERMISSION_DENIED) return 'denied';
  if (error.code === error.TIMEOUT) return 'timeout';
  return 'unavailable';
};

const toUserLocation = (position: GeolocationPosition): UserLocation => ({
  lat: position.coords.latitude,
  lng: position.coords.longitude,
  accuracy: Number.isFinite(position.coords.accuracy)
    ? position.coords.accuracy
    : null,
  heading:
    typeof position.coords.heading === 'number' &&
    Number.isFinite(position.coords.heading)
      ? position.coords.heading
      : null,
  timestamp: position.timestamp || Date.now(),
});

const getDistanceBetweenPoints = (
  from: [number, number],
  to: [number, number],
) => {
  const earthRadiusMeters = 6_371_000;
  const fromLat = (from[0] * Math.PI) / 180;
  const toLat = (to[0] * Math.PI) / 180;
  const deltaLat = ((to[0] - from[0]) * Math.PI) / 180;
  const deltaLng = ((to[1] - from[1]) * Math.PI) / 180;
  const rawA =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(fromLat) * Math.cos(toLat) * Math.sin(deltaLng / 2) ** 2;
  const a = Math.min(1, Math.max(0, rawA));
  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const getBearingBetweenPoints = (
  from: [number, number],
  to: [number, number],
) => {
  const fromLat = (from[0] * Math.PI) / 180;
  const toLat = (to[0] * Math.PI) / 180;
  const deltaLng = ((to[1] - from[1]) * Math.PI) / 180;
  const y = Math.sin(deltaLng) * Math.cos(toLat);
  const x =
    Math.cos(fromLat) * Math.sin(toLat) -
    Math.sin(fromLat) * Math.cos(toLat) * Math.cos(deltaLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
};

export const useLocationController = ({
  isMapActive,
  isEnabled,
}: {
  isMapActive: boolean;
  isEnabled: boolean;
}) => {
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [requestState, setRequestState] =
    useState<LocationRequestState>('idle');
  const [hasGrantedLocationAccess, setHasGrantedLocationAccess] = useState(false);
  const [isPermissionPromptOpen, setIsPermissionPromptOpen] = useState(false);
  const [isDocumentVisible, setIsDocumentVisible] = useState(
    () => typeof document === 'undefined' || document.visibilityState !== 'hidden',
  );
  const [isWatching, setIsWatching] = useState(false);
  const [resolvedRequest, setResolvedRequest] =
    useState<ResolvedLocationRequest | null>(null);

  const watchIdRef = useRef<number | null>(null);
  const requestEpochRef = useRef(0);
  const requestInFlightRef = useRef(false);
  const requestSequenceRef = useRef(0);
  const pendingIntentRef = useRef<LocationRequestIntent>('center');
  const hasRequestedEntryLocationRef = useRef(false);
  const hasSeenEntryLocationPromptRef = useRef(false);
  const headingWatchCleanupRef = useRef<(() => void) | null>(null);
  const lastGpsLocationRef = useRef<[number, number] | null>(null);
  const deviceHeadingRef = useRef<number | null>(null);
  const lastCompassHeadingAtRef = useRef(0);
  const isRequestingHeadingPermissionRef = useRef(false);

  const stopWatch = useCallback(() => {
    if (
      watchIdRef.current !== null &&
      typeof navigator !== 'undefined' &&
      navigator.geolocation
    ) {
      navigator.geolocation.clearWatch(watchIdRef.current);
    }
    watchIdRef.current = null;
  }, []);

  const stopHeadingWatch = useCallback(() => {
    headingWatchCleanupRef.current?.();
    headingWatchCleanupRef.current = null;
  }, []);

  const startHeadingWatch = useCallback(async (requestPermission = true) => {
    if (headingWatchCleanupRef.current || typeof window === 'undefined') return;
    if (isRequestingHeadingPermissionRef.current) return;

    const orientationEvent = window.DeviceOrientationEvent as
      | DeviceOrientationEventConstructorWithPermission
      | undefined;
    if (!orientationEvent) return;

    isRequestingHeadingPermissionRef.current = true;
    try {
      if (typeof orientationEvent.requestPermission === 'function') {
        if (!requestPermission) return;
        const permission = await orientationEvent.requestPermission(true);
        if (permission !== 'granted') return;
      }
    } catch {
      return;
    } finally {
      isRequestingHeadingPermissionRef.current = false;
    }

    const handleOrientation = (event: Event) => {
      const heading = getCompassHeading(
        event as DeviceOrientationEventWithCompass,
      );
      if (heading === null) return;
      deviceHeadingRef.current = heading;
      lastCompassHeadingAtRef.current = Date.now();
      setUserLocation((current) =>
        current ? { ...current, heading } : current,
      );
    };

    window.addEventListener(
      'deviceorientationabsolute',
      handleOrientation,
      true,
    );
    window.addEventListener('deviceorientation', handleOrientation, true);
    headingWatchCleanupRef.current = () => {
      window.removeEventListener(
        'deviceorientationabsolute',
        handleOrientation,
        true,
      );
      window.removeEventListener('deviceorientation', handleOrientation, true);
    };
  }, []);

  const applyGpsPosition = useCallback((position: GeolocationPosition) => {
    const baseLocation = toUserLocation(position);
    const coordinates: [number, number] = [
      baseLocation.lat,
      baseLocation.lng,
    ];
    const previousLocation = lastGpsLocationRef.current;
    const hasRecentCompassHeading =
      Date.now() - lastCompassHeadingAtRef.current < 2_500;
    let heading = deviceHeadingRef.current;

    if (!hasRecentCompassHeading) {
      const gpsHeading =
        typeof position.coords.heading === 'number' &&
        Number.isFinite(position.coords.heading) &&
        typeof position.coords.speed === 'number' &&
        position.coords.speed > 0.5
          ? (position.coords.heading + 360) % 360
          : null;
      if (gpsHeading !== null) {
        heading = gpsHeading;
      } else if (
        previousLocation &&
        getDistanceBetweenPoints(previousLocation, coordinates) >= 1
      ) {
        heading = getBearingBetweenPoints(previousLocation, coordinates);
      }
    }

    deviceHeadingRef.current = heading;
    lastGpsLocationRef.current = coordinates;
    const location = { ...baseLocation, heading };
    setUserLocation(location);
    return location;
  }, []);

  const cancelPendingRequest = useCallback(() => {
    requestEpochRef.current += 1;
    requestInFlightRef.current = false;
  }, []);

  const clearLocationSession = useCallback(() => {
    cancelPendingRequest();
    stopWatch();
    stopHeadingWatch();
    lastGpsLocationRef.current = null;
    deviceHeadingRef.current = null;
    lastCompassHeadingAtRef.current = 0;
    setIsWatching(false);
    setHasGrantedLocationAccess(false);
    setUserLocation(null);
    setResolvedRequest(null);
  }, [cancelPendingRequest, stopHeadingWatch, stopWatch]);

  const requestPosition = useCallback(
    (intent: LocationRequestIntent) =>
      new Promise<boolean>((resolve) => {
        const capabilityFailure = getCapabilityFailure();
        if (capabilityFailure) {
          setRequestState(capabilityFailure);
          setHasGrantedLocationAccess(false);
          setIsWatching(false);
          stopWatch();
          stopHeadingWatch();
          resolve(false);
          return;
        }
        if (requestInFlightRef.current) {
          resolve(false);
          return;
        }

        requestInFlightRef.current = true;
        const requestEpoch = requestEpochRef.current + 1;
        requestEpochRef.current = requestEpoch;
        setRequestState('requesting');

        navigator.geolocation.getCurrentPosition(
          (position) => {
            if (requestEpochRef.current !== requestEpoch) {
              resolve(false);
              return;
            }
            requestInFlightRef.current = false;
            const location = applyGpsPosition(position);
            requestSequenceRef.current += 1;
            setRequestState('ready');
            setHasGrantedLocationAccess(true);
            setIsWatching(true);
            setIsPermissionPromptOpen(false);
            setResolvedRequest({
              id: requestSequenceRef.current,
              intent,
              location,
            });
            resolve(true);
          },
          (error) => {
            if (requestEpochRef.current !== requestEpoch) {
              resolve(false);
              return;
            }
            requestInFlightRef.current = false;
            const failure = getFailureState(error);
            setRequestState(failure);
            if (failure === 'denied') {
              setHasGrantedLocationAccess(false);
              setIsWatching(false);
              stopWatch();
            }
            stopHeadingWatch();
            setIsPermissionPromptOpen(true);
            resolve(false);
          },
          intent === 'place' ? PRECISE_OPTIONS : PASSIVE_OPTIONS,
        );
      }),
    [applyGpsPosition, stopHeadingWatch, stopWatch],
  );

  const openLocationRequest = useCallback(
    (intent: LocationRequestIntent) => {
      if (requestState === 'requesting') return;
      pendingIntentRef.current = intent;
      if (hasGrantedLocationAccess) {
        void startHeadingWatch(true);
        if (intent === 'place' && userLocation) {
          requestSequenceRef.current += 1;
          setResolvedRequest({
            id: requestSequenceRef.current,
            intent,
            location: userLocation,
          });
          return;
        }
        void requestPosition(intent);
        return;
      }
      setRequestState('idle');
      setIsPermissionPromptOpen(true);
    },
    [
      hasGrantedLocationAccess,
      requestPosition,
      requestState,
      startHeadingWatch,
      userLocation,
    ],
  );

  const confirmLocationRequest = useCallback(() => {
    if (requestState === 'requesting') return;
    hasSeenEntryLocationPromptRef.current = true;
    void startHeadingWatch(true);
    void requestPosition(pendingIntentRef.current);
  }, [requestPosition, requestState, startHeadingWatch]);

  const closePermissionPrompt = useCallback(() => {
    if (requestState === 'requesting') return;
    hasSeenEntryLocationPromptRef.current = true;
    setIsPermissionPromptOpen(false);
    setRequestState('idle');
    clearLocationSession();
  }, [clearLocationSession, requestState]);

  useEffect(() => {
    if (!isEnabled) {
      hasRequestedEntryLocationRef.current = false;
      return;
    }
    if (!isMapActive || hasRequestedEntryLocationRef.current) return;
    hasRequestedEntryLocationRef.current = true;
    pendingIntentRef.current = 'center';
    if (
      !hasSeenEntryLocationPromptRef.current &&
      !hasGrantedLocationAccess &&
      requestState !== 'ready'
    ) {
      setRequestState('idle');
      setIsPermissionPromptOpen(true);
    }
  }, [hasGrantedLocationAccess, isEnabled, isMapActive, requestState]);

  useEffect(() => {
    const onVisibilityChange = () => {
      setIsDocumentVisible(document.visibilityState !== 'hidden');
    };
    onVisibilityChange();
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

  useEffect(() => {
    const shouldWatch =
      isEnabled &&
      isWatching &&
      hasGrantedLocationAccess &&
      isMapActive &&
      isDocumentVisible &&
      !getCapabilityFailure();

    if (!shouldWatch) {
      stopWatch();
      stopHeadingWatch();
      return;
    }

    void startHeadingWatch(false);
    stopWatch();
    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        applyGpsPosition(position);
        setRequestState('ready');
      },
      (error) => {
        if (error.code !== error.PERMISSION_DENIED) return;
        setRequestState('denied');
        setHasGrantedLocationAccess(false);
        setIsWatching(false);
        stopWatch();
        stopHeadingWatch();
      },
      PASSIVE_OPTIONS,
    );

    return () => {
      stopWatch();
      stopHeadingWatch();
    };
  }, [
    applyGpsPosition,
    hasGrantedLocationAccess,
    isEnabled,
    isDocumentVisible,
    isMapActive,
    isWatching,
    startHeadingWatch,
    stopHeadingWatch,
    stopWatch,
  ]);

  useEffect(
    () => () => {
      cancelPendingRequest();
      stopWatch();
      stopHeadingWatch();
    },
    [cancelPendingRequest, stopHeadingWatch, stopWatch],
  );

  return {
    userLocation,
    requestState,
    hasGrantedLocationAccess,
    isPermissionPromptOpen,
    resolvedRequest,
    openLocationRequest,
    confirmLocationRequest,
    closePermissionPrompt,
  };
};
