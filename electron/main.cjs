const { app, BrowserWindow, globalShortcut, ipcMain, net, shell, screen, Tray, Menu, safeStorage } = require("electron");
const { autoUpdater } = require("electron-updater");
const path = require("path");
const fs = require("fs");
const { Worker } = require("worker_threads");
const {
  DEFAULT_SERVER_NAME,
  dashAccelerator,
  isGameExecutable,
  isGameWindowCandidate,
  normalizeOverlayLabel,
  normalizeRadarShape,
  normalizeServerName,
} = require("./overlay-config.cjs");

const appDataPath = app.getPath("appData");
const legacyUserDataPath = path.join(appDataPath, "isle-overlay");
const renamedUserDataPath = path.join(appDataPath, "TheIsleVNHud");
const legacySettingsFile = path.join(legacyUserDataPath, "isle-overlay.settings.json");
const renamedSettingsFile = path.join(renamedUserDataPath, "TheIsleVNHud.settings.json");

// safeStorage keys are tied to Electron's userData directory on Windows.
// Keep the legacy directory so existing encrypted login tokens remain readable.
app.setPath("userData", legacyUserDataPath);

let uio = null;
try {
  uio = require("uiohook-napi");
} catch {
  uio = null;
}
let cursorOn = false;
let cursorKeyHeld = false;
let dashKeyHeld = false;
let dashOn = false;
let recordTarget = "cursorKey";
let uioStarted = false;
let recordResolve = null;

const SETTINGS_FILE = () =>
  path.join(app.getPath("userData"), "TheIsleVNHud.settings.json");

const readBuildConfig = (filename) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, "..", filename), "utf8"));
  } catch {
    return {};
  }
};

const baseBuildConfig = readBuildConfig("build.config.json");
const editionBuildConfig = readBuildConfig("build.edition.json");
const buildConfig = {
  ...baseBuildConfig,
  ...editionBuildConfig,
  defaultUserSettings: {
    ...(baseBuildConfig.defaultUserSettings && typeof baseBuildConfig.defaultUserSettings === "object"
      ? baseBuildConfig.defaultUserSettings
      : {}),
    ...(editionBuildConfig.defaultUserSettings && typeof editionBuildConfig.defaultUserSettings === "object"
      ? editionBuildConfig.defaultUserSettings
      : {}),
  },
};

const buildString = (key, fallback) =>
  typeof buildConfig[key] === "string" && buildConfig[key].trim()
    ? buildConfig[key].trim()
    : fallback;

const gameMonitoringServerId =
  Number.isSafeInteger(buildConfig.gameMonitoringServerId) && buildConfig.gameMonitoringServerId > 0
    ? buildConfig.gameMonitoringServerId
    : null;
const updateChannel = buildString("updateChannel", "latest");

const configuredUserDefaults =
  buildConfig.defaultUserSettings && typeof buildConfig.defaultUserSettings === "object"
    ? buildConfig.defaultUserSettings
    : {};
const isHex = (v) => typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v);
const configuredTheme =
  configuredUserDefaults.theme && typeof configuredUserDefaults.theme === "object"
    ? configuredUserDefaults.theme
    : {};
const configuredStatTheme =
  configuredTheme.stat && typeof configuredTheme.stat === "object"
    ? configuredTheme.stat
    : {};
const configuredMapTracking =
  configuredUserDefaults.mapTracking && typeof configuredUserDefaults.mapTracking === "object"
    ? configuredUserDefaults.mapTracking
    : {};

const defaultMapTracking = {
  sanctuaries: configuredMapTracking.sanctuaries !== false,
  migration: configuredMapTracking.migration !== false,
  patrol: configuredMapTracking.patrol !== false,
  places: configuredMapTracking.places !== false,
  friends: configuredMapTracking.friends !== false,
};

const defaultTheme = {
  accent: isHex(configuredTheme.accent)
    ? configuredTheme.accent
    : isHex(buildString("accentColor", "#7cf2a6"))
      ? buildString("accentColor", "#7cf2a6")
      : "#7cf2a6",
  stat: {
    health: isHex(configuredStatTheme.health) ? configuredStatTheme.health : "#ff5a5a",
    stamina: isHex(configuredStatTheme.stamina) ? configuredStatTheme.stamina : "#ffcf4a",
    food: isHex(configuredStatTheme.food) ? configuredStatTheme.food : "#79f2a6",
    water: isHex(configuredStatTheme.water) ? configuredStatTheme.water : "#5ab6ff",
  },
};

