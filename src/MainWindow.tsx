import { useEffect, useRef, useState, type ReactNode } from "react";
import { isInteractLocked, lockInteract, unlockInteract } from "./interaction";
import { DinoShopTab } from "./DinoShopTab";
import { GarageTab } from "./GarageTab";
import { LiveMapTab } from "./LiveMapTab";
import { SkinEditorTab } from "./SkinEditorTab";
import { SkinShopTab } from "./SkinShopTab";
import { MapEditorTab } from "./MapEditorTab";
import { AdminTab } from "./AdminTab";
import type { OverlaySettings, OverlayTheme, PlayerMe } from "./preload";

export type TabKey = "profile" | "livemap" | "skin" | "garage" | "mapedit" | "dinoshop" | "skinshop" | "admin";

const TABS: { key: TabKey; label: string; ready?: boolean }[] = [
  { key: "profile", label: "Dashboard", ready: true },
  { key: "livemap", label: "Live Map", ready: true },
  { key: "skin", label: "Skin Editor", ready: true },
  { key: "garage", label: "Garage", ready: true },
  { key: "dinoshop", label: "Dino Shop", ready: true },
  { key: "skinshop", label: "Skin Shop", ready: true },
  { key: "admin", label: "Support", ready: true },
  { key: "mapedit", label: "Map Editor", ready: true },
];

type Pos = { x: number; y: number };

const TAB_ICONS: Record<TabKey, ReactNode> = {
  profile: (
    <>
      <circle cx="12" cy="7" r="4" />
      <path d="M5.5 21a6.5 6.5 0 0 1 13 0" />
    </>
  ),
  livemap: (
    <>
      <path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3z" />
      <path d="M9 3v15" />
      <path d="M15 6v15" />
    </>
  ),
  skin: (
    <>
      <circle cx="13.5" cy="6.5" r="1.3" />
      <circle cx="17.5" cy="10.5" r="1.3" />
      <circle cx="8.5" cy="7.5" r="1.3" />
      <circle cx="6.5" cy="12.5" r="1.3" />
      <path d="M12 2a10 10 0 0 0 0 20c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.4-.3-.4-.5-.9-.5-1.4 0-1.1.9-2 2-2h2.4a5 5 0 0 0 5-5 8 8 0 0 0-8-8Z" />
    </>
  ),
  garage: (
    <>
      <path d="M3 21V8l9-5 9 5v13" />
      <path d="M3 21h18" />
      <path d="M9 21v-6h6v6" />
    </>
  ),
  mapedit: (
    <>
      <path d="M12 2 3 7l9 5 9-5-9-5Z" />
      <path d="m3 12 9 5 9-5" />
      <path d="m3 17 9 5 9-5" />
    </>
  ),
  dinoshop: (
    <>
      <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
      <path d="M3 6h18" />
      <path d="M16 10a4 4 0 0 1-8 0" />
    </>
  ),
  skinshop: (
    <>
      <path d="M20.4 6.5 16 4a2.2 2.2 0 0 1-4 0 2.2 2.2 0 0 1-4 0L3.6 6.5l2 3.6L8 9v11h8V9l2.4 1.1Z" />
    </>
  ),
  admin: (
    <>
      <path d="M12 2 4 5v6c0 4.4 3.1 8.1 8 9 4.9-.9 8-4.6 8-9V5l-8-3Z" />
      <path d="M9 11.5 11 13.5 15 9.5" />
    </>
  ),
};

