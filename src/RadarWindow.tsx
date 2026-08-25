import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type React from "react";

import type { MapPlayerShape, MapZoneShape } from "./livemap/MapCanvas";
import { worldToNormalized, type MapCalibration } from "./livemap/calibration";
import { RadarView, type RadarMarker } from "./RadarView";
import type { LiveFrame } from "./preload";

type MapResp = {
  liveMapEnabled?: boolean;
  allowed?: boolean;
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

export function RadarWindow() {
  const [data, setData] = useState<MapResp | null>(null);
  const [base, setBase] = useState("https://islepilot.eu");
  const [live, setLive] = useState<LiveFrame | null>(null);
  const [rangeIdx, setRangeIdx] = useState(1);
  const [showLabels, setShowLabels] = useState(false);
  const [size, setSize] = useState({ w: 320, h: 320 });
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const apply = (s: { apiBaseUrl?: string; radarRange?: number; radarLabels?: boolean }) => {
      if (s.apiBaseUrl) setBase(s.apiBaseUrl.replace(/\/+$/, ""));
      if (typeof s.radarRange === "number") setRangeIdx(Math.max(0, Math.min(3, s.radarRange)));
      if (typeof s.radarLabels === "boolean") setShowLabels(s.radarLabels);
    };
    window.isleOverlay.getSettings().then(apply);
    const off = window.isleOverlay.onSettingsChanged(apply);
    return off;
  }, []);

  const refresh = useCallback(async () => {
    const r = await window.isleOverlay.apiGet<MapResp>("/api/overlay/map");
    setData(r as MapResp);
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 15000);
    return () => clearInterval(t);
  }, [refresh]);

  useEffect(() => {
    const off = window.isleOverlay.onLive(setLive);
    return off;
  }, []);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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

  const layerBase = `${base}/maps/gateway-v0.21`;
  const diameter = Math.max(120, Math.min(size.w, size.h) - 2);

  const onDragStart = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const target: HTMLDivElement = e.currentTarget;
    const pid = e.pointerId;
    const mx = e.screenX;
    const my = e.screenY;
    void window.isleOverlay.radarGetBounds().then((baseBounds) => {
      if (!baseBounds) return;
      try { target.setPointerCapture(pid); } catch {}
      const onMove = (ev: PointerEvent) => {
        void window.isleOverlay.radarSetBounds({
          x: baseBounds.x + (ev.screenX - mx),
          y: baseBounds.y + (ev.screenY - my),
          width: baseBounds.width,
          height: baseBounds.height,
        });
      };
      const onUp = () => {
        try { target.releasePointerCapture(pid); } catch {}
        target.removeEventListener("pointermove", onMove);
        target.removeEventListener("pointerup", onUp);
      };
      target.addEventListener("pointermove", onMove);
      target.addEventListener("pointerup", onUp);
    });
  }, []);

  return (
    <div ref={rootRef} style={shell}>
      <div onPointerDown={onDragStart} style={{ cursor: "grab", pointerEvents: "auto" }}>
        <RadarView
          layerBase={layerBase}
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
    </div>
  );
}

const shell: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  display: "grid",
  placeItems: "center",
  background: "transparent",
};
