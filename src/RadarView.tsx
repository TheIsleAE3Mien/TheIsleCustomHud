import type React from "react";

export type RadarMarker = {
  id: string;
  u: number;
  v: number;
  label: string;
  color: string;
  kind: "place" | "friend";
  shape?: string;
  icon?: string | null;
};

export type RadarShape = "circle" | "square";

function Glyph({ kind, shape, color, r }: { kind: string; shape?: string; color: string; r: number }) {
  const stroke = "rgba(0,0,0,0.55)";
  if (kind === "friend") {
    return (
      <>
        <circle r={r} fill={color} stroke={stroke} strokeWidth={1.4} />
        <circle r={r * 0.4} fill="#070b09" />
      </>
    );
  }
  if (shape === "polygon" || shape === "diamond") {
    return <polygon points={`0,${-r} ${r},0 0,${r} ${-r},0`} fill={color} fillOpacity={0.9} stroke={stroke} strokeWidth={1.2} />;
  }
  if (shape === "triangle") {
    return <polygon points={`0,${-r} ${r},${r} ${-r},${r}`} fill={color} fillOpacity={0.9} stroke={stroke} strokeWidth={1.2} />;
  }
  if (shape === "square" || shape === "rectangle") {
    return <rect x={-r} y={-r} width={2 * r} height={2 * r} rx={1.5} fill={color} fillOpacity={0.9} stroke={stroke} strokeWidth={1.2} />;
  }
  return <circle r={r} fill={color} fillOpacity={0.92} stroke={stroke} strokeWidth={1.2} />;
}

export function RadarView({
  layerBase,
  diameter,
  selfU,
  selfV,
  headingDeg,
  rangeUV,
  rangeLabel,
  markers,
  showLabels,
  shape,
}: {
  layerBase: string;
  diameter: number;
  selfU: number | null;
  selfV: number | null;
  headingDeg: number | null;
  rangeUV: number;
  rangeLabel: string;
  markers: RadarMarker[];
  showLabels: boolean;
  shape: RadarShape;
}) {
  const D = diameter;
  const cx = D / 2;
  const cy = D / 2;
  const R = D / 2;

  if (selfU == null || selfV == null) {
    return (
      <div style={radarWrap(D, shape)}>
        <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", textAlign: "center", padding: 24 }}>
          <div>
            <div style={{ fontFamily: "var(--mono)", fontSize: 12, fontWeight: 600, letterSpacing: 1, color: "var(--muted)" }}>NO SIGNAL</div>
            <div style={{ marginTop: 4, fontSize: 11, color: "var(--faint)" }}>Join a server as a dino to acquire your position.</div>
          </div>
        </div>
        <RadarGrid D={D} shape={shape} />
      </div>
    );
  }

  const mapSize = D / (2 * rangeUV);
  const originX = cx - selfU * mapSize;
  const originY = cy - selfV * mapSize;

  const shown = markers
    .map((m) => {
      const x = originX + m.u * mapSize;
      const y = originY + m.v * mapSize;
      const dx = x - cx;
      const dy = y - cy;
      const d = Math.hypot(dx, dy);
      const visible = shape === "square"
        ? Math.abs(dx) <= R - 4 && Math.abs(dy) <= R - 4
        : d <= R - 4;
      return { m, x, y, d, visible };
    })
    .filter((p) => p.visible)
    .sort((a, b) => b.d - a.d);

  const nearestFew = new Set(
    [...shown].sort((a, b) => a.d - b.d).slice(0, 4).map((p) => p.m.id),
  );

  return (
    <div style={radarWrap(D, shape)}>
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: mapSize,
          height: mapSize,
          transform: `translate3d(${originX}px, ${originY}px, 0)`,
          willChange: "transform",
        }}
      >
        {["base", "water", "land"].map((l) => (
          <img
            key={l}
            src={`${layerBase}/${l}.webp`}
            alt=""
            draggable={false}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", userSelect: "none" }}
          />
        ))}
      </div>

      <div style={{ position: "absolute", inset: 0, background: radarShade(shape), pointerEvents: "none" }} />

      <svg width={D} height={D} style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        {shape === "circle"
          ? [0.33, 0.66, 1].map((f, i) => (
              <circle key={i} cx={cx} cy={cy} r={R * f - 1} fill="none" stroke="rgba(124,242,166,0.18)" strokeWidth={1} />
            ))
          : [0.33, 0.66, 1].map((f, i) => {
              const side = D * f - 2;
              return <rect key={i} x={(D - side) / 2} y={(D - side) / 2} width={side} height={side} rx={i === 2 ? 10 : 4} fill="none" stroke="rgba(124,242,166,0.18)" strokeWidth={1} />;
            })}
        <line x1={cx} y1={cy - R} x2={cx} y2={cy + R} stroke="rgba(124,242,166,0.07)" strokeWidth={1} />
        <line x1={cx - R} y1={cy} x2={cx + R} y2={cy} stroke="rgba(124,242,166,0.07)" strokeWidth={1} />

        {shown.map(({ m, x, y }) => {
          const r = m.kind === "friend" ? 5 : 4.5;
          const label = showLabels || nearestFew.has(m.id) ? m.label : null;
          return (
            <g key={m.id} transform={`translate(${x} ${y})`}>
              {m.icon ? (
                <image href={m.icon} x={-7} y={-7} width={14} height={14} preserveAspectRatio="xMidYMid meet" />
              ) : (
                <Glyph kind={m.kind} shape={m.shape} color={m.color} r={r} />
              )}
              {label ? (
                <text x={0} y={-r - 5} textAnchor="middle" fontSize={10} fill="#e7eaf0" style={{ paintOrder: "stroke", stroke: "#05070c", strokeWidth: 3, fontWeight: 600 }}>
                  {label}
                </text>
              ) : null}
            </g>
          );
        })}

        <g transform={`translate(${cx} ${cy}) rotate(${headingDeg ?? 0})`}>
          <circle r={9} fill="rgba(255,206,84,0.18)" />
          <polygon points="11,0 -6,-6.5 -2.5,0 -6,6.5" fill="#ffce54" stroke="#1a1205" strokeWidth={1.2} strokeLinejoin="round" />
        </g>
      </svg>

      <div style={compassStyle}>N</div>
      <div style={rangeStyle}>{rangeLabel}</div>
    </div>
  );
}

