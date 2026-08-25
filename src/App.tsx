import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isInteractLocked, lockInteract, unlockInteract } from "./interaction";
import { HeartHud, MainWindow, StatsWidget } from "./MainWindow";
import { RadarPanel } from "./RadarPanel";
import { TrollLayer } from "./TrollLayer";
import { ColorSwatch } from "./ColorPicker";
import { CompassWidget } from "./CompassWidget";
import { clampToViewport } from "./drag";
import { tr, translatePrimeQuest, type AppLanguage } from "./i18n";
import {
  DEFAULT_MAP_TRACKING,
  type MapTrackingKey,
  type MapTrackingSettings,
} from "./map-tracking";
import type {
  AuthInfo,
  LiveFrame,
  OverlaySettings,
  OverlayState,
  OverlayTheme,
  PlayerMe,
  ServerStatus,
} from "./preload";

const DEFAULT_THEME: OverlayTheme = {
  accent: "#7cf2a6",
  stat: { health: "#ff5a5a", stamina: "#35d6a4", food: "#ffb454", water: "#5ab6ff" },
};

const VN_HUD_THEME: OverlayTheme = {
  accent: "#ff7a3c",
  stat: { health: "#ff5148", stamina: "#ffb638", food: "#8bd44f", water: "#49b6ff" },
};

function applyTheme(t: OverlayTheme) {
  const r = document.documentElement.style;
  r.setProperty("--phos", t.accent);
  r.setProperty("--edge", t.accent + "2e");
  r.setProperty("--phos-dim", t.accent + "77");
}