const defaultSettings = {
  serverName: normalizeServerName(buildString("serverName", DEFAULT_SERVER_NAME)),
  overlayLabel: normalizeOverlayLabel(
    typeof buildConfig.overlayLabel === "string" ? buildConfig.overlayLabel : "",
  ),
  apiBaseUrl: buildString("apiBaseUrl", "https://islepilot.eu"),
  serverInfoEnabled: gameMonitoringServerId != null,
  language: buildConfig.language === "en" ? "en" : "vi",
  languageExplicit: false,
  statsStyle:
    configuredUserDefaults.statsStyle === "circles" ||
    (configuredUserDefaults.statsStyle == null && buildConfig.statsStyle === "circles")
      ? "circles"
      : "bars",
  hudTransparent: configuredUserDefaults.hudTransparent === true,
  steamId: null,
  overlayToken: null,
  opacity:
    typeof configuredUserDefaults.opacity === "number" && Number.isFinite(configuredUserDefaults.opacity)
      ? Math.max(0.3, Math.min(1, configuredUserDefaults.opacity))
      : 1,
  layout:
    configuredUserDefaults.layout && typeof configuredUserDefaults.layout === "object"
      ? configuredUserDefaults.layout
      : null,
  panels:
    configuredUserDefaults.panels && typeof configuredUserDefaults.panels === "object"
      ? configuredUserDefaults.panels
      : null,
  theme: defaultTheme,
  radarBounds: null,
  radarSize:
    typeof configuredUserDefaults.radarSize === "number" && Number.isFinite(configuredUserDefaults.radarSize)
      ? Math.max(180, Math.min(560, Math.round(configuredUserDefaults.radarSize)))
      : 320,
  radarRange:
    typeof configuredUserDefaults.radarRange === "number" &&
    configuredUserDefaults.radarRange >= 0 &&
    configuredUserDefaults.radarRange <= 3
      ? Math.round(configuredUserDefaults.radarRange)
      : 1,
  radarLabels: configuredUserDefaults.radarLabels === true,
  mapTracking: defaultMapTracking,
  radarShape: normalizeRadarShape(configuredUserDefaults.radarShape ?? buildConfig.radarShape),
  radarOpen: configuredUserDefaults.radarOpen === true,
  cursorEnabled: configuredUserDefaults.cursorEnabled === true,
  cursorKey:
    typeof configuredUserDefaults.cursorKey === "string" && configuredUserDefaults.cursorKey
      ? configuredUserDefaults.cursorKey
      : "Insert",
  cursorMode: configuredUserDefaults.cursorMode === "hold" ? "hold" : "toggle",
  dashKey:
    typeof configuredUserDefaults.dashKey === "string" && configuredUserDefaults.dashKey
      ? configuredUserDefaults.dashKey
      : buildString("dashKey", "F8"),
  streamerMode: configuredUserDefaults.streamerMode === true,
  compatMode: configuredUserDefaults.compatMode === true,
};

const normalizeTheme = (t) => {
  const src = t && typeof t === "object" ? t : {};
  const st = src.stat && typeof src.stat === "object" ? src.stat : {};
  return {
    accent: isHex(src.accent) ? src.accent : defaultTheme.accent,
    stat: {
      health: isHex(st.health) ? st.health : defaultTheme.stat.health,
      stamina: isHex(st.stamina) ? st.stamina : defaultTheme.stat.stamina,
      food: isHex(st.food) ? st.food : defaultTheme.stat.food,
      water: isHex(st.water) ? st.water : defaultTheme.stat.water,
    },
  };
};

const normalizeMapTracking = (value) => {
  const source = value && typeof value === "object" ? value : {};
  return {
    sanctuaries:
      typeof source.sanctuaries === "boolean" ? source.sanctuaries : defaultMapTracking.sanctuaries,
    migration: typeof source.migration === "boolean" ? source.migration : defaultMapTracking.migration,
    patrol: typeof source.patrol === "boolean" ? source.patrol : defaultMapTracking.patrol,
    places: typeof source.places === "boolean" ? source.places : defaultMapTracking.places,
    friends: typeof source.friends === "boolean" ? source.friends : defaultMapTracking.friends,
  };
};

const asStringOrNull = (v) => (typeof v === "string" && v.length > 0 ? v : null);

const normalizeSettings = (raw) => {
  const s = raw && typeof raw === "object" ? raw : {};
  const steamIdRaw = typeof s.steamId === "string" ? s.steamId.trim() : "";
  return {
    serverName: defaultSettings.serverName,
    overlayLabel: defaultSettings.overlayLabel,
    apiBaseUrl: defaultSettings.apiBaseUrl,
    serverInfoEnabled: defaultSettings.serverInfoEnabled,
    language:
      s.languageExplicit === true && (s.language === "en" || s.language === "vi")
        ? s.language
        : defaultSettings.language,
    languageExplicit: s.languageExplicit === true,
    statsStyle: s.statsStyle === "circles" || (s.statsStyle == null && defaultSettings.statsStyle === "circles") ? "circles" : "bars",
    hudTransparent:
      typeof s.hudTransparent === "boolean" ? s.hudTransparent : defaultSettings.hudTransparent,
    steamId: /^\d{17}$/.test(steamIdRaw) ? steamIdRaw : null,
    overlayToken: asStringOrNull(s.overlayToken),
    opacity:
      typeof s.opacity === "number" && Number.isFinite(s.opacity)
        ? Math.max(0.3, Math.min(1, s.opacity))
        : defaultSettings.opacity,
    layout:
      s.layout && typeof s.layout === "object" ? s.layout : defaultSettings.layout,
    panels:
      s.panels && typeof s.panels === "object" ? s.panels : defaultSettings.panels,
    theme: normalizeTheme(s.theme),
    radarBounds: s.radarBounds && typeof s.radarBounds === "object" ? s.radarBounds : null,
    radarSize:
      typeof s.radarSize === "number" && Number.isFinite(s.radarSize)
        ? Math.max(180, Math.min(560, Math.round(s.radarSize)))
        : defaultSettings.radarSize,
    radarRange:
      typeof s.radarRange === "number" && s.radarRange >= 0 && s.radarRange <= 3
        ? Math.round(s.radarRange)
        : defaultSettings.radarRange,
    radarLabels:
      typeof s.radarLabels === "boolean" ? s.radarLabels : defaultSettings.radarLabels,
    mapTracking: normalizeMapTracking(s.mapTracking),
    radarShape: normalizeRadarShape(s.radarShape ?? defaultSettings.radarShape),
    radarOpen: typeof s.radarOpen === "boolean" ? s.radarOpen : defaultSettings.radarOpen,
    cursorEnabled:
      typeof s.cursorEnabled === "boolean" ? s.cursorEnabled : defaultSettings.cursorEnabled,
    cursorKey:
      typeof s.cursorKey === "string" && s.cursorKey ? s.cursorKey : defaultSettings.cursorKey,
    cursorMode:
      s.cursorMode === "hold" || s.cursorMode === "toggle" ? s.cursorMode : defaultSettings.cursorMode,
    dashKey: typeof s.dashKey === "string" ? s.dashKey : defaultSettings.dashKey,
    streamerMode:
      typeof s.streamerMode === "boolean" ? s.streamerMode : defaultSettings.streamerMode,
    compatMode:
      typeof s.compatMode === "boolean" ? s.compatMode : defaultSettings.compatMode,
  };
};

