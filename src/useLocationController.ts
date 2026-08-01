import { useCallback, useEffect, useRef, useState } from 'react';

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

export const useLocationController = ({
  isMapActive,
}: {
  isMapActive: boolean;
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

  const cancelPendingRequest = useCallback(() => {
    requestEpochRef.current += 1;
    requestInFlightRef.current = false;
  }, []);

  const clearLocationSession = useCallback(() => {
    cancelPendingRequest();
    stopWatch();
    setIsWatching(false);
    setHasGrantedLocationAccess(false);
    setUserLocation(null);
    setResolvedRequest(null);
  }, [cancelPendingRequest, stopWatch]);

  const requestPosition = useCallback(
    (intent: LocationRequestIntent) =>
      new Promise<boolean>((resolve) => {
        const capabilityFailure = getCapabilityFailure();
        if (capabilityFailure) {
          setRequestState(capabilityFailure);
          setHasGrantedLocationAccess(false);
          setIsWatching(false);
          stopWatch();
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
            const location = toUserLocation(position);
            requestSequenceRef.current += 1;
            setUserLocation(location);
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
            setIsPermissionPromptOpen(true);
            resolve(false);
          },
          intent === 'place' ? PRECISE_OPTIONS : PASSIVE_OPTIONS,
        );
      }),
    [stopWatch],
  );

  const openLocationRequest = useCallback(
    (intent: LocationRequestIntent) => {
      if (requestState === 'requesting') return;
      pendingIntentRef.current = intent;
      if (hasGrantedLocationAccess) {
        void requestPosition(intent);
        return;
      }
      setRequestState('idle');
      setIsPermissionPromptOpen(true);
    },
    [hasGrantedLocationAccess, requestPosition, requestState],
  );

  const confirmLocationRequest = useCallback(() => {
    if (requestState === 'requesting') return;
    void requestPosition(pendingIntentRef.current);
  }, [requestPosition, requestState]);

  const closePermissionPrompt = useCallback(() => {
    if (requestState === 'requesting') return;
    setIsPermissionPromptOpen(false);
    setRequestState('idle');
    clearLocationSession();
  }, [clearLocationSession, requestState]);

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
      isWatching &&
      hasGrantedLocationAccess &&
      isMapActive &&
      isDocumentVisible &&
      !getCapabilityFailure();

    if (!shouldWatch) {
      stopWatch();
      return;
    }

    stopWatch();
    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        setUserLocation(toUserLocation(position));
        setRequestState('ready');
      },
      (error) => {
        if (error.code !== error.PERMISSION_DENIED) return;
        setRequestState('denied');
        setHasGrantedLocationAccess(false);
        setIsWatching(false);
        stopWatch();
      },
      PASSIVE_OPTIONS,
    );

    return stopWatch;
  }, [
    hasGrantedLocationAccess,
    isDocumentVisible,
    isMapActive,
    isWatching,
    stopWatch,
  ]);

  useEffect(
    () => () => {
      cancelPendingRequest();
      stopWatch();
    },
    [cancelPendingRequest, stopWatch],
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
