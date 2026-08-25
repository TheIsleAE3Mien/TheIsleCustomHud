const DEFAULT_SERVER_NAME = "TheBurntIsle";

function normalizeServerName(value) {
  if (typeof value !== "string") return DEFAULT_SERVER_NAME;
  const clean = value.replace(/[\x00-\x1f\x7f]+/g, " ").replace(/\s+/g, " ").trim();
  return clean ? clean.slice(0, 48) : DEFAULT_SERVER_NAME;
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

module.exports = {
  DEFAULT_SERVER_NAME,
  dashAccelerator,
  normalizeRadarShape,
  normalizeServerName,
};