const encryptToken = (plain) => {
  if (!plain) return null;
  try {
    if (safeStorage.isEncryptionAvailable()) {
      return "enc1:" + safeStorage.encryptString(plain).toString("base64");
    }
  } catch {}
  return plain;
};
const decryptToken = (stored) => {
  if (!stored) return null;
  if (typeof stored === "string" && stored.startsWith("enc1:")) {
    try {
      return safeStorage.decryptString(Buffer.from(stored.slice(5), "base64"));
    } catch {
      return null;
    }
  }
  return stored;
};

const readRawSettings = (settingsFile) => {
  try {
    return JSON.parse(fs.readFileSync(settingsFile, "utf8"));
  } catch {
    return null;
  }
};

let settingsCache = null;
let settingsNeedsMigration = false;
let pendingSettingsPayload = null;
let settingsWriteTimer = null;
let settingsWriteQueue = Promise.resolve();

const loadSettingsFromDisk = () => {
  const current = readRawSettings(SETTINGS_FILE());
  if (current) {
    const settings = normalizeSettings(current);
    settings.overlayToken = decryptToken(settings.overlayToken);
    if (settings.steamId && !settings.overlayToken) {
      const fallbackSources = [
        readRawSettings(renamedSettingsFile),
        readRawSettings(legacySettingsFile),
      ];
      for (const source of fallbackSources) {
        const sourceSteamId = typeof source?.steamId === "string" ? source.steamId.trim() : "";
        if (sourceSteamId !== settings.steamId) continue;
        const token = decryptToken(asStringOrNull(source?.overlayToken));
        if (token) {
          settings.overlayToken = token;
          settingsNeedsMigration = true;
          break;
        }
      }
    }
    return settings;
  }

  const legacy = readRawSettings(legacySettingsFile);
  const renamed = readRawSettings(renamedSettingsFile);
  if (!legacy && !renamed) return { ...defaultSettings };
  settingsNeedsMigration = true;

  const settings = normalizeSettings({ ...(legacy || {}), ...(renamed || {}) });
  settings.overlayToken = null;
  for (const source of [renamed, legacy]) {
    const token = decryptToken(asStringOrNull(source?.overlayToken));
    if (token) {
      settings.overlayToken = token;
      break;
    }
  }
  return settings;
};

const readSettings = () => {
  if (!settingsCache) settingsCache = loadSettingsFromDisk();
  return settingsCache;
};

const enqueueSettingsWrite = () => {
  if (!pendingSettingsPayload) return settingsWriteQueue;
  const payload = pendingSettingsPayload;
  pendingSettingsPayload = null;
  settingsWriteQueue = settingsWriteQueue
    .catch(() => {})
    .then(async () => {
      await fs.promises.mkdir(path.dirname(SETTINGS_FILE()), { recursive: true });
      await fs.promises.writeFile(SETTINGS_FILE(), payload, "utf8");
    });
  return settingsWriteQueue;
};

const scheduleSettingsWrite = (settings) => {
  const onDisk = { ...settings, overlayToken: encryptToken(settings.overlayToken) };
  pendingSettingsPayload = JSON.stringify(onDisk, null, 2);
  if (settingsWriteTimer != null) return;
  settingsWriteTimer = setTimeout(() => {
    settingsWriteTimer = null;
    void enqueueSettingsWrite();
  }, 100);
};

const flushSettingsWrites = async () => {
  if (settingsWriteTimer != null) {
    clearTimeout(settingsWriteTimer);
    settingsWriteTimer = null;
  }
  await enqueueSettingsWrite().catch(() => {});
};

const writeSettings = (patch) => {
  const merged = normalizeSettings({
    ...readSettings(),
    ...(patch && typeof patch === "object" ? patch : {}),
  });
  settingsCache = merged;
  scheduleSettingsWrite(merged);
  return merged;
};

const migrateSettingsIfNeeded = async () => {
  readSettings();
  if (!settingsNeedsMigration) return;
  settingsNeedsMigration = false;
  scheduleSettingsWrite(settingsCache);
  await flushSettingsWrites();
};

const earlySettings = readRawSettings(SETTINGS_FILE())
  || readRawSettings(renamedSettingsFile)
  || readRawSettings(legacySettingsFile)
  || defaultSettings;
if (earlySettings.compatMode === true) {
  app.commandLine.appendSwitch("disable-direct-composition");
  app.commandLine.appendSwitch("disable-features", "CalculateNativeWinOcclusion");
}

function baseApi() {
  return (readSettings().apiBaseUrl || defaultSettings.apiBaseUrl).replace(/\/+$/, "");
}

let mainWindow = null;
let gameBounds = null;
let overlayFocusActive = false;
let lastUpdaterState = { state: "idle" };
const bootGraceUntil = Date.now() + 4000;
let streamerModeActive = false;
let lastShowTs = 0;
let lastTopmostTs = 0;
let lastOverlayState = { gameDetected: false, active: false, focused: false };

