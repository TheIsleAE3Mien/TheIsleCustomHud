export type CompassPlace = {
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

export type CachedCompassPlace = {
  id: string;
  name: string;
  color: string;
  centerX: number;
  centerY: number;
};

export type CompassWorkerFriend = {
  steamId: string;
  label?: string;
  x: number;
  y: number;
};

export type CompassWorkerInput = {
  requestId: number;
  places: CachedCompassPlace[];
  friends: CompassWorkerFriend[];
  selfSteamId?: string;
  language: "en" | "vi";
  position: { x: number; y: number };
  heading: number;
};

export type CompassWorkerResult = {
  requestId: number;
  ticks: { heading: number; relative: number; label: string }[];
  visibleMarkers: CompassPlace[];
};

const MAX_PLACE_DISTANCE_METERS = 1500;
const MAX_VISIBLE_MARKERS = 8;
const PLACE_LANES = 2;
const COMPASS_CONTENT_WIDTH_PX = 672;
const PLACE_COLLISION_GAP_DEGREES = 1.5;
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

export function computeCompassFrame(input: CompassWorkerInput): CompassWorkerResult {
  const { requestId, places, friends, selfSteamId, language, position, heading } = input;
  const ticks: CompassWorkerResult["ticks"] = [];
  const first = Math.ceil((heading - 90) / 15) * 15;
  for (let value = first; value <= heading + 90; value += 15) {
    const relative = normalize180(value - heading);
    const direction = cardinal(value);
    ticks.push({
      heading: normalize360(value),
      relative,
      label: direction ?? String(Math.round(normalize360(value))),
    });
  }

  const friendCandidates = friends
    .filter((friend) => friend.steamId !== selfSteamId && Number.isFinite(friend.x) && Number.isFinite(friend.y))
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

  const placeCandidates = places
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

  const lanes: CompassPlace[][] = Array.from({ length: PLACE_LANES }, () => []);
  const visibleMarkers: CompassPlace[] = [];

  for (const candidate of [...friendCandidates, ...placeCandidates]) {
    if (candidate.kind === "place" && visibleMarkers.length >= MAX_VISIBLE_MARKERS) break;
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
    visibleMarkers.push(placed);
  }

  return { requestId, ticks, visibleMarkers };
}
