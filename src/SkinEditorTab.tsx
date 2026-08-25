import { useCallback, useEffect, useRef, useState } from "react";
import type React from "react";

import { ColorSwatch } from "./ColorPicker";

type Preset = { id: string; name: string; species: string; state: Record<string, number> };
type SkinResp = {
  skinLiveEnabled?: boolean;
  allowed?: boolean;
  reason?: string;
  error?: string;
  status?: number;
  presets?: Preset[];
};

function rgb01ToHex(r: number, g: number, b: number): string {
  const c = (n: number) => Math.round(Math.max(0, Math.min(1, n)) * 255).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

type Zone = { key: string; label: string; cfg: string };
const ZONES: Zone[] = [
  { key: "body", label: "Body", cfg: "skin_body" },
  { key: "flank", label: "Flank", cfg: "skin_flank" },
  { key: "underbelly", label: "Belly", cfg: "skin_underbelly" },
  { key: "markings", label: "Markings", cfg: "skin_markings" },
  { key: "maledisplay", label: "Display", cfg: "skin_maledisplay" },
  { key: "detail1", label: "Detail", cfg: "skin_detail1" },
  { key: "eyes", label: "Eyes", cfg: "skin_eyes" },
  { key: "teeth", label: "Teeth", cfg: "skin_teeth" },
  { key: "mouth", label: "Mouth", cfg: "skin_mouth" },
  { key: "claws", label: "Claws", cfg: "skin_claws" },
];

const DEFAULTS: Record<string, string> = {
  body: "#6f8d44",
  flank: "#7b6a42",
  underbelly: "#b2b08e",
  markings: "#364725",
  maledisplay: "#8a5a2b",
  detail1: "#71815d",
  eyes: "#ffd76b",
  teeth: "#e8e2d0",
  mouth: "#7a4a4a",
  claws: "#2b2b2b",
};

function nudgeBlack(hex: string): string {
  return hex.toLowerCase() === "#000000" ? "#000001" : hex;
}

function hexToRgb01(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.slice(0, 2), 16) / 255,
    g: parseInt(h.slice(2, 4), 16) / 255,
    b: parseInt(h.slice(4, 6), 16) / 255,
  };
}

