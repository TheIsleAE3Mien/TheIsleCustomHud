import { useCallback, useEffect, useState } from "react";

import { TicketsSection } from "./TicketsTab";

type StatusOpt = {
  id: string;
  label: string;
  allowsPm: boolean;
  allowsLivechat: boolean;
  hidden: boolean;
};
type AccessResp = {
  enabled?: boolean;
  isAdmin?: boolean;
  isOwner?: boolean;
  statuses?: StatusOpt[];
  currentStatusId?: string | null;
};
type OnlineAdmin = {
  userId: string;
  name: string;
  statusLabel: string;
  allowsPm: boolean;
  allowsLivechat: boolean;
  inGame: boolean;
};

export function AdminTab({ authed, onLogin }: { authed: boolean; onLogin: () => void }) {
  const [access, setAccess] = useState<AccessResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewAsUser, setViewAsUser] = useState(false);
  const [roster, setRoster] = useState<OnlineAdmin[]>([]);
  const [count, setCount] = useState(0);
  const [busy, setBusy] = useState(false);

  const statusId = access?.currentStatusId ?? null;
  const isAdmin = access?.isAdmin === true;
  const isOwner = access?.isOwner === true;
  const showAdmin = isAdmin && !viewAsUser;

  const loadAccess = useCallback(async () => {
    const r = await window.isleOverlay.apiGet<AccessResp>("/api/overlay/admin/access");
    if (r.error) setAccess(r.status === 404 ? { enabled: true } : null);
    else setAccess(r as AccessResp);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!authed) {
      setLoading(false);
      return;
    }
    void loadAccess();
    const iv = setInterval(loadAccess, 15000);
    return () => clearInterval(iv);
  }, [authed, loadAccess]);

  useEffect(() => {
    if (!showAdmin || !statusId) return;
    const ping = () => {
      void window.isleOverlay.apiPost("/api/overlay/admin/status", { statusId });
    };
    const iv = setInterval(ping, 20000);
    return () => clearInterval(iv);
  }, [showAdmin, statusId]);

  useEffect(() => {
    if (!authed || !access?.enabled || showAdmin) return;
    let alive = true;
    const tick = async () => {
      const r = await window.isleOverlay.apiGet<{ count?: number; admins?: OnlineAdmin[] }>(
        "/api/overlay/admin/roster",
      );
      if (!alive || r.error) return;
      setRoster(r.admins ?? []);
      setCount(r.count ?? 0);
    };
    void tick();
    const iv = setInterval(tick, 10000);
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, [authed, access?.enabled, showAdmin]);

  const setStatus = useCallback(async (id: string | null) => {
    setBusy(true);
    try {
      const r = await window.isleOverlay.apiPost("/api/overlay/admin/status", { statusId: id });
      if (!r.error) setAccess((a) => (a ? { ...a, currentStatusId: id } : a));
    } finally {
      setBusy(false);
    }
  }, []);

  const ownerToggle = isOwner ? (
    <div className="admToggle interactive-region">
      <button className={`admSeg ${showAdmin ? "on" : ""}`} onClick={() => setViewAsUser(false)}>
        Admin
      </button>
      <button className={`admSeg ${!showAdmin ? "on" : ""}`} onClick={() => setViewAsUser(true)}>
        User
      </button>
    </div>
  ) : null;

  if (!authed) {
    return (
      <div className="admWrap noData">
        <div className="noDataTtl">Sign in first</div>
        <div className="noDataSub">Log in with Steam to use support.</div>
        <button className="steamBtn interactive-region" onClick={onLogin}>
          Sign in with Steam
        </button>
      </div>
    );
  }
  if (loading) {
    return <div className="admWrap noData"><div className="noDataTtl">Loading…</div></div>;
  }
  if (!access?.enabled) {
    return (
      <div className="admWrap adminTab">
        <div className="admTop">
          <span className="admTitle">Support</span>
        </div>
        <TicketsSection authed={authed} />
      </div>
    );
  }

  if (showAdmin) {
    return (
      <div className="admWrap adminTab">
        <div className="admTop">
          <span className="admTitle">Support desk</span>
          {ownerToggle}
        </div>

        <div className="admCard">
          <div className="admHead">Your status</div>
          <div className="admStatusRow">
            {(access.statuses ?? []).map((s) => (
              <button
                key={s.id}
                className={`admChip interactive-region ${statusId === s.id ? "on" : ""}`}
                disabled={busy}
                onClick={() => void setStatus(s.id)}
              >
                {s.label}
                {s.hidden ? " (hidden)" : ""}
              </button>
            ))}
            <button
              className={`admChip interactive-region ${statusId === null ? "on" : ""}`}
              disabled={busy}
              onClick={() => void setStatus(null)}
            >
              Offline
            </button>
          </div>
          <div className="admMuted">
            Player tickets are handled in the IslePilot dashboard. The envelope
            icon lights up when a ticket assigned to you gets a new reply.
          </div>
        </div>

        <TicketsSection authed={authed} />
      </div>
    );
  }

  return (
    <div className="admWrap adminTab">
      <div className="admTop">
        <span className="admTitle">Support</span>
        {ownerToggle}
      </div>

      <div className="admCard">
        <div className="admHead">
          Admins online <span className="sectionCount">{count}</span>
        </div>
        {roster.length === 0 ? (
          <div className="admMuted">No admins are online right now.</div>
        ) : (
          roster.map((a) => (
            <div key={a.userId} className="admRow">
              <span>
                {a.name} ·{" "}
                <span className="admMuted">
                  {a.statusLabel} · {a.inGame ? "in-game" : "online"}
                </span>
              </span>
            </div>
          ))
        )}
      </div>

      <TicketsSection authed={authed} />
    </div>
  );
}
