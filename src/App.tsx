import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isInteractLocked, lockInteract, unlockInteract } from "./interaction";
import { HeartHud, MainWindow, StatsWidget } from "./MainWindow";
import { RadarPanel } from "./RadarPanel";
import { TrollLayer } from "./TrollLayer";
import { ColorSwatch } from "./ColorPicker";
import type {
  AuthInfo,
  LiveFrame,
  OverlaySettings,
  OverlayState,
  OverlayTheme,
  PlayerMe,
} from "./preload";

const DEFAULT_THEME: OverlayTheme = {
  accent: "#7cf2a6",
  stat: { health: "#ff5a5a", stamina: "#35d6a4", food: "#ffb454", water: "#5ab6ff" },
};

const BURNT_ISLE_THEME: OverlayTheme = {
  accent: "#ff7a3c",
  stat: { health: "#ff5148", stamina: "#ffb638", food: "#8bd44f", water: "#49b6ff" },
};

function applyTheme(t: OverlayTheme) {
  const r = document.documentElement.style;
  r.setProperty("--phos", t.accent);
  r.setProperty("--edge", t.accent + "2e");
  r.setProperty("--phos-dim", t.accent + "77");
}

function BootScreen({ onDone, serverName }: { onDone: () => void; serverName: string }) {
  const [leaving, setLeaving] = useState(false);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  useEffect(() => {
    const t1 = window.setTimeout(() => setLeaving(true), 1000);
    const t2 = window.setTimeout(() => doneRef.current(), 1400);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, []);
  return (
    <div className={`boot ${leaving ? "leaving" : ""}`}>
      <div className="bootMark">
        <div className="bootLogo">
          {serverName}
        </div>
        <div className="bootSub">OVERLAY · v{__APP_VERSION__}</div>
        <div className="bootBar">
          <div className="bootBarFill" />
        </div>
        <div className="bootCredit">Coded by YannikAufDie1</div>
      </div>
    </div>
  );
}

let cursorLatched = false;

function useAutoInteract() {
  useEffect(() => {
    let ignore = true;
    const set = (next: boolean) => {
      if (next === ignore) return;
      ignore = next;
      void window.isleOverlay.setMouseIgnore(next);
    };
    const onMove = () => {
      set(!(cursorLatched || isInteractLocked()));
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, []);
}

type Pos = { x: number; y: number };
function DraggablePanel({
  id,
  defaultPos,
  settings,
  children,
}: {
  id: string;
  defaultPos: Pos;
  settings: OverlaySettings | null;
  children: React.ReactNode;
}) {
  const saved = (settings?.layout as Record<string, Pos> | null | undefined)?.[id];
  const [pos, setPos] = useState<Pos>(saved && typeof saved.x === "number" ? saved : defaultPos);
  const off = useRef<Pos | null>(null);
  const hovered = useRef(false);
  useEffect(() => {
    if (saved && typeof saved.x === "number") setPos(saved);
  }, [saved?.x, saved?.y]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!hovered.current) return;
      const step = e.shiftKey ? 10 : 1;
      let dx = 0;
      let dy = 0;
      if (e.key === "ArrowLeft") dx = -step;
      else if (e.key === "ArrowRight") dx = step;
      else if (e.key === "ArrowUp") dy = -step;
      else if (e.key === "ArrowDown") dy = step;
      else return;
      e.preventDefault();
      setPos((p) => {
        const np = { x: p.x + dx, y: p.y + dy };
        void window.isleOverlay.getSettings().then((s) => {
          void window.isleOverlay.setSettings({ layout: { ...(s.layout || {}), [id]: np } });
        });
        return np;
      });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [id]);

  const onDown = (e: React.MouseEvent) => {
    if (!(e.target as HTMLElement).closest(".dragHandle")) return;
    e.preventDefault();
    off.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
    lockInteract();
    const move = (ev: MouseEvent) => {
      if (!off.current) return;
      setPos({
        x: Math.max(0, Math.min(window.innerWidth - 60, ev.clientX - off.current.x)),
        y: Math.max(0, Math.min(window.innerHeight - 34, ev.clientY - off.current.y)),
      });
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      off.current = null;
      unlockInteract();
      setPos((p) => {
        void window.isleOverlay.getSettings().then((s) => {
          const layout = { ...(s.layout || {}), [id]: p };
          void window.isleOverlay.setSettings({ layout });
        });
        return p;
      });
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  return (
    <div
      className="panel interactive-region"
      style={{ left: pos.x, top: pos.y }}
      onMouseDown={onDown}
      onMouseEnter={() => (hovered.current = true)}
      onMouseLeave={() => (hovered.current = false)}
    >
      {children}
    </div>
  );
}


function PrimePanel({ me }: { me: PlayerMe | null }) {
  const p = me?.prime;
  return (
    <div className="frame primeFrame">
      <div className="frameBar dragHandle">
        <span className="dot" />
        <span className="ttl">PRIME</span>
        {p ? <span className="badge">{p.done}/{p.required}</span> : null}
        <span className="grip">⠿</span>
      </div>
      <div className="frameBody">
        {!p ? (
          <div className="muted">no prime data</div>
        ) : p.elder ? (
          <div className="ok">✔ Prime Elder</div>
        ) : (
          <>
            <div className={p.eligible ? "ok" : "muted"}>
              {p.eligible ? "✔ eligible for elder" : `need ${p.required} conditions`}
            </div>
            <ul className="primeList">
              {p.quests.map((q, i) => (
                <li key={i} className={q.done ? "q-done" : "q-open"}>
                  <span className="qbox">{q.done ? "▣" : "▢"}</span> {q.name}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

const PANELS: { key: string; label: string; soon?: boolean }[] = [
  { key: "stats", label: "STATS" },
  { key: "prime", label: "PRIME" },
  { key: "heart", label: "HP HEART" },
  { key: "radar", label: "RADAR" },
];

function ColorRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="colorRow">
      <span>{label}</span>
      <ColorSwatch value={value} onChange={onChange} size={22} />
      <code>{value}</code>
    </div>
  );
}

function SettingsPanel({
  settings,
  theme,
  panels,
  opacity,
  authed,
  onTheme,
  onOpacity,
  onTogglePanel,
  onLogout,
  onQuit,
  onClose,
}: {
  settings: OverlaySettings | null;
  theme: OverlayTheme;
  panels: Record<string, boolean>;
  opacity: number;
  authed: boolean;
  onTheme: (t: OverlayTheme) => void;
  onOpacity: (v: number) => void;
  onTogglePanel: (k: string) => void;
  onLogout: () => void;
  onQuit: () => void;
  onClose: () => void;
}) {
  const setStat = (k: keyof OverlayTheme["stat"], v: string) =>
    onTheme({ ...theme, stat: { ...theme.stat, [k]: v } });
  const radarOpen = Boolean(panels.radar);
  const toggleRadar = () => onTogglePanel("radar");
  const [radarSize, setRadarSize] = useState(settings?.radarSize ?? 320);
  const [radarRange, setRadarRange] = useState(settings?.radarRange ?? 1);
  const [radarLabels, setRadarLabels] = useState(settings?.radarLabels ?? false);
  const [radarShape, setRadarShape] = useState<"circle" | "square">(settings?.radarShape ?? "circle");
  const RANGE_LABELS = ["CLOSE", "MID", "FAR", "MAX"];
  const [cursorEnabled, setCursorEnabled] = useState(settings?.cursorEnabled ?? false);
  const [cursorKey, setCursorKey] = useState(settings?.cursorKey ?? "Insert");
  const [cursorMode, setCursorMode] = useState(settings?.cursorMode ?? "toggle");
  const [recording, setRecording] = useState(false);
  const [dashKey, setDashKey] = useState(settings?.dashKey ?? "F8");
  const [recordingDash, setRecordingDash] = useState(false);
  const CURSOR_KEYS = ["Insert", "Home", "End", "PageUp", "PageDown", "Delete", "CapsLock", "Backquote", "F6", "F7", "F8", "F9", "F10"];
  async function recordCursorKey() {
    setRecording(true);
    const k = await window.isleOverlay.recordCursorKey();
    setRecording(false);
    if (k) setCursorKey(k);
  }
  async function recordDashKey() {
    setRecordingDash(true);
    const k = await window.isleOverlay.recordDashKey();
    setRecordingDash(false);
    if (k) setDashKey(k);
  }
  const SETTINGS_CATS = [
    { key: "widgets", label: "Widgets" },
    { key: "radar", label: "Radar" },
    { key: "controls", label: "Controls" },
    { key: "streaming", label: "Streaming" },
    { key: "appearance", label: "Appearance" },
    { key: "account", label: "Account" },
  ];
  const [cat, setCat] = useState("widgets");
  const [streamerMode, setStreamerMode] = useState(settings?.streamerMode ?? false);
  const [compatMode, setCompatMode] = useState(settings?.compatMode ?? false);
  const [serverName, setServerName] = useState(settings?.serverName ?? "TheBurntIsle");
  async function commitServerName() {
    const merged = await window.isleOverlay.setSettings({ serverName });
    setServerName(merged.serverName);
  }
  useEffect(() => {
    void window.isleOverlay.getSettings().then((s) => {
      setStreamerMode(Boolean(s.streamerMode));
      setCompatMode(Boolean(s.compatMode));
    });
  }, []);

  return (
    <div className="settingsBackdrop interactive-region" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="frame settingsFrame">
        <div className="frameBar">
          <span className="dot" />
          <span className="ttl">SETTINGS</span>
          <button className="xbtn" onClick={onClose}>✕</button>
        </div>
        <div className="settingsLayout">
          <div className="settingsRail">
            {SETTINGS_CATS.map((c) => (
              <button
                key={c.key}
                className={`settingsRailBtn ${cat === c.key ? "on" : ""}`}
                onClick={() => setCat(c.key)}
              >
                {c.label}
              </button>
            ))}
          </div>
          <div className="settingsContent">
          {cat === "widgets" && (<>
          <div className="secLabel">detached widgets</div>
          <div className="hint">tear a widget out onto your screen, then drag it anywhere</div>
          <div className="featRow">
            {PANELS.map((p) => (
              <button
                key={p.key}
                className={`chip ${panels[p.key] ? "on" : ""}`}
                onClick={() => onTogglePanel(p.key)}
              >
                {p.label}
              </button>
            ))}
          </div>

          </>)}
          {cat === "radar" && (<>
          <div className="secLabel">live radar</div>
          <div className="hint">a floating minimap that follows you in-game. drag the minimap to move it</div>
          <button className={`radarToggle ${radarOpen ? "on" : ""}`} onClick={toggleRadar}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 3v18M3 12h18" strokeWidth="1" opacity="0.5" />
              <circle cx="12" cy="12" r="2.4" fill="currentColor" stroke="none" />
            </svg>
            {radarOpen ? "Close radar" : "Open radar"}
          </button>

          <div className="hint" style={{ marginTop: 6 }}>size · {radarSize}px</div>
          <input
            className="range"
            type="range"
            min={180}
            max={520}
            step={10}
            value={radarSize}
            onChange={(e) => {
              const v = Number(e.target.value);
              setRadarSize(v);
              void window.isleOverlay.setSettings({ radarSize: v });
            }}
          />

          <div className="hint" style={{ marginTop: 6 }}>range</div>
          <div className="featRow">
            {RANGE_LABELS.map((lbl, i) => (
              <button
                key={lbl}
                className={`chip ${radarRange === i ? "on" : ""}`}
                onClick={() => {
                  setRadarRange(i);
                  void window.isleOverlay.setSettings({ radarRange: i });
                }}
              >
                {lbl}
              </button>
            ))}
          </div>

          <div className="hint" style={{ marginTop: 6 }}>shape</div>
          <div className="featRow">
            {(["circle", "square"] as const).map((shape) => (
              <button
                key={shape}
                className={`chip ${radarShape === shape ? "on" : ""}`}
                aria-pressed={radarShape === shape}
                onClick={() => {
                  setRadarShape(shape);
                  void window.isleOverlay.setSettings({ radarShape: shape });
                }}
              >
                {shape.toUpperCase()}
              </button>
            ))}
          </div>

          <div className="featRow" style={{ marginTop: 6 }}>
            <button
              className={`chip ${radarLabels ? "on" : ""}`}
              onClick={() => {
                const v = !radarLabels;
                setRadarLabels(v);
                void window.isleOverlay.setSettings({ radarLabels: v });
              }}
            >
              LABELS
            </button>
          </div>

          </>)}
          {cat === "controls" && (<>
          <div className="secLabel">cursor</div>
          <div className="hint">press the key to show a mouse cursor and click the overlay</div>
          <div className="featRow">
            <button
              className={`chip ${cursorEnabled ? "on" : ""}`}
              onClick={() => {
                const v = !cursorEnabled;
                setCursorEnabled(v);
                void window.isleOverlay.setSettings({ cursorEnabled: v });
              }}
            >
              {cursorEnabled ? "ON" : "OFF"}
            </button>
            <button
              className={`chip ${cursorMode === "toggle" ? "on" : ""}`}
              onClick={() => {
                setCursorMode("toggle");
                void window.isleOverlay.setSettings({ cursorMode: "toggle" });
              }}
            >
              TOGGLE
            </button>
            <button
              className={`chip ${cursorMode === "hold" ? "on" : ""}`}
              onClick={() => {
                setCursorMode("hold");
                void window.isleOverlay.setSettings({ cursorMode: "hold" });
              }}
            >
              HOLD
            </button>
          </div>
          <div className="hint" style={{ marginTop: 6 }}>key · {cursorKey}</div>
          <div className="featRow" style={{ flexWrap: "wrap" }}>
            {CURSOR_KEYS.map((k) => (
              <button
                key={k}
                className={`chip ${cursorKey === k ? "on" : ""}`}
                onClick={() => {
                  setCursorKey(k);
                  void window.isleOverlay.setSettings({ cursorKey: k });
                }}
              >
                {k}
              </button>
            ))}
            <button className={`chip ${recording ? "on" : ""}`} onClick={recordCursorKey}>
              {recording ? "PRESS KEY…" : "+ CUSTOM"}
            </button>
          </div>

          <div className="secLabel">dashboard hotkey</div>
          <div className="hint">global shortcut: show/hide the dashboard and cursor even while the game has focus</div>
          <div className="hint" style={{ marginTop: 6 }}>key · {dashKey}</div>
          <div className="featRow" style={{ flexWrap: "wrap" }}>
            {CURSOR_KEYS.map((k) => (
              <button
                key={k}
                className={`chip ${dashKey === k ? "on" : ""}`}
                onClick={() => {
                  setDashKey(k);
                  void window.isleOverlay.setSettings({ dashKey: k });
                }}
              >
                {k}
              </button>
            ))}
            <button className={`chip ${recordingDash ? "on" : ""}`} onClick={recordDashKey}>
              {recordingDash ? "PRESS KEY…" : "+ CUSTOM"}
            </button>
          </div>

          </>)}
          {cat === "streaming" && (<>
          <div className="secLabel">OBS / streamer mode</div>
          <div className="hint">
            Makes this overlay a normal, capturable window so it shows up in OBS. Add a
            "Window Capture" source and pick "{serverName} Overlay".
          </div>
          <div className="featRow">
            <button
              className={`chip ${streamerMode ? "on" : ""}`}
              onClick={() => {
                const v = !streamerMode;
                setStreamerMode(v);
                void window.isleOverlay.setSettings({ streamerMode: v });
              }}
            >
              {streamerMode ? "ON" : "OFF"}
            </button>
          </div>
          <div className="hint" style={{ marginTop: 6 }}>
            Use the "Windows 10 (1903+)" capture method. If the background isn't transparent,
            add a Chroma/Color key or lower the source opacity.
          </div>

          </>)}
          {cat === "appearance" && (<>
          <div className="secLabel">server name</div>
          <label className="settingsField" htmlFor="server-name">
            <span className="hint">Displayed in the overlay title and branding</span>
            <input
              id="server-name"
              className="settingsTextInput"
              value={serverName}
              maxLength={48}
              spellCheck={false}
              onChange={(e) => setServerName(e.target.value)}
              onBlur={() => void commitServerName()}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
            />
          </label>

          <div className="secLabel">theme</div>
          <div className="presetRow">
            <button className="tbtn ghost" onClick={() => onTheme(DEFAULT_THEME)}>Default</button>
            <button className="tbtn ghost" onClick={() => onTheme(BURNT_ISLE_THEME)}>TheBurntIsle</button>
          </div>
          <ColorRow label="accent" value={theme.accent} onChange={(v) => onTheme({ ...theme, accent: v })} />

          <div className="secLabel">stat colors</div>
          <ColorRow label="health" value={theme.stat.health} onChange={(v) => setStat("health", v)} />
          <ColorRow label="stamina" value={theme.stat.stamina} onChange={(v) => setStat("stamina", v)} />
          <ColorRow label="food" value={theme.stat.food} onChange={(v) => setStat("food", v)} />
          <ColorRow label="water" value={theme.stat.water} onChange={(v) => setStat("water", v)} />

          <div className="secLabel">opacity</div>
          <input
            className="range"
            type="range"
            min={0.4}
            max={1}
            step={0.05}
            value={opacity}
            onChange={(e) => onOpacity(Number(e.target.value))}
          />

          <div className="secLabel">compatibility mode</div>
          <div className="hint">
            Turn this on if the overlay covers your screen in black and you can only see
            the game by dragging the opacity slider down. It switches Windows to a different
            way of compositing the overlay window, which restores transparency on graphics
            drivers that break it.
          </div>
          <div className="featRow">
            <button
              className={`chip ${compatMode ? "on" : ""}`}
              onClick={() => {
                const v = !compatMode;
                setCompatMode(v);
                void window.isleOverlay.setSettings({ compatMode: v });
              }}
            >
              {compatMode ? "ON" : "OFF"}
            </button>
          </div>
          <div className="hint" style={{ marginTop: 6 }}>
            Restart the overlay for this to take effect. Leave it off unless you need it,
            it costs some performance.
          </div>

          </>)}
          {cat === "account" && (<>
          <div className="secLabel">account</div>
          <div className="menuFoot">
            {authed ? (
              <button className="tbtn ghost" onClick={onLogout}>
                logout
              </button>
            ) : null}
            <button className="tbtn ghost" onClick={onQuit}>
              quit overlay
            </button>
          </div>
          <div className="secLabel">about</div>
          <div className="hint">{serverName} Overlay · v{__APP_VERSION__}</div>
          <div className="hint">Coded by YannikAufDie1</div>
          </>)}
          </div>
        </div>
      </div>
    </div>
  );
}

function useMe(authed: boolean): PlayerMe | null {
  const [me, setMe] = useState<PlayerMe | null>(null);
  useEffect(() => {
    if (!authed) {
      setMe(null);
      return;
    }
    let alive = true;
    const tick = async () => {
      const r = await window.isleOverlay.apiGet<PlayerMe>("/api/overlay/me");
      if (alive && !r.error) setMe(r as PlayerMe);
    };
    void tick();
    const id = window.setInterval(tick, 10000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [authed]);
  return me;
}

function useLive(authed: boolean): LiveFrame | null {
  const [live, setLive] = useState<{ d: LiveFrame; ts: number } | null>(null);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!authed) {
      setLive(null);
      return;
    }
    const off = window.isleOverlay.onLive((d) => setLive({ d, ts: Date.now() }));
    const iv = window.setInterval(() => tick((n) => n + 1), 1000);
    return () => {
      off();
      window.clearInterval(iv);
    };
  }, [authed]);
  if (!live || Date.now() - live.ts > 4000) return null;
  return live.d;
}

function mergeLive(me: PlayerMe | null, live: LiveFrame | null): PlayerMe | null {
  if (!live || !live.hasDino) return me;
  const base: PlayerMe = me ?? { hasData: true, steamId: live.steamId, name: "" };
  return {
    ...base,
    hasData: true,
    online: true,
    growth: live.growth ?? base.growth,
    health: live.health ?? base.health,
    maxHealth: live.maxHealth ?? base.maxHealth,
    hunger: live.hunger ?? base.hunger,
    maxHunger: live.maxHunger ?? base.maxHunger,
    thirst: live.thirst ?? base.thirst,
    maxThirst: live.maxThirst ?? base.maxThirst,
    stamina: live.stamina ?? base.stamina,
    maxStamina: live.maxStamina ?? base.maxStamina,
    nutrition: live.nutrition ?? base.nutrition,
  };
}

export function App() {
  const [booted, setBooted] = useState(false);
  const [auth, setAuth] = useState<AuthInfo>({ steamId: null, authed: false });
  const [state, setState] = useState<OverlayState>({ gameDetected: false, active: false });
  const [settings, setSettings] = useState<OverlaySettings | null>(null);
  const [panels, setPanels] = useState<Record<string, boolean>>({ heart: true });
  const [theme, setThemeState] = useState<OverlayTheme>(DEFAULT_THEME);
  const [opacity, setOpacityState] = useState(1);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mainOpen, setMainOpen] = useState(false);
  const [ticketSummary, setTicketSummary] = useState({ unread: 0, urgent: false });
  const [focusSupportSignal, setFocusSupportSignal] = useState(0);
  const [blocked, setBlocked] = useState(false);
  const mounted = useRef(false);

  useEffect(() => {
    const off = window.isleOverlay.onDash((on) => setMainOpen(on));
    return off;
  }, []);

  useEffect(() => {
    if (!mainOpen) setSettingsOpen(false);
  }, [mainOpen]);

  useEffect(() => {
    const off = window.isleOverlay.onBlocked((b) => setBlocked(b));
    return off;
  }, []);

  useEffect(() => {
    void window.isleOverlay.setDashOpen(mainOpen);
  }, [mainOpen]);

  useEffect(() => {
    const off = window.isleOverlay.onCursor((on) => {
      cursorLatched = on;
      if (on) void window.isleOverlay.setMouseIgnore(false);
    });
    return off;
  }, []);

  useAutoInteract();
  const me = useMe(auth.authed);
  const live = useLive(auth.authed);

  useEffect(() => {
    if (!auth.authed) {
      setTicketSummary({ unread: 0, urgent: false });
      return;
    }
    let alive = true;
    const tick = async () => {
      const r = (await window.isleOverlay.apiGet("/api/overlay/tickets/summary")) as {
        error?: string;
        unreadTickets?: number;
        hasUrgent?: boolean;
        staff?: { assignedUnread?: number };
      };
      if (!alive || r.error) return;
      const unread = (r.unreadTickets ?? 0) + (r.staff?.assignedUnread ?? 0);
      setTicketSummary({ unread, urgent: r.hasUrgent === true });
    };
    void tick();
    const iv = setInterval(tick, 20000);
    const off = window.isleOverlay.onTicket(() => void tick());
    return () => {
      alive = false;
      clearInterval(iv);
      off();
    };
  }, [auth.authed]);
  const view = useMemo(() => mergeLive(me, live), [me, live]);
  const dinoPresent = live ? live.hasDino : Boolean(me?.online && me?.species);
  const isDino = dinoPresent && !(typeof view?.health === "number" && view.health <= 0);

  useEffect(() => {
    if (mounted.current) return;
    mounted.current = true;
    void window.isleOverlay.getSettings().then((s) => {
      setSettings(s);
      if (s.panels) setPanels((prev) => ({ ...prev, ...s.panels }));
      if (s.theme) {
        setThemeState(s.theme);
        applyTheme(s.theme);
      }
      if (typeof s.opacity === "number") setOpacityState(s.opacity);
    });
    void window.isleOverlay.getAuth().then(setAuth);
    void window.isleOverlay.getState().then(setState);
    const offState = window.isleOverlay.onState(setState);
    const offAuth = window.isleOverlay.onAuthChanged(() => window.isleOverlay.getAuth().then(setAuth));
    const offSettings = window.isleOverlay.onSettingsChanged((s) => setSettings(s));
    return () => {
      offState();
      offAuth();
      offSettings();
    };
  }, []);

  const login = useCallback(() => void window.isleOverlay.steamLogin(), []);
  const logout = useCallback(() => void window.isleOverlay.logout(), []);
  const quit = useCallback(() => void window.isleOverlay.quit(), []);
  const togglePanel = useCallback((key: string) => {
    setPanels((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      void window.isleOverlay.setSettings({ panels: next });
      return next;
    });
  }, []);
  const setTheme = useCallback((t: OverlayTheme) => {
    setThemeState(t);
    applyTheme(t);
    void window.isleOverlay.setSettings({ theme: t });
  }, []);
  const setOpacity = useCallback((v: number) => {
    setOpacityState(v);
    void window.isleOverlay.setSettings({ opacity: v });
  }, []);

  if (!booted) {
    return (
      <BootScreen serverName={settings?.serverName ?? "TheBurntIsle"} onDone={() => setBooted(true)} />
    );
  }

  if (blocked)
    return (
      <div className="overlay" style={{ display: "grid", placeItems: "center" }}>
        <div
          style={{
            fontSize: 140,
            lineHeight: 1,
            userSelect: "none",
            filter: "drop-shadow(0 3px 14px rgba(0,0,0,0.7))",
          }}
        >
          ☹️
        </div>
      </div>
    );

  if ((settings?.streamerMode ?? false) && state.focused === false) {
    return (
      <div className="overlay">
        <div className="streamerBox">
          <div className="streamerBoxTitle">Streamer setup</div>
          <div className="streamerBoxHint">
            {settings?.serverName ?? "TheBurntIsle"} Overlay is capturable. Add a Window Capture in OBS and pick this
            window, then tab back into the game.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="overlay">
      <TrollLayer />
      <div style={{ display: mainOpen ? "contents" : "none" }}>
        <MainWindow
          me={view}
          theme={theme}
          settings={settings}
          authed={auth.authed}
          ticketUnread={ticketSummary.unread}
          ticketUrgent={ticketSummary.urgent}
          focusSupportSignal={focusSupportSignal}
          onLogin={login}
          onSettings={() => setSettingsOpen((v) => !v)}
          onClose={() => setMainOpen(false)}
        />
      </div>

      {auth.authed && !mainOpen && ticketSummary.unread > 0 ? (
        <button
          className={`envelopeFloat interactive-region ${ticketSummary.urgent ? "urgent" : ""}`}
          title="Unread ticket messages"
          onClick={() => {
            setMainOpen(true);
            setFocusSupportSignal((v) => v + 1);
          }}
        >
          ✉<span className="envelopeCount">{ticketSummary.unread}</span>
        </button>
      ) : null}

      {settingsOpen ? (
        <SettingsPanel
          settings={settings}
          theme={theme}
          panels={panels}
          opacity={opacity}
          authed={auth.authed}
          onTheme={setTheme}
          onOpacity={setOpacity}
          onTogglePanel={togglePanel}
          onLogout={logout}
          onQuit={quit}
          onClose={() => setSettingsOpen(false)}
        />
      ) : null}

      {auth.authed && panels.stats && isDino ? (
        <DraggablePanel id="w_stats" defaultPos={{ x: 18, y: 240 }} settings={settings}>
          <StatsWidget me={view} theme={theme} />
        </DraggablePanel>
      ) : null}

      {auth.authed && panels.prime && isDino ? (
        <DraggablePanel id="w_prime" defaultPos={{ x: 18, y: 470 }} settings={settings}>
          <PrimePanel me={view} />
        </DraggablePanel>
      ) : null}

      {auth.authed && panels.heart && isDino ? <HeartHud me={view} /> : null}

      {auth.authed && panels.radar ? (
        <DraggablePanel id="w_radar" defaultPos={{ x: 18, y: 60 }} settings={settings}>
          <RadarPanel
            live={live}
            base={(settings?.apiBaseUrl ?? "https://islepilot.eu").replace(/\/+$/, "")}
            rangeIdx={Math.max(0, Math.min(3, settings?.radarRange ?? 1))}
            showLabels={settings?.radarLabels ?? false}
            shape={settings?.radarShape ?? "circle"}
            diameter={Math.max(140, Math.min(560, settings?.radarSize ?? 320))}
          />
        </DraggablePanel>
      ) : null}

      <button
        className="statusPill interactive-region"
        onClick={() => setMainOpen((v) => !v)}
        title={mainOpen ? "hide dashboard" : "show dashboard"}
      >
        <span className={`sig ${state.gameDetected ? "on" : "off"}`} />
        {mainOpen ? (settings?.serverName ?? "TheBurntIsle") : "Dashboard"}
      </button>
    </div>
  );
}

