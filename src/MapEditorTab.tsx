import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import { Canvas } from "@react-three/fiber";
import { Grid, OrbitControls, TransformControls } from "@react-three/drei";
import * as THREE from "three";

import type { BlueprintAsset, MapObject, MeshAsset } from "./preload";
import { lockInteract, unlockInteract } from "./interaction";
import smFiles from "../resources/sm_files.json";
import bpFiles from "../resources/bp_files.json";

type CatMesh = MeshAsset & { category: string };

function meshCategory(p: string): string {
  const parts = p.split("/").filter(Boolean);
  const rest =
    parts[1] === "TheIsle"
      ? parts[2] === "Art"
        ? parts.slice(3, 5)
        : parts.slice(2, 4)
      : parts.slice(1, 3);
  return rest.join("/") || "Misc";
}

const CATALOG: { meshes: CatMesh[]; blueprints: BlueprintAsset[] } = {
  meshes: (smFiles as unknown as MeshAsset[])
    .filter((m) => m && m.path && m.name)
    .map((m) => ({ ...m, category: meshCategory(m.path) })),
  blueprints: (bpFiles as unknown as BlueprintAsset[]).filter(
    (b) => b && b.path && b.name && b.name.startsWith("BP_"),
  ),
};

type StatusResp = { status?: string; error?: string | null };
type SpawnResp = { ok?: boolean; error?: string; commandId?: string; id?: string };
type CmdResp = { ok?: boolean; error?: string; commandId?: string };

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function pollCommand(commandId: string): Promise<{ ok: boolean; error?: string }> {
  for (let i = 0; i < 40; i++) {
    await sleep(1500);
    const r = (await window.isleOverlay.apiGet(
      `/api/overlay/mapedit/status?id=${commandId}`,
    )) as unknown as StatusResp;
    if (r.error && r.status !== "done" && r.status !== "failed") continue;
    if (r.status === "done") return { ok: true };
    if (r.status === "failed") return { ok: false, error: r.error ?? "Command failed." };
  }
  return { ok: false, error: "Timed out waiting for the server." };
}

const CM_PER_UNIT = 100;
const ROT_ORDER = "YXZ";
const deg = THREE.MathUtils.radToDeg;
const rad = THREE.MathUtils.degToRad;

function scenePos(x: number, y: number, z: number): [number, number, number] {
  return [x / CM_PER_UNIT, z / CM_PER_UNIT, y / CM_PER_UNIT];
}
function sceneScale(sx: number, sy: number, sz: number): [number, number, number] {
  return [sx, sz, sy];
}
function sceneEuler(pitch: number, yaw: number, roll: number): THREE.Euler {
  return new THREE.Euler(rad(roll), rad(yaw), rad(pitch), ROT_ORDER);
}

type Draft = {
  locX: number; locY: number; locZ: number;
  pitch: number; yaw: number; roll: number;
  sx: number; sy: number; sz: number;
};

function toDraft(o: MapObject): Draft {
  return {
    locX: o.locX, locY: o.locY, locZ: o.locZ,
    pitch: o.rotPitch, yaw: o.rotYaw, roll: o.rotRoll,
    sx: o.scaleX, sy: o.scaleY, sz: o.scaleZ,
  };
}

function meshToDraft(m: THREE.Object3D): Draft {
  const e = new THREE.Euler().setFromQuaternion(m.quaternion, ROT_ORDER);
  return {
    locX: m.position.x * CM_PER_UNIT,
    locY: m.position.z * CM_PER_UNIT,
    locZ: m.position.y * CM_PER_UNIT,
    pitch: deg(e.z),
    yaw: deg(e.y),
    roll: deg(e.x),
    sx: m.scale.x,
    sy: m.scale.z,
    sz: m.scale.y,
  };
}

function draftPayload(id: string, d: Draft) {
  return {
    id,
    loc: { x: d.locX, y: d.locY, z: d.locZ },
    rot: { pitch: d.pitch, yaw: d.yaw, roll: d.roll },
    scale: { x: d.sx, y: d.sy, z: d.sz },
  };
}

type SelAsset = { kind: "mesh" | "blueprint"; path: string; name: string };
type Placement = "player" | "look" | "xyz";