const STAT_ICONS: Record<string, ReactNode> = {
  health: <path d="M12 20.5s-7-4.2-9.2-8.3C1.3 9 2.7 5.6 6 5.6c2 0 3.2 1.2 4 2.6.8-1.4 2-2.6 4-2.6 3.3 0 4.7 3.4 3.2 6.6C19 16.3 12 20.5 12 20.5Z" />,
  stamina: <path d="M13 2 4 13.5h6L9 22l9-11.5h-6L13 2Z" />,
  hunger: (
    <>
      <path d="M15.5 6.5a4 4 0 0 0-7 2.5c0 1.2-.7 1.8-1.5 2.6a3 3 0 1 0 4.2 4.2c.8-.8 1.4-1.5 2.6-1.5a4 4 0 0 0 1.7-7.8Z" />
    </>
  ),
  thirst: <path d="M12 3s6 6.4 6 10.5a6 6 0 0 1-12 0C6 9.4 12 3 12 3Z" />,
  growth: (
    <>
      <path d="M12 21v-9" />
      <path d="M12 12c0-2.8 2.2-5 5-5 0 2.8-2.2 5-5 5Z" />
      <path d="M12 14c0-2.2-1.8-4-4-4 0 2.2 1.8 4 4 4Z" />
    </>
  ),
};

function TabIcon({ name }: { name: TabKey }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="15"
      height="15"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {TAB_ICONS[name]}
    </svg>
  );
}

