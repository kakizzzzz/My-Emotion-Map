import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { Map as MapGL } from "react-map-gl/maplibre";
import { AnimatePresence } from "motion/react";
import { MapSearchPanel } from './MapSearchPanel';
import { MapToolbar } from './MapToolbar';
import { StarActionBar } from './StarActionBar';
import { useMapInteractionController } from './useMapInteractionController';
import { MapMarkers } from './MapMarkers';
import { MapAttribution } from './MapAttribution';
import { useAppLanguage } from "../../i18n";
import { type LocationRequestState, type ResolvedLocationRequest, type UserLocation } from "../../useLocationController";
import type { EmotionMoment, EmotionNote } from "../../types";
import {
  MAP_STYLES,
  MAP_STYLE_STORAGE_KEY,
  loadMapStyle,
} from './mapPreferences';
import {
  parseCoordinateInput,
  writeClipboardText,
  isInsideMainlandChina,
  wgs84ToGcj02,
  gcj02ToBd09,
  formatCoordinate,
} from './coordinateTransforms';
import { createRecord } from '../../app/recordFactory';
import { readPhotoMetadata } from './photoMetadata';
import {
  invokePhotoAssist,
  preparePhotoForAssist,
} from './photoAssist';
import type { CloudAuth } from '../../services/supabaseClient';
import { createRecordId } from '../../app/createRecordId';
import type {
  PhotoAssistDelivery,
  ToastHandler,
} from '../../app/appTypes';
import type {
  MapProvider,
} from './coordinateTransforms';

export type MapScreenProps = {
  moments: EmotionMoment[];
  setMoments: Dispatch<SetStateAction<EmotionMoment[]>>;
  notes: EmotionNote[];
  setNotes: Dispatch<SetStateAction<EmotionNote[]>>;
  focusMomentId: string | null;
  setFocusMomentId: Dispatch<SetStateAction<string | null>>;
  onEditMoment: (id: string) => void;
  onViewMoment: (id: string) => void;
  onDeleteMoment: (id: string) => void;
  userLocation: UserLocation | null;
  locationRequestState: LocationRequestState;
  resolvedLocationRequest: ResolvedLocationRequest | null;
  onRequestLocation: (intent: 'center' | 'place') => void;
  onToast: ToastHandler;
  cloudAuth: CloudAuth | null;
  onPhotoAssistResult: (momentId: string, delivery: PhotoAssistDelivery) => void;
};

