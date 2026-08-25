const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("isleOverlay", {
  getSettings: () => ipcRenderer.invoke("overlay:getSettings"),
  setSettings: (next) => ipcRenderer.invoke("overlay:setSettings", next),

  getState: () => ipcRenderer.invoke("overlay:getState"),
  setMouseIgnore: (ignore) => ipcRenderer.invoke("overlay:mouseIgnore", ignore),
  onState: (cb) => {
    const h = (_e, s) => cb(s);
    ipcRenderer.on("overlay:state", h);
    return () => ipcRenderer.removeListener("overlay:state", h);
  },
  quit: () => ipcRenderer.invoke("overlay:quit"),

  steamLogin: () => ipcRenderer.invoke("auth:steamLogin"),
  getAuth: () => ipcRenderer.invoke("auth:getAuth"),
  logout: () => ipcRenderer.invoke("auth:logout"),
  onAuthChanged: (cb) => {
    const h = (_e, s) => cb(s);
    ipcRenderer.on("auth:changed", h);
    return () => ipcRenderer.removeListener("auth:changed", h);
  },

  apiGet: (pathname) => ipcRenderer.invoke("api:get", pathname),
  apiPost: (pathname, body) => ipcRenderer.invoke("api:post", pathname, body),
  apiGetFile: (pathname) => ipcRenderer.invoke("api:getfile", pathname),
  getServerStatus: () => ipcRenderer.invoke("server:getStatus"),

  getMapCatalog: () => ipcRenderer.invoke("mapedit:getCatalog"),

  onLive: (cb) => {
    const h = (_e, d) => cb(d);
    ipcRenderer.on("overlay:live", h);
    return () => ipcRenderer.removeListener("overlay:live", h);
  },

  onTicket: (cb) => {
    const h = (_e, frame) => cb(frame);
    ipcRenderer.on("overlay:ticket", h);
    return () => ipcRenderer.removeListener("overlay:ticket", h);
  },

  onTroll: (cb) => {
    const h = (_e, frame) => cb(frame);
    ipcRenderer.on("overlay:troll", h);
    return () => ipcRenderer.removeListener("overlay:troll", h);
  },
  onTrollAudio: (cb) => {
    const h = (_e, chunk) => cb(chunk);
    ipcRenderer.on("overlay:troll-audio", h);
    return () => ipcRenderer.removeListener("overlay:troll-audio", h);
  },

  sendLiveSkin: (state) => ipcRenderer.invoke("skin:send", state),
  recordCursorKey: () => ipcRenderer.invoke("cursor:recordKey"),
  recordDashKey: () => ipcRenderer.invoke("dash:recordKey"),
  setDashOpen: (open) => ipcRenderer.invoke("overlay:dashOpen", open),
  onDash: (cb) => {
    const h = (_e, on) => cb(on);
    ipcRenderer.on("overlay:dash", h);
    return () => ipcRenderer.removeListener("overlay:dash", h);
  },
  onCursor: (cb) => {
    const h = (_e, on) => cb(on);
    ipcRenderer.on("overlay:cursor", h);
    return () => ipcRenderer.removeListener("overlay:cursor", h);
  },
  onBlocked: (cb) => {
    const h = (_e, blocked) => cb(blocked);
    ipcRenderer.on("overlay:blocked", h);
    return () => ipcRenderer.removeListener("overlay:blocked", h);
  },

  onSettingsChanged: (cb) => {
    const h = (_e, s) => cb(s);
    ipcRenderer.on("settings:changed", h);
    return () => ipcRenderer.removeListener("settings:changed", h);
  },

  radarToggle: () => ipcRenderer.invoke("radar:toggle"),
  radarClose: () => ipcRenderer.invoke("radar:close"),
  radarIsOpen: () => ipcRenderer.invoke("radar:isOpen"),
  radarGetBounds: () => ipcRenderer.invoke("radar:getBounds"),
  radarSetBounds: (b) => ipcRenderer.invoke("radar:setBounds", b),
  onRadarChanged: (cb) => {
    const h = (_e, d) => cb(d);
    ipcRenderer.on("radar:changed", h);
    return () => ipcRenderer.removeListener("radar:changed", h);
  },

  updaterRestart: () => ipcRenderer.invoke("updater:restart"),
  updaterCheck: () => ipcRenderer.invoke("updater:check"),
  updaterGetState: () => ipcRenderer.invoke("updater:getState"),
  onUpdaterEvent: (cb) => {
    const h = (_e, s) => cb(s);
    ipcRenderer.on("updater:event", h);
    return () => ipcRenderer.removeListener("updater:event", h);
  },
});