export function SkinEditorTab({ authed, onLogin }: { authed: boolean; onLogin: () => void }) {
  const [resp, setResp] = useState<SkinResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [colors, setColors] = useState<Record<string, string>>({ ...DEFAULTS });
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const [presetName, setPresetName] = useState("");
  const [busy, setBusy] = useState(false);
  const colorsRef = useRef(colors);
  colorsRef.current = colors;
  const dirty = useRef<Set<string>>(new Set());
  const seeded = useRef(false);
  const sendTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    const r = await window.isleOverlay.apiGet<SkinResp>("/api/overlay/skin");
    setResp(r as SkinResp);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!authed) {
      setLoading(false);
      return;
    }
    refresh();
  }, [authed, refresh]);

  useEffect(() => {
    const off = window.isleOverlay.onLive((frame) => {
      if (seeded.current || !frame.skin) return;
      const next: Record<string, string> = { ...colorsRef.current };
      let any = false;
      for (const z of ZONES) {
        const r = frame.skin[`${z.cfg}_r`];
        if (typeof r === "number") {
          next[z.key] = rgb01ToHex(r, frame.skin[`${z.cfg}_g`] ?? 0, frame.skin[`${z.cfg}_b`] ?? 0);
          any = true;
        }
      }
      if (any) {
        seeded.current = true;
        setColors(next);
      }
    });
    return off;
  }, []);

  const flush = useCallback(() => {
    sendTimer.current = null;
    const state: Record<string, number> = {};
    for (const z of ZONES) {
      if (!dirty.current.has(z.key)) continue;
      const { r, g, b } = hexToRgb01(nudgeBlack(colorsRef.current[z.key] ?? "#808080"));
      state[`${z.cfg}_r`] = r;
      state[`${z.cfg}_g`] = g;
      state[`${z.cfg}_b`] = b;
    }
    if (Object.keys(state).length > 0) window.isleOverlay.sendLiveSkin(state);
  }, []);

  const onColor = useCallback(
    (key: string, hex: string) => {
      dirty.current.add(key);
      seeded.current = true;
      setColors((c) => ({ ...c, [key]: hex }));
      if (!sendTimer.current) sendTimer.current = setTimeout(flush, 80);
    },
    [flush],
  );

  const applyPreset = useCallback((p: Preset) => {
    const next: Record<string, string> = { ...colorsRef.current };
    for (const z of ZONES) {
      const r = p.state[`${z.cfg}_r`];
      if (typeof r === "number") next[z.key] = rgb01ToHex(r, p.state[`${z.cfg}_g`] ?? 0, p.state[`${z.cfg}_b`] ?? 0);
    }
    seeded.current = true;
    for (const z of ZONES) dirty.current.add(z.key);
    setColors(next);
    setLoadedId(p.id);
    setPresetName(p.name);
    const safe = { ...p.state };
    for (const z of ZONES) {
      if (safe[`${z.cfg}_r`] === 0 && safe[`${z.cfg}_g`] === 0 && safe[`${z.cfg}_b`] === 0) {
        safe[`${z.cfg}_b`] = 1 / 255;
      }
    }
    window.isleOverlay.sendLiveSkin(safe);
  }, []);

  const applyAllColors = useCallback((next: Record<string, string>) => {
    seeded.current = true;
    for (const z of ZONES) dirty.current.add(z.key);
    setColors(next);
    const state: Record<string, number> = {};
    for (const z of ZONES) {
      const { r, g, b } = hexToRgb01(nudgeBlack(next[z.key] ?? "#808080"));
      state[`${z.cfg}_r`] = r;
      state[`${z.cfg}_g`] = g;
      state[`${z.cfg}_b`] = b;
    }
    window.isleOverlay.sendLiveSkin(state);
  }, []);
  const resetDefaults = useCallback(() => applyAllColors({ ...DEFAULTS }), [applyAllColors]);
  const randomizeColors = useCallback(() => {
    const next: Record<string, string> = {};
    for (const z of ZONES) {
      const n = Math.floor(Math.random() * 0xffffff);
      next[z.key] = "#" + n.toString(16).padStart(6, "0");
    }
    applyAllColors(next);
  }, [applyAllColors]);

  function buildPalette(): Record<string, string> {
    const c = colorsRef.current;
    return {
      body: nudgeBlack(c.body), markings: nudgeBlack(c.markings), flank: nudgeBlack(c.flank), underbelly: nudgeBlack(c.underbelly),
      detail: nudgeBlack(c.detail1), eyes: nudgeBlack(c.eyes), display: nudgeBlack(c.maledisplay), teeth: nudgeBlack(c.teeth), mouth: nudgeBlack(c.mouth), claws: nudgeBlack(c.claws),
    };
  }
  async function savePreset() {
    setBusy(true);
    const r = await window.isleOverlay.apiPost<{ ok?: boolean; id?: string }>("/api/overlay/skin/presets", {
      action: "save",
      id: loadedId ?? undefined,
      name: presetName.trim() || "Custom skin",
      palette: buildPalette(),
    });
    setBusy(false);
    if (!r.error) {
      if (r.id) setLoadedId(r.id);
      await refresh();
    }
  }
  async function deletePreset(id: string) {
    setBusy(true);
    await window.isleOverlay.apiPost("/api/overlay/skin/presets", { action: "delete", id });
    setBusy(false);
    if (loadedId === id) {
      setLoadedId(null);
      setPresetName("");
    }
    await refresh();
  }

  useEffect(() => () => { if (sendTimer.current) clearTimeout(sendTimer.current); }, []);

  if (!authed) {
    return (
      <div className="noData">
        <div className="noDataTtl">Sign in first</div>
        <div className="noDataSub">Log in with Steam to recolor your dino.</div>
        <button className="steamBtn interactive-region" onClick={onLogin}>Sign in with Steam</button>
      </div>
    );
  }
  if (loading) return <div className="noData"><div className="noDataTtl">Loading…</div></div>;

  if (resp?.error || resp?.skinLiveEnabled === false || resp?.allowed === false) {
    const msg = resp?.error
      ? resp.status === 404
        ? "Join a server as a dino to recolor it."
        : resp.error
      : resp?.skinLiveEnabled === false
        ? "The skin editor is turned off on this server."
        : resp?.reason === "link"
          ? "Link your Discord account to unlock the editor."
          : "You don't have a role that unlocks the editor.";
    return (
      <div className="noData">
        <div className="noDataTtl">Skin editor</div>
        <div className="noDataSub">{msg}</div>
      </div>
    );
  }

  return (
    <div className="interactive-region" style={{ paddingTop: 14 }}>
      <div style={hdr}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={badge}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--phos)" strokeWidth="1.8" strokeLinecap="round">
              <circle cx="13.5" cy="6.5" r="2.5" />
              <circle cx="17.5" cy="12" r="2.5" />
              <circle cx="8.5" cy="7.5" r="2.5" />
              <circle cx="6.5" cy="12.5" r="2.5" />
              <path d="M12 22a10 10 0 1 1 8-4c-2 2.5-6 1-6-1 0-1.5 1-2 0-3" />
            </svg>
          </span>
          <div>
            <div style={{ fontFamily: "var(--mono)", fontSize: 13, fontWeight: 600, letterSpacing: "0.08em", color: "var(--text)" }}>SKIN EDITOR</div>
            <div style={{ fontSize: 11, color: "var(--faint)", marginTop: 2 }}>Changes apply live on your dino</div>
          </div>
        </div>
      </div>

      <div style={{ padding: "0 10px 14px" }}>
        <div style={{ fontSize: 11, color: "var(--faint)", fontFamily: "var(--mono)", letterSpacing: "0.06em", marginBottom: 7 }}>YOUR SKINS</div>
        {(resp?.presets?.length ?? 0) > 0 ? (
          <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4, marginBottom: 8 }}>
            {resp!.presets!.map((p) => {
              const dot = rgb01ToHex(p.state.skin_body_r ?? 0.5, p.state.skin_body_g ?? 0.5, p.state.skin_body_b ?? 0.5);
              return (
                <span key={p.id} className={`presetChip ${loadedId === p.id ? "active" : ""}`}>
                  <button className="presetLoad" onClick={() => applyPreset(p)} title={`${p.name} (${p.species})`}>
                    <span style={{ width: 13, height: 13, borderRadius: "50%", background: dot, border: "1px solid rgba(0,0,0,0.45)", flexShrink: 0 }} />
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 90 }}>{p.name}</span>
                  </button>
                  <button className="presetDel" disabled={busy} onClick={() => deletePreset(p.id)} title="Delete">✕</button>
                </span>
              );
            })}
          </div>
        ) : (
          <div style={{ fontSize: 11, color: "var(--faint)", marginBottom: 8 }}>No saved skins yet. Pick colors, then save.</div>
        )}
        <div style={{ display: "flex", gap: 6 }}>
          <input className="presetInput" value={presetName} onChange={(e) => setPresetName(e.target.value)} placeholder="Skin name" maxLength={40} />
          <button className="presetSave" disabled={busy} onClick={savePreset}>{loadedId ? "Update" : "Save"}</button>
          {loadedId ? (
            <button className="presetSave alt" disabled={busy} onClick={() => { setLoadedId(null); setPresetName(""); }}>New</button>
          ) : null}
        </div>
      </div>

      <div style={grid}>
        {ZONES.map((z) => (
          <ColorSwatch key={z.key} value={colors[z.key]} onChange={(hex) => onColor(z.key, hex)} label={z.label} />
        ))}
      </div>

      <div style={{ display: "flex", gap: 6, padding: "10px 10px 14px" }}>
        <button className="presetSave alt" style={{ flex: 1 }} onClick={resetDefaults}>
          Reset to default
        </button>
        <button className="presetSave" style={{ flex: 1 }} onClick={randomizeColors}>
          Randomize
        </button>
      </div>

      <style>{`.presetChip { display: inline-flex; align-items: center; border-radius: 999px; border: 1px solid var(--line); background: var(--track); flex-shrink: 0; overflow: hidden; }
.presetChip.active { border-color: var(--edge); background: rgba(124,242,166,0.1); }
.presetLoad { display: inline-flex; align-items: center; gap: 7px; padding: 6px 4px 6px 11px; background: transparent; border: none; color: var(--text); font-size: 12px; cursor: pointer; }
.presetLoad:hover { color: var(--phos); }
.presetDel { background: transparent; border: none; color: var(--faint); font-size: 11px; padding: 0 9px; cursor: pointer; align-self: stretch; }
.presetDel:hover { color: var(--danger); }
.presetInput { flex: 1; min-width: 0; padding: 6px 9px; border: 1px solid var(--line); border-radius: 8px; background: var(--track); color: var(--text); font-size: 12px; }
.presetInput::placeholder { color: var(--faint); }
.presetSave { padding: 6px 12px; border: 1px solid var(--edge); border-radius: 8px; background: rgba(124,242,166,0.12); color: var(--phos); font-size: 12px; font-weight: 600; cursor: pointer; white-space: nowrap; }
.presetSave.alt { border-color: var(--line); background: var(--track); color: var(--muted); }
.presetSave:disabled { opacity: .5; cursor: default; }`}</style>
    </div>
  );
}

const hdr: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "2px 10px 0", marginBottom: 14 };
const badge: React.CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: 9,
  display: "grid",
  placeItems: "center",
  background: "rgba(124,242,166,0.08)",
  border: "1px solid var(--edge)",
  flexShrink: 0,
};
const grid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, 1fr)",
  gap: "18px 14px",
  padding: "6px 12px 16px",
};
