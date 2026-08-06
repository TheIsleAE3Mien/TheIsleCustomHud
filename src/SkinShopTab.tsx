import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { DinoModelViewer } from "./skin3d/dino-model-viewer";
import type { SkinPalette } from "./skin3d/types";

type ShopSkin = {
  id: string;
  name: string;
  species: string;
  price: number;
  allSpecies: boolean;
  maxUses: number | null;
  palette: SkinPalette;
};

type OwnedSkin = {
  id: string;
  name: string;
  species: string;
  shopSkinId: string | null;
  allSpecies: boolean;
  maxUses: number | null;
  usesLeft: number | null;
  palette: SkinPalette;
};

type ShopResp = {
  skinShopEnabled?: boolean;
  skinAllowed?: boolean;
  skinReason?: string | null;
  balance?: number;
  currencyName?: string;
  currencySymbol?: string;
  sellRefundPct?: number;
  skins?: ShopSkin[];
  owned?: OwnedSkin[];
  error?: string;
  status?: number;
};

type Sel = { kind: "sale" | "owned"; id: string };

function money(n: number, name?: string, symbol?: string): string {
  return symbol
    ? `${symbol} ${n.toLocaleString("en-US")}`
    : `${n.toLocaleString("en-US")} ${name ?? "Coins"}`;
}