function BootScreen({ onDone, serverName, overlayLabel }: { onDone: () => void; serverName: string; overlayLabel: string }) {
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
      <div className="bootMark" role="status" aria-live="polite" aria-label={`${serverName} đang khởi động`}>
        <img className="bootBackdropLogo" src="./icon.png" alt="" aria-hidden="true" />
        <div className="bootContent">
          <div className="bootEyebrow">THE ISLE VIETNAM HUD</div>
          <div className="bootLogo">
            {serverName}
          </div>
          <div className="bootSub">{overlayLabel ? `${overlayLabel.toUpperCase()} · ` : ""}v{__APP_VERSION__}</div>
          <div className="bootBar" aria-hidden="true">
            <div className="bootBarFill" />
          </div>
          <div className="bootCredit">Coded by RayJacobs</div>
        </div>
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
type WidgetLayout = Pos & { scale?: number };
type WidgetSize = { width: number; height: number };

const clampScale = (value: number, min = 0.5, max = 2.5) =>
  Math.max(min, Math.min(max, value));

function DraggablePanel({
  id,
  defaultPos,
  settings,
  resizeLabel,
  children,
}: {
  id: string;
  defaultPos: Pos;
  settings: OverlaySettings | null;
  resizeLabel: string;
  children: React.ReactNode;
}) {
  const saved = (settings?.layout as Record<string, WidgetLayout> | null | undefined)?.[id];
  const [pos, setPos] = useState<Pos>(saved && typeof saved.x === "number" ? saved : defaultPos);
  const [scale, setScale] = useState(
    typeof saved?.scale === "number" ? clampScale(saved.scale) : 1,
  );
  const [baseSize, setBaseSize] = useState<WidgetSize | null>(null);
  const off = useRef<Pos | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const hovered = useRef(false);
  const scaleRef = useRef(scale);

  const saveLayout = (next: WidgetLayout) => {
    void window.isleOverlay.getSettings().then((s) => {
      void window.isleOverlay.setSettings({
        layout: { ...(s.layout || {}), [id]: next },
      });
    });
  };

  useEffect(() => {
    if (saved && typeof saved.x === "number") setPos(saved);
    if (typeof saved?.scale === "number") {
      const nextScale = clampScale(saved.scale);
      scaleRef.current = nextScale;
      setScale(nextScale);
    }
  }, [saved?.x, saved?.y, saved?.scale]);

  useEffect(() => {
    scaleRef.current = scale;
  }, [scale]);

  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    const measure = () => {
      const width = content.offsetWidth;
      const height = content.offsetHeight;
      if (width > 0 && height > 0) {
        setBaseSize((current) =>
          current?.width === width && current.height === height ? current : { width, height },
        );
      }
    };
    const observer = new ResizeObserver(measure);
    observer.observe(content);
    measure();
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const element = panelRef.current;
    if (!element) return;
    const keepVisible = () => {
      const box = element.getBoundingClientRect();
      setPos((current) => {
        const next = clampToViewport(current, box.width, box.height);
        return next.x === current.x && next.y === current.y ? current : next;
      });
    };
    const observer = new ResizeObserver(keepVisible);
    observer.observe(element);
    window.addEventListener("resize", keepVisible);
    keepVisible();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", keepVisible);
    };
  }, []);

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
        const box = panelRef.current?.getBoundingClientRect();
        const np = clampToViewport(
          { x: p.x + dx, y: p.y + dy },
          box?.width ?? 0,
          box?.height ?? 0,
        );
        saveLayout({ ...np, scale: scaleRef.current });
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
      const box = panelRef.current?.getBoundingClientRect();
      setPos(clampToViewport(
        { x: ev.clientX - off.current.x, y: ev.clientY - off.current.y },
        box?.width ?? 0,
        box?.height ?? 0,
      ));
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      off.current = null;
      unlockInteract();
      setPos((p) => {
        saveLayout({ ...p, scale: scaleRef.current });
        return p;
      });
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  const onResizeDown = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!baseSize) return;
    e.preventDefault();
    e.stopPropagation();
    const start = { x: e.clientX, y: e.clientY, scale: scaleRef.current };
    lockInteract();
    const move = (ev: MouseEvent) => {
      const denominator = baseSize.width ** 2 + baseSize.height ** 2;
      const projected = denominator > 0
        ? ((ev.clientX - start.x) * baseSize.width + (ev.clientY - start.y) * baseSize.height) / denominator
        : 0;
      const viewportMax = Math.min(
        (window.innerWidth - pos.x) / baseSize.width,
        (window.innerHeight - pos.y) / baseSize.height,
        2.5,
      );
      const nextScale = Math.max(0.35, Math.min(clampScale(start.scale + projected), viewportMax));
      scaleRef.current = nextScale;
      setScale(nextScale);
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      unlockInteract();
      saveLayout({ ...pos, scale: scaleRef.current });
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  const scaledWidth = baseSize ? baseSize.width * scale : undefined;
  const scaledHeight = baseSize ? baseSize.height * scale : undefined;

  return (
    <div
      ref={panelRef}
      className="panel resizablePanel hudWidgetPanel interactive-region"
      style={{ left: pos.x, top: pos.y, width: scaledWidth, height: scaledHeight }}
      onMouseDown={onDown}
      onMouseEnter={() => (hovered.current = true)}
      onMouseLeave={() => (hovered.current = false)}
    >
      <div
        ref={contentRef}
        className="resizablePanelContent"
        style={{ transform: `scale(${scale})` }}
      >
        {children}
      </div>
      <button
        type="button"
        className="panelResizeHandle"
        aria-label={resizeLabel}
        title={resizeLabel}
        onMouseDown={onResizeDown}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M6 14 14 6M10 14l4-4M2 14 14 2" />
        </svg>
      </button>
    </div>
  );
}