export function MapScreen({
  moments,
  setMoments,
  notes,
  setNotes,
  focusMomentId,
  setFocusMomentId,
  onEditMoment,
  onViewMoment,
  onDeleteMoment,
  userLocation,
  locationRequestState,
  resolvedLocationRequest,
  onRequestLocation,
  onToast,
  cloudAuth,
  onPhotoAssistResult,
}: MapScreenProps) {
  const { copy, language } = useAppLanguage();
  const mapStyleLabels: Record<keyof typeof MAP_STYLES, string> = {
    light: copy.map.styles.light,
    dark: copy.map.styles.dark,
    aerial: copy.map.styles.aerial,
  };
  const starActionOverlayRef = useRef<HTMLDivElement | null>(null);
  const skipNextMapClickRef = useRef(false);
  const handledLocationRequestRef = useRef(0);
  const cloudUserIdRef = useRef(cloudAuth?.userId ?? '');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [toolsOpen, setToolsOpen] = useState(true);
  const [mapStyle, setMapStyle] = useState<keyof typeof MAP_STYLES>(loadMapStyle);

  useEffect(() => {
    cloudUserIdRef.current = cloudAuth?.userId ?? '';
  }, [cloudAuth?.userId]);
  const [stylePickerOpen, setStylePickerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [coordinateSearch, setCoordinateSearch] = useState('');
  const [textSearch, setTextSearch] = useState('');
  const [activeSearchField, setActiveSearchField] = useState<'coordinate' | 'text'>('text');
  const [tagMode, setTagMode] = useState<'add' | 'remove' | null>(null);
  const [currentTagGroup, setCurrentTagGroup] = useState(() => Date.now());
  const [activeStarTab, setActiveStarTab] = useState<'eye' | 'color' | null>(null);
  const [customPickerOpen, setCustomPickerOpen] = useState(false);
  const [customColor, setCustomColor] = useState('#D2936D');
  const [mapChooserOpen, setMapChooserOpen] = useState(false);
  const [copyStatus, setCopyStatus] = useState('');
  const [photoLoading, setPhotoLoading] = useState(false);
  const [mapLoadError, setMapLoadError] = useState(false);
  const [mapReloadKey, setMapReloadKey] = useState(0);
  const selectedMoment = useMemo(
    () => moments.find((moment) => moment.id === selectedId) ?? null,
    [moments, selectedId],
  );
  const {
    mapRef,
    starDragPreview,
    ignoreNextStarClickRef,
    moveMapTo,
    beginStarDrag,
    beginStarMouseDrag,
  } = useMapInteractionController({
    isLocationRequesting: locationRequestState === 'requesting',
    onDropStar: ({ lng, lat }) => {
      onEditMoment(addMomentAt(lng, lat));
    },
  });

  const syncStarActionPosition = useCallback(() => {
    const map = mapRef.current;
    const overlay = starActionOverlayRef.current;
    if (!map || !overlay || !selectedMoment || tagMode) return;

    const point = map.project([
      selectedMoment.longitude,
      selectedMoment.latitude,
    ]);
    overlay.style.left = `${point.x}px`;
    overlay.style.top = `${point.y + 36}px`;
    overlay.style.visibility = 'visible';
  }, [mapRef, selectedMoment, tagMode]);

  useLayoutEffect(() => {
    const overlay = starActionOverlayRef.current;
    if (!overlay || !selectedMoment || tagMode) return;

    syncStarActionPosition();
    const frame = window.requestAnimationFrame(syncStarActionPosition);
    window.addEventListener('resize', syncStarActionPosition);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', syncStarActionPosition);
    };
  }, [selectedMoment, syncStarActionPosition, tagMode]);

  useEffect(() => {
    try {
      window.localStorage.setItem(MAP_STYLE_STORAGE_KEY, mapStyle);
    } catch {
      // Keep the selected map style for the current session.
    }
  }, [mapStyle]);

  useEffect(() => {
    if (!focusMomentId) return;
    const target = moments.find((moment) => moment.id === focusMomentId);
    if (!target || !mapRef.current) return;

    const frame = window.requestAnimationFrame(() => {
      moveMapTo([target.longitude, target.latitude], 17, 620);
      setSelectedId(null);
      setFocusMomentId(null);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [focusMomentId, mapRef, moments, moveMapTo, setFocusMomentId]);

  const tagLine = useMemo(() => {
    const groups = new Map<number, EmotionMoment[]>();
    moments
      .filter((moment) => moment.tagGroupId !== undefined && moment.tagOrder !== undefined)
      .forEach((moment) => {
        const group = groups.get(moment.tagGroupId!) ?? [];
        group.push(moment);
        groups.set(moment.tagGroupId!, group);
      });

    return {
      type: 'FeatureCollection',
      features: Array.from(groups.entries())
        .map(([groupId, group]) => ({
          type: 'Feature',
          properties: { groupId },
          geometry: {
            type: 'LineString',
            coordinates: [...group]
              .sort((a, b) => (a.tagOrder ?? 0) - (b.tagOrder ?? 0))
              .map((moment) => [moment.longitude, moment.latitude]),
          },
        }))
        .filter((feature) => feature.geometry.coordinates.length > 1),
    };
  }, [moments]);

  const localSearchResults = useMemo(() => {
    const query = textSearch.trim().toLocaleLowerCase();
    if (!query) return [];
    return moments
      .filter((moment) => {
        const note = notes.find((item) => item.id === moment.noteId);
        const searchable = [
          moment.place,
          moment.date,
          moment.time,
          note?.title,
          note?.place,
          note?.date,
          note?.time,
          note?.excerpt,
          ...(note?.answers.flatMap((answer) => [answer.question, answer.answer]) ?? []),
        ]
          .filter(Boolean)
          .join(' ')
          .toLocaleLowerCase();
        return searchable.includes(query);
      })
      .slice(0, 8);
  }, [moments, notes, textSearch]);

  const focusSearchResult = (moment: EmotionMoment) => {
    moveMapTo([moment.longitude, moment.latitude], 17, 620);
    setSelectedId(moment.id);
    setSearchOpen(false);
  };

  const flyMomentToCenter = (moment: EmotionMoment) => {
    const map = mapRef.current;
    if (!map) return;

    const center = [moment.longitude, moment.latitude] as [number, number];
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      map.jumpTo({ center, zoom: 16 });
      return;
    }

    const container = map.getContainer();
    const point = map.project(center);
    const distance = Math.hypot(
      point.x - container.clientWidth / 2,
      point.y - container.clientHeight / 2,
    );
    const diagonal = Math.hypot(
      container.clientWidth,
      container.clientHeight,
    ) || 1;
    const travelRatio = Math.min(distance / diagonal, 1);
    const duration =
      Math.abs(map.getZoom() - 16) < 0.001
        ? 620 + travelRatio * 180
        : 1250 + travelRatio * 300;

    map.flyTo({
      center,
      zoom: 16,
      duration,
      curve: 1.15,
      essential: false,
    });
  };

  const selectStar = (id: string) => {
    if (tagMode === 'add') {
      const target = moments.find((moment) => moment.id === id);
      if (target?.tagOrder !== undefined) {
        return;
      }
      if (target) flyMomentToCenter(target);
      setMoments((current) => {
        const currentTarget = current.find((moment) => moment.id === id);
        if (!currentTarget || currentTarget.tagOrder !== undefined) return current;
        const groupStars = current.filter((moment) => moment.tagGroupId === currentTagGroup);
        const nextOrder = Math.max(0, ...groupStars.map((moment) => moment.tagOrder ?? 0)) + 1;
        return current.map((moment) =>
          moment.id === id
            ? { ...moment, tagGroupId: currentTagGroup, tagOrder: nextOrder }
            : moment,
        );
      });
      return;
    }

    if (tagMode === 'remove') {
      const target = moments.find((moment) => moment.id === id);
      if (!target?.tagOrder || target.tagGroupId === undefined) {
        return;
      }
      flyMomentToCenter(target);
      setMoments((current) => {
        const removed = current.find((moment) => moment.id === id);
        if (!removed?.tagOrder || removed.tagGroupId === undefined) return current;
        const removedOrder = removed.tagOrder;
        return current.map((moment) => {
          if (moment.id === id) {
            return { ...moment, tagGroupId: undefined, tagOrder: undefined };
          }
          if (
            moment.tagGroupId === removed.tagGroupId &&
            moment.tagOrder &&
            moment.tagOrder > removedOrder
          ) {
            return { ...moment, tagOrder: moment.tagOrder - 1 };
          }
          return moment;
        });
      });
      return;
    }

    setActiveStarTab(null);
    setCustomPickerOpen(false);
    setMapChooserOpen(false);
    setCopyStatus('');
    if (selectedId === id) {
      mapRef.current?.stop();
      setSelectedId(null);
      return;
    }

    const target = moments.find((moment) => moment.id === id);
    if (!target) return;
    setSelectedId(id);
    flyMomentToCenter(target);
  };

  const setSelectedColor = (color: string) => {
    if (!selectedId) return;
    const selectedMoment = moments.find((moment) => moment.id === selectedId);
    if (!selectedMoment) return;
    setMoments((current) =>
      current.map((moment) =>
        moment.id === selectedId ? { ...moment, color } : moment,
      ),
    );
    setNotes((current) =>
      current.map((note) =>
        note.id === selectedMoment.noteId ? { ...note, color } : note,
      ),
    );
  };

  const deleteMoment = (moment: EmotionMoment) => {
    onDeleteMoment(moment.id);
    setSelectedId(null);
    setActiveStarTab(null);
    setCustomPickerOpen(false);
    setMapChooserOpen(false);
  };

  const copyMomentCoordinates = async (moment: EmotionMoment) => {
    try {
      await writeClipboardText(`${moment.latitude}, ${moment.longitude}`);
      setCopyStatus(copy.common.copied);
      window.setTimeout(() => setCopyStatus(''), 500);
    } catch {
      // Failed clipboard access stays quiet and leaves local records unchanged.
    }
  };

  const openWithFallback = (primaryUrl: string, fallbackUrl?: string) => {
    if (!fallbackUrl) {
      window.open(primaryUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    const isMobile = /Android|iPad|iPhone|iPod/i.test(navigator.userAgent || '');
    if (!isMobile) {
      window.open(fallbackUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    const startedAt = Date.now();
    window.location.href = primaryUrl;
    window.setTimeout(() => {
      if (!document.hidden && Date.now() - startedAt < 1800) window.location.href = fallbackUrl;
    }, 900);
  };

  const openMomentInMap = (moment: EmotionMoment, provider: MapProvider) => {
    setMapChooserOpen(false);
    const wgs84 = { lat: moment.latitude, lng: moment.longitude };
    const gcj02 = wgs84ToGcj02(wgs84);
    const bd09 = gcj02ToBd09(gcj02);
    const title = encodeURIComponent(moment.place || copy.map.label);
    const appName = encodeURIComponent('My Emotion Map');
    const isIOS =
      /iPad|iPhone|iPod/i.test(navigator.userAgent || '') ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isAndroid = /Android/i.test(navigator.userAgent || '');

    if (provider === 'apple') {
      const point = isInsideMainlandChina(wgs84) ? gcj02 : wgs84;
      const lat = formatCoordinate(point.lat);
      const lng = formatCoordinate(point.lng);
      const webUrl = `https://maps.apple.com/?ll=${lat},${lng}&q=${title}`;
      openWithFallback(isIOS ? `maps://?ll=${lat},${lng}&q=${title}` : webUrl, webUrl);
      return;
    }

    if (provider === 'amap') {
      const lat = formatCoordinate(gcj02.lat);
      const lng = formatCoordinate(gcj02.lng);
      const webUrl = `https://uri.amap.com/marker?position=${lng},${lat}&name=${title}&src=${appName}&coordinate=gaode`;
      const appUrl = isIOS
        ? `iosamap://viewMap?sourceApplication=${appName}&poiname=${title}&lat=${lat}&lon=${lng}&dev=0`
        : `androidamap://viewMap?sourceApplication=${appName}&poiname=${title}&lat=${lat}&lon=${lng}&dev=0`;
      openWithFallback(isIOS || isAndroid ? appUrl : webUrl, webUrl);
      return;
    }

    if (provider === 'baidu') {
      const lat = formatCoordinate(bd09.lat);
      const lng = formatCoordinate(bd09.lng);
      const webUrl = `https://api.map.baidu.com/marker?location=${lat},${lng}&title=${title}&content=${title}&coord_type=bd09ll&output=html&src=${appName}`;
      openWithFallback(
        `baidumap://map/marker?location=${lat},${lng}&title=${title}&content=${title}&coord_type=bd09ll&src=${appName}`,
        webUrl,
      );
      return;
    }

    const lat = formatCoordinate(wgs84.lat);
    const lng = formatCoordinate(wgs84.lng);
    const webUrl = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
    const appUrl = isIOS
      ? `comgooglemaps://?q=${lat},${lng}`
      : `geo:${lat},${lng}?q=${lat},${lng}(${title})`;
    openWithFallback(isIOS || isAndroid ? appUrl : webUrl, webUrl);
  };

  const addMomentAt = useCallback((
    longitude: number,
    latitude: number,
    place = copy.map.selectedLocation,
    metadata: Partial<Pick<
      EmotionMoment,
      | 'source'
      | 'eventTimeSource'
      | 'photoTakenAt'
      | 'photoTakenAtKind'
      | 'photoTakenAtSource'
      | 'importedAt'
      | 'date'
      | 'time'
    >> & { source?: NonNullable<EmotionMoment['source']> } = {
      source: 'manual',
      eventTimeSource: 'device-created',
    },
  ) => {
    const { moment, note } = createRecord({
      longitude,
      latitude,
      place,
      language,
      source: metadata.source ?? 'manual',
      eventTimeSource: metadata.eventTimeSource,
      date: metadata.date || undefined,
      time: metadata.time || undefined,
      photoTakenAt: metadata.photoTakenAt,
      photoTakenAtKind: metadata.photoTakenAtKind,
      photoTakenAtSource: metadata.photoTakenAtSource,
      importedAt: metadata.importedAt,
    });
    setMoments((current) => [...current, moment]);
    setNotes((current) => [...current, note]);
    return moment.id;
  }, [copy.map.selectedLocation, language, setMoments, setNotes]);

  useEffect(() => {
    if (
      !resolvedLocationRequest ||
      handledLocationRequestRef.current === resolvedLocationRequest.id
    ) {
      return;
    }
    handledLocationRequestRef.current = resolvedLocationRequest.id;
    const { intent, location } = resolvedLocationRequest;
    if (intent === 'place') {
      onEditMoment(
        addMomentAt(
          location.lng,
          location.lat,
          copy.map.currentLocation,
          { source: 'current-location' },
        ),
      );
    }
    moveMapTo(
      [location.lng, location.lat],
      intent === 'place' ? 17 : 16,
      650,
    );
  }, [
    addMomentAt,
    copy.map.currentLocation,
    moveMapTo,
    onEditMoment,
    resolvedLocationRequest,
  ]);

  const handlePhotoFile = async (file: File) => {
    if (photoLoading) return;
    setPhotoLoading(true);
    onToast(copy.feedback.photoLocationLoading, {
      placement: 'top',
      durationMs: 0,
    });
    try {
      const metadata = await readPhotoMetadata(file);
      if (!metadata) {
        onToast(copy.feedback.photoLocationMissing, {
          placement: 'top',
          durationMs: 1800,
        });
        return;
      }
      const momentId = addMomentAt(
        metadata.longitude,
        metadata.latitude,
        copy.map.photoRecordLocation,
        {
          source: 'photo',
          eventTimeSource: metadata.photoTakenAt ? 'photo-exif' : 'device-created',
          date: metadata.date ?? '',
          time: metadata.time ?? '',
          photoTakenAt: metadata.photoTakenAt,
          photoTakenAtKind: metadata.photoTakenAtKind,
          photoTakenAtSource: metadata.photoTakenAtSource,
          importedAt: new Date().toISOString(),
        },
      );
      onEditMoment(momentId);
      moveMapTo([metadata.longitude, metadata.latitude], 17, 650);
      onToast(copy.feedback.photoLocationCreated, {
        placement: 'top',
        durationMs: 500,
      });
      if (cloudAuth) {
        const requestUserId = cloudAuth.userId;
        try {
          const prepared = await preparePhotoForAssist(file);
          const result = await invokePhotoAssist({
            auth: cloudAuth,
            imageDataUrl: prepared.imageDataUrl,
            language,
            localDate: metadata.date,
          });
          if (result && cloudUserIdRef.current === requestUserId) {
            onPhotoAssistResult(momentId, {
              requestId: createRecordId('photo-assist'),
              result,
            });
          }
        } catch {
          // The local GPS/EXIF record remains complete when image assistance fails.
        }
      }
    } catch {
      onToast(copy.feedback.photoLocationFailed, {
        placement: 'top',
        durationMs: 500,
      });
    } finally {
      setPhotoLoading(false);
    }
  };

  const submitSearch = () => {
    if (activeSearchField === 'coordinate') {
      const coordinate = parseCoordinateInput(coordinateSearch);
      if (!coordinate) {
        onToast(copy.map.invalidCoordinates);
        return;
      }
      moveMapTo([coordinate.lng, coordinate.lat], 17, 650);
      setSelectedId(null);
      setSearchOpen(false);
      return;
    }

    if (!textSearch.trim()) {
      return;
    }
    if (!localSearchResults.length) {
      return;
    }
    if (localSearchResults.length === 1) {
      focusSearchResult(localSearchResults[0]);
    }
  };

  return (
    <section className={`map-screen theme-${mapStyle}`} aria-label={copy.map.label}>
      <MapGL
        key={mapReloadKey}
        ref={mapRef}
        initialViewState={{
          longitude: 127.0001,
          latitude: 37.5583,
          zoom: 16,
        }}
        mapStyle={MAP_STYLES[mapStyle]}
        attributionControl={false}
        onLoad={() => setMapLoadError(false)}
        onError={() => setMapLoadError(true)}
        cursor="grab"
        onMove={syncStarActionPosition}
        onResize={syncStarActionPosition}
        onClick={(event) => {
          if (skipNextMapClickRef.current) {
            skipNextMapClickRef.current = false;
            return;
          }
          const clickTarget = event.originalEvent.target;
          if (clickTarget instanceof Element && clickTarget.closest('.map-star-anchor')) return;
          setSelectedId(null);
        }}
      >
        <MapMarkers
          moments={moments}
          selectedId={selectedId}
          mapStyle={mapStyle}
          tagLine={tagLine}
          userLocation={userLocation}
          starDragPreview={starDragPreview}
          onSelectMoment={(momentId) => {
            skipNextMapClickRef.current = true;
            window.setTimeout(() => {
              skipNextMapClickRef.current = false;
            }, 80);
            selectStar(momentId);
          }}
        />
      </MapGL>

      <AnimatePresence>
        {selectedMoment && !tagMode ? (
          <StarActionBar
            overlayRef={starActionOverlayRef}
            moment={selectedMoment}
            activeTab={activeStarTab}
            customPickerOpen={customPickerOpen}
            customColor={customColor}
            mapChooserOpen={mapChooserOpen}
            copyStatus={copyStatus}
            onActiveTab={(tab) => {
              if (tab === 'eye') {
                setMapChooserOpen(false);
                setCopyStatus('');
              }
              setActiveStarTab(tab);
            }}
            onCustomPickerOpen={setCustomPickerOpen}
            onCustomColor={setCustomColor}
            onMapChooserOpen={setMapChooserOpen}
            onColor={setSelectedColor}
            onEdit={() => onEditMoment(selectedMoment.id)}
            onView={() => onViewMoment(selectedMoment.id)}
            onDelete={() => deleteMoment(selectedMoment)}
            onCopyCoordinates={() =>
              void copyMomentCoordinates(selectedMoment)
            }
            onOpenMap={(provider) =>
              openMomentInMap(selectedMoment, provider)
            }
          />
        ) : null}
      </AnimatePresence>

      {mapLoadError ? (
        <div className="map-load-error" role="alert">
          <span>{copy.map.loadFailed}</span>
          <button
            type="button"
            onClick={() => {
              setMapLoadError(false);
              setMapReloadKey((current) => current + 1);
            }}
          >
            {copy.common.retry}
          </button>
        </div>
      ) : null}

      <MapAttribution mapStyle={mapStyle} />

      <MapToolbar
        toolsOpen={toolsOpen}
        mapStyle={mapStyle}
        mapStyleLabels={mapStyleLabels}
        stylePickerOpen={stylePickerOpen}
        tagMode={tagMode}
        starDragPreview={starDragPreview}
        photoLoading={photoLoading}
        searchOpen={searchOpen}
        locationRequestState={locationRequestState}
        onToolsOpen={() => setToolsOpen((current) => !current)}
        onStylePickerOpen={() =>
          setStylePickerOpen((current) => !current)
        }
        onMapStyle={(style) => {
          setMapStyle(style);
          setStylePickerOpen(false);
        }}
        onRequestLocation={onRequestLocation}
        onTagMode={(mode) => {
          if (mode === 'add' && !tagMode) {
            setCurrentTagGroup(Date.now());
          }
          setTagMode(mode);
        }}
        onBeginStarDrag={beginStarDrag}
        onBeginStarMouseDrag={beginStarMouseDrag}
        onStarClick={() => {
          if (ignoreNextStarClickRef.current) return;
          onRequestLocation('place');
        }}
        onPhotoFile={(file) => void handlePhotoFile(file)}
        onSearchOpen={() =>
          setSearchOpen((current) => !current)
        }
      />

      <AnimatePresence>
        {searchOpen ? (
          <MapSearchPanel
            activeField={activeSearchField}
            coordinateSearch={coordinateSearch}
            textSearch={textSearch}
            results={localSearchResults}
            notes={notes}
            onActiveField={setActiveSearchField}
            onCoordinateSearch={setCoordinateSearch}
            onTextSearch={setTextSearch}
            onSubmit={submitSearch}
            onFocusResult={focusSearchResult}
            onClose={() => setSearchOpen(false)}
          />
        ) : null}
      </AnimatePresence>

    </section>
  );
}
