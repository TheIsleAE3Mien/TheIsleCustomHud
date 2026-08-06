"use strict";

const koffi = require("koffi");

const user32 = koffi.load("user32.dll");
const kernel32 = koffi.load("kernel32.dll");

const HWND = koffi.pointer("HWND", koffi.opaque());

const GetForegroundWindow = user32.func("HWND __stdcall GetForegroundWindow()");
const GetWindowThreadProcessId = user32.func(
  "uint32 __stdcall GetWindowThreadProcessId(HWND hwnd, _Out_ uint32 *pid)",
);
const IsWindow = user32.func("int __stdcall IsWindow(HWND hwnd)");
const IsWindowVisible = user32.func("int __stdcall IsWindowVisible(HWND hwnd)");
const GetWindowTextW = user32.func(
  "int __stdcall GetWindowTextW(HWND hwnd, _Out_ char16 *buf, int max)",
);
const GetWindowRect = user32.func(
  "int __stdcall GetWindowRect(HWND hwnd, _Out_ int32 *rect)",
);
const EnumWindowsProc = koffi.proto("int __stdcall EnumWindowsProc(HWND hwnd, intptr lparam)");
const EnumWindows = user32.func(
  "int __stdcall EnumWindows(EnumWindowsProc *cb, intptr lparam)",
);

const OpenProcess = kernel32.func("intptr __stdcall OpenProcess(uint32 access, int inherit, uint32 pid)");
const CloseHandle = kernel32.func("int __stdcall CloseHandle(intptr handle)");
const QueryFullProcessImageNameW = kernel32.func(
  "int __stdcall QueryFullProcessImageNameW(intptr handle, uint32 flags, _Out_ char16 *buf, _Inout_ uint32 *size)",
);

const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;

function windowPid(hwnd) {
  const out = [0];
  GetWindowThreadProcessId(hwnd, out);
  return out[0];
}

function processImagePath(pid) {
  if (!pid) return "";
  const handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
  if (!handle) return "";
  try {
    const buf = Buffer.alloc(1040);
    const size = [520];
    const ok = QueryFullProcessImageNameW(handle, 0, buf, size);
    if (!ok) return "";
    return buf.toString("utf16le", 0, size[0] * 2);
  } catch {
    return "";
  } finally {
    CloseHandle(handle);
  }
}

function windowTitle(hwnd) {
  const buf = Buffer.alloc(512);
  const n = GetWindowTextW(hwnd, buf, 256);
  return n > 0 ? buf.toString("utf16le", 0, n * 2) : "";
}

function windowBounds(hwnd) {
  const rect = [0, 0, 0, 0];
  if (!GetWindowRect(hwnd, rect)) return null;
  return { x: rect[0], y: rect[1], width: rect[2] - rect[0], height: rect[3] - rect[1] };
}

function findWindow(matcher) {
  let found = null;
  const cb = koffi.register((hwnd, _lparam) => {
    if (!IsWindowVisible(hwnd)) return 1;
    const title = windowTitle(hwnd);
    if (!title) return 1;
    const path = processImagePath(windowPid(hwnd));
    if (matcher(title.toLowerCase(), path.toLowerCase())) {
      found = hwnd;
      return 0;
    }
    return 1;
  }, "EnumWindowsProc *");
  try {
    EnumWindows(cb, 0);
  } finally {
    koffi.unregister(cb);
  }
  return found;
}

function hwndFromBuffer(buf) {
  if (!buf || buf.length < 8) return null;
  return koffi.decode(buf, "HWND");
}

function isSameWindow(a, b) {
  if (!a || !b) return false;
  return koffi.address(a) === koffi.address(b);
}

module.exports = {
  GetForegroundWindow,
  IsWindow,
  windowPid,
  processImagePath,
  windowTitle,
  windowBounds,
  findWindow,
  hwndFromBuffer,
  isSameWindow,
};
