import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { tr, type AppLanguage } from "./i18n";
import type { PlayerMe, UpdaterState } from "./preload";

type AlertTone = "warning" | "critical" | "info" | "success";
type VitalKey = "health" | "hunger" | "thirst" | "stamina";
type AlertLevel = 0 | 1 | 2;

type HudAlert = {
  id: string;
  key: VitalKey;
  tone: AlertTone;
  title: string;
  message: string;
  percent: number;
};

type VitalRule = {
  key: VitalKey;
  value?: number | null;
  max?: number | null;
  warningBelow: number;
  criticalBelow: number;
  warningTitle: string;
  warningMessage: string;
  criticalTitle: string;
  criticalMessage: string;
};

const ALERT_DURATION_MS = 6500;
const CRITICAL_REPEAT_MS = 2 * 60 * 1000;

function toPercent(value?: number | null, max?: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (typeof max === "number" && Number.isFinite(max) && max > 0) {
    return Math.max(0, Math.min(100, (value / max) * 100));
  }
  if (value >= 0 && value <= 100) return value;
  return null;
}

function AlertIcon({ tone }: { tone: AlertTone }) {
  if (tone === "success") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3 21 7.5v9L12 21l-9-4.5v-9L12 3Z" />
        <path d="m8 12 2.5 2.5L16.5 9" />
      </svg>
    );
  }
  if (tone === "info") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 10v6M12 7h.01" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3 22 20H2L12 3Z" />
      <path d="M12 9v5M12 17h.01" />
    </svg>
  );
}

function AlertCard({
  tone,
  title,
  message,
  trailing,
  progress,
}: {
  tone: AlertTone;
  title: string;
  message: string;
  trailing?: ReactNode;
  progress?: number | null;
}) {
  return (
    <div className={`hudAlert ${tone}`} role="status">
      <span className="hudAlertIcon"><AlertIcon tone={tone} /></span>
      <span className="hudAlertCopy">
        <span className="hudAlertTitle">{title}</span>
        <span className="hudAlertMessage">{message}</span>
      </span>
      {trailing != null ? <span className="hudAlertValue">{trailing}</span> : null}
      {typeof progress === "number" ? (
        <span className="hudAlertProgress" aria-hidden="true">
          <span style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
        </span>
      ) : null}
    </div>
  );
}

function updaterAlert(updater: UpdaterState, language: AppLanguage) {
  const t = (text: string) => tr(language, text);
  if (updater.state === "available") {
    return {
      tone: "info" as const,
      title: t("Update available"),
      message: t("The new version is downloading automatically."),
      trailing: updater.version ? `v${updater.version}` : undefined,
      progress: null,
    };
  }
  if (updater.state === "downloading") {
    const percent = Math.max(0, Math.min(100, updater.percent ?? 0));
    return {
      tone: "info" as const,
      title: t("Downloading update"),
      message: t("The HUD will install it automatically when it is safe."),
      trailing: `${percent}%`,
      progress: percent,
    };
  }
  if (updater.state === "downloaded") {
    return {
      tone: "success" as const,
      title: t("Update ready"),
      message: t(updater.deferred
        ? "Waiting until you leave the game or close the dashboard."
        : "The HUD will restart automatically."),
      trailing: updater.version ? `v${updater.version}` : undefined,
      progress: 100,
    };
  }
  return null;
}

