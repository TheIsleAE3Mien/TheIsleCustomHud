import { useEffect, useRef, useState } from "react";
import type React from "react";

function hexToRgb(hex: string) {
  const h = hex.replace("#", "");
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}
function rgbToHex(r: number, g: number, b: number) {
  const c = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}
function rgbToHsv(r: number, g: number, b: number) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}
function hsvToRgb(h: number, s: number, v: number) {
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; } else if (h < 120) { r = x; g = c; } else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; } else if (h < 300) { r = x; b = c; } else { r = c; b = x; }
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
}

function Popover({ value, onChange, onClose, flipUp }: { value: string; onChange: (hex: string) => void; onClose: () => void; flipUp: boolean }) {
  const init = rgbToHsv(...(Object.values(hexToRgb(value)) as [number, number, number]));
  const [hsv, setHsv] = useState(init);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [onClose]);

  function emit(next: { h: number; s: number; v: number }) {
    setHsv(next);
    const { r, g, b } = hsvToRgb(next.h, next.s, next.v);
    onChange(rgbToHex(r, g, b));
  }

  function svDown(e: React.PointerEvent) {
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    svMove(e);
  }
  function svMove(e: React.PointerEvent) {
    if (e.buttons === 0 && e.type === "pointermove") return;
    const rect = e.currentTarget.getBoundingClientRect();
    const s = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const v = Math.max(0, Math.min(1, 1 - (e.clientY - rect.top) / rect.height));
    emit({ ...hsv, s, v });
  }
  function hueDown(e: React.PointerEvent) {
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    hueMove(e);
  }
  function hueMove(e: React.PointerEvent) {
    if (e.buttons === 0 && e.type === "pointermove") return;
    const rect = e.currentTarget.getBoundingClientRect();
    const h = Math.max(0, Math.min(360, ((e.clientX - rect.left) / rect.width) * 360));
    emit({ ...hsv, h });
  }

  const hueColor = (() => {
    const { r, g, b } = hsvToRgb(hsv.h, 1, 1);
    return rgbToHex(r, g, b);
  })();

  return (
    <div
      ref={ref}
      style={{ ...pop, ...(flipUp ? { bottom: "100%", marginBottom: 6 } : { top: "100%", marginTop: 6 }) }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div
        onPointerDown={svDown}
        onPointerMove={svMove}
        style={{
          position: "relative",
          width: "100%",
          height: 100,
          borderRadius: 6,
          cursor: "crosshair",
          background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${hueColor})`,
          touchAction: "none",
        }}
      >
        <div style={{ position: "absolute", left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, width: 12, height: 12, marginLeft: -6, marginTop: -6, borderRadius: "50%", border: "2px solid #fff", boxShadow: "0 0 2px #000", pointerEvents: "none" }} />
      </div>
      <div
        onPointerDown={hueDown}
        onPointerMove={hueMove}
        style={{
          position: "relative",
          width: "100%",
          height: 14,
          marginTop: 8,
          borderRadius: 7,
          cursor: "ew-resize",
          background: "linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)",
          touchAction: "none",
        }}
      >
        <div style={{ position: "absolute", left: `${(hsv.h / 360) * 100}%`, top: "50%", width: 14, height: 14, marginLeft: -7, marginTop: -7, borderRadius: "50%", border: "2px solid #fff", boxShadow: "0 0 2px #000", pointerEvents: "none" }} />
      </div>
    </div>
  );
}

export function ColorSwatch({
  value,
  onChange,
  size = 58,
  label,
}: {
  value: string;
  onChange: (hex: string) => void;
  size?: number;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [flipUp, setFlipUp] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  function toggle() {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      let p: HTMLElement | null = btnRef.current.parentElement;
      let bottom = window.innerHeight;
      while (p) {
        const oy = getComputedStyle(p).overflowY;
        if (oy === "auto" || oy === "scroll") {
          bottom = p.getBoundingClientRect().bottom;
          break;
        }
        p = p.parentElement;
      }
      setFlipUp(bottom - r.bottom < 210);
    }
    setOpen((o) => !o);
  }
  return (
    <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: 7 }}>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          background: value,
          border: "2px solid rgba(255,255,255,0.16)",
          boxShadow: "0 3px 10px rgba(0,0,0,0.45), inset 0 0 0 1px rgba(0,0,0,0.35)",
          cursor: "pointer",
          padding: 0,
        }}
        aria-label={label}
      />
      {label ? <span style={{ fontSize: 10, color: "var(--muted)", fontFamily: "var(--mono)" }}>{label}</span> : null}
      {open ? <Popover value={value} onChange={onChange} onClose={() => setOpen(false)} flipUp={flipUp} /> : null}
    </div>
  );
}

const pop: React.CSSProperties = {
  position: "absolute",
  top: "100%",
  left: "50%",
  transform: "translateX(-50%)",
  marginTop: 6,
  zIndex: 50,
  width: 150,
  padding: 8,
  borderRadius: 8,
  background: "var(--panel, #0a0f0c)",
  border: "1px solid var(--line, #1b2a1f)",
  boxShadow: "0 12px 30px rgba(0,0,0,0.6)",
};
