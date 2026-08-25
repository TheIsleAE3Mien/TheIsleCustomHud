import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { DinoModelViewer } from "./skin3d/dino-model-viewer";
import type { SkinPalette } from "./skin3d/types";
import type { CommandResult, GarageData, GarageDino } from "./preload";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

type StatusResp = { status?: string; error?: string | null };

type ParkResult = {
  ok?: boolean;
  error?: string;
  commandId?: string;
  pending?: boolean;
  delaySec?: number;
};

async function pollCommand(commandId: string): Promise<{ ok: boolean; error?: string }> {
  for (let i = 0; i < 40; i++) {
    await sleep(1500);
    const r = (await window.isleOverlay.apiGet(
      `/api/overlay/garage/status?id=${commandId}`,
    )) as unknown as StatusResp;
    if (r.error && r.status !== "done" && r.status !== "failed") continue;
    if (r.status === "done") return { ok: true };
    if (r.status === "failed") return { ok: false, error: r.error ?? "Command failed." };
  }
  return { ok: false, error: "Timed out waiting for the server." };
}

function pct(v: number): string {
  return `${Math.round(Math.max(0, Math.min(1, v)) * 100)}%`;
}

export function GarageTab({
  authed,
  onLogin,
}: {
  authed: boolean;
  onLogin: () => void;
}) {
  const [data, setData] = useState<GarageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [renameVal, setRenameVal] = useState("");
  const [picking, setPicking] = useState(false);
  const [picks, setPicks] = useState<[string, string, string]>(["", "", ""]);
  const [castLeft, setCastLeft] = useState(0);
  const cancelCast = useRef(false);
  const selRef = useRef<string | null>(null);
  selRef.current = selectedId;

  const refresh = useCallback(async () => {
    const r = await window.isleOverlay.apiGet<GarageData>("/api/overlay/garage");
    if (r.error) {
      setError(r.status === 404 ? "Join a server first to see your garage." : r.error);
      setData(null);
    } else {
      setError(null);
      setData(r as GarageData);
      const dinos = (r as GarageData).dinos;
      if (!selRef.current || !dinos.some((d) => d.id === selRef.current)) {
        setSelectedId(dinos[0]?.id ?? null);
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!authed) {
      setLoading(false);
      return;
    }
    void refresh();
  }, [authed, refresh]);

  const dinos = data?.dinos ?? [];
  const settings = data?.settings;
  const selected = useMemo(() => dinos.find((d) => d.id === selectedId) ?? null, [dinos, selectedId]);

  const flash = useCallback((text: string, ok: boolean) => {
    setMsg({ text, ok });
    setTimeout(() => setMsg(null), 4000);
  }, []);

  const runCommand = useCallback(
    async (label: string, path: string, body?: unknown) => {
      setBusy(label);
      try {
        const r = await window.isleOverlay.apiPost<CommandResult>(path, body);
        if (r.error || !r.ok) {
          flash(r.error ?? "That didn't work.", false);
          return;
        }
        if (r.commandId) {
          const done = await pollCommand(r.commandId);
          if (!done.ok) {
            flash(done.error ?? "The server rejected it.", false);
            return;
          }
        }
        flash(`${label} done.`, true);
        await refresh();
      } finally {
        setBusy(null);
      }
    },
    [flash, refresh],
  );

  const park = useCallback(async () => {
    setBusy("Park");
    try {
      const start = await window.isleOverlay.apiPost<ParkResult>("/api/overlay/garage/park", {
        step: "start",
      });
      if (start.error || !start.ok) {
        flash(start.error ?? "That didn't work.", false);
        return;
      }

      if (start.pending && start.delaySec && start.delaySec > 0) {
        cancelCast.current = false;
        for (let n = start.delaySec; n > 0; n--) {
          if (cancelCast.current) {
            setCastLeft(0);
            void window.isleOverlay.apiPost("/api/overlay/garage/park", { step: "cancel" });
            flash("Park cancelled.", false);
            return;
          }
          setCastLeft(n);
          await sleep(1000);
        }
        setCastLeft(0);
        const fin = await window.isleOverlay.apiPost<ParkResult>("/api/overlay/garage/park", {
          step: "finalize",
        });
        if (fin.error || !fin.ok || !fin.commandId) {
          flash(fin.error ?? "Parking was cancelled.", false);
          return;
        }
        const done = await pollCommand(fin.commandId);
        if (!done.ok) {
          flash(done.error ?? "The server rejected it.", false);
          return;
        }
        flash("Park done.", true);
        await refresh();
        return;
      }

      if (start.commandId) {
        const done = await pollCommand(start.commandId);
        if (!done.ok) {
          flash(done.error ?? "The server rejected it.", false);
          return;
        }
      }
      flash("Park done.", true);
      await refresh();
    } finally {
      setBusy(null);
      setCastLeft(0);
    }
  }, [flash, refresh]);
  const slay = useCallback(() => runCommand("Slay", "/api/overlay/garage/slay"), [runCommand]);
  const restore = useCallback(
    (d: GarageDino, mutations?: string[]) =>
      runCommand(
        settings?.liveSwap ? "Swap" : "Restore",
        `/api/overlay/garage/${d.id}/restore`,
        mutations ? { mutations } : undefined,
      ),
    [runCommand, settings?.liveSwap],
  );

  const sell = useCallback(
    async (d: GarageDino) => {
      setBusy("Sell");
      try {
        const r = await window.isleOverlay.apiPost<CommandResult>(`/api/overlay/garage/${d.id}/sell`);
        if (r.error || !r.ok) {
          flash(r.error ?? "Could not sell.", false);
          return;
        }
        flash(`Sold for ${r.amount ?? 0} ${settings?.currencyName ?? "Coins"}.`, true);
        await refresh();
      } finally {
        setBusy(null);
      }
    },
    [flash, refresh, settings?.currencyName],
  );

  const rename = useCallback(
    async (d: GarageDino, name: string) => {
      setBusy("Rename");
      try {
        const r = await window.isleOverlay.apiPost<CommandResult>(`/api/overlay/garage/${d.id}/rename`, {
          name,
        });
        if (r.error || !r.ok) {
          flash(r.error ?? "Could not rename.", false);
          return;
        }
        setRenaming(false);
        await refresh();
      } finally {
        setBusy(null);
      }
    },
    [flash, refresh],
  );

  if (!authed) {
    return (
      <div className="noData">
        <div className="noDataTtl">Sign in first</div>
        <div className="noDataSub">Log in with Steam to open your garage.</div>
        <button className="steamBtn interactive-region" onClick={onLogin}>
          Sign in with Steam
        </button>
      </div>
    );
  }
  if (loading) {
    return <div className="noData"><div className="noDataTtl">Loading garage…</div></div>;
  }
  if (error) {
    return (
      <div className="noData">
        <div className="noDataTtl">Garage</div>
        <div className="noDataSub">{error}</div>
      </div>
    );
  }

  const busyAny = busy != null;

  return (
    <div className="garage">
      <div className="gHead">
        <div className="gHeadL">
          <span className="gTtl">Garage</span>
          <span className="sectionCount">{dinos.length}</span>
        </div>
        <div className="gHeadR">
          <button
            className="tbtn interactive-region"
            disabled={busyAny && castLeft === 0}
            onClick={castLeft > 0 ? () => { cancelCast.current = true; } : park}
          >
            {castLeft > 0
              ? `Cancel park (${castLeft}s)`
              : busy === "Park"
                ? "Parking…"
                : "Park current"}
          </button>
          {settings?.selfSlayEnabled ? (
            <button className="tbtn ghost interactive-region" disabled={busyAny} onClick={slay}>
              {busy === "Slay" ? "Slaying…" : "Slay"}
            </button>
          ) : null}
        </div>
      </div>

      {settings?.liveSwap ? (
        <div className="gNote">Live swap: restoring parks your current dino and spawns the chosen one in place.</div>
      ) : null}

      {dinos.length === 0 ? (
        <div className="noData">
          <div className="noDataTtl">No dinos parked</div>
          <div className="noDataSub">Park a dino in-game or with the button above.</div>
        </div>
      ) : selected ? (
        <>
          <div className="gViewer interactive-region">
            <DinoModelViewer species={selected.species} palette={selected.palette as SkinPalette} controls />
          </div>

          <div className="gInfo">
            <div className="gNameRow">
              {renaming ? (
                <>
                  <input
                    className="gNameInput interactive-region"
                    value={renameVal}
                    maxLength={32}
                    autoFocus
                    onChange={(e) => setRenameVal(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void rename(selected, renameVal);
                      if (e.key === "Escape") setRenaming(false);
                    }}
                  />
                  <button
                    className="tbtn interactive-region"
                    disabled={busyAny}
                    onClick={() => void rename(selected, renameVal)}
                  >
                    Save
                  </button>
                </>
              ) : (
                <>
                  <span className="gName">{selected.name}</span>
                  {selected.isPrimeElder ? <span className="gElder">ELDER</span> : null}
                  <button
                    className="gEdit interactive-region"
                    title="Rename"
                    onClick={() => {
                      setRenameVal(selected.name);
                      setRenaming(true);
                    }}
                  >
                    ✎
                  </button>
                </>
              )}
            </div>
            <div className="gSub">
              {selected.species} · {selected.gender} · Stage {pct(selected.growth)}
            </div>

            <div className="gVitals">
              <GVital label="HP" v={selected.health} color="var(--danger)" />
              <GVital label="Food" v={selected.hunger} color="var(--amber)" />
              <GVital label="Water" v={selected.thirst} color="var(--phos)" />
            </div>

            <div className="gActions">
              {selected.mutationEligible && selected.pickableMutations.length >= 3 ? (
                <button
                  className="tbtn interactive-region"
                  disabled={busyAny}
                  onClick={() => {
                    setPicks(["", "", ""]);
                    setPicking((p) => !p);
                  }}
                >
                  {settings?.liveSwap ? "Swap + pick mutations" : "Restore + pick mutations"}
                </button>
              ) : (
                <button
                  className="tbtn interactive-region"
                  disabled={busyAny}
                  onClick={() => void restore(selected)}
                >
                  {busy === "Restore" || busy === "Swap"
                    ? "Working…"
                    : settings?.liveSwap
                      ? "Swap to this"
                      : "Restore"}
                </button>
              )}
              {settings?.sellingEnabled && selected.sellPrice != null ? (
                <button
                  className="tbtn ghost interactive-region"
                  disabled={busyAny}
                  onClick={() => void sell(selected)}
                >
                  {busy === "Sell" ? "Selling…" : `Sell · ${selected.sellPrice} ${settings.currencyName}`}
                </button>
              ) : null}
            </div>

            {picking ? (
              <div className="gPick">
                {[0, 1, 2].map((i) => (
                  <select
                    key={i}
                    className="gPickSel interactive-region"
                    value={picks[i]}
                    onChange={(e) => {
                      const next = [...picks] as [string, string, string];
                      next[i] = e.target.value;
                      setPicks(next);
                    }}
                  >
                    <option value="">Mutation {i + 1}…</option>
                    {selected.pickableMutations.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                ))}
                <button
                  className="tbtn interactive-region"
                  disabled={busyAny || new Set(picks).size !== 3 || picks.some((p) => !p)}
                  onClick={() => {
                    setPicking(false);
                    void restore(selected, picks);
                  }}
                >
                  Confirm
                </button>
              </div>
            ) : null}
          </div>

          <div className="gPills">
            {dinos.map((d) => (
              <button
                key={d.id}
                className={`gPill interactive-region ${d.id === selectedId ? "on" : ""}`}
                onClick={() => {
                  setSelectedId(d.id);
                  setPicking(false);
                  setRenaming(false);
                }}
              >
                {d.name}
              </button>
            ))}
          </div>
        </>
      ) : null}

      {msg ? <div className={`gMsg ${msg.ok ? "ok" : "err"}`}>{msg.text}</div> : null}
    </div>
  );
}

function GVital({ label, v, color }: { label: string; v: number; color: string }) {
  return (
    <div className="vital">
      <div className="vitalHead">
        <span>{label}</span>
        <span className="mono">{pct(v)}</span>
      </div>
      <div className="vitalTrack">
        <div className="vitalFill" style={{ width: pct(v), background: color }} />
      </div>
    </div>
  );
}
