import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { MapPlayerShape, MapZoneShape } from "./livemap/MapCanvas";
import type { AppLanguage } from "./i18n";
import { tr } from "./i18n";
import { isTrackedPlace, type MapTrackingSettings } from "./map-tracking";
import type { LiveFrame } from "./preload";
import {
  computeCompassFrame,
  type CachedCompassPlace,
  type CompassWorkerFriend,
  type CompassWorkerResult,
} from "./compass-compute";

type CompassMapResponse = {
  pois?: MapZoneShape[];
  categories?: { id: string; name: string }[];
  markers?: MapPlayerShape[];
  error?: string;
};

const HEADING_SMOOTHING_MS = 75;
const HEADING_FRAME_INTERVAL_MS = 1000 / 30;
const FRIEND_REFRESH_MS = 3000;
const PLACE_REFRESH_TICKS = 5;

const normalize360 = (degrees: number) => ((degrees % 360) + 360) % 360;
const normalize180 = (degrees: number) => ((degrees + 540) % 360) - 180;

function formatDistance(meters: number): string {
  if (meters >= 1000) return `${(meters / 1000).toFixed(meters >= 10000 ? 0 : 1)} km`;
  return `${Math.max(1, Math.round(meters))} m`;
}


function useSmoothHeading(targetHeading: number | null | undefined): number {
  const initialHeading = normalize360(targetHeading ?? 0);
  const [heading, setHeading] = useState(initialHeading);
  const currentRef = useRef(initialHeading);
  const initializedRef = useRef(targetHeading != null);
  const reducedMotionRef = useRef(window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  useEffect(() => {
    if (targetHeading == null) return;
    const next = normalize360(targetHeading);
    if (!initializedRef.current || reducedMotionRef.current) {
      initializedRef.current = true;
      currentRef.current = next;
      setHeading(next);
      return;
    }

    let frame = 0;
    let previousTime = performance.now();
    const animate = (time: number) => {
      if (time - previousTime < HEADING_FRAME_INTERVAL_MS) {
        frame = window.requestAnimationFrame(animate);
        return;
      }
      const elapsed = Math.min(50, Math.max(0, time - previousTime));
      previousTime = time;
      const delta = normalize180(next - currentRef.current);
      if (Math.abs(delta) <= 0.01) {
        currentRef.current = next;
        setHeading(next);
        return;
      }
      const blend = 1 - Math.exp(-elapsed / HEADING_SMOOTHING_MS);
      currentRef.current = normalize360(currentRef.current + delta * blend);
      setHeading(currentRef.current);
      frame = window.requestAnimationFrame(animate);
    };
    frame = window.requestAnimationFrame(animate);
    return () => window.cancelAnimationFrame(frame);
  }, [targetHeading]);

  return heading;
}

export function CompassWidget({
  live,
  language,
  tracking,
}: {
  live: LiveFrame | null;
  language: AppLanguage;
  tracking: MapTrackingSettings;
}) {
  const [places, setPlaces] = useState<MapZoneShape[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [friends, setFriends] = useState<MapPlayerShape[]>([]);
  const [workerFrame, setWorkerFrame] = useState<CompassWorkerResult>({
    requestId: 0,
    ticks: [],
    visibleMarkers: [],
  });
  const [workerFailed, setWorkerFailed] = useState(false);
  const refreshInFlightRef = useRef(false);
  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef(0);
  const acceptedResultRef = useRef(0);
  const workerFrameTimerRef = useRef<number | null>(null);
  const pendingWorkerFrameRef = useRef<{ position: { x: number; y: number }; heading: number } | null>(null);
  const hasPosition = live?.position != null;
  const t = (text: string) => tr(language, text);

  const refresh = useCallback(async (includePlaces: boolean) => {
    if (refreshInFlightRef.current) return;
    refreshInFlightRef.current = true;
    try {
      const response = await window.isleOverlay.apiGet<CompassMapResponse>("/api/overlay/map");
      if (response.error) return;
      if (includePlaces && Array.isArray(response.pois)) {
        setPlaces(response.pois);
        setCategories(Array.isArray(response.categories) ? response.categories : []);
      }
      if (Array.isArray(response.markers)) setFriends(response.markers.filter((marker) => !marker.self));
    } finally {
      refreshInFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (!hasPosition) return;
    let ticks = 0;
    void refresh(true);
    const timer = window.setInterval(() => {
      ticks += 1;
      void refresh(ticks % PLACE_REFRESH_TICKS === 0);
    }, FRIEND_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [hasPosition, refresh]);

  const heading = useSmoothHeading(live?.position?.yaw);

  useEffect(() => {
    let worker: Worker;
    try {
      worker = new Worker(new URL("./compass.worker.ts", import.meta.url), { type: "module" });
    } catch {
      setWorkerFailed(true);
      return;
    }
    workerRef.current = worker;
    worker.onmessage = (event: MessageEvent<CompassWorkerResult>) => {
      const result = event.data;
      if (!result || result.requestId < acceptedResultRef.current) return;
      acceptedResultRef.current = result.requestId;
      setWorkerFrame(result);
    };
    worker.onerror = () => {
      setWorkerFailed(true);
      worker.terminate();
      if (workerRef.current === worker) workerRef.current = null;
    };
    return () => {
      if (workerFrameTimerRef.current != null) window.clearTimeout(workerFrameTimerRef.current);
      worker.terminate();
      if (workerRef.current === worker) workerRef.current = null;
    };
  }, []);

  const categoryNames = useMemo(
    () => new Map(categories.map((category) => [category.id, category.name])),
    [categories],
  );

  const cachedPlaces = useMemo<CachedCompassPlace[]>(() =>
    places
      .filter((place) => {
        const categoryName = place.categoryId ? categoryNames.get(place.categoryId) : "";
        return place.enabled !== false && place.points.length > 0 && isTrackedPlace(place, tracking, categoryName);
      })
      .map((place) => ({
        id: place.id,
        name: place.name,
        color: place.color || "#7cf2a6",
        centerX: place.points.reduce((sum, point) => sum + point.x, 0) / place.points.length,
        centerY: place.points.reduce((sum, point) => sum + point.y, 0) / place.points.length,
      })),
  [categoryNames, places, tracking]);

  const workerFriends = useMemo<CompassWorkerFriend[]>(() =>
    (tracking.friends ? friends : []).map((friend) => ({
      steamId: friend.steamId,
      label: friend.label,
      x: friend.x,
      y: friend.y,
    })),
  [friends, tracking.friends]);

  useEffect(() => {
    workerRef.current?.postMessage({
      type: "data",
      places: cachedPlaces,
      friends: workerFriends,
      selfSteamId: live?.steamId,
      language,
    });
  }, [cachedPlaces, language, live?.steamId, workerFriends]);

  useEffect(() => {
    const position = live?.position;
    if (!position || workerFailed) return;
    pendingWorkerFrameRef.current = { position: { x: position.x, y: position.y }, heading };
    if (workerFrameTimerRef.current != null) return;
    workerFrameTimerRef.current = window.setTimeout(() => {
      workerFrameTimerRef.current = null;
      const worker = workerRef.current;
      const pendingFrame = pendingWorkerFrameRef.current;
      pendingWorkerFrameRef.current = null;
      if (!worker || !pendingFrame) return;
      worker.postMessage({
        type: "frame",
        requestId: ++requestIdRef.current,
        ...pendingFrame,
      });
    }, HEADING_FRAME_INTERVAL_MS);
  }, [heading, live?.position, workerFailed]);

  const fallbackFrame = useMemo<CompassWorkerResult>(() => {
    const position = live?.position;
    if (!workerFailed || !position) return { requestId: 0, ticks: [], visibleMarkers: [] };
    return computeCompassFrame({
      requestId: 0,
      places: cachedPlaces,
      friends: workerFriends,
      selfSteamId: live?.steamId,
      language,
      position: { x: position.x, y: position.y },
      heading,
    });
  }, [cachedPlaces, heading, language, live?.position, live?.steamId, workerFailed, workerFriends]);

  const { ticks, visibleMarkers } = workerFailed ? fallbackFrame : workerFrame;

  if (!live?.position) {
    return (
      <div className="compassHud dragHandle" aria-label={t("Compass")}>
        <div className="compassUnavailable">{t("Waiting for location data")}</div>
      </div>
    );
  }

  return (
    <div className="compassHud dragHandle" aria-label={`${t("Compass")} ${Math.round(heading)}°`}>
      <div className="compassPlaces" aria-hidden="true">
        {visibleMarkers.map((place) => {
          const anchorLeft = 50 + (place.anchorBearing / 180) * 100;
          return (
            <span
              key={`anchor-${place.id}`}
              className={`compassPoiAnchor ${place.kind === "friend" ? "friend" : ""}`}
              style={{ left: `${anchorLeft}%`, ["--place-color" as string]: place.color }}
            />
          );
        })}
        {visibleMarkers.map((place) => {
          const left = 50 + (place.screenBearing / 180) * 100;
          return (
            <div
              key={place.id}
              className={`compassPlace ${place.kind === "friend" ? "friend" : ""}`}
              style={{
                left: `${left}%`,
                top: place.lane === 0 ? 4 : 55,
                ["--place-color" as string]: place.color,
              }}
              title={`${place.name} · ${formatDistance(place.distanceMeters)}`}
            >
              <span className="compassPlacePin" />
              <span className="compassPlaceText">{place.name}</span>
              <span className="compassDistance">
                {place.kind === "friend" ? (
                  <span className="compassFriendTag">{language === "vi" ? "BẠN" : "FRIEND"}</span>
                ) : null}
                {formatDistance(place.distanceMeters)}
                {place.edgeDirection !== 0 ? (
                  <span className="compassFriendEdge">{place.edgeDirection < 0 ? "◀" : "▶"}</span>
                ) : null}
              </span>
            </div>
          );
        })}
      </div>

      <div className="compassScale" aria-hidden="true">
        {ticks.map((tick) => {
          const left = 50 + (tick.relative / 180) * 100;
          const major = tick.heading % 90 === 0;
          return (
            <div key={tick.heading} className={`compassTick ${major ? "major" : ""}`} style={{ left: `${left}%` }}>
              <span>{tick.label}</span>
            </div>
          );
        })}
      </div>

      <svg className="compassCenter" viewBox="0 0 18 11" aria-hidden="true">
        <path d="M2 2 9 9l7-7" />
      </svg>
    </div>
  );
}
