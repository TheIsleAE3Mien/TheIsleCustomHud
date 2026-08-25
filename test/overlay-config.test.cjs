const test = require("node:test");
const assert = require("node:assert/strict");

const {
  dashAccelerator,
  normalizeRadarShape,
  normalizeServerName,
} = require("../electron/overlay-config.cjs");

test("server name is trimmed, sanitized, and limited", () => {
  assert.equal(normalizeServerName("  My Isle Server  "), "My Isle Server");
  assert.equal(normalizeServerName("My\nServer\tName"), "My Server Name");
  assert.equal(normalizeServerName("x".repeat(80)).length, 48);
});

test("server name falls back when it is empty", () => {
  assert.equal(normalizeServerName("   "), "TheBurntIsle");
  assert.equal(normalizeServerName(null), "TheBurntIsle");
});

test("radar shape accepts square and defaults to circle", () => {
  assert.equal(normalizeRadarShape("square"), "square");
  assert.equal(normalizeRadarShape("circle"), "circle");
  assert.equal(normalizeRadarShape("triangle"), "circle");
});

test("dashboard keys convert to Electron accelerators", () => {
  assert.equal(dashAccelerator("F8"), "F8");
  assert.equal(dashAccelerator("PageUp"), "PageUp");
  assert.equal(dashAccelerator("CapsLock"), "Capslock");
  assert.equal(dashAccelerator("Backquote"), "`");
  assert.equal(dashAccelerator("not-a-key"), null);
});