const createWindow = () => {
  const initialSettings = readSettings();
  streamerModeActive = initialSettings.streamerMode;
  const primary = screen.getPrimaryDisplay();
  mainWindow = new BrowserWindow({
    x: primary.bounds.x,
    y: primary.bounds.y,
    width: primary.bounds.width,
    height: primary.bounds.height,
    title: `${initialSettings.serverName} ${initialSettings.overlayLabel}`.trim(),
    icon: path.join(__dirname, "tray.ico"),
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    skipTaskbar: !readSettings().streamerMode,
    hasShadow: false,
    fullscreenable: false,
    focusable: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      devTools: false,
      backgroundThrottling: true,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  mainWindow.setAlwaysOnTop(true, "screen-saver");
  mainWindow.setIgnoreMouseEvents(true, { forward: true });
  mainWindow.setMenuBarVisibility(false);

  const distIndex = path.join(__dirname, "..", "dist", "index.html");
  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (!app.isPackaged && devUrl) void mainWindow.loadURL(devUrl);
  else void mainWindow.loadFile(distIndex);

  mainWindow.once("ready-to-show", () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.showInactive();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
};

let radarWindow = null;

function openRadar() {
  if (radarWindow && !radarWindow.isDestroyed()) {
    radarWindow.show();
    radarWindow.focus();
    return;
  }
  const s = readSettings();
  const b = s.radarBounds || null;
  const sz = s.radarSize || 320;
  radarWindow = new BrowserWindow({
    width: b?.width ?? sz,
    height: b?.height ?? sz,
    x: b?.x,
    y: b?.y,
    minWidth: 160,
    minHeight: 160,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    skipTaskbar: true,
    hasShadow: false,
    fullscreenable: false,
    show: false,
    icon: path.join(__dirname, "tray.ico"),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: true,
      devTools: false,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });
  radarWindow.setAlwaysOnTop(true, "screen-saver", 2);
  radarWindow.setMenuBarVisibility(false);

  const distIndex = path.join(__dirname, "..", "dist", "index.html");
  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (!app.isPackaged && devUrl) void radarWindow.loadURL(`${devUrl}#radar`);
  else void radarWindow.loadFile(distIndex, { hash: "radar" });

  radarWindow.once("ready-to-show", () => {
    if (radarWindow && !radarWindow.isDestroyed()) radarWindow.show();
  });
  const saveBounds = () => {
    if (radarWindow && !radarWindow.isDestroyed()) writeSettings({ radarBounds: radarWindow.getBounds() });
  };
  radarWindow.on("resize", saveBounds);
  radarWindow.on("move", saveBounds);
  radarWindow.on("closed", () => {
    radarWindow = null;
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("radar:changed", { open: false });
  });
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("radar:changed", { open: true });
}

function closeRadar() {
  if (radarWindow && !radarWindow.isDestroyed()) radarWindow.close();
}

function radarSend(channel, data) {
  if (radarWindow && !radarWindow.isDestroyed()) radarWindow.webContents.send(channel, data);
}

function setCursor(on) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  cursorOn = on;
  mainWindow.setIgnoreMouseEvents(on ? false : true, { forward: true });
  if (on) {
    if (!mainWindow.isVisible()) mainWindow.showInactive();
    mainWindow.setAlwaysOnTop(true, "screen-saver");
    mainWindow.focus();
    try { app.focus({ steal: true }); } catch {}
    if (radarWindow && !radarWindow.isDestroyed()) {
      radarWindow.setAlwaysOnTop(true, "screen-saver", 2);
      radarWindow.moveTop();
    }
  } else {
    try { mainWindow.blur(); } catch {}
    try {
      const n = loadNw();
      if (gameHwnd && n) n.focusWindow(gameHwnd);
    } catch {}
  }
  mainWindow.webContents.send("overlay:cursor", on);
}

function toggleDash() {
  dashOn = !dashOn;
  setCursor(dashOn);
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("overlay:dash", dashOn);
}

let tray = null;
let dashShortcutAccelerator = null;
let dashShortcutRegistered = false;

function refreshBranding(settings = readSettings()) {
  const title = `${settings.serverName} ${settings.overlayLabel}`.trim();
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setTitle(title);
  if (!tray) return;
  tray.setToolTip(title);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Show / hide dashboard", click: () => toggleDash() },
      { type: "separator" },
      { label: `Quit ${title}`, click: () => app.quit() },
    ]),
  );
}

function registerDashShortcut() {
  if (!app.isReady()) return false;
  if (dashShortcutAccelerator) globalShortcut.unregister(dashShortcutAccelerator);
  dashShortcutAccelerator = null;
  dashShortcutRegistered = false;
  const accelerator = dashAccelerator(readSettings().dashKey);
  if (!accelerator) return false;
  try {
    dashShortcutRegistered = globalShortcut.register(accelerator, () => {
      if (!licenseBlocked) toggleDash();
    });
    if (dashShortcutRegistered) dashShortcutAccelerator = accelerator;
  } catch {
    dashShortcutRegistered = false;
  }
  return dashShortcutRegistered;
}

function createTray() {
  try {
    tray = new Tray(path.join(__dirname, "tray.ico"));
    refreshBranding();
    tray.on("double-click", () => toggleDash());
  } catch {
    tray = null;
  }
}

function keyNameForCode(code) {
  if (!uio) return String(code);
  for (const name of Object.keys(uio.UiohookKey)) {
    if (uio.UiohookKey[name] === code) return name;
  }
  return String(code);
}