const FAV_KEY = "mapedit:favorites";
const REC_KEY = "mapedit:recents";

function readStore(key: string): SelAsset[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (x): x is SelAsset =>
        x && (x.kind === "mesh" || x.kind === "blueprint") &&
        typeof x.path === "string" && typeof x.name === "string",
    );
  } catch {
    return [];
  }
}

export function MapEditorTab({ authed, onLogin }: { authed: boolean; onLogin: () => void }) {
  const [access, setAccess] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authed) {
      setLoading(false);
      return;
    }
    let alive = true;
    void window.isleOverlay
      .apiGet<{ admin: boolean }>("/api/overlay/mapedit/access")
      .then((r) => {
        if (!alive) return;
        setAccess(!r.error && Boolean(r.admin));
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [authed]);

  if (!authed) {
    return (
      <div className="noData">
        <div className="noDataTtl">Sign in first</div>
        <div className="noDataSub">Log in with Steam to open the map editor.</div>
        <button className="steamBtn interactive-region" onClick={onLogin}>
          Sign in with Steam
        </button>
      </div>
    );
  }
  if (loading) {
    return <div className="noData"><div className="noDataTtl">Checking access…</div></div>;
  }
  if (!access) {
    return (
      <div className="noData">
        <div className="noDataTtl">Map Editor</div>
        <div className="noDataSub">You are not an admin on this server.</div>
      </div>
    );
  }
  return <MapEditor />;
}

