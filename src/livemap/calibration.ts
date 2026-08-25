export type MapAnchor = {
  worldX: number;
  worldY: number;
  u: number;
  v: number;
};

export type MapCalibration = {
  a: MapAnchor;
  b: MapAnchor;
};

function isAnchor(v: unknown): v is MapAnchor {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.worldX === "number" &&
    typeof o.worldY === "number" &&
    typeof o.u === "number" &&
    typeof o.v === "number"
  );
}

export function parseCalibration(json: unknown): MapCalibration | null {
  if (!json || typeof json !== "object") return null;
  const o = json as Record<string, unknown>;
  if (!isAnchor(o.a) || !isAnchor(o.b)) return null;
  const cal = { a: o.a, b: o.b };
  if (cal.a.worldX === cal.b.worldX || cal.a.worldY === cal.b.worldY) return null;
  return cal;
}

function lerpInv(value: number, from: number, to: number): number {
  return (value - from) / (to - from);
}

export function worldToNormalized(
  cal: MapCalibration,
  worldX: number,
  worldY: number,
): { u: number; v: number } {
  const tx = lerpInv(worldX, cal.a.worldX, cal.b.worldX);
  const ty = lerpInv(worldY, cal.a.worldY, cal.b.worldY);
  return {
    u: cal.a.u + tx * (cal.b.u - cal.a.u),
    v: cal.a.v + ty * (cal.b.v - cal.a.v),
  };
}