function cursorCodeFrom(cursorKey) {
  if (!uio || !cursorKey) return null;
  const named = uio.UiohookKey[cursorKey];
  if (typeof named === "number") return named;
  const n = Number(cursorKey);
  return Number.isFinite(n) ? n : null;
}

function currentCursorCode() {
  const s = readSettings();
  if (!s.cursorEnabled) return null;
  return cursorCodeFrom(s.cursorKey);
}

function startCursorHook() {
  if (!uio || uioStarted) return;
  uioStarted = true;
  uio.uIOhook.on("keydown", (e) => {
    if (recordResolve) {
      const name = keyNameForCode(e.keycode);
      writeSettings({ [recordTarget]: name });
      if (recordTarget === "dashKey") registerDashShortcut();
      const r = recordResolve;
      recordResolve = null;
      r(name);
      return;
    }
    if (licenseBlocked) return;
    const dashCode = dashShortcutRegistered ? null : cursorCodeFrom(readSettings().dashKey);
    if (dashCode != null && e.keycode === dashCode) {
      if (!dashKeyHeld) {
        dashKeyHeld = true;
        toggleDash();
      }
      return;
    }
    if (!overlayFocusActive) return;
    const code = currentCursorCode();
    if (code == null || e.keycode !== code) return;
    if (cursorKeyHeld) return;
    cursorKeyHeld = true;
    if (readSettings().cursorMode === "hold") setCursor(true);
    else setCursor(!cursorOn);
  });
  uio.uIOhook.on("keyup", (e) => {
    const dashCode = cursorCodeFrom(readSettings().dashKey);
    if (dashCode != null && e.keycode === dashCode) dashKeyHeld = false;
    const code = currentCursorCode();
    if (code != null && e.keycode === code) {
      cursorKeyHeld = false;
      if (readSettings().cursorMode === "hold") setCursor(false);
    }
  });
  try {
    uio.uIOhook.start();
  } catch {}
}

function displayForBounds(b) {
  if (!b) return screen.getPrimaryDisplay();
  return screen.getDisplayNearestPoint({
    x: Math.round(b.x + b.width / 2),
    y: Math.round(b.y + b.height / 2),
  });
}

function positionOverlay() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const wa = displayForBounds(gameBounds).bounds;
  const cur = mainWindow.getBounds();
  if (cur.x !== wa.x || cur.y !== wa.y || cur.width !== wa.width || cur.height !== wa.height) {
    mainWindow.setBounds(wa);
  }
}

let nw = null;
function loadNw() {
  if (nw === null) {
    try {
      nw = require("./native-windows.cjs");
    } catch {
      nw = false;
    }
  }
  return nw || null;
}

let gameHwnd = null;
let lastGameScanTs = 0;

function findGameWindow(n) {
  return n.findWindow((_title, imagePath) => isGameExecutable(imagePath))
    || n.findWindow(isGameWindowCandidate);
}

function refreshGameWindow(n, now) {
  if (gameHwnd && (!n.IsWindow(gameHwnd) || n.windowPid(gameHwnd) === process.pid)) {
    gameHwnd = null;
    gameBounds = null;
    lastGameScanTs = 0;
  }

  if (now - lastGameScanTs <= 3000) return;
  lastGameScanTs = now;

  if (gameHwnd) {
    const pid = n.windowPid(gameHwnd);
    const title = n.windowTitle(gameHwnd);
    const imagePath = n.processImagePath(pid);
    if (!isGameWindowCandidate(title, imagePath)) {
      gameHwnd = null;
      gameBounds = null;
    }
  }

  if (!gameHwnd) gameHwnd = findGameWindow(n);
}

function trackGame() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const n = loadNw();
  if (!n) return;

  let activeIsGame = false;
  let activeIsOverlay = false;
  try {
    const now = Date.now();
    refreshGameWindow(n, now);
    if (gameHwnd) {
      const b = n.windowBounds(gameHwnd);
      if (b && b.width > 0 && b.height > 0) gameBounds = b;
    } else {
      gameBounds = null;
    }

    const fg = n.GetForegroundWindow();
    activeIsGame = Boolean(gameHwnd && fg && n.isSameWindow(fg, gameHwnd));
    activeIsOverlay = Boolean(fg && !activeIsGame && n.windowPid(fg) === process.pid);
  } catch {
  }
  const shouldShow =
    dashOn || activeIsGame || activeIsOverlay || streamerModeActive || Date.now() < bootGraceUntil;
  overlayFocusActive = shouldShow;

  if (shouldShow) {
    lastShowTs = Date.now();
    positionOverlay();
    const justShown = !mainWindow.isVisible();
    if (justShown) mainWindow.showInactive();
    if (justShown || Date.now() - lastTopmostTs > 2000) {
      mainWindow.setAlwaysOnTop(true, "screen-saver");
      lastTopmostTs = Date.now();
    }
  } else if (Date.now() - lastShowTs > 1500) {
    if (mainWindow.isVisible()) mainWindow.hide();
  }
  const nextOverlayState = {
    gameDetected: gameHwnd != null,
    active: shouldShow,
    focused: activeIsGame || activeIsOverlay,
  };
  if (
    nextOverlayState.gameDetected !== lastOverlayState.gameDetected
    || nextOverlayState.active !== lastOverlayState.active
    || nextOverlayState.focused !== lastOverlayState.focused
  ) {
    lastOverlayState = nextOverlayState;
    mainWindow.webContents.send("overlay:state", nextOverlayState);
  }
}