export function HudAlerts({
  me,
  active,
  language,
  updater,
  preview = false,
}: {
  me: PlayerMe | null;
  active: boolean;
  language: AppLanguage;
  updater: UpdaterState;
  preview?: boolean;
}) {
  const [alerts, setAlerts] = useState<HudAlert[]>([]);
  const [updaterHidden, setUpdaterHidden] = useState(false);
  const levels = useRef<Partial<Record<VitalKey, AlertLevel>>>({});
  const lastShown = useRef<Partial<Record<VitalKey, number>>>({});

  const pushAlert = useCallback((alert: Omit<HudAlert, "id">) => {
    const id = `${alert.key}-${Date.now()}`;
    setAlerts((current) => [
      ...current.filter((item) => item.key !== alert.key),
      { ...alert, id },
    ].slice(-6));
  }, []);

  const visibleAlert = alerts[0] ?? null;
  useEffect(() => {
    if (!visibleAlert) return;
    const timer = window.setTimeout(() => {
      setAlerts((current) => current[0]?.id === visibleAlert.id ? current.slice(1) : current);
    }, ALERT_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [visibleAlert?.id]);

  useEffect(() => {
    if (!active || !me?.hasData) {
      levels.current = {};
      lastShown.current = {};
      setAlerts([]);
      return;
    }

    const rules: VitalRule[] = [
      {
        key: "health",
        value: me.health,
        max: me.maxHealth,
        warningBelow: 35,
        criticalBelow: 15,
        warningTitle: "Low health",
        warningMessage: "Your health is low. Avoid combat and recover.",
        criticalTitle: "Critical health",
        criticalMessage: "You are close to death. Get to safety now.",
      },
      {
        key: "hunger",
        value: me.hunger,
        max: me.maxHunger,
        warningBelow: 25,
        criticalBelow: 10,
        warningTitle: "Low hunger",
        warningMessage: "You are getting hungry. Find food soon.",
        criticalTitle: "Starving",
        criticalMessage: "You are close to starving. Eat immediately.",
      },
      {
        key: "thirst",
        value: me.thirst,
        max: me.maxThirst,
        warningBelow: 25,
        criticalBelow: 10,
        warningTitle: "Low thirst",
        warningMessage: "You are getting thirsty. Find water soon.",
        criticalTitle: "Severe dehydration",
        criticalMessage: "Your thirst is critical. Drink immediately.",
      },
      {
        key: "stamina",
        value: me.stamina,
        max: me.maxStamina,
        warningBelow: 60,
        criticalBelow: 20,
        warningTitle: "Low stamina",
        warningMessage: "Below 60%, stamina will not recover while walking.",
        criticalTitle: "Critical stamina",
        criticalMessage: "Stop moving and rest before you become exhausted.",
      },
    ];

    const now = Date.now();
    for (const rule of rules) {
      const percent = toPercent(rule.value, rule.max);
      if (percent == null) continue;
      const level: AlertLevel = percent < rule.criticalBelow ? 2 : percent < rule.warningBelow ? 1 : 0;
      const previousLevel = levels.current[rule.key] ?? 0;
      levels.current[rule.key] = level;
      if (level === 0) {
        lastShown.current[rule.key] = 0;
        continue;
      }
      const repeatCritical = level === 2 && now - (lastShown.current[rule.key] ?? 0) >= CRITICAL_REPEAT_MS;
      if (level <= previousLevel && !repeatCritical) continue;
      lastShown.current[rule.key] = now;
      pushAlert({
        key: rule.key,
        tone: level === 2 ? "critical" : "warning",
        title: tr(language, level === 2 ? rule.criticalTitle : rule.warningTitle),
        message: tr(language, level === 2 ? rule.criticalMessage : rule.warningMessage),
        percent: Math.round(percent),
      });
    }
  }, [
    active,
    language,
    me?.hasData,
    me?.health,
    me?.maxHealth,
    me?.hunger,
    me?.maxHunger,
    me?.thirst,
    me?.maxThirst,
    me?.stamina,
    me?.maxStamina,
    pushAlert,
  ]);

  const updateNotice = useMemo(() => updaterAlert(updater, language), [language, updater]);
  const updaterSignature = `${updater.state}:${updater.version ?? ""}:${updater.deferred === true}`;
  useEffect(() => {
    setUpdaterHidden(false);
    if (updater.state !== "available" && updater.state !== "downloaded") return;
    const timer = window.setTimeout(() => setUpdaterHidden(true), 8500);
    return () => window.clearTimeout(timer);
  }, [updaterSignature]);

  const visibleUpdateNotice = visibleAlert == null && updateNotice && !updaterHidden
    ? updateNotice
    : null;
  const visiblePreview = preview && visibleAlert == null && visibleUpdateNotice == null;
  if (!visibleAlert && !visibleUpdateNotice && !visiblePreview) return null;
  return (
    <div className="hudAlerts dragHandle" aria-live="assertive" aria-atomic="false">
      {visibleUpdateNotice ? (
        <AlertCard
          tone={visibleUpdateNotice.tone}
          title={visibleUpdateNotice.title}
          message={visibleUpdateNotice.message}
          trailing={visibleUpdateNotice.trailing}
          progress={visibleUpdateNotice.progress}
        />
      ) : null}
      {visibleAlert ? (
        <AlertCard
          key={visibleAlert.id}
          tone={visibleAlert.tone}
          title={visibleAlert.title}
          message={visibleAlert.message}
          trailing={`${visibleAlert.percent}%`}
        />
      ) : null}
      {visiblePreview ? (
        <AlertCard
          tone="info"
          title={tr(language, "Notification preview")}
          message={tr(language, "Drag this preview to move notifications. Use the corner handle to resize.")}
        />
      ) : null}
    </div>
  );
}
