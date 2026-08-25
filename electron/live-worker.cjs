const { parentPort } = require("worker_threads");

const LIVE_EMIT_INTERVAL_MS = 50;

let pendingLive = null;
let liveTimer = null;

function flushLive() {
  liveTimer = null;
  if (!pendingLive) return;
  const data = pendingLive;
  pendingLive = null;
  parentPort.postMessage({ kind: "live", data });
}

parentPort.on("message", (raw) => {
  let frame;
  try {
    frame = JSON.parse(raw);
  } catch {
    return;
  }

  if (frame && frame.t === "live" && frame.d) {
    pendingLive = frame.d;
    if (liveTimer == null) liveTimer = setTimeout(flushLive, LIVE_EMIT_INTERVAL_MS);
    return;
  }

  parentPort.postMessage({ kind: "frame", data: frame });
});
