import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { DinoModelViewer } from "./skin3d/dino-model-viewer";
import type { SkinPalette } from "./skin3d/types";

type ShopDino = {
  id: string;
  species: string;
  growth: number;
  gender: string;
  isPrimeElder: boolean;
  price: number;
  soldBySteamId: string | null;
  mutations: string[];
  palette: SkinPalette;
};

type ShopResp = {
  dinoShopEnabled?: boolean;
  dinoAllowed?: boolean;
  dinoReason?: string | null;
  balance?: number;
  currencyName?: string;
  currencySymbol?: string;
  dinos?: ShopDino[];
  error?: string;
  status?: number;
};

function money(n: number, name?: string, symbol?: string): string {
  return symbol
    ? `${symbol} ${n.toLocaleString("en-US")}`
    : `${n.toLocaleString("en-US")} ${name ?? "Coins"}`;
}

export function DinoShopTab({ authed, onLogin }: { authed: boolean; onLogin: () => void }) {
  const [data, setData] = useState<ShopResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const selRef = useRef<string | null>(null);
  selRef.current = selectedId;

  const refresh = useCallback(async () => {
    const r = await window.isleOverlay.apiGet<ShopResp>("/api/overlay/shop");
    setData(r as ShopResp);
    const dinos = (r as ShopResp).dinos ?? [];
    if (!selRef.current || !dinos.some((d) => d.id === selRef.current)) {
      setSelectedId(dinos[0]?.id ?? null);
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

  const flash = useCallback((text: string, ok: boolean) => {
    setMsg({ text, ok });
    setTimeout(() => setMsg(null), 4000);
  }, []);

  const dinos = data?.dinos ?? [];
  const selected = useMemo(
    () => dinos.find((d) => d.id === selectedId) ?? null,
    [dinos, selectedId],
  );

  const buy = useCallback(
    async (d: ShopDino) => {
      setBusy(true);
      try {
        const r = await window.isleOverlay.apiPost<{ ok?: boolean; error?: string }>(
          "/api/overlay/shop",
          { action: "buy-dino", id: d.id },
        );
        if (r.error || !r.ok) flash(r.error ?? "Purchase failed.", false);
        else {
          flash(`${d.species} is waiting in your garage.`, true);
          await refresh();
        }
      } finally {
        setBusy(false);
      }
    },
    [flash, refresh],
  );

  if (!authed) {
    return (
      <div className="noData">
        <div className="noDataTtl">Sign in first</div>
        <div className="noDataSub">Log in with Steam to buy dinos.</div>
        <button className="steamBtn interactive-region" onClick={onLogin}>
          Sign in with Steam
        </button>
      </div>
    );
  }
  if (loading) {
    return <div className="noData"><div className="noDataTtl">Loading shop…</div></div>;
  }

  if (data?.error || data?.dinoShopEnabled === false || data?.dinoAllowed === false) {
    const txt = data?.error
      ? data.status === 404
        ? "Join a server first."
        : data.error
      : data?.dinoShopEnabled === false
        ? "The dino shop is off on this server."
        : data?.dinoReason === "link"
          ? "Link your Discord to unlock the shop."
          : "You don't have a role that unlocks the shop.";
    return (
      <div className="noData">
        <div className="noDataTtl">Dino Shop</div>
        <div className="noDataSub">{txt}</div>
      </div>
    );
  }

  const balance = data?.balance ?? 0;

  return (
    <div className="garage">
      <div className="gHead">
        <div className="gHeadL">
          <span className="gTtl">Dino Shop</span>
          <span className="sectionCount">{dinos.length}</span>
        </div>
        <span className="shopBal">{money(balance, data?.currencyName, data?.currencySymbol)}</span>
      </div>

      {dinos.length === 0 ? (
        <div className="noData">
          <div className="noDataTtl">Nothing for sale</div>
          <div className="noDataSub">Check back later, offers rotate.</div>
        </div>
      ) : selected ? (
        <>
          <div className="gViewer interactive-region">
            <DinoModelViewer species={selected.species} palette={selected.palette} controls />
          </div>

          <div className="gInfo">
            <div className="gNameRow">
              <span className="gName">{selected.species}</span>
              {selected.isPrimeElder ? <span className="gElder">ELDER</span> : null}
              {selected.soldBySteamId ? <span className="shopUsed">PLAYER SOLD</span> : null}
            </div>
            <div className="gSub">
              {Math.round(selected.growth * 100)}% grown · {selected.gender}
              {selected.mutations.length ? ` · ${selected.mutations.length} mutations` : ""}
            </div>

            <div className="gActions">
              <button
                className="tbtn interactive-region"
                disabled={busy || balance < selected.price}
                onClick={() => void buy(selected)}
              >
                {busy
                  ? "Buying…"
                  : `Buy · ${money(selected.price, data?.currencyName, data?.currencySymbol)}`}
              </button>
              {balance < selected.price ? (
                <span className="shopShort">
                  {money(selected.price - balance, data?.currencyName, data?.currencySymbol)} short
                </span>
              ) : null}
            </div>
            <div className="gNote">Bought dinos land in your garage, restore them from there.</div>
          </div>

          <div className="gPills">
            {dinos.map((d) => (
              <button
                key={d.id}
                className={`gPill interactive-region ${d.id === selectedId ? "on" : ""}`}
                onClick={() => setSelectedId(d.id)}
              >
                {d.species} · {money(d.price, data?.currencyName, data?.currencySymbol)}
              </button>
            ))}
          </div>
        </>
      ) : null}

      {msg ? <div className={`gMsg ${msg.ok ? "ok" : "err"}`}>{msg.text}</div> : null}
    </div>
  );
}