function PrimePanel({ me, language }: { me: PlayerMe | null; language: AppLanguage }) {
  const p = me?.prime;
  const t = (text: string) => tr(language, text);
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
          <div className="muted">{t("No Prime data")}</div>
        ) : p.elder ? (
          <div className="ok">✔ {t("Prime Elder reached")}</div>
        ) : (
          <>
            <div className={p.eligible ? "ok" : "muted"}>
              {p.eligible
                ? `✔ ${t("Eligible for Prime Elder")}`
                : language === "vi"
                  ? `Cần ${p.required} điều kiện`
                  : `Need ${p.required} conditions`}
            </div>
            <ul className="primeList">
              {p.quests.map((q, i) => (
                <li key={i} className={q.done ? "q-done" : "q-open"}>
                  <span className="qbox">{q.done ? "▣" : "▢"}</span> {translatePrimeQuest(language, q.name)}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

function validPlayerCount(...values: Array<number | null | undefined>): number | null {
  const value = values.find((candidate) =>
    typeof candidate === "number" && Number.isFinite(candidate) && candidate >= 0,
  );
  return typeof value === "number" ? Math.floor(value) : null;
}

function formatServerDataAge(language: AppLanguage, lastUpdate?: number | null): string | null {
  if (typeof lastUpdate !== "number" || !Number.isFinite(lastUpdate) || lastUpdate <= 0) return null;
  const ageSeconds = Math.max(0, Math.floor(Date.now() / 1000 - lastUpdate));
  if (ageSeconds < 60) return language === "vi" ? "Dữ liệu vừa cập nhật" : "Data updated just now";
  const minutes = Math.floor(ageSeconds / 60);
  if (minutes < 60) return language === "vi" ? `Dữ liệu ${minutes} phút trước` : `Data from ${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return language === "vi" ? `Dữ liệu ${hours} giờ trước` : `Data from ${hours} hr ago`;
}

function ServerInfoWidget({
  me,
  status,
  language,
}: {
  me: PlayerMe;
  status: ServerStatus | null;
  language: AppLanguage;
}) {
  const t = (text: string) => tr(language, text);
  const playerCount = validPlayerCount(
    status?.playersOnline,
    me.playersOnline,
    me.playerCount,
    me.onlinePlayers,
  );
  const maxPlayers = validPlayerCount(status?.maxPlayers, me.maxPlayers);
  const hasMonitoringStatus = typeof status?.online === "boolean";
  const isOnline = hasMonitoringStatus ? status.online === true : me.online === true;
  const serverName = status?.name?.trim() || me.server || t("Unknown server");
  const statusText = hasMonitoringStatus
    ? t(isOnline ? "Server online" : "Server offline")
    : t(isOnline ? "Player online" : "Player offline");
  const dataAge = formatServerDataAge(language, status?.lastUpdate);
  const staleData =
    typeof status?.lastUpdate === "number" && Date.now() / 1000 - status.lastUpdate >= 120;

  return (
    <div
      className="serverInfoHud dragHandle"
      role="status"
      aria-live="polite"
      aria-label={`${t("Current server")}: ${serverName}. ${statusText}${playerCount !== null ? `, ${playerCount}/${maxPlayers ?? "?"} ${t("Players online")}` : ""}`}
    >
      <div className="serverInfoHeader">
        <svg className="serverInfoIcon" viewBox="0 0 24 24" aria-hidden="true">
          <rect x="4" y="3" width="16" height="7" rx="2" />
          <rect x="4" y="14" width="16" height="7" rx="2" />
          <path d="M8 6.5h.01M8 17.5h.01M12 6.5h5M12 17.5h5" />
        </svg>
        <span>{t("Current server")}</span>
      </div>
      <div className="serverInfoName" title={serverName}>{serverName}</div>
      <div className="serverInfoMeta">
        <span className={`serverInfoDot ${isOnline ? "online" : "offline"}`} aria-hidden="true" />
        <span>{statusText}</span>
        {playerCount !== null ? (
          <span className="serverInfoCount" title={t("Players online")}>
            {playerCount}{maxPlayers !== null ? `/${maxPlayers}` : ""}
          </span>
        ) : null}
      </div>
      {dataAge ? (
        <div className={`serverInfoFreshness ${staleData ? "stale" : ""}`}>
          GameMonitoring · {dataAge}
        </div>
      ) : null}
    </div>
  );
}

const PANELS: { key: string; label: string; soon?: boolean }[] = [
  { key: "server", label: "Server info" },
  { key: "compass", label: "Compass" },
  { key: "stats", label: "Stats" },
  { key: "prime", label: "PRIME" },
  { key: "heart", label: "HP Heart" },
  { key: "radar", label: "Radar" },
];

const TRACKING_OPTIONS: Array<{ key: MapTrackingKey; label: string; color: string }> = [
  { key: "sanctuaries", label: "Sanctuaries", color: "#79f2a6" },
  { key: "migration", label: "Migration zones", color: "#ffce54" },
  { key: "patrol", label: "Patrol zones", color: "#5ab6ff" },
  { key: "places", label: "Other places", color: "#b79cff" },
  { key: "friends", label: "Friends", color: "#7cf2a6" },
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
  const [mapTracking, setMapTracking] = useState<MapTrackingSettings>(
    settings?.mapTracking ?? DEFAULT_MAP_TRACKING,
  );
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
  const [language, setLanguage] = useState<AppLanguage>(settings?.language ?? "en");
  const [statsStyle, setStatsStyle] = useState<"bars" | "circles">(settings?.statsStyle ?? "bars");
  const [hudTransparent, setHudTransparent] = useState(settings?.hudTransparent ?? false);
  const t = (text: string) => tr(language, text);
  useEffect(() => {
    void window.isleOverlay.getSettings().then((s) => {
      setStreamerMode(Boolean(s.streamerMode));
      setCompatMode(Boolean(s.compatMode));
      setLanguage(s.language);
      setStatsStyle(s.statsStyle);
      setHudTransparent(Boolean(s.hudTransparent));
      setMapTracking(s.mapTracking ?? DEFAULT_MAP_TRACKING);
    });
  }, []);

  return (
    <div className="settingsBackdrop interactive-region" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="frame settingsFrame">
        <div className="frameBar">
          <span className="dot" />
          <span className="ttl">{t("Settings").toUpperCase()}</span>
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
                {t(c.label)}
              </button>
            ))}
          </div>
          <div className="settingsContent">
          {cat === "widgets" && (<>
          <div className="secLabel">{t("Detached widgets")}</div>
          <div className="hint">{t("Enable widgets, drag them anywhere, and resize them from the bottom-right corner.")}</div>
          <div className="featRow">
            {PANELS.filter((p) => p.key !== "server" || settings?.serverInfoEnabled).map((p) => (
              <button
                key={p.key}
                className={`chip ${panels[p.key] ? "on" : ""}`}
                onClick={() => onTogglePanel(p.key)}
              >
                {t(p.label).toUpperCase()}
              </button>
            ))}
          </div>

          </>)}
          {cat === "radar" && (<>
          <div className="secLabel">{t("Live radar")}</div>
          <div className="hint">{t("A floating minimap that follows you in-game. Drag it to move it.")}</div>
          <button className={`radarToggle ${radarOpen ? "on" : ""}`} onClick={toggleRadar}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 3v18M3 12h18" strokeWidth="1" opacity="0.5" />
              <circle cx="12" cy="12" r="2.4" fill="currentColor" stroke="none" />
            </svg>
            {t(radarOpen ? "Close radar" : "Open radar")}
          </button>

          <div className="hint" style={{ marginTop: 6 }}>{t("Size")} · {radarSize}px</div>
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

          <div className="hint" style={{ marginTop: 6 }}>{t("Range")}</div>
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

          <div className="secLabel">{t("Stats layout")}</div>
          <div className="featRow">
            {(["bars", "circles"] as const).map((style) => (
              <button
                key={style}
                className={`chip ${statsStyle === style ? "on" : ""}`}
                aria-pressed={statsStyle === style}
                onClick={() => {
                  setStatsStyle(style);
                  void window.isleOverlay.setSettings({ statsStyle: style });
                }}
              >
                {t(style === "bars" ? "Bars" : "Circles").toUpperCase()}
              </button>
            ))}
          </div>

          <div className="secLabel">{t("HUD background")}</div>
          <div className="hint">{t("Choose a solid panel or remove the background behind floating HUD widgets.")}</div>
          <div className="featRow">
            {([false, true] as const).map((transparent) => (
              <button
                key={String(transparent)}
                className={`chip ${hudTransparent === transparent ? "on" : ""}`}
                aria-pressed={hudTransparent === transparent}
                onClick={() => {
                  setHudTransparent(transparent);
                  void window.isleOverlay.setSettings({ hudTransparent: transparent });
                }}
              >
                {t(transparent ? "Transparent" : "Default").toUpperCase()}
              </button>
            ))}
          </div>

          <div className="hint" style={{ marginTop: 6 }}>{t("Shape")}</div>
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
                {t(shape === "circle" ? "Circle" : "Square").toUpperCase()}
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
              {t("Labels").toUpperCase()}
            </button>
          </div>
          <div className="hint" style={{ marginTop: 6 }}>{t("Shows names for places and markers on the minimap.")}</div>

          <div className="secLabel">{t("Tracked map items")}</div>
          <div className="hint">{t("These filters are shared by the radar and compass.")}</div>
          <div className="trackingGrid">
            <button
              type="button"
              className={`trackingChip ${Object.values(mapTracking).every(Boolean) ? "on" : ""}`}
              aria-pressed={Object.values(mapTracking).every(Boolean)}
              onClick={() => {
                const enabled = !Object.values(mapTracking).every(Boolean);
                const next = Object.fromEntries(
                  TRACKING_OPTIONS.map((option) => [option.key, enabled]),
                ) as MapTrackingSettings;
                setMapTracking(next);
                void window.isleOverlay.setSettings({ mapTracking: next });
              }}
            >
              <span className="trackingCheck" aria-hidden="true" />
              <span>{t("All items")}</span>
            </button>
            {TRACKING_OPTIONS.map((option) => (
              <button
                key={option.key}
                type="button"
                className={`trackingChip ${mapTracking[option.key] ? "on" : ""}`}
                aria-pressed={mapTracking[option.key]}
                style={{ ["--track-color" as string]: option.color }}
                onClick={() => {
                  const next = { ...mapTracking, [option.key]: !mapTracking[option.key] };
                  setMapTracking(next);
                  void window.isleOverlay.setSettings({ mapTracking: next });
                }}
              >
                <span className="trackingCheck" aria-hidden="true" />
                <span>{t(option.label)}</span>
              </button>
            ))}
          </div>

          </>)}
          {cat === "controls" && (<>
          <div className="secLabel">{t("Cursor")}</div>
          <div className="hint">{t("Press the key to show a mouse cursor and click the overlay.")}</div>
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
              {t("Toggle").toUpperCase()}
            </button>
            <button
              className={`chip ${cursorMode === "hold" ? "on" : ""}`}
              onClick={() => {
                setCursorMode("hold");
                void window.isleOverlay.setSettings({ cursorMode: "hold" });
              }}
            >
              {t("Hold").toUpperCase()}
            </button>
          </div>
          <div className="hint" style={{ marginTop: 6 }}>{t("Key")} · {cursorKey}</div>
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
              {recording ? t("Press key…").toUpperCase() : `+ ${t("Custom").toUpperCase()}`}
            </button>
          </div>

          <div className="secLabel">{t("Dashboard hotkey")}</div>
          <div className="hint">{t("Global shortcut: show or hide the dashboard while the game has focus.")}</div>
          <div className="hint" style={{ marginTop: 6 }}>{t("Key")} · {dashKey}</div>
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
              {recordingDash ? t("Press key…").toUpperCase() : `+ ${t("Custom").toUpperCase()}`}
            </button>
          </div>

          </>)}
          {cat === "streaming" && (<>
          <div className="secLabel">{t("OBS / streamer mode")}</div>
          <div className="hint">{t("Makes the overlay a normal capturable window for OBS Window Capture.")}</div>
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
            {t("Use Windows 10 (1903+) capture. If transparency fails, add a Chroma/Color Key or lower source opacity.")}
          </div>

          </>)}
          {cat === "appearance" && (<>
          <div className="secLabel">{t("Language")}</div>
          <div className="featRow">
            {(["en", "vi"] as const).map((nextLanguage) => (
              <button
                key={nextLanguage}
                className={`chip ${language === nextLanguage ? "on" : ""}`}
                aria-pressed={language === nextLanguage}
                onClick={() => {
                  setLanguage(nextLanguage);
                  void window.isleOverlay.setSettings({ language: nextLanguage, languageExplicit: true });
                }}
              >
                {tr(nextLanguage, nextLanguage === "en" ? "English" : "Vietnamese").toUpperCase()}
              </button>
            ))}
          </div>

          <div className="secLabel">{t("Theme")}</div>
          <div className="presetRow">
            <button className="tbtn ghost" onClick={() => onTheme(DEFAULT_THEME)}>{t("Default")}</button>
            <button className="tbtn ghost" onClick={() => onTheme(VN_HUD_THEME)}>TheIsleVNHud</button>
          </div>
          <ColorRow label={t("Accent")} value={theme.accent} onChange={(v) => onTheme({ ...theme, accent: v })} />

          <div className="secLabel">{t("Stat colors")}</div>
          <ColorRow label={t("Health")} value={theme.stat.health} onChange={(v) => setStat("health", v)} />
          <ColorRow label={t("Stamina")} value={theme.stat.stamina} onChange={(v) => setStat("stamina", v)} />
          <ColorRow label={t("Hunger")} value={theme.stat.food} onChange={(v) => setStat("food", v)} />
          <ColorRow label={t("Thirst")} value={theme.stat.water} onChange={(v) => setStat("water", v)} />

          <div className="secLabel">{t("Opacity")}</div>
          <input
            className="range"
            type="range"
            min={0.4}
            max={1}
            step={0.05}
            value={opacity}
            onChange={(e) => onOpacity(Number(e.target.value))}
          />

          <div className="secLabel">{t("Compatibility mode")}</div>
          <div className="hint">{t("Use this only when the overlay creates a black background because it has a small performance cost.")}</div>
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
            {t("Restart the overlay for compatibility mode changes to take effect.")}
          </div>

          </>)}
          {cat === "account" && (<>
          <div className="secLabel">{t("Account")}</div>
          <div className="menuFoot">
            {authed ? (
              <button className="tbtn ghost" onClick={onLogout}>
                {t("Logout")}
              </button>
            ) : null}
            <button className="tbtn ghost" onClick={onQuit}>
              {t("Quit overlay")}
            </button>
          </div>
          <div className="secLabel">{t("About")}</div>
          <div className="hint">{[settings?.serverName ?? "TheIsleVNHud", settings?.overlayLabel].filter(Boolean).join(" ")} · v{__APP_VERSION__}</div>
          <div className="hint">Coded by RayJacobs</div>
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

const LIVE_RENDER_INTERVAL_MS = 50;
const LIVE_STALE_MS = 4000;

function useLive(authed: boolean): LiveFrame | null {
  const [live, setLive] = useState<LiveFrame | null>(null);
  useEffect(() => {
    if (!authed) {
      setLive(null);
      return;
    }
    let pending: LiveFrame | null = null;
    let flushTimer: number | null = null;
    let staleTimer: number | null = null;
    const flush = () => {
      flushTimer = null;
      if (!pending) return;
      const next = pending;
      pending = null;
      setLive(next);
      if (staleTimer != null) window.clearTimeout(staleTimer);
      staleTimer = window.setTimeout(() => setLive(null), LIVE_STALE_MS);
    };
    const off = window.isleOverlay.onLive((d) => {
      pending = d;
      if (flushTimer == null) flushTimer = window.setTimeout(flush, LIVE_RENDER_INTERVAL_MS);
    });
    return () => {
      off();
      if (flushTimer != null) window.clearTimeout(flushTimer);
      if (staleTimer != null) window.clearTimeout(staleTimer);
    };
  }, [authed]);
  return live;
}

function useServerStatus(enabled: boolean): ServerStatus | null {
  const [status, setStatus] = useState<ServerStatus | null>(null);
  useEffect(() => {
    if (!enabled) {
      setStatus(null);
      return;
    }
    let alive = true;
    const tick = async () => {
      const next = await window.isleOverlay.getServerStatus();
      if (alive) setStatus(next);
    };
    void tick();
    const id = window.setInterval(tick, 30000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [enabled]);
  return status;
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
  const [panels, setPanels] = useState<Record<string, boolean>>({ heart: true, compass: true, server: true });
  const [theme, setThemeState] = useState<OverlayTheme>(DEFAULT_THEME);
  const [opacity, setOpacityState] = useState(1);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mainOpen, setMainOpen] = useState(false);
  const [ticketSummary, setTicketSummary] = useState({ unread: 0, urgent: false });
  const [focusSupportSignal, setFocusSupportSignal] = useState(0);
  const [blocked, setBlocked] = useState(false);
  const mounted = useRef(false);
  const language = settings?.language ?? "en";
  const t = (text: string) => tr(language, text);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

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
  const serverStatus = useServerStatus(
    auth.authed && panels.server !== false && settings?.serverInfoEnabled === true,
  );

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
      <BootScreen
        serverName={settings?.serverName ?? "TheIsleVNHud"}
        overlayLabel={settings?.overlayLabel ?? ""}
        onDone={() => setBooted(true)}
      />
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
          <div className="streamerBoxTitle">{t("Streaming")}</div>
          <div className="streamerBoxHint">
            {[settings?.serverName ?? "TheIsleVNHud", settings?.overlayLabel].filter(Boolean).join(" ")} · {t("Makes the overlay a normal capturable window for OBS Window Capture.")}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`overlay ${settings?.hudTransparent ? "hudTransparent" : ""} ${mainOpen ? "dashboardOpen" : ""}`}>
      <TrollLayer />
      {mainOpen ? (
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
      ) : null}

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

      {auth.authed && settings?.serverInfoEnabled && panels.server !== false && view ? (
        <DraggablePanel
          id="w_server"
          defaultPos={{ x: Math.max(12, window.innerWidth - 292), y: 72 }}
          settings={settings}
          resizeLabel={t("Resize HUD")}
        >
          <ServerInfoWidget me={view} status={serverStatus} language={language} />
        </DraggablePanel>
      ) : null}

      {auth.authed && panels.compass && isDino ? (
        <DraggablePanel
          id="w_compass"
          defaultPos={{ x: Math.max(0, window.innerWidth / 2 - 360), y: 18 }}
          settings={settings}
          resizeLabel={t("Resize HUD")}
        >
          <CompassWidget
            live={live}
            language={language}
            tracking={settings?.mapTracking ?? DEFAULT_MAP_TRACKING}
          />
        </DraggablePanel>
      ) : null}

      {auth.authed && panels.stats && isDino ? (
        <DraggablePanel id="w_stats" defaultPos={{ x: 18, y: 240 }} settings={settings} resizeLabel={t("Resize HUD")}>
          <StatsWidget
            me={view}
            theme={theme}
            styleMode={settings?.statsStyle ?? "bars"}
            language={language}
          />
        </DraggablePanel>
      ) : null}

      {auth.authed && panels.prime && isDino ? (
        <DraggablePanel id="w_prime" defaultPos={{ x: 18, y: 470 }} settings={settings} resizeLabel={t("Resize HUD")}>
          <PrimePanel me={view} language={language} />
        </DraggablePanel>
      ) : null}

      {auth.authed && panels.heart && isDino ? (
        <DraggablePanel
          id="w_heart"
          defaultPos={{
            x: Math.max(0, window.innerWidth - window.innerHeight * 0.2),
            y: Math.max(0, window.innerHeight - window.innerHeight * 0.3),
          }}
          settings={settings}
          resizeLabel={t("Resize HUD")}
        >
          <HeartHud me={view} />
        </DraggablePanel>
      ) : null}

      {auth.authed && panels.radar ? (
        <DraggablePanel id="w_radar" defaultPos={{ x: 18, y: 60 }} settings={settings} resizeLabel={t("Resize HUD")}>
          <RadarPanel
            live={live}
            base={(settings?.apiBaseUrl ?? "https://islepilot.eu").replace(/\/+$/, "")}
            rangeIdx={Math.max(0, Math.min(3, settings?.radarRange ?? 1))}
            showLabels={settings?.radarLabels ?? false}
            tracking={settings?.mapTracking ?? DEFAULT_MAP_TRACKING}
            shape={settings?.radarShape ?? "circle"}
            diameter={Math.max(140, Math.min(560, settings?.radarSize ?? 320))}
          />
        </DraggablePanel>
      ) : null}

      <button
        className="statusPill interactive-region"
        onClick={() => setMainOpen((v) => !v)}
        title={t(mainOpen ? "Hide dashboard" : "Show dashboard")}
        aria-pressed={mainOpen}
      >
        <span className={`sig ${state.gameDetected ? "on" : "off"}`} />
        <span className="statusText">
          {t("{key} to open dashboard").replace("{key}", settings?.dashKey ?? "F8")}
        </span>
      </button>
    </div>
  );
}