export function StatGlyph({ name }: { name: string }) {
  const fill = name === "health" || name === "thirst";
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill={fill ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={fill ? 0 : 1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {STAT_ICONS[name]}
    </svg>
  );
}

function VitalBar({
  icon,
  label,
  value,
  max,
  color,
  suffix = "%",
}: {
  icon: string;
  label: string;
  value?: number | null;
  max?: number | null;
  color: string;
  suffix?: string;
}) {
  const v = typeof value === "number" ? value : null;
  const m = typeof max === "number" && max > 0 ? max : null;
  const pct = v != null && m != null ? Math.max(0, Math.min(100, (v / m) * 100)) : null;
  const shown = pct != null ? Math.round(pct) : v != null ? Math.round(v) : null;
  return (
    <div className="vital" style={{ ["--c" as string]: color }}>
      <div className="vitalHead">
        <span className="vitalIcon">
          <StatGlyph name={icon} />
        </span>
        <span className="vitalName">{label}</span>
        <span className="vitalVal">{shown != null ? `${shown}${suffix}` : "—"}</span>
      </div>
      <div className="vitalTrack">
        <div className="vitalFill" style={{ width: pct != null ? `${pct}%` : "0%" }} />
      </div>
    </div>
  );
}

function NutBar({ label, value, color }: { label: string; value?: number | null; color: string }) {
  const v = typeof value === "number" ? value : null;
  const pct = v != null ? Math.max(4, Math.min(100, (v / 5000) * 100)) : null;
  return (
    <div className="vital" style={{ ["--c" as string]: color }}>
      <div className="vitalHead">
        <span className="vitalName">{label}</span>
        <span className="vitalVal mono">{v != null ? v.toFixed(1) : "—"}</span>
      </div>
      <div className="vitalTrack">
        <div className="vitalFill" style={{ width: pct != null ? `${pct}%` : "0%" }} />
      </div>
    </div>
  );
}

function MiniStat({
  icon,
  label,
  value,
  max,
  color,
  suffix = "%",
}: {
  icon: string;
  label: string;
  value?: number | null;
  max?: number | null;
  color: string;
  suffix?: string;
}) {
  const v = typeof value === "number" ? value : null;
  const m = typeof max === "number" && max > 0 ? max : null;
  const pct = v != null && m != null ? Math.max(0, Math.min(100, (v / m) * 100)) : null;
  const shown = pct != null ? Math.round(pct) : v != null ? Math.round(v) : null;
  return (
    <div className="miniStat" style={{ ["--c" as string]: color }}>
      <div className="hudTop">
        <span className="hudIcon">
          <StatGlyph name={icon} />
        </span>
        <span className="hudLabel">{label}</span>
        <span className="hudVal">{shown != null ? `${shown}${suffix}` : "—"}</span>
      </div>
      <div className="vitalTrack">
        <div className="vitalFill" style={{ width: pct != null ? `${pct}%` : "0%" }} />
      </div>
    </div>
  );
}

export function StatsWidget({ me, theme }: { me: PlayerMe | null; theme: OverlayTheme }) {
  return (
    <div className="hud statsWidget dragHandle">
      <div className="hudTitle">
        <span className="hudTitleName">{me?.hasData && me.species ? me.species : "Stats"}</span>
        {me?.growth != null ? (
          <span className="hudTitleBadge">{Math.round(me.growth * 100)}%</span>
        ) : null}
      </div>
      {me?.hasData ? (
        <>
          <MiniStat icon="health" label="Health" value={me.health} max={me.maxHealth} color={theme.stat.health} />
          <MiniStat icon="stamina" label="Stamina" value={me.stamina} max={me.maxStamina} color={theme.stat.stamina} />
          <MiniStat icon="hunger" label="Hunger" value={me.hunger} max={me.maxHunger} color={theme.stat.food} />
          <MiniStat icon="thirst" label="Thirst" value={me.thirst} max={me.maxThirst} color={theme.stat.water} />
          <MiniStat icon="growth" label="Growth" value={me.growth != null ? me.growth * 100 : null} max={100} color="#4ade80" />
        </>
      ) : (
        <div className="hudEmpty">no live dino</div>
      )}
    </div>
  );
}

const HEX_D = "M26 3 L74 3 L98 44 L74 85 L26 85 L2 44 Z";
const HEART_D =
  "M50 68 C 30 52 22 43 22 33 C 22 25 28 20 35 20 C 41 20 46 24 50 30 C 54 24 59 20 65 20 C 72 20 78 25 78 33 C 78 43 70 52 50 68 Z";
const HEART_TOP = 20;
const HEART_BOTTOM = 68;

export function HeartHud({ me }: { me: PlayerMe | null }) {
  const v = typeof me?.health === "number" ? me.health : null;
  const m = typeof me?.maxHealth === "number" && me.maxHealth > 0 ? me.maxHealth : null;
  const pct = v != null && m != null ? Math.max(0, Math.min(1, v / m)) : 0;
  const fillY = HEART_BOTTOM - pct * (HEART_BOTTOM - HEART_TOP);
  return (
    <div className="heartHud" title={`Health ${Math.round(pct * 100)}%`}>
      <svg viewBox="0 0 100 88" aria-hidden="true">
        <defs>
          <clipPath id="heartClip">
            <path d={HEART_D} />
          </clipPath>
        </defs>
        <path className="hexOuter" d={HEX_D} transform="rotate(30 50 44)" />
        <path className="heartBase" d={HEART_D} />
        <g clipPath="url(#heartClip)">
          <rect className="heartFill" x="0" y={fillY} width="100" height="88" />
        </g>
        <path className="heartLine" d={HEART_D} />
      </svg>
    </div>
  );
}

function dinoStage(me: PlayerMe): string {
  if (me.prime?.elder) return "Prime Elder";
  const g = me.growth ?? 0;
  if (g >= 0.99) return "Adult";
  if (g >= 0.5) return "Sub-Adult";
  if (g >= 0.25) return "Juvenile";
  return "Hatchling";
}

const GROWTH_COLOR = "#4ade80";

function DashboardTab({
  me,
  theme,
  onGoto,
  supportOn,
}: {
  me: PlayerMe | null;
  theme: OverlayTheme;
  onGoto: (t: TabKey) => void;
  supportOn: boolean;
}) {
  const supportBtn = supportOn ? (
    <button className="supportBtn interactive-region" onClick={() => onGoto("admin")}>
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" />
      </svg>
      Support
    </button>
  ) : null;
  if (!me?.hasData) {
    return (
      <div className="noData">
        <svg viewBox="0 0 24 24" width="42" height="42" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 2 21 7v10l-9 5-9-5V7l9-5Z" />
          <path d="M12 12 21 7M12 12v10M12 12 3 7" />
        </svg>
        <div className="noDataTtl">No live dino</div>
        <div className="noDataSub">Spawn in on a server running the IslePilot plugin to see your stats.</div>
        {supportBtn}
      </div>
    );
  }
  const p = me.prime;
  const primePct = p ? Math.max(0, Math.min(100, (p.done / Math.max(1, p.required)) * 100)) : 0;
  const initial = (me.species ?? "?").slice(0, 1).toUpperCase();

  return (
    <div className="dash">
      <div className="idCard">
        <div className="avatar">
          <span className="avatarInitial">{initial}</span>
        </div>
        <div className="idMeta">
          <div className="dinoLine">
            <span className="dinoName">{me.species ?? "Unknown"}</span>
            {me.female != null ? (
              <span className={`gender ${me.female ? "f" : "m"}`}>{me.female ? "♀" : "♂"}</span>
            ) : null}
          </div>
          <div className="idRow">
            <span className="idKey">Stage</span>
            <span className="idVal">{dinoStage(me)}</span>
          </div>
          <div className="idRow">
            <span className="idKey">Server</span>
            <span className="idVal">{me.server ?? "—"}</span>
          </div>
          <div className="idRow">
            <span className="idKey">SteamID</span>
            <span className="idVal mono">{me.steamId}</span>
          </div>
        </div>
      </div>

      {supportBtn}

      <div className="sectionHead">Vitals</div>
      <div className="vGrid">
        <VitalBar icon="health" label="Health" value={me.health} max={me.maxHealth} color={theme.stat.health} />
        <VitalBar icon="hunger" label="Hunger" value={me.hunger} max={me.maxHunger} color={theme.stat.food} />
        <VitalBar icon="thirst" label="Thirst" value={me.thirst} max={me.maxThirst} color={theme.stat.water} />
        <VitalBar icon="stamina" label="Stamina" value={me.stamina} max={me.maxStamina} color={theme.stat.stamina} />
        <VitalBar icon="growth" label="Growth" value={me.growth != null ? me.growth * 100 : null} max={100} color={GROWTH_COLOR} />
      </div>

      {me.nutrition ? (
        <>
          <div className="sectionHead">Nutrition</div>
          <div className="vGrid nut">
            <NutBar label="Carb" value={me.nutrition.carb} color="#e0a94b" />
            <NutBar label="Protein" value={me.nutrition.protein} color="#66c26a" />
            <NutBar label="Lipid" value={me.nutrition.lipid} color="#d7b35a" />
          </div>
        </>
      ) : null}

      {p ? (
        <>
          <div className="sectionHead">
            Prime Conditions
            <span className="sectionCount">
              {p.done}/{p.required}
            </span>
          </div>
          <div className="primeWrap">
            <div className="primeTrack">
              <div className="primeFill" style={{ width: `${primePct}%` }} />
            </div>
            {p.elder ? (
              <div className="primeElder">
                <CheckMark done /> Prime Elder reached
              </div>
            ) : (
              <ul className="condList">
                {p.quests.map((q, i) => (
                  <li key={i} className={q.done ? "condDone" : "condOpen"}>
                    <CheckMark done={q.done} />
                    <span>{q.name}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      ) : null}

      <div className="sectionHead">Add-ons</div>
      <div className="addons">
        <button className="addon" onClick={() => onGoto("livemap")}>
          <TabIcon name="livemap" /> Live Map
        </button>
        <button className="addon" onClick={() => onGoto("skin")}>
          <TabIcon name="skin" /> Skin Editor
        </button>
      </div>
    </div>
  );
}

function CheckMark({ done }: { done: boolean }) {
  return (
    <span className={`mark ${done ? "ok" : "no"}`} aria-hidden="true">
      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
        {done ? <path d="m5 12 5 5 9-10" /> : <path d="M6 6l12 12M18 6 6 18" />}
      </svg>
    </span>
  );
}

export function MainWindow({
  me,
  theme,
  settings,
  authed,
  ticketUnread,
  ticketUrgent,
  focusSupportSignal,
  onLogin,
  onSettings,
  onClose,
}: {
  me: PlayerMe | null;
  theme: OverlayTheme;
  settings: OverlaySettings | null;
  authed: boolean;
  ticketUnread: number;
  ticketUrgent: boolean;
  focusSupportSignal: number;
  onLogin: () => void;
  onSettings: () => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<TabKey>("profile");
  const [mapEditAdmin, setMapEditAdmin] = useState(false);
  const [adminModeOn, setAdminModeOn] = useState(false);
  const saved = (settings?.layout as Record<string, Pos> | null | undefined)?.["main"];

  useEffect(() => {
    if (!authed) {
      setMapEditAdmin(false);
      return;
    }
    let alive = true;
    const check = async () => {
      try {
        const r = (await window.isleOverlay.apiGet("/api/overlay/mapedit/access")) as
          | { admin?: boolean }
          | null;
        if (alive) setMapEditAdmin(r?.admin === true);
      } catch {
        if (alive) setMapEditAdmin(false);
      }
    };
    void check();
    const iv = setInterval(check, 10000);
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, [authed, me?.hasData]);

  useEffect(() => {
    if (!authed) {
      setAdminModeOn(false);
      return;
    }
    let alive = true;
    const check = async () => {
      try {
        const r = (await window.isleOverlay.apiGet("/api/overlay/admin/access")) as
          | { enabled?: boolean }
          | null;
        if (alive) setAdminModeOn(r?.enabled === true);
      } catch {
        if (alive) setAdminModeOn(false);
      }
    };
    void check();
    const iv = setInterval(check, 15000);
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, [authed, me?.hasData]);

  useEffect(() => {
    if (tab === "mapedit" && !mapEditAdmin) setTab("profile");
    if (tab === "admin" && !adminModeOn) setTab("profile");
  }, [tab, mapEditAdmin, adminModeOn]);

  useEffect(() => {
    if (focusSupportSignal > 0) setTab("admin");
  }, [focusSupportSignal]);
  const [pos, setPos] = useState<Pos>(saved && typeof saved.x === "number" ? saved : { x: 140, y: 70 });
  const off = useRef<Pos | null>(null);

  useEffect(() => {
    if (saved && typeof saved.x === "number") setPos(saved);
  }, [saved?.x, saved?.y]);

  const onDown = (e: React.MouseEvent) => {
    if (!(e.target as HTMLElement).closest(".dragHandle")) return;
    e.preventDefault();
    off.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
    lockInteract();
    const move = (ev: MouseEvent) => {
      if (!off.current) return;
      setPos({
        x: Math.max(0, Math.min(window.innerWidth - 160, ev.clientX - off.current.x)),
        y: Math.max(0, Math.min(window.innerHeight - 46, ev.clientY - off.current.y)),
      });
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      off.current = null;
      unlockInteract();
      setPos((cur) => {
        void window.isleOverlay.getSettings().then((s) => {
          void window.isleOverlay.setSettings({ layout: { ...(s.layout || {}), main: cur } });
        });
        return cur;
      });
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  const holdInteract = () => {
    if (!isInteractLocked()) void window.isleOverlay.setMouseIgnore(false);
  };

  const statusText = me?.hasData
    ? `${me.species ?? "Unknown"}${me.growth != null ? ` · ${Math.round(me.growth * 100)}%` : ""}`
    : authed
    ? "not in game"
    : "signed out";

  return (
    <div
      className="mainWin interactive-region"
      style={{ left: pos.x, top: pos.y }}
      onMouseDown={onDown}
      onMouseMove={holdInteract}
    >
      <div className="topbar dragHandle">
        <span className="brand">
          <svg className="brandMark" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path d="M12 2 21 7v10l-9 5-9-5V7l9-5Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
            <path d="M12 7 16 9.5v5L12 17l-4-2.5v-5L12 7Z" fill="currentColor" />
          </svg>
          <span className="brandName">{settings?.serverName ?? "TheBurntIsle"}</span>
          <span className="brandSep">/</span>
          <span className="brandCtx">{TABS.find((t) => t.key === tab)?.label ?? "Dashboard"}</span>
        </span>
        <span className="topStatus">
          <span className={`liveDot ${me?.hasData ? "on" : ""}`} />
          {statusText}
        </span>
        {ticketUnread > 0 ? (
          <button
            className={`envelopeBtn interactive-region ${ticketUrgent ? "urgent" : ""}`}
            title={`${ticketUnread} unread ticket ${ticketUnread === 1 ? "message" : "messages"}`}
            onClick={() => setTab("admin")}
          >
            ✉<span className="envelopeCount">{ticketUnread}</span>
          </button>
        ) : null}
        <span className="topVer">v{__APP_VERSION__}</span>
        <button className="iconBtn" onClick={onSettings} title="settings" aria-label="Settings">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
          </svg>
        </button>
        <button className="iconBtn danger" onClick={onClose} title="hide dashboard" aria-label="Hide dashboard">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M6 6 18 18M18 6 6 18" />
          </svg>
        </button>
      </div>

      {!authed ? (
        <div className="gate">
          <svg className="gateMark" viewBox="0 0 24 24" width="48" height="48" aria-hidden="true">
            <path d="M12 2 21 7v10l-9 5-9-5V7l9-5Z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
            <path d="M12 7 16 9.5v5L12 17l-4-2.5v-5L12 7Z" fill="currentColor" opacity="0.9" />
          </svg>
          <div className="gateTtl">Sign in to {settings?.serverName ?? "TheBurntIsle"}</div>
          <div className="gateSub">Log in with Steam to load your dino stats, garage, skins and the live map.</div>
          <button className="steamBtn" onClick={onLogin}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
              <path d="M12 2a10 10 0 0 0-9.9 8.7l5.3 2.2a2.8 2.8 0 0 1 1.6-.5h.1l2.4-3.4v-.1a3.7 3.7 0 1 1 3.7 3.7h-.1l-3.4 2.4v.1a2.8 2.8 0 0 1-5.5.8L2 16.6A10 10 0 1 0 12 2Zm-3.6 15.2-1.2-.5a2.1 2.1 0 0 0 3.9-1 2.1 2.1 0 0 0-2.8-2l1.3.5a1.6 1.6 0 1 1-1.2 3Zm8.8-6.7a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5Z" />
            </svg>
            Sign in with Steam
          </button>
          <div className="gateHint">Opens in your browser</div>
        </div>
      ) : (
        <>
          <div
            className="tabBar"
            onWheel={(e) => {
              if (e.deltaY !== 0) e.currentTarget.scrollLeft += e.deltaY;
            }}
          >
            {TABS.filter(
              (t) =>
                (t.key !== "mapedit" || mapEditAdmin) && (t.key !== "admin" || adminModeOn),
            ).map((t) => (
              <button
                key={t.key}
                className={`tab ${tab === t.key ? "active" : ""}`}
                onClick={() => setTab(t.key)}
              >
                <TabIcon name={t.key} />
                <span>{t.label}</span>
                {t.key === "admin" && ticketUnread > 0 ? (
                  <span className={`tabBadge ${ticketUrgent ? "urgent" : ""}`}>{ticketUnread}</span>
                ) : null}
                {t.ready ? null : <span className="tabSoon">soon</span>}
              </button>
            ))}
          </div>
          <div className="tabContent">
            {tab === "profile" ? (
              <DashboardTab me={me} theme={theme} onGoto={setTab} supportOn={adminModeOn} />
            ) : tab === "livemap" ? (
              <LiveMapTab authed={authed} onLogin={onLogin} />
            ) : tab === "skin" ? (
              <SkinEditorTab authed={authed} onLogin={onLogin} />
            ) : tab === "garage" ? (
              <GarageTab authed={authed} onLogin={onLogin} />
            ) : tab === "mapedit" && mapEditAdmin ? (
              <MapEditorTab authed={authed} onLogin={onLogin} />
            ) : tab === "admin" && adminModeOn ? (
              <AdminTab authed={authed} onLogin={onLogin} />
            ) : tab === "dinoshop" ? (
              <DinoShopTab authed={authed} onLogin={onLogin} />
            ) : (
              <SkinShopTab authed={authed} onLogin={onLogin} />
            )}
          </div>
        </>
      )}
    </div>
  );
}