export function SkinShopTab({ authed, onLogin }: { authed: boolean; onLogin: () => void }) {
  const [data, setData] = useState<ShopResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState<Sel | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const selRef = useRef<Sel | null>(null);
  selRef.current = sel;

  const refresh = useCallback(async () => {
    const r = (await window.isleOverlay.apiGet<ShopResp>("/api/overlay/shop")) as ShopResp;
    setData(r);
    const skins = r.skins ?? [];
    const owned = r.owned ?? [];
    const cur = selRef.current;
    const stillThere =
      cur &&
      (cur.kind === "sale"
        ? skins.some((s) => s.id === cur.id)
        : owned.some((o) => o.id === cur.id));
    if (!stillThere) {
      setSel(
        skins[0] ? { kind: "sale", id: skins[0].id } : owned[0] ? { kind: "owned", id: owned[0].id } : null,
      );
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

  const act = useCallback(
    async (action: string, id: string, okText: string) => {
      setBusy(true);
      try {
        const r = await window.isleOverlay.apiPost<{ ok?: boolean; error?: string }>(
          "/api/overlay/shop",
          { action, id },
        );
        if (r.error || !r.ok) flash(r.error ?? "That didn't work.", false);
        else {
          flash(okText, true);
          await refresh();
        }
      } finally {
        setBusy(false);
      }
    },
    [flash, refresh],
  );

  const skins = data?.skins ?? [];
  const owned = data?.owned ?? [];
  const ownedIds = useMemo(
    () => new Set(owned.map((o) => o.shopSkinId).filter(Boolean)),
    [owned],
  );
  const selected = useMemo(() => {
    if (!sel) return null;
    if (sel.kind === "sale") {
      const s = skins.find((x) => x.id === sel.id);
      return s ? { ...s, kind: "sale" as const, usesLeft: null as number | null } : null;
    }
    const o = owned.find((x) => x.id === sel.id);
    return o ? { ...o, kind: "owned" as const, price: 0 } : null;
  }, [sel, skins, owned]);

  if (!authed) {
    return (
      <div className="noData">
        <div className="noDataTtl">Sign in first</div>
        <div className="noDataSub">Log in with Steam to browse skins.</div>
        <button className="steamBtn interactive-region" onClick={onLogin}>
          Sign in with Steam
        </button>
      </div>
    );
  }
  if (loading) {
    return <div className="noData"><div className="noDataTtl">Loading skins…</div></div>;
  }

  if (data?.error || data?.skinShopEnabled === false || data?.skinAllowed === false) {
    const txt = data?.error
      ? data.status === 404
        ? "Join a server first."
        : data.error
      : data?.skinShopEnabled === false
        ? "The skin shop is off on this server."
        : data?.skinReason === "link"
          ? "Link your Discord to unlock the shop."
          : "You don't have a role that unlocks the shop.";
    return (
      <div className="noData">
        <div className="noDataTtl">Skin Shop</div>
        <div className="noDataSub">{txt}</div>
      </div>
    );
  }

  const balance = data?.balance ?? 0;

  return (
    <div className="garage">
      <div className="gHead">
        <div className="gHeadL">
          <span className="gTtl">Skin Shop</span>
          <span className="sectionCount">{skins.length}</span>
        </div>
        <span className="shopBal">{money(balance, data?.currencyName, data?.currencySymbol)}</span>
      </div>

      {skins.length === 0 && owned.length === 0 ? (
        <div className="noData">
          <div className="noDataTtl">No skins yet</div>
          <div className="noDataSub">Nothing for sale right now, check back later.</div>
        </div>
      ) : selected ? (
        <>
          <div className="gViewer interactive-region">
            <DinoModelViewer species={selected.species} palette={selected.palette} controls />
          </div>

          <div className="gInfo">
            <div className="gNameRow">
              <span className="gName">{selected.name}</span>
              {selected.kind === "owned" ? <span className="gElder">OWNED</span> : null}
            </div>
            <div className="gSub">
              {selected.allSpecies ? "Fits every species" : selected.species}
              {selected.kind === "owned" && selected.maxUses != null
                ? ` · ${selected.usesLeft ?? 0}/${selected.maxUses} uses left`
                : selected.kind === "sale" && selected.maxUses != null
                  ? ` · ${selected.maxUses} uses`
                  : ""}
            </div>

            <div className="gActions">
              {selected.kind === "sale" ? (
                ownedIds.has(selected.id) ? (
                  <button className="tbtn interactive-region" disabled>
                    Already owned
                  </button>
                ) : (
                  <>
                    <button
                      className="tbtn interactive-region"
                      disabled={busy || balance < selected.price}
                      onClick={() =>
                        void act("buy-skin", selected.id, `${selected.name} is yours.`)
                      }
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
                  </>
                )
              ) : (
                <>
                  <button
                    className="tbtn interactive-region"
                    disabled={busy}
                    onClick={() =>
                      void act("apply-skin", selected.id, `${selected.name} applied to your dino.`)
                    }
                  >
                    {busy ? "Working…" : "Apply to current dino"}
                  </button>
                  {data?.sellRefundPct ? (
                    <button
                      className="tbtn ghost interactive-region"
                      disabled={busy}
                      onClick={() => void act("sell-skin", selected.id, "Skin sold.")}
                    >
                      Sell
                    </button>
                  ) : null}
                </>
              )}
            </div>
          </div>

          {skins.length > 0 ? (
            <>
              <div className="secLabel">for sale</div>
              <div className="gPills">
                {skins.map((s) => (
                  <button
                    key={s.id}
                    className={`gPill interactive-region ${sel?.kind === "sale" && sel.id === s.id ? "on" : ""}`}
                    onClick={() => setSel({ kind: "sale", id: s.id })}
                  >
                    <span className="shopSwatch" style={{ background: s.palette.body }} />
                    {s.name}
                  </button>
                ))}
              </div>
            </>
          ) : null}

          {owned.length > 0 ? (
            <>
              <div className="secLabel">my skins</div>
              <div className="gPills">
                {owned.map((o) => (
                  <button
                    key={o.id}
                    className={`gPill interactive-region ${sel?.kind === "owned" && sel.id === o.id ? "on" : ""}`}
                    onClick={() => setSel({ kind: "owned", id: o.id })}
                  >
                    <span className="shopSwatch" style={{ background: o.palette.body }} />
                    {o.name}
                  </button>
                ))}
              </div>
            </>
          ) : null}
        </>
      ) : null}

      {msg ? <div className={`gMsg ${msg.ok ? "ok" : "err"}`}>{msg.text}</div> : null}
    </div>
  );
}