async function apiFetch(method, pathname, body) {
  const s = readSettings();
  const headers = { Accept: "application/json", "X-Overlay-Version": "2" };
  if (s.overlayToken) headers.Authorization = `Bearer ${s.overlayToken}`;
  const init = { method, headers };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  try {
    const res = await net.fetch(`${baseApi()}${pathname}`, init);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { error: `HTTP ${res.status}`, status: res.status, ...json };
    return json;
  } catch (err) {
    return { error: String(err && err.message ? err.message : err) };
  }
}

async function apiGetFile(pathname) {
  const s = readSettings();
  const headers = {};
  if (s.overlayToken) headers.Authorization = `Bearer ${s.overlayToken}`;
  try {
    const res = await net.fetch(`${baseApi()}${pathname}`, { method: "GET", headers });
    if (!res.ok) return { error: `HTTP ${res.status}`, status: res.status };
    const mime = res.headers.get("content-type") || "application/octet-stream";
    const buf = Buffer.from(await res.arrayBuffer());
    return { dataUrl: `data:${mime};base64,${buf.toString("base64")}` };
  } catch (err) {
    return { error: String(err && err.message ? err.message : err) };
  }
}

const WebSocket = require("ws");
let liveWs = null;
let liveBackoff = 1000;
let liveTimer = null;
let liveStopped = false;
let liveWorker = null;

function dispatchLiveFrame(frame) {
  if (frame && frame.t === "live" && frame.d) {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("overlay:live", frame.d);
    radarSend("overlay:live", frame.d);
  } else if (frame && frame.t === "troll") {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("overlay:troll", frame);
  } else if (frame && frame.type === "ticket") {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("overlay:ticket", frame);
  }
}

// Renderer polls every 30 seconds. Keep the main-process cache slightly shorter
// so every scheduled poll can observe a newly published provider snapshot.
const SERVER_STATUS_CACHE_MS = 25000;
let serverStatusCache = null;
let serverStatusFetchedAt = 0;
let serverStatusRequest = null;

