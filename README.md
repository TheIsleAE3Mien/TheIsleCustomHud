# IsleOverlay

In-game overlay for The Isle. An Electron desktop app that draws a
click-through HUD on top of the game: your dinosaur's vitals and nutrition,
prime status, a draggable radar/live map, a garage view, and an admin mode. It
reads data from the IslePilot backend over HTTP and a live-feed WebSocket, and
signs in through Steam.

## Stack

- Electron main process (`electron/`) — transparent click-through overlay
  window, radar window, active-window detection to show/hide over the game,
  Steam login deep-link, HTTP/WS passthrough (the bearer token stays in the main
  process and never reaches the renderer).
- React + TypeScript renderer (`src/`), bundled with Vite.
- `resources/` holds static game asset lists (blueprints, materials, meshes)
  used by the map editor.

## Develop

```bash
npm install
npm run dev        # Vite dev server + Electron
npm run typecheck  # tsc, no emit
```

## Build

```bash
npm run build      # type-check + Vite production build into dist/
npm run dist       # full electron-builder installer
npm run pack       # unpacked build (dir only)
```
