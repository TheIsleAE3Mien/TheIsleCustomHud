const DEFAULT_SERVER_NAME = "TheIsleVNHud";

function normalizeServerName(value) {
  if (typeof value !== "string") return DEFAULT_SERVER_NAME;
  const clean = value.replace(/[\x00-\x1f\x7f]+/g, " ").replace(/\s+/g, " ").trim();
  return clean ? clean.slice(0, 48) : DEFAULT_SERVER_NAME;
}

function normalizeOverlayLabel(value) {
  if (typeof value !== "string") return "";
  const clean = value.replace(/[\x00-\x1f\x7f]+/g, " ").replace(/\s+/g, " ").trim();
  return clean.slice(0, 24);
}

function normalizeRadarShape(value) {
  return value === "square" ? "square" : "circle";
}

function dashAccelerator(value) {
  if (typeof value !== "string") return null;
  if (/^F(?:[1-9]|1\d|2[0-4])$/.test(value)) return value;
  const named = {
    Insert: "Insert",
    Home: "Home",
    End: "End",
    PageUp: "PageUp",
    PageDown: "PageDown",
    Delete: "Delete",
    CapsLock: "Capslock",
    Backquote: "`",
  };
  return named[value] ?? null;
}

function isGameExecutable(imagePath) {
  const normalizedPath = typeof imagePath === "string" ? imagePath.trim() : "";
  return /(?:^|[\\/])(?:theisle|theisleclient-win64-shipping)\.exe$/i.test(normalizedPath);
}

function isGameWindowCandidate(title, imagePath) {
  if (isGameExecutable(imagePath)) return true;

  const normalizedPath = typeof imagePath === "string" ? imagePath.trim() : "";
  if (normalizedPath) return false;

  const normalizedTitle = typeof title === "string"
    ? title.replace(/\s+/g, "").trim()
    : "";
  return /^theisle$/i.test(normalizedTitle);
}

module.exports = {
  DEFAULT_SERVER_NAME,
  dashAccelerator,
  isGameExecutable,
  isGameWindowCandidate,
  normalizeOverlayLabel,
  normalizeRadarShape,
  normalizeServerName,
};
