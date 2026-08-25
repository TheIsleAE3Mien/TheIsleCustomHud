import type { MapZoneShape } from "./livemap/MapCanvas";

export type MapTrackingKey = "sanctuaries" | "migration" | "patrol" | "places" | "friends";

export type MapTrackingSettings = Record<MapTrackingKey, boolean>;

export const DEFAULT_MAP_TRACKING: MapTrackingSettings = {
  sanctuaries: true,
  migration: true,
  patrol: true,
  places: true,
  friends: true,
};

function searchable(value: string): string {
  return value.normalize("NFD").replace(/\p{M}+/gu, "").toLowerCase();
}

export function trackingKeyForPlace(place: MapZoneShape, categoryName = ""): MapTrackingKey {
  const text = searchable([categoryName, place.categoryId, place.kind, place.name].filter(Boolean).join(" "));
  if (/sanctuar|bao ton/.test(text)) return "sanctuaries";
  if (/migration|di cu/.test(text)) return "migration";
  if (/patrol|tuan tra/.test(text)) return "patrol";
  return "places";
}

export function isTrackedPlace(
  place: MapZoneShape,
  tracking: MapTrackingSettings,
  categoryName = "",
): boolean {
  return tracking[trackingKeyForPlace(place, categoryName)] !== false;
}
