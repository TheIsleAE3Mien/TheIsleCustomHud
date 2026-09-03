# TheIsleCustomHud project instructions

Read `E:\TheIsle\AGENTS.md`, this file and `README.md` before changing this
repository.

## Product and edition boundary

- `main` is the generic `TheIsleCustomHud` edition. It must not contain
  AE3Miền branding, updater channel or GameMonitoring server ID.
- `ae3mien` is the Anh Em 3 Miền-only `TheIsleVNHud` edition and uses server ID
  `14040695` plus its own updater/release channel.
- Preserve attribution and history from `reversum/isle-overlay`. Do not claim a
  new license for upstream code or remove `LICENSE`/`THIRD_PARTY_NOTICES.md`.
- Do not move Launcher, Panel, Plugin or Voice responsibilities into this app.

## Security and data

- Steam/auth token and native access stay in Electron main/preload boundaries;
  renderer must not receive raw secrets or unrestricted Node/filesystem access.
- Never commit tokens, machine paths, detached-window coordinates, user settings,
  diagnostics, `.env` files or production credentials.
- Generic defaults keep `gameMonitoringServerId: null`; edition-specific values
  belong in their edition branch/config only.

## Development rules

- Preserve the existing Electron/React/TypeScript style and player-facing
  Vietnamese copy. Keep mock/development state visibly labelled.
- Do not add unit tests unless the user explicitly requests them. Use existing
  typecheck, build and targeted smoke workflows.
- For UI/UX work, apply the workspace-required design skill and verify the
  affected desktop/viewport behavior.
- Preserve unrelated dirty work. Customization stays local, uncommitted,
  unpushed and undeployed until the user explicitly approves publishing.

## Repository hygiene

- Commit source, docs, edition definitions, required assets and release notes.
- Do not commit `node_modules`, `dist`, `release`, any `release-*` packaging
  directory, installers, blockmaps, logs, local `.env` or `build.edition.json`.
- Old packaging directories are regenerable disk output, not source of truth.

## Verification and release

```powershell
npm ci
npm run typecheck
npm run build
npm run dist -- --publish never
```

Validate UTF-8, mojibake, unnecessary Unicode escapes and secrets in changed
text. Confirm the active branch/edition and inspect the installer name/channel.
Do not commit, push, tag or publish a GitHub Release until the user approves the
tested local result.