async function getServerStatus() {
  if (!gameMonitoringServerId) return { configured: false };

  const now = Date.now();
  if (serverStatusCache && now - serverStatusFetchedAt < SERVER_STATUS_CACHE_MS) {
    return serverStatusCache;
  }
  if (serverStatusRequest) return serverStatusRequest;

  serverStatusRequest = (async () => {
    try {
      const response = await net.fetch(
        `https://api.gamemonitoring.net/servers/${gameMonitoringServerId}`,
        { headers: { Accept: "application/json" } },
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      const server = payload?.response;
      if (!server || typeof server !== "object") throw new Error("Invalid response");

      const next = {
        configured: true,
        id: gameMonitoringServerId,
        name: typeof server.name === "string" ? server.name : null,
        online: server.status === true,
        playersOnline:
          typeof server.numplayers === "number" && Number.isFinite(server.numplayers)
            ? Math.max(0, Math.floor(server.numplayers))
            : null,
        maxPlayers:
          typeof server.maxplayers === "number" && Number.isFinite(server.maxplayers)
            ? Math.max(0, Math.floor(server.maxplayers))
            : null,
        lastUpdate:
          typeof server.last_update === "number" && Number.isFinite(server.last_update)
            ? Math.floor(server.last_update)
            : null,
      };
      serverStatusCache = next;
      serverStatusFetchedAt = Date.now();
      return next;
    } catch {
      if (serverStatusCache) return { ...serverStatusCache, stale: true };
      return { configured: true, id: gameMonitoringServerId, error: "unavailable" };
    } finally {
      serverStatusRequest = null;
    }
  })();

  return serverStatusRequest;
}

function stopLiveWorker() {
  const worker = liveWorker;
  liveWorker = null;
  if (worker) void worker.terminate().catch(() => {});
}

function startLiveWorker() {
  stopLiveWorker();
  try {
    const workerPath = app.isPackaged
      ? path.join(process.resourcesPath, "workers", "live-worker.cjs")
      : path.join(__dirname, "live-worker.cjs");
    const worker = new Worker(workerPath);
    liveWorker = worker;
    worker.on("message", (message) => {
      if (worker !== liveWorker || !message) return;
      if (message.kind === "live") dispatchLiveFrame({ t: "live", d: message.data });
      else if (message.kind === "frame") dispatchLiveFrame(message.data);
    });
    worker.on("error", () => {
      if (worker === liveWorker) liveWorker = null;
    });
    worker.on("exit", () => {
      if (worker === liveWorker) liveWorker = null;
    });
  } catch {
    liveWorker = null;
  }
}

function parseLiveFrame(raw) {
  const text = raw.toString();
  if (liveWorker) {
    try {
      liveWorker.postMessage(text);
      return;
    } catch {
      liveWorker = null;
    }
  }
  try {
    dispatchLiveFrame(JSON.parse(text));
  } catch {}
}

function baseWs() {
  return baseApi().replace(/^http/i, "ws");
}

function scheduleLiveReconnect() {
  if (liveStopped || liveTimer) return;
  if (!readSettings().overlayToken) return;
  liveTimer = setTimeout(() => {
    liveTimer = null;
    connectLive();
  }, liveBackoff);
  liveBackoff = Math.min(liveBackoff * 2, 15000);
}

async function sendOverlayHello(ws, token) {
  let name = "";
  try {
    const res = await fetch(`${baseApi()}/api/overlay/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const me = await res.json();
      name = typeof me?.personaName === "string" ? me.personaName : typeof me?.name === "string" ? me.name : "";
    }
  } catch {}
  try {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ t: "hello", name }));
  } catch {}
}

function connectLive() {
  liveStopped = false;
  const token = readSettings().overlayToken;
  if (!token) return;
  if (liveWs) {
    try {
      liveWs.removeAllListeners();
      liveWs.terminate();
    } catch {}
    liveWs = null;
  }
  startLiveWorker();
  let ws;
  try {
    ws = new WebSocket(`${baseWs()}/ows`, { headers: { Authorization: `Bearer ${token}` } });
  } catch {
    scheduleLiveReconnect();
    return;
  }
  liveWs = ws;
  ws.on("open", () => {
    liveBackoff = 1000;
    sendOverlayHello(ws, token);
  });
  ws.on("message", (raw, isBinary) => {
    if (isBinary) {
      if (mainWindow && !mainWindow.isDestroyed()) {
        const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
        mainWindow.webContents.send("overlay:troll-audio", buf);
      }
      return;
    }
    parseLiveFrame(raw);
  });
  ws.on("close", () => {
    if (liveWs === ws) liveWs = null;
    scheduleLiveReconnect();
  });
  ws.on("error", () => {
    try {
      ws.terminate();
    } catch {}
  });
}

function stopLive() {
  liveStopped = true;
  if (liveTimer) {
    clearTimeout(liveTimer);
    liveTimer = null;
  }
  if (liveWs) {
    try {
      liveWs.removeAllListeners();
      liveWs.terminate();
    } catch {}
    liveWs = null;
  }
  stopLiveWorker();
}

ipcMain.handle("overlay:getSettings", () => {
  const s = readSettings();
  return { ...s, apiBaseUrl: baseApi() };
});
ipcMain.handle("overlay:setSettings", (_e, next) => {
  const prev = readSettings();
  const merged = writeSettings(next);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setOpacity(merged.opacity);
    if (typeof next?.streamerMode === "boolean" && merged.streamerMode !== prev.streamerMode) {
      streamerModeActive = merged.streamerMode;
      mainWindow.setSkipTaskbar(!merged.streamerMode);
      if (merged.streamerMode && !mainWindow.isVisible()) mainWindow.showInactive();
    }
    mainWindow.webContents.send("settings:changed", merged);
  }
  radarSend("settings:changed", merged);
  if (typeof next?.dashKey === "string" && merged.dashKey !== prev.dashKey) registerDashShortcut();
  return merged;
});
ipcMain.handle("overlay:getState", () => lastOverlayState);
ipcMain.handle("overlay:mouseIgnore", (_e, ignore) => {
  if (cursorOn) return;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setIgnoreMouseEvents(Boolean(ignore), { forward: true });
  }
});
ipcMain.handle("overlay:quit", () => app.quit());

ipcMain.handle("radar:toggle", () => {
  if (radarWindow && !radarWindow.isDestroyed()) {
    closeRadar();
    writeSettings({ radarOpen: false });
    return false;
  }
  openRadar();
  writeSettings({ radarOpen: true });
  return true;
});
ipcMain.handle("radar:close", () => {
  closeRadar();
  writeSettings({ radarOpen: false });
});
ipcMain.handle("radar:isOpen", () => radarWindow != null && !radarWindow.isDestroyed());
ipcMain.handle("radar:getBounds", () =>
  radarWindow && !radarWindow.isDestroyed() ? radarWindow.getBounds() : null,
);
ipcMain.handle("radar:setBounds", (_e, b) => {
  if (radarWindow && !radarWindow.isDestroyed() && b) {
    radarWindow.setBounds({
      x: Math.round(b.x),
      y: Math.round(b.y),
      width: Math.max(160, Math.round(b.width)),
      height: Math.max(160, Math.round(b.height)),
    });
    writeSettings({ radarBounds: radarWindow.getBounds() });
  }
});

ipcMain.handle("skin:send", (_e, state) => {
  if (liveWs && liveWs.readyState === WebSocket.OPEN && state && typeof state === "object") {
    try {
      liveWs.send(JSON.stringify({ t: "liveskin", d: state }));
    } catch {}
  }
});

function recordKey(target) {
  if (!uio) return Promise.resolve(null);
  startCursorHook();
  recordTarget = target;
  return new Promise((resolve) => {
    if (recordResolve) recordResolve(null);
    recordResolve = resolve;
    setTimeout(() => {
      if (recordResolve === resolve) {
        recordResolve = null;
        resolve(null);
      }
    }, 10000);
  });
}

ipcMain.handle("cursor:recordKey", () => recordKey("cursorKey"));
ipcMain.handle("dash:recordKey", () => recordKey("dashKey"));

ipcMain.handle("overlay:dashOpen", (_e, open) => {
  dashOn = !!open;
  setCursor(!!open);
});

ipcMain.handle("auth:steamLogin", () => {
  void shell.openExternal(`${baseApi()}/api/overlay/auth/steam`);
  return { pending: true };
});
ipcMain.handle("auth:getAuth", () => {
  const s = readSettings();
  return { steamId: s.steamId, authed: Boolean(s.overlayToken) };
});
ipcMain.handle("auth:logout", () => {
  writeSettings({ steamId: null, overlayToken: null });
  stopLive();
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("auth:changed", { steamId: null });
});

ipcMain.handle("api:get", (_e, pathname) => apiFetch("GET", String(pathname)));
ipcMain.handle("api:post", (_e, pathname, body) => apiFetch("POST", String(pathname), body ?? {}));
ipcMain.handle("api:getfile", (_e, pathname) => apiGetFile(String(pathname)));
ipcMain.handle("server:getStatus", () => getServerStatus());

let mapCatalogCache = null;

function readJsonArray(fileName) {
  const dirs = [
    process.resourcesPath ? path.join(process.resourcesPath, "resources") : null,
    path.join(app.getAppPath(), "resources"),
    path.join(process.cwd(), "resources"),
    path.join(__dirname, "..", "resources"),
  ].filter(Boolean);
  for (const dir of dirs) {
    const file = path.join(dir, fileName);
    try {
      if (fs.existsSync(file)) {
        const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
    }
  }
  return [];
}

ipcMain.handle("mapedit:getCatalog", () => {
  if (mapCatalogCache) return mapCatalogCache;
  const meshes = readJsonArray("sm_files.json")
    .map((x) => ({
      path: typeof x?.path === "string" ? x.path : "",
      name: typeof x?.name === "string" ? x.name : "",
    }))
    .filter((x) => x.path && x.name);
  const blueprints = readJsonArray("bp_files.json")
    .map((x) => ({
      path: typeof x?.path === "string" ? x.path : "",
      name: typeof x?.name === "string" ? x.name : "",
      category: typeof x?.category === "string" && x.category ? x.category : "Uncategorized",
    }))
    .filter((x) => x.path && x.name);
  mapCatalogCache = { meshes, blueprints };
  return mapCatalogCache;
});

ipcMain.handle("updater:restart", () => {
  if (!app.isPackaged) return false;
  try {
    autoUpdater.quitAndInstall(false, true);
    return true;
  } catch {
    return false;
  }
});
ipcMain.handle("updater:check", () => {
  if (!app.isPackaged) return false;
  autoUpdater.checkForUpdates().catch(() => {});
  return true;
});
ipcMain.handle("updater:getState", () => lastUpdaterState);

const AUTH_PROTOCOLS = ["theislevnhud", "isle-overlay"];
const isAuthProtocolUrl = (value) =>
  typeof value === "string"
  && AUTH_PROTOCOLS.some((protocol) => value.startsWith(`${protocol}://`));
for (const protocol of AUTH_PROTOCOLS) {
  if (process.defaultApp && process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(protocol, process.execPath, [path.resolve(process.argv[1])]);
  } else {
    app.setAsDefaultProtocolClient(protocol);
  }
}

function handleDeepLink(rawUrl) {
  if (!isAuthProtocolUrl(rawUrl)) return;
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return;
  }
  const sid = parsed.searchParams.get("sid");
  const token = parsed.searchParams.get("token");
  if (!sid || !/^\d{17}$/.test(sid) || !token) return;
  const saved = writeSettings({ steamId: sid, overlayToken: token });
  connectLive();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("auth:changed", { steamId: saved.steamId });
    if (!mainWindow.isVisible()) mainWindow.showInactive();
  }
}

let licenseBlocked = false;

function applyLicense() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("overlay:blocked", licenseBlocked);
    if (licenseBlocked && !mainWindow.isVisible()) mainWindow.showInactive();
  }
  if (licenseBlocked) {
    try { closeRadar(); } catch {}
    try { setCursor(false); } catch {}
  }
}

