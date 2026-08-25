import { useCallback, useEffect, useMemo, useState } from "react";
import type React from "react";

import { MapCanvas, type MapFocus, type MapPlayerShape, type MapZoneShape } from "./livemap/MapCanvas";
import type { MapCalibration } from "./livemap/calibration";
import { ISLE_FOOD_SPAWNS } from "./livemap/isle-food-spawns";
import type { LiveFrame } from "./preload";

type Category = { id: string; name: string; color: string };

type MapResp = {
  liveMapEnabled?: boolean;
  allowed?: boolean;
  reason?: string;
  calibration?: MapCalibration | null;
  pois?: MapZoneShape[];
  categories?: Category[];
  markers?: MapPlayerShape[];
  foodSpawnsEnabled?: boolean;
  error?: string;
  status?: number;
};

const UNCAT = "__uncat__";
const FOOD_COLORS = new Map(
  ISLE_FOOD_SPAWNS.map((f, i, a) => [f.type, `hsl(${Math.round((i * 360) / a.length)} 70% 55%)`]),
);

export function LiveMapTab({ authed, onLogin }: { authed: boolean; onLogin: () => void }) {
  const [data, setData] = useState<MapResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [base, setBase] = useState("https://islepilot.eu");
  const [live, setLive] = useState<LiveFrame | null>(null);
  const [showFood, setShowFood] = useState(false);
  const [hiddenCats, setHiddenCats] = useState<Set<string>>(new Set());
  const [placesOpen, setPlacesOpen] = useState(true);
  const [focus, setFocus] = useState<MapFocus | null>(null);

  useEffect(() => {
    window.isleOverlay.getSettings().then((s) => {
      if (s.apiBaseUrl) setBase(s.apiBaseUrl.replace(/\/+$/, ""));
    });
  }, []);

  const refresh = useCallback(async () => {
    const r = await window.isleOverlay.apiGet<MapResp>("/api/overlay/map");
    setData(r as MapResp);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!authed) {
      setLoading(false);
      return;
    }
    refresh();
    const t = setInterval(refresh, 15000);
    return () => clearInterval(t);
  }, [authed, refresh]);

  useEffect(() => {
    const off = window.isleOverlay.onLive(setLive);
    return off;
  }, []);

  const players = useMemo<MapPlayerShape[]>(() => {
    const server = data?.markers ?? [];
    if (live?.position) {
      const selfPath = server.find((m) => m.self)?.path;
      const self: MapPlayerShape = {
        steamId: live.steamId,
        label: "You",
        x: live.position.x,
        y: live.position.y,
        yaw: live.position.yaw,
        self: true,
        path: selfPath,
      };
      return [...server.filter((m) => !m.self), self];
    }
    return server;
  }, [data?.markers, live]);

  const layerBase = `${base}/maps/gateway-v0.21`;

  if (!authed) {
    return (
      <div className="noData">
        <div className="noDataTtl">Sign in first</div>
        <div className="noDataSub">Log in with Steam to open the live map.</div>
        <button className="steamBtn interactive-region" onClick={onLogin}>Sign in with Steam</button>
      </div>
    );
  }
  if (loading) {
    return <div className="noData"><div className="noDataTtl">Loading map…</div></div>;
  }
  if (data?.error) {
    return (
      <div className="noData">
        <div className="noDataTtl">Live map</div>
        <div className="noDataSub">{data.status === 404 ? "Join a server first to see the map." : data.error}</div>
      </div>
    );
  }
  if (data && data.liveMapEnabled === false) {
    return (
      <div className="noData">
        <div className="noDataTtl">Live map</div>
        <div className="noDataSub">The map is disabled on this server.</div>
      </div>
    );
  }
  if (data && data.allowed === false) {
    return (
      <div className="noData">
        <div className="noDataTtl">Live map</div>
        <div className="noDataSub">
          {data.reason === "link" ? "Link your Discord account to unlock the map." : "You don't have a role that unlocks the map."}
        </div>
      </div>
    );
  }

  const calibration = data?.calibration ?? null;
  const categories = data?.categories ?? [];
  const visiblePois = (data?.pois ?? []).filter((p) => !hiddenCats.has(p.categoryId ?? UNCAT));
  const food = showFood && data?.foodSpawnsEnabled
    ? ISLE_FOOD_SPAWNS.map((f) => ({ label: f.type, color: FOOD_COLORS.get(f.type) ?? "#f59e0b", points: f.points }))
    : [];

  const byCat = new Map<string, MapZoneShape[]>();
  for (const p of data?.pois ?? []) {
    const key = p.categoryId ?? UNCAT;
    (byCat.get(key) ?? byCat.set(key, []).get(key)!).push(p);
  }
  const groups = [
    ...categories.filter((c) => byCat.has(c.id)).map((c) => ({ key: c.id, name: c.name, color: c.color, items: byCat.get(c.id)! })),
    ...(byCat.has(UNCAT) ? [{ key: UNCAT, name: "Uncategorized", color: "#8b93a1", items: byCat.get(UNCAT)! }] : []),
  ];

  function focusOn(p: MapZoneShape) {
    if (!p.points.length) return;
    const cx = p.points.reduce((s, q) => s + q.x, 0) / p.points.length;
    const cy = p.points.reduce((s, q) => s + q.y, 0) / p.points.length;
    setFocus((f) => ({ x: cx, y: cy, nonce: (f?.nonce ?? 0) + 1 }));
  }
  function toggleCat(key: string) {
    setHiddenCats((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const placeCount = data?.pois?.length ?? 0;
  const friendCount = (data?.markers ?? []).filter((m) => !m.self).length;

  return (
    <div className="interactive-region" style={{ position: "relative", paddingTop: 14 }}>
      <div style={hdr}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <span style={mapBadge}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--phos)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 3 L3 6 v15 l6-3 6 3 6-3 V3 l-6 3-6-3Z" />
              <path d="M9 3 v15 M15 6 v15" />
            </svg>
          </span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: "var(--mono)", fontSize: 13, fontWeight: 600, letterSpacing: "0.08em", color: "var(--text)" }}>LIVE MAP</div>
            <div style={{ fontSize: 11, color: "var(--faint)", marginTop: 2 }}>
              {placeCount} places{friendCount ? ` · ${friendCount} online` : ""}
            </div>
          </div>
        </div>
        <span style={live?.position ? livePillOn : livePillOff}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: live?.position ? "var(--phos)" : "var(--faint)" }} />
          {live?.position ? "LIVE" : "offline"}
        </span>
      </div>

      {calibration ? null : (
        <div className="noDataSub" style={{ marginBottom: 8 }}>
          The map isn&apos;t calibrated yet. Positions show up once the operator calibrates it.
        </div>
      )}

      <div style={{ position: "relative" }}>
        <MapCanvas layerBase={layerBase} calibration={calibration} zones={visiblePois} players={players} food={food} focus={focus} />

        <div style={{ position: "absolute", left: 10, top: 10, width: 176 }}>
          {placesOpen ? (
            <div style={mapPanel}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 9px" }}>
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.4 }}>PLACES</span>
                <button className="lmGhost" onClick={() => setPlacesOpen(false)}>✕</button>
              </div>
              <div style={{ overflowY: "auto", maxHeight: 260, padding: "0 5px 6px" }}>
                {groups.length === 0 ? <div style={{ fontSize: 11, opacity: 0.6, padding: "2px 5px" }}>No places yet.</div> : null}
                {groups.map((g) => (
                  <div key={g.key} style={{ marginBottom: 5, borderRadius: 6, border: "1px solid rgba(255,255,255,0.07)" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 5, padding: "4px 6px" }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0 }}>
                        <span style={{ width: 8, height: 8, borderRadius: 2, background: g.color, flexShrink: 0 }} />
                        <span style={{ fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.name}</span>
                        <span style={{ fontSize: 10, opacity: 0.5 }}>{g.items.length}</span>
                      </span>
                      <button className="lmDot" onClick={() => toggleCat(g.key)}>{hiddenCats.has(g.key) ? "○" : "●"}</button>
                    </div>
                    {!hiddenCats.has(g.key) ? (
                      <div style={{ display: "flex", flexDirection: "column", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                        {g.items.map((m) => (
                          <button key={m.id} className="lmItem" onClick={() => focusOn(m)}>{m.name}</button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))}
                {data?.foodSpawnsEnabled ? (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 5, padding: "5px 6px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.07)" }}>
                    <span style={{ fontSize: 11 }}>Food spawns</span>
                    <button className="lmDot" onClick={() => setShowFood((v) => !v)}>{showFood ? "●" : "○"}</button>
                  </div>
                ) : null}
              </div>
            </div>
          ) : (
            <button className="lmChip" onClick={() => setPlacesOpen(true)}>Places</button>
          )}
        </div>
      </div>

      <style>{CSS}</style>
    </div>
  );
}

const hdr: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  marginBottom: 12,
  padding: "2px 10px 0",
};
const mapBadge: React.CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: 9,
  display: "grid",
  placeItems: "center",
  background: "rgba(124,242,166,0.08)",
  border: "1px solid var(--edge)",
  flexShrink: 0,
};
const livePillBase: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "4px 10px",
  borderRadius: 999,
  fontFamily: "var(--mono)",
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: 0.8,
  border: "1px solid",
};
const livePillOn: React.CSSProperties = { ...livePillBase, color: "var(--phos)", borderColor: "var(--edge)", background: "rgba(124,242,166,0.1)" };
const livePillOff: React.CSSProperties = { ...livePillBase, color: "var(--muted)", borderColor: "var(--line)", background: "var(--track)" };

