import { useCallback, useEffect, useMemo, useState } from "react";

import type { MapPlayerShape, MapZoneShape } from "./livemap/MapCanvas";
import { worldToNormalized, type MapCalibration } from "./livemap/calibration";
import { RadarView, type RadarMarker } from "./RadarView";
import type { LiveFrame } from "./preload";

type MapResp = {
  calibration?: MapCalibration | null;
  pois?: MapZoneShape[];
  markers?: MapPlayerShape[];
  error?: string;
  status?: number;
};

const RANGE_UV = [0.05, 0.1, 0.2, 0.4];
const RANGE_LABEL = ["CLOSE", "MID", "FAR", "MAX"];

function centroidUV(cal: MapCalibration, points: { x: number; y: number }[]): { u: number; v: number } | null {
  if (!points.length) return null;
  const cx = points.reduce((s, p) => s + p.x, 0) / points.length;
  const cy = points.reduce((s, p) => s + p.y, 0) / points.length;
  return worldToNormalized(cal, cx, cy);
}

export function RadarPanel({
  live,
  base,
  rangeIdx,
  showLabels,
  diameter,
}: {
  live: LiveFrame | null;
  base: string;
  rangeIdx: number;
  showLabels: boolean;
  diameter: number;
}) {
  const [data, setData] = useState<MapResp | null>(null);

  const refresh = useCallback(async () => {
    const r = await window.isleOverlay.apiGet<MapResp>("/api/overlay/map");
    setData(r as MapResp);
  }, []);

  useEffect(() => {
    void refresh();
    const t = setInterval(refresh, 15000);
    return () => clearInterval(t);
  }, [refresh]);

  const cal = data?.calibration ?? null;

  const selfUV = useMemo(() => {
    if (!cal || !live?.position) return null;
    return worldToNormalized(cal, live.position.x, live.position.y);
  }, [cal, live]);

  const headingDeg = useMemo(() => {
    if (!cal || !live?.position || live.position.yaw == null || !selfUV) return null;
    const rad = (live.position.yaw * Math.PI) / 180;
    const ahead = worldToNormalized(cal, live.position.x + 1000 * Math.cos(rad), live.position.y + 1000 * Math.sin(rad));
    return (Math.atan2(ahead.v - selfUV.v, ahead.u - selfUV.u) * 180) / Math.PI;
  }, [cal, live, selfUV]);

  const markers = useMemo<RadarMarker[]>(() => {
    if (!cal) return [];
    const out: RadarMarker[] = [];
    for (const p of data?.pois ?? []) {
      const uv = centroidUV(cal, p.points);
      if (uv) out.push({ id: p.id, u: uv.u, v: uv.v, label: p.name, color: p.color, kind: "place", shape: p.shape, icon: p.icon });
    }
    for (const m of data?.markers ?? []) {
      if (m.self) continue;
      const uv = worldToNormalized(cal, m.x, m.y);
      out.push({ id: m.steamId, u: uv.u, v: uv.v, label: m.label, color: "#7cf2a6", kind: "friend" });
    }
    return out;
  }, [cal, data]);

  return (
    <div className="radarPanel dragHandle">
      <RadarView
        layerBase={`${base}/maps/gateway-v0.21`}
        diameter={diameter}
        selfU={selfUV?.u ?? null}
        selfV={selfUV?.v ?? null}
        headingDeg={headingDeg}
        rangeUV={RANGE_UV[rangeIdx]}
        rangeLabel={RANGE_LABEL[rangeIdx]}
        markers={markers}
        showLabels={showLabels}
      />
    </div>
  );
}
