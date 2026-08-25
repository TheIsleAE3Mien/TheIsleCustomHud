import { useEffect, useRef, useState } from "react";
import type React from "react";

import { worldToNormalized, type MapCalibration } from "./calibration";

export type MapPoint = { x: number; y: number };

export type MapZoneShape = {
  id: string;
  name: string;
  color: string;
  kind: string;
  shape?: string;
  size?: number;
  icon?: string | null;
  points: MapPoint[];
  enabled?: boolean;
  hideLabel?: boolean;
  categoryId?: string | null;
};

export type MapFocus = { x: number; y: number; nonce: number };

export type MapPlayerShape = {
  steamId: string;
  label: string;
  x: number;
  y: number;
  yaw?: number | null;
  path?: MapPoint[];
  self?: boolean;
};

export type MapFoodLayer = {
  label: string;
  color: string;
  points: { u: number; v: number }[];
};

function svg(cal: MapCalibration, p: MapPoint): { x: number; y: number } {
  const n = worldToNormalized(cal, p.x, p.y);
  return { x: n.u * 1000, y: n.v * 1000 };
}

export function MapCanvas({
  layerBase,
  calibration,
  zones,
  players,
  focus,
  food,
}: {
  layerBase: string;
  calibration: MapCalibration | null;
  zones: MapZoneShape[];
  players: MapPlayerShape[];
  focus?: MapFocus | null;
  food?: MapFoodLayer[];
}) {
  const layers = [`${layerBase}/base.webp`, `${layerBase}/water.webp`, `${layerBase}/land.webp`];
  const viewRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ scale: 1, tx: 0, ty: 0 });
  const viewLatest = useRef(view);
  viewLatest.current = view;
  const drag = useRef<{ x: number; y: number; tx: number; ty: number; moved: boolean } | null>(null);
  const resetView = () => setView({ scale: 1, tx: 0, ty: 0 });

  useEffect(() => {
    const el = viewRef.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const rect = el!.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const { scale, tx, ty } = viewLatest.current;
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      const ns = Math.min(25, Math.max(1, scale * factor));
      const wx = (cx - tx) / scale;
      const wy = (cy - ty) / scale;
      setView({ scale: ns, tx: cx - wx * ns, ty: cy - wy * ns });
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => {
    if (!focus || !calibration) return;
    const el = viewRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const n = worldToNormalized(calibration, focus.x, focus.y);
    const z = 6;
    setView({
      scale: z,
      tx: rect.width / 2 - n.u * rect.width * z,
      ty: rect.height / 2 - n.v * rect.height * z,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.nonce]);

  function onPointerDown(e: React.PointerEvent) {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty, moved: false };
  }
  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true;
    setView((v) => ({ ...v, tx: d.tx + dx, ty: d.ty + dy }));
  }
  function onPointerUp() {
    drag.current = null;
  }

  return (
    <div
      ref={viewRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      className="interactive-region"
      style={{
        position: "relative",
        aspectRatio: "1 / 1",
        width: "100%",
        overflow: "hidden",
        borderRadius: 10,
        border: "1px solid var(--line)",
        background: "#070b09",
        touchAction: "none",
        cursor: "grab",
      }}
    >
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={resetView}
        style={{
          position: "absolute",
          right: 8,
          top: 8,
          zIndex: 10,
          padding: "4px 10px",
          fontFamily: "var(--mono)",
          fontSize: 11,
          borderRadius: 6,
          border: "1px solid var(--line)",
          background: "rgba(10,15,12,0.9)",
          color: "var(--muted)",
          cursor: "pointer",
        }}
      >
        Reset
      </button>
      <div
        style={{
          position: "absolute",
          inset: 0,
          transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})`,
          transformOrigin: "0 0",
        }}
      >
        {layers.map((src) => (
          <img
            key={src}
            src={src}
            alt=""
            draggable={false}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              pointerEvents: "none",
              userSelect: "none",
            }}
          />
        ))}
        <svg
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
          viewBox="0 0 1000 1000"
          preserveAspectRatio="none"
        >
          {food && food.length ? <FoodDots food={food} scale={view.scale} /> : null}
          {calibration ? (
            <Shapes calibration={calibration} zones={zones} players={players} scale={view.scale} />
          ) : null}
        </svg>
      </div>
    </div>
  );
}

function FoodDots({ food, scale }: { food: MapFoodLayer[]; scale: number }) {
  const k = 1 / scale;
  const [hover, setHover] = useState<{ cx: number; cy: number; label: string; color: string } | null>(null);
  return (
    <g>
      {food.flatMap((grp, gi) =>
        grp.points.map((p, i) => {
          const cx = p.u * 1000;
          const cy = p.v * 1000;
          return (
            <g key={`${gi}-${i}`}>
              <circle cx={cx} cy={cy} r={3.4 * k} fill={grp.color} fillOpacity={0.9} stroke="rgba(0,0,0,0.65)" strokeWidth={0.8 * k} />
              <circle
                cx={cx}
                cy={cy}
                r={9 * k}
                fill="transparent"
                style={{ pointerEvents: "auto", cursor: "pointer" }}
                onMouseEnter={() => setHover({ cx, cy, label: grp.label, color: grp.color })}
                onMouseLeave={() => setHover(null)}
              />
            </g>
          );
        }),
      )}
      {hover ? <Pill cx={hover.cx} cy={hover.cy - 12 * k} label={hover.label} color={hover.color} k={k} /> : null}
    </g>
  );
}

function Pill({ cx, cy, label, color, k }: { cx: number; cy: number; label: string; color: string; k: number }) {
  const fontSize = 16 * k;
  const h = 23 * k;
  const padL = 18 * k;
  const padR = 12 * k;
  const w = label.length * fontSize * 0.56 + padL + padR;
  return (
    <g>
      <rect x={cx - w / 2} y={cy - h / 2} width={w} height={h} rx={h / 2} fill="rgba(17,20,27,0.85)" stroke="rgba(255,255,255,0.14)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
      <circle cx={cx - w / 2 + 10 * k} cy={cy} r={3.5 * k} fill={color} />
      <text x={cx - w / 2 + padL} y={cy} textAnchor="start" dominantBaseline="central" fontSize={fontSize} fill="rgba(255,255,255,0.9)" style={{ fontWeight: 600 }}>
        {label}
      </text>
    </g>
  );
}

function MarkerShape({ shape, cx, cy, r, color }: { shape: string; cx: number; cy: number; r: number; color: string }) {
  const common = {
    fill: color,
    fillOpacity: 0.55,
    stroke: "rgba(0,0,0,0.6)",
    strokeWidth: 1.5,
    vectorEffect: "non-scaling-stroke" as const,
  };
  if (shape === "square") return <rect x={cx - r} y={cy - r} width={2 * r} height={2 * r} {...common} />;
  if (shape === "rectangle") return <rect x={cx - r * 1.4} y={cy - r * 0.7} width={r * 2.8} height={r * 1.4} {...common} />;
  if (shape === "triangle") return <polygon points={`${cx},${cy - r} ${cx - r},${cy + r} ${cx + r},${cy + r}`} {...common} />;
  if (shape === "diamond") return <polygon points={`${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}`} {...common} />;
  return <circle cx={cx} cy={cy} r={r} {...common} />;
}

function Shapes({
  calibration,
  zones,
  players,
  scale,
}: {
  calibration: MapCalibration;
  zones: MapZoneShape[];
  players: MapPlayerShape[];
  scale: number;
}) {
  const k = 1 / scale;
  return (
    <>
      {zones.map((zone) => {
        const pts = zone.points.map((p) => svg(calibration, p));
        if (pts.length === 0) return null;
        const isPolygon = zone.shape === "polygon";
        const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
        const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
        const r = (zone.size ?? 0.02) * 1000;
        return (
          <g key={zone.id} opacity={zone.enabled === false ? 0.4 : 1}>
            {isPolygon ? (
              <polygon points={pts.map((p) => `${p.x},${p.y}`).join(" ")} fill={zone.color} fillOpacity={0.3} stroke={zone.color} strokeWidth={2} vectorEffect="non-scaling-stroke" />
            ) : null}
            {zone.icon ? (
              <image href={zone.icon} x={cx - r} y={cy - r} width={2 * r} height={2 * r} preserveAspectRatio="xMidYMid meet" />
            ) : !isPolygon ? (
              <MarkerShape shape={zone.shape ?? "circle"} cx={cx} cy={cy} r={r} color={zone.color} />
            ) : null}
            {zone.hideLabel ? null : <Pill cx={cx} cy={isPolygon && !zone.icon ? cy : cy - r - 10 * k} label={zone.name} color={zone.color} k={k} />}
          </g>
        );
      })}

      {players.map((p) => {
        const here = svg(calibration, p);
        const trail =
          p.path && p.path.length > 1
            ? p.path.map((q) => { const s = svg(calibration, q); return `${s.x},${s.y}`; }).join(" ")
            : null;
        let angleDeg: number | null = null;
        if (p.yaw != null) {
          const rad = (p.yaw * Math.PI) / 180;
          const ahead = svg(calibration, { x: p.x + 1000 * Math.cos(rad), y: p.y + 1000 * Math.sin(rad) });
          angleDeg = (Math.atan2(ahead.y - here.y, ahead.x - here.x) * 180) / Math.PI;
        }
        const fill = p.self ? "#fbbf24" : "#34d399";
        const a = (p.self ? 11 : 9) * k;
        return (
          <g key={p.steamId}>
            {trail ? <polyline points={trail} fill="none" stroke={p.self ? "#f59e0b" : "#38bdf8"} strokeWidth={2} strokeOpacity={0.7} vectorEffect="non-scaling-stroke" /> : null}
            {angleDeg != null ? (
              <polygon points={`${a},0 ${-a * 0.7},${-a * 0.7} ${-a * 0.7},${a * 0.7}`} transform={`translate(${here.x} ${here.y}) rotate(${angleDeg})`} fill={fill} stroke="#000" strokeWidth={1.5 * k} strokeLinejoin="round" />
            ) : (
              <circle cx={here.x} cy={here.y} r={(p.self ? 7 : 5) * k} fill={fill} stroke="#000" strokeWidth={1.5 * k} />
            )}
            <text x={here.x} y={here.y - 13 * k} textAnchor="middle" fontSize={13 * k} fill="#fff" style={{ paintOrder: "stroke", stroke: "#000", strokeWidth: 4 * k }}>
              {p.label}
            </text>
          </g>
        );
      })}
    </>
  );
}