const mapPanel: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  borderRadius: 8,
  border: "1px solid var(--line)",
  background: "rgba(10,15,12,0.9)",
  backdropFilter: "blur(6px)",
  overflow: "hidden",
};

const CSS = `
.lmGhost { background: transparent; border: none; color: var(--muted); font-size: 11px; width: 20px; height: 20px; border-radius: 5px; cursor: pointer; }
.lmGhost:hover { background: rgba(255,255,255,0.06); color: var(--text); }
.lmDot { min-width: 20px; height: 18px; border: 1px solid var(--line); background: var(--track); color: var(--muted); font-size: 11px; line-height: 1; border-radius: 5px; cursor: pointer; }
.lmDot:hover { border-color: var(--edge); color: var(--phos); }
.lmItem { text-align: left; background: transparent; border: none; color: var(--muted); font-family: var(--mono); font-size: 11px; padding: 3px 7px; cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lmItem:hover { background: rgba(124,242,166,0.06); color: var(--text); }
.lmChip { font-family: var(--mono); padding: 5px 12px; border-radius: 7px; border: 1px solid var(--line); background: rgba(10,15,12,0.9); color: var(--muted); font-size: 11px; letter-spacing: 0.05em; cursor: pointer; }
.lmChip:hover { border-color: var(--edge); color: var(--phos); }
.lmPlacesTtl { font-family: var(--mono); }
`;