function MapEditor() {
  const catalog = CATALOG;
  const [objects, setObjects] = useState<MapObject[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [dirty, setDirty] = useState(false);
  const [mode, setMode] = useState<"translate" | "rotate" | "scale">("translate");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const [asset, setAsset] = useState<SelAsset | null>(null);
  const [placement, setPlacement] = useState<Placement>("player");
  const [xyz, setXyz] = useState({ x: 0, y: 0, z: 0 });

  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;
  const lastSent = useRef<string>("");
  const loadedId = useRef<string | null>(null);
  const selRef = useRef<string | null>(null);
  selRef.current = selectedId;
  const meshRef = useRef<THREE.Mesh | null>(null);
  const [gizmoMesh, setGizmoMesh] = useState<THREE.Mesh | null>(null);
  const draggingRef = useRef(false);
  const orbitRef = useRef<React.ComponentRef<typeof OrbitControls>>(null);

  const flash = useCallback((text: string, ok: boolean) => {
    setMsg({ text, ok });
    setTimeout(() => setMsg(null), 4000);
  }, []);

  useEffect(() => {
    lockInteract();
    void window.isleOverlay.setMouseIgnore(false);
    return () => unlockInteract();
  }, []);

  const refresh = useCallback(async () => {
    const r = await window.isleOverlay.apiGet<{ objects: MapObject[] }>("/api/overlay/mapedit/list");
    if (r.error) return;
    setObjects(Array.isArray(r.objects) ? r.objects : []);
  }, []);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => {
      if (dirtyRef.current) return;
      void refresh();
    }, 1500);
    return () => window.clearInterval(id);
  }, [refresh]);

  const selected = useMemo(
    () => objects.find((o) => o.id === selectedId) ?? null,
    [objects, selectedId],
  );

  const focusObject = useCallback((o: MapObject) => {
    const c = orbitRef.current;
    if (!c) return;
    const [px, py, pz] = scenePos(o.locX, o.locY, o.locZ);
    c.target.set(px, py, pz);
    c.object.position.set(px + 6, py + 5, pz + 6);
    c.update();
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setDraft(null);
      setDirty(false);
      loadedId.current = null;
      return;
    }
    if (!selected) return;
    const isNew = loadedId.current !== selectedId;
    if (!isNew) {
      if (dirtyRef.current || !draft) return;
      const jump = Math.hypot(
        selected.locX - draft.locX,
        selected.locY - draft.locY,
        selected.locZ - draft.locZ,
      );
      if (jump < 500) return;
    }
    loadedId.current = selectedId;
    const next = toDraft(selected);
    setDraft(next);
    lastSent.current = JSON.stringify(draftPayload(selectedId, next));
    setDirty(false);
    focusObject(selected);
  }, [selectedId, selected, draft, focusObject]);

  const applyDraft = useCallback(async () => {
    const id = selRef.current;
    if (!id || !draft) return;
    const payload = draftPayload(id, draft);
    const raw = JSON.stringify(payload);
    if (raw === lastSent.current) {
      setDirty(false);
      return;
    }
    lastSent.current = raw;
    const r = await window.isleOverlay.apiPost<CmdResp>("/api/overlay/mapedit/update", payload);
    if (r.error || !r.ok) flash(r.error ?? "Update failed.", false);
    setDirty(false);
  }, [draft, flash]);

  useEffect(() => {
    if (!dirty || !draft) return;
    const t = window.setTimeout(() => void applyDraft(), 150);
    return () => window.clearTimeout(t);
  }, [dirty, draft, applyDraft]);

  const patch = useCallback((p: Partial<Draft>) => {
    setDraft((d) => (d ? { ...d, ...p } : d));
    setDirty(true);
  }, []);

  const onGizmo = useCallback(() => {
    if (!meshRef.current) return;
    setDraft(meshToDraft(meshRef.current));
    setDirty(true);
  }, []);

  const bindGizmoMesh = useCallback((m: THREE.Mesh | null) => {
    meshRef.current = m;
    setGizmoMesh((prev) => (prev === m ? prev : m));
  }, []);

  const onGizmoDown = useCallback(() => {
    draggingRef.current = true;
    if (orbitRef.current) orbitRef.current.enabled = false;
  }, []);

  const onGizmoUp = useCallback(() => {
    draggingRef.current = false;
    if (orbitRef.current) orbitRef.current.enabled = true;
    if (meshRef.current) {
      setDraft(meshToDraft(meshRef.current));
      setDirty(true);
    }
  }, []);

  useEffect(() => {
    const m = gizmoMesh;
    if (!m || !draft || draggingRef.current) return;
    const [px, py, pz] = scenePos(draft.locX, draft.locY, draft.locZ);
    m.position.set(px, py, pz);
    const [sx, sy, sz] = sceneScale(draft.sx, draft.sy, draft.sz);
    m.scale.set(sx, sy, sz);
    m.rotation.copy(sceneEuler(draft.pitch, draft.yaw, draft.roll));
  }, [gizmoMesh, draft]);

  const pushRecent = useCallback((a: SelAsset) => {
    const next = [a, ...readStore(REC_KEY).filter((x) => x.path !== a.path)].slice(0, 12);
    try {
      localStorage.setItem(REC_KEY, JSON.stringify(next));
    } catch {
    }
  }, []);

  const spawn = useCallback(async () => {
    if (!asset) return;
    setBusy(true);
    try {
      const body: Record<string, unknown> = {
        kind: asset.kind,
        assetPath: asset.path,
        name: asset.name,
        placement,
      };
      if (placement === "xyz") body.xyz = xyz;
      const r = await window.isleOverlay.apiPost<SpawnResp>("/api/overlay/mapedit/spawn", body);
      if (r.error || !r.ok) {
        flash(r.error ?? "Spawn failed.", false);
        return;
      }
      if (r.commandId) {
        const done = await pollCommand(r.commandId);
        if (!done.ok) {
          flash(done.error ?? "The server rejected the spawn.", false);
          return;
        }
      }
      pushRecent(asset);
      flash(`Spawned ${asset.name}.`, true);
      const list = await window.isleOverlay.apiGet<{ objects: MapObject[] }>(
        "/api/overlay/mapedit/list",
      );
      const objs = Array.isArray(list.objects) ? list.objects : [];
      setObjects(objs);
      if (r.id) {
        setSelectedId(r.id);
        const fresh = objs.find((o) => o.id === r.id);
        if (fresh) focusObject(fresh);
      }
    } finally {
      setBusy(false);
    }
  }, [asset, placement, xyz, flash, pushRecent, focusObject]);

  const remove = useCallback(
    async (id: string) => {
      setBusy(true);
      try {
        const r = await window.isleOverlay.apiPost<CmdResp>("/api/overlay/mapedit/delete", { id });
        if (r.error || !r.ok) {
          flash(r.error ?? "Delete failed.", false);
          return;
        }
        if (r.commandId) {
          const done = await pollCommand(r.commandId);
          if (!done.ok) {
            flash(done.error ?? "The server rejected the delete.", false);
            return;
          }
        }
        if (selRef.current === id) setSelectedId(null);
        flash("Deleted.", true);
        await refresh();
      } finally {
        setBusy(false);
      }
    },
    [flash, refresh],
  );

  const bring = useCallback(
    async (id: string) => {
      setBusy(true);
      try {
        const r = await window.isleOverlay.apiPost<CmdResp>("/api/overlay/mapedit/bring", { id });
        if (r.error || !r.ok) {
          flash(r.error ?? "Bring failed.", false);
          return;
        }
        if (r.commandId) {
          const done = await pollCommand(r.commandId);
          if (!done.ok) {
            flash(done.error ?? "The server rejected the bring.", false);
            return;
          }
        }
        flash("Object brought to you.", true);
        await refresh();
      } finally {
        setBusy(false);
      }
    },
    [flash, refresh],
  );

  const tpTo = useCallback(
    async (id: string) => {
      setBusy(true);
      try {
        const r = await window.isleOverlay.apiPost<CmdResp>("/api/overlay/mapedit/tpto", { id });
        if (r.error || !r.ok) {
          flash(r.error ?? "Teleport failed.", false);
          return;
        }
        if (r.commandId) {
          const done = await pollCommand(r.commandId);
          if (!done.ok) {
            flash(done.error ?? "The server rejected the teleport.", false);
            return;
          }
        }
        flash("Teleported to object.", true);
      } finally {
        setBusy(false);
      }
    },
    [flash],
  );

  return (
    <div className="me">
      <AssetBrowser catalog={catalog} selected={asset} onSelect={setAsset} />

      <SpawnBar
        asset={asset}
        placement={placement}
        xyz={xyz}
        busy={busy}
        onPlacement={setPlacement}
        onXyz={setXyz}
        onSpawn={() => void spawn()}
      />

      <div className="meViewport interactive-region">
        <div className="meTools">
          {(["translate", "rotate", "scale"] as const)
            .filter((m) => m !== "scale" || selected?.kind !== "blueprint")
            .map((m) => (
              <button
                key={m}
                className={`chip ${mode === m ? "on" : ""}`}
                onClick={() => setMode(m)}
              >
                {m === "translate" ? "MOVE" : m === "rotate" ? "ROTATE" : "SCALE"}
              </button>
            ))}
          <span className="meToolInfo">{selected ? selected.name : "no selection"}</span>
        </div>
        <Canvas
          dpr={[1, 1.5]}
          camera={{ position: [8, 6, 8], fov: 45, near: 0.1, far: 100000 }}
          gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
        >
          <ambientLight intensity={0.8} />
          <directionalLight position={[10, 16, 8]} intensity={1.4} />
          <Grid
            args={[200, 200]}
            infiniteGrid
            cellSize={1}
            sectionSize={10}
            cellColor="#1b2a1f"
            sectionColor="#2c4a37"
            fadeDistance={140}
            fadeStrength={2}
          />
          <axesHelper args={[4]} />
          {objects.map((o) =>
            o.id === selectedId ? null : (
              <mesh
                key={o.id}
                position={scenePos(o.locX, o.locY, o.locZ)}
                scale={sceneScale(o.scaleX, o.scaleY, o.scaleZ)}
                rotation={sceneEuler(o.rotPitch, o.rotYaw, o.rotRoll)}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedId(o.id);
                }}
              >
                <boxGeometry args={[1, 1, 1]} />
                <meshStandardMaterial color="#4a6152" transparent opacity={0.7} />
              </mesh>
            ),
          )}
          {draft && selectedId ? (
            <mesh ref={bindGizmoMesh}>
              <boxGeometry args={[1, 1, 1]} />
              <meshStandardMaterial color="#7cf2a6" transparent opacity={0.85} />
            </mesh>
          ) : null}
          {draft && selectedId && gizmoMesh ? (
            <TransformControls
              object={gizmoMesh}
              mode={mode}
              onObjectChange={onGizmo}
              onMouseDown={onGizmoDown}
              onMouseUp={onGizmoUp}
            />
          ) : null}
          <OrbitControls makeDefault ref={orbitRef} />
        </Canvas>
      </div>

      <Outliner
        objects={objects}
        selectedId={selectedId}
        busy={busy}
        onSelect={setSelectedId}
        onFocus={(o) => focusObject(o)}
        onBring={(id) => void bring(id)}
        onTpTo={(id) => void tpTo(id)}
        onDelete={(id) => void remove(id)}
      />

      {draft ? (
        <TransformPanel draft={draft} showScale={selected?.kind !== "blueprint"} onPatch={patch} />
      ) : null}


      {msg ? <div className={`gMsg ${msg.ok ? "ok" : "err"}`}>{msg.text}</div> : null}

      <style>{MAP_CSS}</style>
    </div>
  );
}

