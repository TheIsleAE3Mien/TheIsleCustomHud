import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { MapPlayerShape, MapZoneShape } from "./livemap/MapCanvas";
import type { AppLanguage } from "./i18n";
import { tr } from "./i18n";
import type { LiveFrame } from "./preload";

type CompassMapResponse = {
  pois?: MapZoneShape[];
  markers?: MapPlayerShape[];
  error?: string;
};

type CompassPlace = {
  id: string;
  kind: "place" | "friend";
  name: string;
  color: string;
  relativeBearing: number;
  anchorBearing: number;
  screenBearing: number;
  distanceMeters: number;
  halfSpanDegrees: number;
  lane: number;
  edgeDirection: -1 | 0 | 1;
};

type CachedCompassPlace = {
  id: string;
  name: string;
  color: string;
  centerX: number;
  centerY: number;
};

const MAX_PLACE_DISTANCE_METERS = 1500;
const MAX_VISIBLE_MARKERS = 8;
const PLACE_LANES = 2;
const COMPASS_CONTENT_WIDTH_PX = 672;
const PLACE_COLLISION_GAP_DEGREES = 1.5;
const HEADING_SMOOTHING_MS = 75;
const FRIEND_REFRESH_MS = 3000;
const PLACE_REFRESH_TICKS = 5;
const FRIEND_COLOR = "#5ecbff";

const normalize360 = (degrees: number) => ((degrees % 360) + 360) % 360;
const normalize180 = (degrees: number) => ((degrees + 540) % 360) - 180;

function cardinal(degrees: number): string | null {
  const normalized = Math.round(normalize360(degrees));
  if (normalized === 0 || normalized === 360) return "N";
  if (normalized === 90) return "E";
  if (normalized === 180) return "S";
  if (normalized === 270) return "W";
  return null;
}

function formatDistance(meters: number): string {
  if (meters >= 1000) return `${(meters / 1000).toFixed(meters >= 10000 ? 0 : 1)} km`;
  return `${Math.max(1, Math.round(meters))} m`;
}

function estimateHalfSpanDegrees(name: string, distanceMeters: number, kind: CompassPlace["kind"]): number {
  const characterLimit = kind === "friend" ? 22 : 28;
  const maxWidth = kind === "friend" ? 180 : 210;
  const longestLineCharacters = Math.max(Math.min(name.length, characterLimit), formatDistance(distanceMeters).length);
  const estimatedWidthPx = Math.max(104, Math.min(maxWidth, 38 + longestLineCharacters * 7.3));
  return (estimatedWidthPx / COMPASS_CONTENT_WIDTH_PX) * 90;
}