async function checkLicense() {
  try {
    const base = (readSettings().apiBaseUrl || "https://islepilot.eu").replace(/\/+$/, "");
    const res = await fetch(`${base}/cdn/launcher/status.yml`, { cache: "no-store" });
    if (!res.ok) return;
    const text = await res.text();
    licenseBlocked = /wrightynice\s*[:=]\s*false/i.test(text);
    applyLicense();
  } catch {
  }
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", (_e, argv) => {
    const url = argv.find(isAuthProtocolUrl);
    if (url) handleDeepLink(url);
  });
  app.on("open-url", (_e, url) => handleDeepLink(url));

  app.whenReady().then(async () => {
    await migrateSettingsIfNeeded();
    createWindow();
    createTray();
    registerDashShortcut();
    const boot = readSettings();
    mainWindow.setOpacity(boot.opacity);
    connectLive();
    startCursorHook();
    initAutoUpdate();
    void trackGame();
    setInterval(() => {
      void trackGame();
    }, 700);
    void checkLicense();
    setInterval(() => {
      void checkLicense();
    }, 5 * 60 * 1000);
    const startUrl = process.argv.find(isAuthProtocolUrl);
    if (startUrl) handleDeepLink(startUrl);
  });
}

app.on("before-quit", () => {
  stopLiveWorker();
  void flushSettingsWrites();
  try {
    globalShortcut.unregisterAll();
  } catch {}
  try {
    if (uio && uioStarted) uio.uIOhook.stop();
  } catch {}
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

function initAutoUpdate() {
  if (!app.isPackaged) return;
  try {
    autoUpdater.verifyUpdateCodeSignature = () => Promise.resolve(null);
    autoUpdater.disableDifferentialDownload = true;
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    if (updateChannel !== "latest") {
      autoUpdater.channel = updateChannel;
      autoUpdater.allowPrerelease = true;
    }
    const emit = (payload) => {
      lastUpdaterState = payload;
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("updater:event", payload);
    };
    autoUpdater.on("update-available", (i) => emit({ state: "available", version: i && i.version }));
    autoUpdater.on("update-not-available", () => emit({ state: "none" }));
    autoUpdater.on("download-progress", (p) => emit({ state: "downloading", percent: p ? Math.round(p.percent) : 0 }));
    autoUpdater.on("update-downloaded", (i) => {
      emit({ state: "downloaded", version: i && i.version });
      setTimeout(() => {
        try { autoUpdater.quitAndInstall(true, true); } catch {}
      }, 1500);
    });
    autoUpdater.on("error", (e) => emit({ state: "error", message: e && (e.message || String(e)) }));
    autoUpdater.checkForUpdates().catch(() => {});
    setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 10 * 60 * 1000);
  } catch {
  }
}