function CategoryDropdown({
  value,
  options,
  onChange,
}: {
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onDoc);
    return () => window.removeEventListener("mousedown", onDoc);
  }, [open]);
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        className="meSelect"
        onClick={() => setOpen((o) => !o)}
        style={{ width: "100%", textAlign: "left", cursor: "pointer" }}
      >
        {value || "All categories"} ▾
      </button>
      {open ? (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            zIndex: 50,
            maxHeight: 240,
            overflowY: "auto",
            marginTop: 2,
            background: "#0d1512",
            border: "1px solid #2c4a37",
            borderRadius: 6,
          }}
        >
          {["", ...options].map((c) => (
            <button
              key={c || "__all"}
              onClick={() => {
                onChange(c);
                setOpen(false);
              }}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "6px 10px",
                background: c === value ? "#1b2a1f" : "transparent",
                border: "none",
                color: "#cfeadd",
                cursor: "pointer",
                fontSize: 12,
              }}
            >
              {c || "All categories"}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function AssetBrowser({
  catalog,
  selected,
  onSelect,
}: {
  catalog: typeof CATALOG;
  selected: SelAsset | null;
  onSelect: (a: SelAsset) => void;
}) {
  const [kind, setKind] = useState<"mesh" | "blueprint">("mesh");
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [favs, setFavs] = useState<SelAsset[]>(() => readStore(FAV_KEY));

  useEffect(() => {
    const t = window.setTimeout(() => setQuery(input.trim().toLowerCase()), 180);
    return () => window.clearTimeout(t);
  }, [input]);

  const switchKind = (k: "mesh" | "blueprint") => {
    setKind(k);
    setCategory("");
  };

  const categories = useMemo(() => {
    const set = new Set<string>();
    if (kind === "mesh") for (const m of catalog.meshes) set.add(m.category);
    else for (const b of catalog.blueprints) set.add(b.category);
    return [...set].sort();
  }, [kind, catalog]);

  const results = useMemo<SelAsset[]>(() => {
    const out: SelAsset[] = [];
    const list = kind === "mesh" ? catalog.meshes : catalog.blueprints;
    for (const a of list) {
      if (out.length >= 120) break;
      if (category && a.category !== category) continue;
      if (query && !a.name.toLowerCase().includes(query) && !a.path.toLowerCase().includes(query)) continue;
      out.push({ kind, path: a.path, name: a.name });
    }
    return out;
  }, [kind, query, category, catalog]);

  const isFav = useCallback((a: SelAsset) => favs.some((f) => f.path === a.path), [favs]);
  const toggleFav = useCallback((a: SelAsset) => {
    setFavs((prev) => {
      const next = prev.some((f) => f.path === a.path)
        ? prev.filter((f) => f.path !== a.path)
        : [a, ...prev].slice(0, 40);
      try {
        localStorage.setItem(FAV_KEY, JSON.stringify(next));
      } catch {
      }
      return next;
    });
  }, []);

  const recents = readStore(REC_KEY);

  return (
    <div className="frame meFrame">
      <div className="frameBar">
        <span className="dot" />
        <span className="ttl">ASSETS</span>
        <span className="badge">{kind === "mesh" ? catalog.meshes.length : catalog.blueprints.length}</span>
      </div>
      <div className="frameBody">
        <div className="featRow">
          <button className={`chip ${kind === "mesh" ? "on" : ""}`} onClick={() => switchKind("mesh")}>
            STATIC MESHES
          </button>
          <button className={`chip ${kind === "blueprint" ? "on" : ""}`} onClick={() => switchKind("blueprint")}>
            BLUEPRINTS
          </button>
        </div>

        <input
          className="meSearch"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={kind === "mesh" ? "Search meshes…" : "Search blueprints…"}
        />

        {categories.length > 0 ? (
          <CategoryDropdown value={category} options={categories} onChange={setCategory} />
        ) : null}

        {favs.length > 0 ? (
          <>
            <div className="secLabel">favorites</div>
            <div className="meChipWrap">
              {favs.map((f) => (
                <button key={f.path} className="meQuick" title={f.path} onClick={() => onSelect(f)}>
                  {f.name}
                </button>
              ))}
            </div>
          </>
        ) : null}

        {recents.length > 0 ? (
          <>
            <div className="secLabel">recents</div>
            <div className="meChipWrap">
              {recents.map((f) => (
                <button key={f.path} className="meQuick" title={f.path} onClick={() => onSelect(f)}>
                  {f.name}
                </button>
              ))}
            </div>
          </>
        ) : null}

        <div className="meList">
          {results.length === 0 ? (
            <div className="hint">No matches.</div>
          ) : (
            results.map((a) => (
              <div key={a.path} className={`meItem ${selected?.path === a.path ? "on" : ""}`}>
                <button className="meItemPick" onClick={() => onSelect(a)} title={a.path}>
                  <span className="meItemName">{a.name}</span>
                  <span className="meItemPath">{a.path}</span>
                </button>
                <button
                  className={`meStar ${isFav(a) ? "on" : ""}`}
                  onClick={() => toggleFav(a)}
                  title={isFav(a) ? "Remove favorite" : "Add favorite"}
                >
                  ★
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function SpawnBar({
  asset,
  placement,
  xyz,
  busy,
  onPlacement,
  onXyz,
  onSpawn,
}: {
  asset: SelAsset | null;
  placement: Placement;
  xyz: { x: number; y: number; z: number };
  busy: boolean;
  onPlacement: (p: Placement) => void;
  onXyz: (v: { x: number; y: number; z: number }) => void;
  onSpawn: () => void;
}) {
  return (
    <div className="frame meFrame">
      <div className="frameBar">
        <span className="dot" />
        <span className="ttl">SPAWN</span>
      </div>
      <div className="frameBody">
        <div className="meSelName">{asset ? asset.name : "Pick an asset above"}</div>
        <div className="featRow">
          <button className={`chip ${placement === "player" ? "on" : ""}`} onClick={() => onPlacement("player")}>
            AT ME
          </button>
          <button className={`chip ${placement === "look" ? "on" : ""}`} onClick={() => onPlacement("look")}>
            AT CROSSHAIR
          </button>
          <button className={`chip ${placement === "xyz" ? "on" : ""}`} onClick={() => onPlacement("xyz")}>
            XYZ
          </button>
        </div>
        {placement === "xyz" ? (
          <div className="meXyz">
            {(["x", "y", "z"] as const).map((k) => (
              <label key={k} className="meXyzField">
                <span>{k.toUpperCase()}</span>
                <input
                  className="meNum"
                  type="number"
                  value={xyz[k]}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    onXyz({ ...xyz, [k]: Number.isFinite(n) ? n : 0 });
                  }}
                />
              </label>
            ))}
          </div>
        ) : null}
        <button className="tbtn" disabled={!asset || busy} onClick={onSpawn}>
          {busy ? "Working…" : "Spawn"}
        </button>
      </div>
    </div>
  );
}

function Outliner({
  objects,
  selectedId,
  busy,
  onSelect,
  onFocus,
  onBring,
  onTpTo,
  onDelete,
}: {
  objects: MapObject[];
  selectedId: string | null;
  busy: boolean;
  onSelect: (id: string) => void;
  onFocus: (o: MapObject) => void;
  onBring: (id: string) => void;
  onTpTo: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [input, setInput] = useState("");
  const q = input.trim().toLowerCase();
  const shown = q
    ? objects.filter((o) => o.name.toLowerCase().includes(q) || o.assetPath.toLowerCase().includes(q))
    : objects;

  return (
    <div className="frame meFrame">
      <div className="frameBar">
        <span className="dot" />
        <span className="ttl">OBJECTS</span>
        <span className="badge">{objects.length}</span>
      </div>
      <div className="frameBody">
        <input
          className="meSearch"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Filter objects…"
        />
        <div className="meList">
          {shown.length === 0 ? (
            <div className="hint">Nothing placed yet.</div>
          ) : (
            shown.map((o) => (
              <div key={o.id} className={`meItem ${o.id === selectedId ? "on" : ""}`}>
                <button className="meItemPick" onClick={() => onSelect(o.id)} title={o.assetPath}>
                  <span className="meItemName">
                    {o.name}
                    {o.spawned ? null : <span className="meDot">unspawned</span>}
                  </span>
                  <span className="meItemPath">{o.kind} · {o.assetPath}</span>
                </button>
                <button className="meRowBtn" onClick={() => onFocus(o)} title="Focus camera">
                  ◎
                </button>
                <button
                  className="meRowBtn"
                  disabled={busy}
                  onClick={() => onBring(o.id)}
                  title="Bring object to you"
                >
                  ⤵
                </button>
                <button
                  className="meRowBtn"
                  disabled={busy}
                  onClick={() => onTpTo(o.id)}
                  title="Teleport yourself to object"
                >
                  ⤴
                </button>
                <button
                  className="meRowBtn del"
                  disabled={busy}
                  onClick={() => onDelete(o.id)}
                  title="Delete"
                >
                  ✕
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

const POS = { min: -600000, max: 600000, step: 10, nudge: 1, dec: 0 };
const ROT = { min: -180, max: 180, step: 1, nudge: 1, dec: 1 };
const SCL = { min: 0.05, max: 20, step: 0.05, nudge: 0.05, dec: 2 };

function TransformPanel({
  draft,
  showScale,
  onPatch,
}: {
  draft: Draft;
  showScale: boolean;
  onPatch: (p: Partial<Draft>) => void;
}) {
  return (
    <div className="frame meFrame">
      <div className="frameBar">
        <span className="dot" />
        <span className="ttl">TRANSFORM</span>
      </div>
      <div className="frameBody">
        <div className="secLabel">position (cm)</div>
        <AxisRow label="X" value={draft.locX} cfg={POS} onChange={(v) => onPatch({ locX: v })} />
        <AxisRow label="Y" value={draft.locY} cfg={POS} onChange={(v) => onPatch({ locY: v })} />
        <AxisRow label="Z" value={draft.locZ} cfg={POS} onChange={(v) => onPatch({ locZ: v })} />

        <div className="secLabel">rotation (deg)</div>
        <AxisRow label="Pitch" value={draft.pitch} cfg={ROT} onChange={(v) => onPatch({ pitch: v })} />
        <AxisRow label="Yaw" value={draft.yaw} cfg={ROT} onChange={(v) => onPatch({ yaw: v })} />
        <AxisRow label="Roll" value={draft.roll} cfg={ROT} onChange={(v) => onPatch({ roll: v })} />

        {showScale ? (
          <>
            <div className="secLabel">scale</div>
            <AxisRow label="X" value={draft.sx} cfg={SCL} onChange={(v) => onPatch({ sx: v })} />
            <AxisRow label="Y" value={draft.sy} cfg={SCL} onChange={(v) => onPatch({ sy: v })} />
            <AxisRow label="Z" value={draft.sz} cfg={SCL} onChange={(v) => onPatch({ sz: v })} />
          </>
        ) : null}
      </div>
    </div>
  );
}

type AxisCfg = { min: number; max: number; step: number; nudge: number; dec: number };

function AxisRow({
  label,
  value,
  cfg,
  onChange,
}: {
  label: string;
  value: number;
  cfg: AxisCfg;
  onChange: (v: number) => void;
}) {
  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    e.preventDefault();
    const step = (e.shiftKey ? 10 : 1) * cfg.nudge;
    onChange(value + (e.key === "ArrowUp" ? step : -step));
  };
  const set = (raw: string) => {
    const n = Number(raw);
    onChange(Number.isFinite(n) ? n : 0);
  };
  return (
    <div className="meAxis">
      <span className="meAxisLbl">{label}</span>
      <input
        className="range"
        type="range"
        min={cfg.min}
        max={cfg.max}
        step={cfg.step}
        value={value}
        onChange={(e) => set(e.target.value)}
      />
      <input
        className="meNum"
        type="number"
        step={cfg.step}
        value={Number(value.toFixed(cfg.dec))}
        onChange={(e) => set(e.target.value)}
        onKeyDown={onKey}
      />
    </div>
  );
}

const MAP_CSS = `
.me { display: flex; flex-direction: column; gap: 12px; padding: 12px 14px; }
.me .meFrame { width: 100%; }
.meSearch, .meSelect {
  width: 100%; padding: 7px 9px; border: 1px solid var(--line); border-radius: var(--r-sm);
  background: var(--track); color: var(--text); font-size: 12px;
}
.meSearch:focus, .meSelect:focus { outline: none; border-color: var(--phos-dim); }
.meSearch::placeholder { color: var(--faint); }
.meSelect option { background: var(--panel); color: var(--text); }
.meChipWrap { display: flex; flex-wrap: wrap; gap: 6px; }
.meQuick {
  max-width: 130px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  border: 1px solid var(--line); background: var(--panel-2); color: var(--muted);
  font-size: 11px; padding: 4px 9px; border-radius: 999px; cursor: pointer;
}
.meQuick:hover { color: var(--phos); border-color: var(--phos-dim); }
.meList {
  display: flex; flex-direction: column; gap: 3px; max-height: 200px; overflow-y: auto;
  scrollbar-width: thin; scrollbar-color: var(--line) transparent;
}
.meList::-webkit-scrollbar { width: 7px; }
.meList::-webkit-scrollbar-thumb { background: var(--line); border-radius: 999px; }
.meItem {
  flex: none; display: flex; align-items: stretch; border: 1px solid var(--line); border-radius: var(--r-sm);
  background: var(--panel-2); overflow: hidden;
}
.meItem.on { border-color: var(--edge); background: rgba(124, 242, 166, 0.09); }
.meItemPick {
  flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; align-items: flex-start;
  padding: 6px 10px; background: transparent; border: none; color: var(--text); cursor: pointer; text-align: left;
}
.meItemName { font-size: 12px; font-weight: 600; color: var(--text); display: flex; align-items: center; gap: 6px; }
.meItemPath {
  font-family: var(--mono); font-size: 9.5px; color: var(--faint);
  max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.meItemPick:hover .meItemName { color: var(--phos); }
.meDot {
  font-family: var(--mono); font-size: 8px; letter-spacing: 0.08em; color: var(--amber);
  border: 1px solid var(--amber); border-radius: 4px; padding: 0 4px;
}
.meStar, .meRowBtn {
  flex: none; width: 30px; background: transparent; border: none; border-left: 1px solid var(--line);
  color: var(--faint); cursor: pointer; font-size: 13px;
}
.meStar:hover { color: var(--amber); }
.meStar.on { color: var(--amber); }
.meRowBtn:hover { color: var(--phos); }
.meRowBtn.del:hover { color: var(--danger); }
.meRowBtn:disabled { opacity: 0.5; cursor: default; }
.meViewport {
  position: relative; height: 320px; border: 1px solid var(--line); border-radius: var(--r);
  background: radial-gradient(120% 120% at 50% 20%, #0d1712, #05080699); overflow: hidden;
}
.meViewport canvas { display: block; }
.meTools {
  position: absolute; top: 8px; left: 8px; right: 8px; z-index: 2;
  display: flex; align-items: center; gap: 6px;
}
.meToolInfo {
  margin-left: auto; font-family: var(--mono); font-size: 10px; color: var(--muted);
  max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.meSelName { font-size: 12px; color: var(--text); font-weight: 600; }
.meXyz { display: flex; gap: 6px; }
.meXyzField { flex: 1; display: flex; flex-direction: column; gap: 3px; }
.meXyzField span { font-family: var(--mono); font-size: 9px; color: var(--faint); letter-spacing: 0.08em; }
.meNum {
  width: 100%; padding: 5px 7px; border: 1px solid var(--line); border-radius: var(--r-sm);
  background: var(--track); color: var(--text); font-family: var(--mono); font-size: 11px;
}
.meNum:focus { outline: none; border-color: var(--phos-dim); }
.meAxis { display: grid; grid-template-columns: 42px 1fr 74px; align-items: center; gap: 8px; }
.meAxisLbl { font-family: var(--mono); font-size: 10px; color: var(--muted); letter-spacing: 0.05em; }
`;