function RadarGrid({ D, shape }: { D: number; shape: RadarShape }) {
  const cx = D / 2;
  const R = D / 2;
  return (
    <svg width={D} height={D} style={{ position: "absolute", inset: 0, pointerEvents: "none", opacity: 0.5 }}>
      {shape === "circle"
        ? [0.33, 0.66, 1].map((f, i) => (
            <circle key={i} cx={cx} cy={cx} r={R * f - 1} fill="none" stroke="rgba(124,242,166,0.16)" strokeWidth={1} />
          ))
        : [0.33, 0.66, 1].map((f, i) => {
            const side = D * f - 2;
            return <rect key={i} x={(D - side) / 2} y={(D - side) / 2} width={side} height={side} rx={i === 2 ? 10 : 4} fill="none" stroke="rgba(124,242,166,0.16)" strokeWidth={1} />;
          })}
      <line x1={cx} y1={0} x2={cx} y2={D} stroke="rgba(124,242,166,0.06)" />
      <line x1={0} y1={cx} x2={D} y2={cx} stroke="rgba(124,242,166,0.06)" />
    </svg>
  );
}

function radarWrap(D: number, shape: RadarShape): React.CSSProperties {
  return {
    position: "relative",
    width: D,
    height: D,
    borderRadius: shape === "square" ? 12 : "50%",
    overflow: "hidden",
    background: "#070b09",
    border: "1px solid var(--line)",
    boxShadow: "inset 0 0 0 1px rgba(124,242,166,0.05)",
    flexShrink: 0,
  };
}

function radarShade(shape: RadarShape) {
  return shape === "square"
    ? "radial-gradient(circle at 50% 50%, rgba(6,10,8,0) 52%, rgba(6,10,8,0.48) 86%, rgba(6,10,8,0.88) 100%)"
    : "radial-gradient(circle at 50% 50%, rgba(6,10,8,0) 48%, rgba(6,10,8,0.72) 82%, rgba(6,10,8,0.96) 100%)";
}

const compassStyle: React.CSSProperties = {
  position: "absolute",
  top: 5,
  left: "50%",
  transform: "translateX(-50%)",
  fontFamily: "var(--mono)",
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: 1,
  color: "var(--muted)",
  pointerEvents: "none",
};

const rangeStyle: React.CSSProperties = {
  position: "absolute",
  bottom: 6,
  right: 10,
  fontFamily: "var(--mono)",
  fontSize: 10,
  color: "var(--muted)",
  pointerEvents: "none",
};