function findLanePosition(desired: number, halfSpan: number, placed: CompassPlace[]): number | null {
  const min = -90 + halfSpan;
  const max = 90 - halfSpan;
  const clampedDesired = Math.max(min, Math.min(max, desired));
  const candidates = [
    clampedDesired,
    ...placed.flatMap((place) => [
      place.screenBearing - place.halfSpanDegrees - PLACE_COLLISION_GAP_DEGREES - halfSpan,
      place.screenBearing + place.halfSpanDegrees + PLACE_COLLISION_GAP_DEGREES + halfSpan,
    ]),
  ];

  return candidates
    .filter((candidate) => candidate >= min && candidate <= max)
    .filter((candidate) =>
      placed.every(
        (place) =>
          Math.abs(place.screenBearing - candidate)
          >= place.halfSpanDegrees + halfSpan + PLACE_COLLISION_GAP_DEGREES,
      ),
    )
    .sort((a, b) => Math.abs(a - desired) - Math.abs(b - desired))[0] ?? null;
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

export function CompassWidget({ live, language }: { live: LiveFrame | null; language: AppLanguage }) {
  const [places, setPlaces] = useState<MapZoneShape[]>([]);
  const [friends, setFriends] = useState<MapPlayerShape[]>([]);
  const refreshInFlightRef = useRef(false);
  const t = (text: string) => tr(language, text);

  const refresh = useCallback(async (includePlaces: boolean) => {
    if (refreshInFlightRef.current) return;
    refreshInFlightRef.current = true;
    try {
      const response = await window.isleOverlay.apiGet<CompassMapResponse>("/api/overlay/map");
      if (response.error) return;
      if (includePlaces && Array.isArray(response.pois)) setPlaces(response.pois);
      if (Array.isArray(response.markers)) setFriends(response.markers.filter((marker) => !marker.self));
    } finally {
      refreshInFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    let ticks = 0;
    void refresh(true);
    const timer = window.setInterval(() => {
      ticks += 1;
      void refresh(ticks % PLACE_REFRESH_TICKS === 0);
    }, FRIEND_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const heading = useSmoothHeading(live?.position?.yaw);

  const cachedPlaces = useMemo<CachedCompassPlace[]>(() =>
    places
      .filter((place) => place.enabled !== false && place.points.length > 0)
      .map((place) => ({
        id: place.id,
        name: place.name,
        color: place.color || "#7cf2a6",
        centerX: place.points.reduce((sum, point) => sum + point.x, 0) / place.points.length,
        centerY: place.points.reduce((sum, point) => sum + point.y, 0) / place.points.length,
      })),
  [places]);

  const ticks = useMemo(() => {
    const output: { heading: number; relative: number; label: string }[] = [];
    const first = Math.ceil((heading - 90) / 15) * 15;
    for (let value = first; value <= heading + 90; value += 15) {
      const relative = normalize180(value - heading);
      const direction = cardinal(value);
      output.push({
        heading: normalize360(value),
        relative,
        label: direction ?? String(Math.round(normalize360(value))),
      });
    }
    return output;
  }, [heading]);

  const visibleMarkers = useMemo<CompassPlace[]>(() => {
    const position = live?.position;
    if (!position) return [];
    const friendCandidates = friends
      .filter((friend) => friend.steamId !== live.steamId && Number.isFinite(friend.x) && Number.isFinite(friend.y))
      .map((friend) => {
        const deltaX = friend.x - position.x;
        const deltaY = friend.y - position.y;
        const bearing = normalize360((Math.atan2(deltaY, deltaX) * 180) / Math.PI);
        const relativeBearing = normalize180(bearing - heading);
        return {
          id: `friend-${friend.steamId}`,
          kind: "friend" as const,
          name: friend.label?.trim() || (language === "vi" ? "Bạn bè" : "Friend"),
          color: FRIEND_COLOR,
          relativeBearing,
          anchorBearing: Math.max(-86, Math.min(86, relativeBearing)),
          distanceMeters: Math.hypot(deltaX, deltaY) / 100,
          edgeDirection: (relativeBearing < -86 ? -1 : relativeBearing > 86 ? 1 : 0) as -1 | 0 | 1,
        };
      })
      .sort((a, b) => a.distanceMeters - b.distanceMeters);

    const placeCandidates = cachedPlaces
      .map((place) => {
        const deltaX = place.centerX - position.x;
        const deltaY = place.centerY - position.y;
        const bearing = normalize360((Math.atan2(deltaY, deltaX) * 180) / Math.PI);
        const relativeBearing = normalize180(bearing - heading);
        return {
          id: `place-${place.id}`,
          kind: "place" as const,
          name: place.name,
          color: place.color || "#7cf2a6",
          relativeBearing,
          anchorBearing: relativeBearing,
          distanceMeters: Math.hypot(deltaX, deltaY) / 100,
          edgeDirection: 0 as const,
        };
      })
      .filter((place) => Math.abs(place.relativeBearing) <= 86 && place.distanceMeters <= MAX_PLACE_DISTANCE_METERS)
      .sort((a, b) => a.distanceMeters - b.distanceMeters);
    const candidates = [...friendCandidates, ...placeCandidates];

    const lanes: CompassPlace[][] = Array.from({ length: PLACE_LANES }, () => []);
    const visible: CompassPlace[] = [];

    for (const candidate of candidates) {
      if (candidate.kind === "place" && visible.length >= MAX_VISIBLE_MARKERS) break;
      const halfSpanDegrees = estimateHalfSpanDegrees(candidate.name, candidate.distanceMeters, candidate.kind);
      const options = lanes
        .map((placesInLane, lane) => {
          const screenBearing = findLanePosition(candidate.anchorBearing, halfSpanDegrees, placesInLane);
          return screenBearing == null
            ? null
            : { lane, screenBearing, score: Math.abs(screenBearing - candidate.anchorBearing) + lane * 1.5 };
        })
        .filter((option): option is { lane: number; screenBearing: number; score: number } => option != null)
        .sort((a, b) => a.score - b.score);
      const best = options[0];
      if (!best) continue;

      const placed: CompassPlace = {
        ...candidate,
        screenBearing: best.screenBearing,
        halfSpanDegrees,
        lane: best.lane,
      };
      lanes[best.lane].push(placed);
      visible.push(placed);
    }

    return visible;
  }, [cachedPlaces, friends, heading, language, live?.position, live?.steamId]);

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
