export type OverlayTheme = {
  accent: string;
  stat: { health: string; stamina: string; food: string; water: string };
};

export type OverlaySettings = {
  serverName: string;
  overlayLabel: string;
  apiBaseUrl: string;
  language: "en" | "vi";
  languageExplicit: boolean;
  statsStyle: "bars" | "circles";
  hudTransparent: boolean;
  steamId: string | null;
  overlayToken: string | null;
  opacity: number;
  layout: Record<string, unknown> | null;
  panels: Record<string, boolean> | null;
  theme: OverlayTheme;
  radarBounds: { x: number; y: number; width: number; height: number } | null;
  radarSize: number;
  radarRange: number;
  radarLabels: boolean;
  radarShape: "circle" | "square";
  radarOpen: boolean;
  cursorEnabled: boolean;
  cursorKey: string;
  cursorMode: "toggle" | "hold";
  dashKey: string;
  streamerMode: boolean;
  compatMode: boolean;
};

export type OverlayState = { gameDetected: boolean; active: boolean; focused?: boolean };

export type PrimeQuest = { name: string; done: boolean };
export type PlayerMe = {
  hasData: boolean;
  steamId: string;
  name: string;
  server?: string | null;
  online?: boolean;
  species?: string | null;
  female?: boolean | null;
  growth?: number | null;
  health?: number | null;
  maxHealth?: number | null;
  hunger?: number | null;
  maxHunger?: number | null;
  thirst?: number | null;
  maxThirst?: number | null;
  stamina?: number | null;
  maxStamina?: number | null;
  nutrition?: { carb: number | null; protein: number | null; lipid: number | null };
  prime?: {
    eligible: boolean;
    elder: boolean;
    required: number;
    total: number;
    done: number;
    quests: PrimeQuest[];
  };
};
export type GarageDino = {
  id: string;
  name: string;
  species: string;
  className: string;
  gender: string;
  growth: number;
  health: number;
  hunger: number;
  thirst: number;
  stamina: number | null;
  isPrimeElder: boolean;
  parkedAt: string;
  palette: Record<string, string>;
  sellPrice: number | null;
  mutationEligible: boolean;
  pickableMutations: string[];
};
export type GarageData = {
  settings: {
    sellingEnabled: boolean;
    currencyName: string;
    liveSwap: boolean;
    selfSlayEnabled: boolean;
    mutationPickEnabled: boolean;
  };
  dinos: GarageDino[];
};
export type CommandResult = { ok: boolean; error?: string; commandId?: string; amount?: number };
export type CommandStatus = { status: "pending" | "claimed" | "done" | "failed"; error?: string | null };

export type MeshAsset = { path: string; name: string };
export type BlueprintAsset = { path: string; name: string; category: string };
export type MapCatalog = { meshes: MeshAsset[]; blueprints: BlueprintAsset[] };
export type MapObject = {
  id: string;
  kind: "mesh" | "blueprint";
  assetPath: string;
  name: string;
  locX: number;
  locY: number;
  locZ: number;
  rotPitch: number;
  rotYaw: number;
  rotRoll: number;
  scaleX: number;
  scaleY: number;
  scaleZ: number;
  placement: string;
  spawned: boolean;
  materialPath?: string;
};

export type LiveFrame = {
  steamId: string;
  hasDino: boolean;
  growth?: number;
  health?: number;
  maxHealth?: number;
  hunger?: number;
  maxHunger?: number;
  thirst?: number;
  maxThirst?: number;
  stamina?: number;
  maxStamina?: number;
  nutrition?: { carb: number; protein: number; lipid: number };
  position?: { x: number; y: number; z: number; yaw: number };
  skin?: Record<string, number>;
};

export type TrollFrame = {
  t: "troll";
  kind: "sound" | "media" | "stop" | "mic-start" | "mic-stop";
  url?: string;
  mediaType?: "image" | "video";
  volume?: number;
  durationMs?: number;
  sizePct?: number;
};

export type AuthInfo = { steamId: string | null; authed: boolean };
export type UpdaterState = { state: string; version?: string; percent?: number; message?: string };

export type ApiResult<T = unknown> = T & { error?: string; status?: number };

export type IsleOverlayBridge = {
  getSettings: () => Promise<OverlaySettings>;
  setSettings: (next: Partial<OverlaySettings>) => Promise<OverlaySettings>;
  getState: () => Promise<OverlayState>;
  setMouseIgnore: (ignore: boolean) => Promise<void>;
  onState: (cb: (s: OverlayState) => void) => () => void;
  quit: () => Promise<void>;
  steamLogin: () => Promise<{ pending: boolean }>;
  getAuth: () => Promise<AuthInfo>;
  logout: () => Promise<void>;
  onAuthChanged: (cb: (s: { steamId: string | null }) => void) => () => void;
  apiGet: <T = unknown>(pathname: string) => Promise<ApiResult<T>>;
  apiPost: <T = unknown>(pathname: string, body?: unknown) => Promise<ApiResult<T>>;
  apiGetFile: (pathname: string) => Promise<{ dataUrl?: string; error?: string; status?: number }>;
  getMapCatalog: () => Promise<MapCatalog>;
  onLive: (cb: (d: LiveFrame) => void) => () => void;
  onTicket: (cb: (frame: { type: string; ticketId?: string }) => void) => () => void;
  onTroll: (cb: (frame: TrollFrame) => void) => () => void;
  onTrollAudio: (cb: (chunk: Uint8Array) => void) => () => void;
  sendLiveSkin: (state: Record<string, number | string>) => Promise<void>;
  recordCursorKey: () => Promise<string | null>;
  recordDashKey: () => Promise<string | null>;
  setDashOpen: (open: boolean) => Promise<void>;
  onDash: (cb: (on: boolean) => void) => () => void;
  onCursor: (cb: (on: boolean) => void) => () => void;
  onBlocked: (cb: (blocked: boolean) => void) => () => void;
  onSettingsChanged: (cb: (s: OverlaySettings) => void) => () => void;
  radarToggle: () => Promise<boolean>;
  radarClose: () => Promise<void>;
  radarIsOpen: () => Promise<boolean>;
  radarGetBounds: () => Promise<{ x: number; y: number; width: number; height: number } | null>;
  radarSetBounds: (b: { x: number; y: number; width: number; height: number }) => Promise<void>;
  onRadarChanged: (cb: (d: { open: boolean }) => void) => () => void;
  updaterRestart: () => Promise<boolean>;
  updaterCheck: () => Promise<boolean>;
  updaterGetState: () => Promise<UpdaterState>;
  onUpdaterEvent: (cb: (s: UpdaterState) => void) => () => void;
};

declare global {
  const __APP_VERSION__: string;
  interface Window {
    isleOverlay: IsleOverlayBridge;
  }
}
