import * as THREE from "three";


export type ColorState = {
  maleColor: string;
  highColor: string;
  midColor: string;
  mid2Color: string;
  lowColor: string;
  bottomColor: string;
  eyeColor: string;
  teethColor: string;
  mouthColor: string;
  clawsColor: string;
};

export type GlitchState = Partial<Record<keyof ColorState, string>>;

export type OverlayChannel = { color: string; alpha: number };

export type GlitchTuning = {
  bleedReach: number;
  juviErosion: number;
  darkBleed: number;
  juviOpacity: number;
  juviTint: string;
};

export const DEFAULT_GLITCH_TUNING: GlitchTuning = {
  bleedReach: 0.5,
  juviErosion: 0,
  darkBleed: 0,
  juviOpacity: 1,
  juviTint: "#ffffff",
};

const ZONE_REFERENCE_COLORS: Record<
  string,
  { r: number; g: number; b: number }
> = {
  maleColor: { r: 255, g: 0, b: 0 },
  bottomColor: { r: 0, g: 255, b: 0 },
  highColor: { r: 0, g: 1, b: 245 },
  lowColor: { r: 0, g: 255, b: 241 },
  midColor: { r: 255, g: 0, b: 255 },
  mid2Color: { r: 255, g: 255, b: 0 },
};

const ZONE_REF_BY_INDEX: Array<{ r: number; g: number; b: number }> = [
  { r: 255, g: 0, b: 0 },
  { r: 0, g: 255, b: 0 },
  { r: 0, g: 1, b: 245 },
  { r: 0, g: 255, b: 241 },
  { r: 255, g: 0, b: 255 },
  { r: 255, g: 255, b: 0 },
];

export const COLOR_KEY_TO_ZONE_INDEX: Record<string, number> = {
  maleColor: 1,
  bottomColor: 2,
  highColor: 3,
  lowColor: 4,
  midColor: 5,
  mid2Color: 6,
};

export const JSON_KEY_TO_COLOR: Record<string, keyof ColorState> = {
  md: "maleColor",
  f: "highColor",
  m: "midColor",
  d1: "mid2Color",
  b: "lowColor",
  u: "bottomColor",
  e: "eyeColor",
};

export function parseXYZ(xyzStr: string): { X: number; Y: number; Z: number } {
  const matches = xyzStr.match(/X=([-\d.]+),Y=([-\d.]+),Z=([-\d.]+)/);
  if (!matches) return { X: 0, Y: 0, Z: 0 };
  return {
    X: parseFloat(matches[1]),
    Y: parseFloat(matches[2]),
    Z: parseFloat(matches[3]),
  };
}

export function hexToLinearRGB(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const toLinear = (c: number) =>
    c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  return [toLinear(r), toLinear(g), toLinear(b)];
}

export interface PatternBleedInfo {
  bleedColor: [number, number, number];
  erosionPx: number;
}

const BLEED_SUPER_NEG_THRESHOLD = 2 ** 24;

export function getPatternBleedInfo(xyzStr: string): PatternBleedInfo | null {
  const { X, Y, Z } = parseXYZ(xyzStr);
  const vals = [X, Y, Z];
  const absVals = vals.map((v) => Math.abs(v));
  const maxAbs = Math.max(...absVals);
  if (maxAbs < BLEED_SUPER_NEG_THRESHOLD) return null;
  const maxIdx = absVals.indexOf(maxAbs);
  if (vals[maxIdx] >= 0) return null;
  const superNegCount = absVals.filter(
    (v) => v >= BLEED_SUPER_NEG_THRESHOLD,
  ).length;
  if (superNegCount === 3) return null;
  const erosionPx = Math.max(0, 27 - Math.log2(maxAbs));
  const bleedColor: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    if (absVals[i] < BLEED_SUPER_NEG_THRESHOLD) {
      bleedColor[i] = Math.max(0, vals[i]);
    }
  }
  return { bleedColor, erosionPx };
}

const LINE_BLEED_RATIO = 10;
const LINE_BLEED_MAX = 99999;

function computeLineBleed(
  X: number,
  Y: number,
  Z: number,
): { color: [number, number, number]; radius: number } | null {
  const ax = Math.abs(X),
    ay = Math.abs(Y),
    az = Math.abs(Z);
  const sorted = [ax, ay, az].sort((a, b) => b - a);
  const maxAbs = sorted[0],
    secondAbs = sorted[1];
  if (maxAbs <= 1) return null;
  if (maxAbs / Math.max(secondAbs, 1) < LINE_BLEED_RATIO) return null;
  const nx = X < 0 ? ax : 0;
  const ny = Y < 0 ? ay : 0;
  const nz = Z < 0 ? az : 0;
  const maxNeg = Math.max(nx, ny, nz);
  if (maxNeg === 0) return null;
  if (maxNeg > LINE_BLEED_MAX) return null;
  return {
    color: [1 - nx / maxNeg, 1 - ny / maxNeg, 1 - nz / maxNeg],
    radius: 1,
  };
}

export function getDisplayColors(
  colors: ColorState,
  glitchValues: GlitchState,
): ColorState {
  const result = { ...colors };
  const toHex = (r: number, g: number, b: number) =>
    `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b
      .toString(16)
      .padStart(2, "0")}`;
  for (const [colorKey, glitchStr] of Object.entries(glitchValues)) {
    if (!glitchStr) continue;
    const bleedInfo = getPatternBleedInfo(glitchStr);
    if (bleedInfo) {
      result[colorKey as keyof ColorState] = toHex(
        Math.round(bleedInfo.bleedColor[0] * 255),
        Math.round(bleedInfo.bleedColor[1] * 255),
        Math.round(bleedInfo.bleedColor[2] * 255),
      );
    } else {
      const { X, Y, Z } = parseXYZ(glitchStr);
      const maxVal = Math.max(X, Y, Z, 1.0);
      result[colorKey as keyof ColorState] = toHex(
        Math.min(255, Math.max(0, Math.round((X / maxVal) * 255))),
        Math.min(255, Math.max(0, Math.round((Y / maxVal) * 255))),
        Math.min(255, Math.max(0, Math.round((Z / maxVal) * 255))),
      );
    }
  }
  return result;
}

export function bakeNormalMap(
  baseTexture: THREE.Texture,
  detailTexture: THREE.Texture,
  detailScale = 12,
  flipY = true,
): THREE.Texture {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Failed to get 2D context");
  const baseImg = baseTexture.image as HTMLImageElement;
  const W = baseImg.width,
    H = baseImg.height;
  canvas.width = W;
  canvas.height = H;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(baseImg, 0, 0);
  const baseData = ctx.getImageData(0, 0, W, H).data;

  const detailImg = detailTexture.image as HTMLImageElement;
  const dW = detailImg.width,
    dH = detailImg.height;
  const dCanvas = document.createElement("canvas");
  dCanvas.width = dW;
  dCanvas.height = dH;
  const dCtx = dCanvas.getContext("2d")!;
  dCtx.imageSmoothingEnabled = false;
  dCtx.drawImage(detailImg, 0, 0);
  const detailData = dCtx.getImageData(0, 0, dW, dH).data;

  const out = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const bi = (y * W + x) * 4;
      const bx = (baseData[bi] / 255) * 2 - 1;
      const by = (baseData[bi + 1] / 255) * 2 - 1;
      const bz = (baseData[bi + 2] / 255) * 2 - 1;
      const dx = Math.floor(((((x / W) * detailScale) % 1) + 1) % 1 * dW);
      const dy = Math.floor(((((y / H) * detailScale) % 1) + 1) % 1 * dH);
      const di = (dy * dW + dx) * 4;
      const dnx = (detailData[di] / 255) * 2 - 1;
      const dny = (detailData[di + 1] / 255) * 2 - 1;
      const rx = bx + dnx,
        ry = by + dny,
        rz = bz;
      const len = Math.sqrt(rx * rx + ry * ry + rz * rz) || 1;
      out[bi] = Math.round(((rx / len) * 0.5 + 0.5) * 255);
      out[bi + 1] = Math.round(((ry / len) * 0.5 + 0.5) * 255);
      out[bi + 2] = Math.round(((rz / len) * 0.5 + 0.5) * 255);
      out[bi + 3] = 255;
    }
  }
  ctx.putImageData(new ImageData(out, W, H), 0, 0);
  const newTex = new THREE.Texture(canvas);
  newTex.minFilter = THREE.LinearMipmapLinearFilter;
  newTex.magFilter = THREE.LinearFilter;
  newTex.anisotropy = baseTexture.anisotropy;
  newTex.generateMipmaps = true;
  newTex.flipY = flipY;
  newTex.needsUpdate = true;
  return newTex;
}

type BleedEntry = {
  bleedR: number;
  bleedG: number;
  bleedB: number;
  compR: number;
  compG: number;
  compB: number;
  erosionPx: number;
  expandRadius: number;
};
type LineBleedEntry = { r: number; g: number; b: number; radius: number };

function hexToRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

export type SkinSources = {
  W: number;
  H: number;
  base: Uint8ClampedArray;
  juvenile: { data: Uint8ClampedArray; W: number; H: number } | null;
  rac: Uint8ClampedArray | null;
  noise: Uint8ClampedArray | null;
  mask: Uint8ClampedArray | null;
  tmc: Uint8ClampedArray | null;
  colorSpace: THREE.Texture["colorSpace"];
  anisotropy: number;
  canvas: HTMLCanvasElement;
};

function drawToData(
  img: HTMLImageElement,
  W: number,
  H: number,
  smooth: boolean,
): Uint8ClampedArray {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = smooth;
  if (smooth) ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, W, H);
  return ctx.getImageData(0, 0, W, H).data;
}

export function buildSkinSources(input: {
  pattern: THREE.Texture;
  juvenile: THREE.Texture | null;
  rac: THREE.Texture | null;
  noise: THREE.Texture | null;
  mask: THREE.Texture | null;
  tmc: THREE.Texture | null;
}): SkinSources {
  const img = input.pattern.image as HTMLImageElement;
  const W = img.width,
    H = img.height;
  const juvImg = input.juvenile?.image as HTMLImageElement | undefined;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  return {
    W,
    H,
    base: drawToData(img, W, H, false),
    juvenile:
      juvImg && juvImg.width > 0
        ? {
            data: drawToData(juvImg, juvImg.width, juvImg.height, false),
            W: juvImg.width,
            H: juvImg.height,
          }
        : null,
    rac: input.rac
      ? drawToData(input.rac.image as HTMLImageElement, W, H, false)
      : null,
    noise: input.noise
      ? drawToData(input.noise.image as HTMLImageElement, W, H, true)
      : null,
    mask: input.mask
      ? drawToData(input.mask.image as HTMLImageElement, W, H, false)
      : null,
    tmc: input.tmc
      ? drawToData(input.tmc.image as HTMLImageElement, W, H, false)
      : null,
    colorSpace: input.pattern.colorSpace,
    anisotropy: input.pattern.anisotropy,
    canvas,
  };
}

export function composeAlbedo(
  sources: SkinSources,
  colors: ColorState,
  glitchValues: GlitchState = {},
  overlayDefaults: OverlayChannel[] | undefined,
  noiseStrength: number,
  brightness = 0.55,
  tuning: GlitchTuning = DEFAULT_GLITCH_TUNING,
): THREE.Texture {
  const W = sources.W,
    H = sources.H;
  const data = new Uint8ClampedArray(sources.base);

  const ZONE_THRESHOLD = 0.42;
  const BLEED_SUPER_NEG = 2 ** 24;

  const zoneIndexBleedMap = new Map<number, BleedEntry>();
  for (const [colorKey, glitchStr] of Object.entries(glitchValues)) {
    if (!glitchStr) continue;
    const bleedInfo = getPatternBleedInfo(glitchStr);
    if (!bleedInfo) continue;
    const zoneIdx = COLOR_KEY_TO_ZONE_INDEX[colorKey];
    if (!zoneIdx) continue;
    const { X, Y, Z } = parseXYZ(glitchStr);
    const isSuperNeg = (v: number) => v < 0 && Math.abs(v) >= BLEED_SUPER_NEG;
    zoneIndexBleedMap.set(zoneIdx, {
      bleedR: Math.round(bleedInfo.bleedColor[0] * 255),
      bleedG: Math.round(bleedInfo.bleedColor[1] * 255),
      bleedB: Math.round(bleedInfo.bleedColor[2] * 255),
      compR: isSuperNeg(X) ? 0 : 255,
      compG: isSuperNeg(Y) ? 0 : 255,
      compB: isSuperNeg(Z) ? 0 : 255,
      erosionPx: bleedInfo.erosionPx,
      expandRadius: Math.max(0, Math.round(2 - bleedInfo.erosionPx)),
    });
  }

  const lineBleedZoneMap = new Map<string, LineBleedEntry>();
  for (const [colorKey, glitchStr] of Object.entries(glitchValues)) {
    if (!glitchStr) continue;
    const { X, Y, Z } = parseXYZ(glitchStr);
    const lb = computeLineBleed(X, Y, Z);
    if (!lb) continue;
    lineBleedZoneMap.set(colorKey, {
      r: Math.round(lb.color[0] * 255),
      g: Math.round(lb.color[1] * 255),
      b: Math.round(lb.color[2] * 255),
      radius: Math.floor(lb.radius),
    });
  }

  const hasBleedZones =
    zoneIndexBleedMap.size > 0 || lineBleedZoneMap.size > 0;

  const ZONE_KEYS: Array<keyof ColorState> = [
    "maleColor",
    "bottomColor",
    "highColor",
    "lowColor",
    "midColor",
    "mid2Color",
  ];
  const refR = new Float64Array(6);
  const refG = new Float64Array(6);
  const refB = new Float64Array(6);
  const tgtR = new Uint8ClampedArray(6);
  const tgtG = new Uint8ClampedArray(6);
  const tgtB = new Uint8ClampedArray(6);
  const thr = new Float64Array(6);
  const lbByZone: Array<LineBleedEntry | null> = new Array(6).fill(null);
  for (let z = 0; z < 6; z++) {
    const key = ZONE_KEYS[z];
    const ref = ZONE_REFERENCE_COLORS[key];
    refR[z] = ref.r / 255;
    refG[z] = ref.g / 255;
    refB[z] = ref.b / 255;
    const hex = colors[key];
    tgtR[z] = Math.round(parseInt(hex.slice(1, 3), 16) * brightness);
    tgtG[z] = Math.round(parseInt(hex.slice(3, 5), 16) * brightness);
    tgtB[z] = Math.round(parseInt(hex.slice(5, 7), 16) * brightness);
    thr[z] = key === "midColor" ? 0.6 : ZONE_THRESHOLD;
    lbByZone[z] = lineBleedZoneMap.get(key) ?? null;
  }

  const lineBleedMask =
    lineBleedZoneMap.size > 0 ? new Uint8Array(W * H) : null;
  const lineBleedPerPixel =
    lineBleedZoneMap.size > 0
      ? new Array<LineBleedEntry | null>(W * H).fill(null)
      : null;

  for (let p = 0; p < W * H; p++) {
    const i = p * 4;
    const pr = data[i] / 255,
      pg = data[i + 1] / 255,
      pb = data[i + 2] / 255;
    let minDist = Infinity,
      best = 0;
    for (let z = 0; z < 6; z++) {
      const dr = pr - refR[z],
        dg = pg - refG[z],
        db = pb - refB[z];
      const d = dr * dr + dg * dg + db * db;
      if (d < minDist) {
        minDist = d;
        best = z;
      }
    }
    if (minDist <= thr[best]) {
      data[i] = tgtR[best];
      data[i + 1] = tgtG[best];
      data[i + 2] = tgtB[best];
      data[i + 3] = 255;
      const lb = lbByZone[best];
      if (lb && lineBleedMask) {
        lineBleedMask[p] = 1;
        lineBleedPerPixel![p] = lb;
      }
    }
  }

  if (lineBleedMask && lineBleedPerPixel) {
    const DIRS = [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ] as const;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const pidx = y * W + x;
        if (!lineBleedMask[pidx]) continue;
        const entry = lineBleedPerPixel[pidx]!;
        const reach = Math.max(0, Math.round(entry.radius * tuning.bleedReach));
        for (const [dx, dy] of DIRS) {
          for (let rad = 1; rad <= reach; rad++) {
            const nx = x + dx * rad,
              ny = y + dy * rad;
            if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
            const nIdx = ny * W + nx;
            if (lineBleedMask[nIdx]) continue;
            const di = nIdx * 4;
            const tv = Math.max(
              Math.max(data[di], data[di + 1], data[di + 2]) / 255,
              tuning.darkBleed,
            );
            data[di] = Math.round(entry.r * tv);
            data[di + 1] = Math.round(entry.g * tv);
            data[di + 2] = Math.round(entry.b * tv);
            data[di + 3] = 255;
          }
        }
      }
    }
  }

  if (sources.juvenile && hasBleedZones) {
    const juvData = sources.juvenile.data;
    const juvW = sources.juvenile.W,
      juvH = sources.juvenile.H;
    const matchZone = (pr: number, pg: number, pb: number) => {
      let minDist = Infinity,
        bestIdx = 0;
      for (let z = 0; z < 6; z++) {
        const ref = ZONE_REF_BY_INDEX[z];
        const dr = pr / 255 - ref.r / 255;
        const dg = pg / 255 - ref.g / 255;
        const db = pb / 255 - ref.b / 255;
        const d = dr * dr + dg * dg + db * db;
        if (d < minDist) {
          minDist = d;
          bestIdx = z + 1;
        }
      }
      return minDist <= ZONE_THRESHOLD ? bestIdx : 0;
    };
    const tintR = parseInt(tuning.juviTint.slice(1, 3), 16) / 255;
    const tintG = parseInt(tuning.juviTint.slice(3, 5), 16) / 255;
    const tintB = parseInt(tuning.juviTint.slice(5, 7), 16) / 255;
    const jOp = tuning.juviOpacity;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const jx = Math.floor((x * juvW) / W);
        const jy = Math.floor((y * juvH) / H);
        const ji = (jy * juvW + jx) * 4;
        const jZone = matchZone(juvData[ji], juvData[ji + 1], juvData[ji + 2]);
        if (jZone === 0) continue;
        const bleed = zoneIndexBleedMap.get(jZone);
        if (!bleed || bleed.erosionPx < 0) continue;
        let isEroded = false;
        const baseEro = bleed.erosionPx >= 1.5 ? bleed.erosionPx : 0;
        const ero = baseEro + tuning.juviErosion;
        if (ero > 0) {
          const ref = ZONE_REF_BY_INDEX[jZone - 1];
          const CARD = [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ] as const;
          for (const [dx, dy] of CARD) {
            const ex = Math.floor(jx + dx * ero);
            const ey = Math.floor(jy + dy * ero);
            if (ex < 0 || ex >= juvW || ey < 0 || ey >= juvH) {
              isEroded = true;
              break;
            }
            const ei = (ey * juvW + ex) * 4;
            const dr = juvData[ei] / 255 - ref.r / 255;
            const dg = juvData[ei + 1] / 255 - ref.g / 255;
            const db = juvData[ei + 2] / 255 - ref.b / 255;
            if (dr * dr + dg * dg + db * db > ZONE_THRESHOLD) {
              isEroded = true;
              break;
            }
          }
        }
        if (isEroded) continue;
        const pi = (y * W + x) * 4;
        const mr = 1 - jOp + jOp * (bleed.compR / 255) * tintR;
        const mg = 1 - jOp + jOp * (bleed.compG / 255) * tintG;
        const mb = 1 - jOp + jOp * (bleed.compB / 255) * tintB;
        data[pi] = Math.round(data[pi] * mr);
        data[pi + 1] = Math.round(data[pi + 1] * mg);
        data[pi + 2] = Math.round(data[pi + 2] * mb);
        data[pi + 3] = 255;
      }
    }
  }

  if (sources.tmc) {
    const m = sources.tmc;
    const chans = [
      hexToRgb(colors.teethColor),
      hexToRgb(colors.mouthColor),
      hexToRgb(colors.clawsColor),
    ];
    for (let i = 0; i < data.length; i += 4) {
      for (let ch = 0; ch < 3; ch++) {
        const cov = m[i + ch] / 255;
        if (cov <= 0) continue;
        const c = chans[ch];
        data[i] = Math.round(data[i] * (1 - cov) + c[0] * cov);
        data[i + 1] = Math.round(data[i + 1] * (1 - cov) + c[1] * cov);
        data[i + 2] = Math.round(data[i + 2] * (1 - cov) + c[2] * cov);
      }
    }
  }

  if (sources.rac) {
    const r = sources.rac;
    const strength = 0.85;
    for (let i = 0; i < data.length; i += 4) {
      const ao = r[i + 1] / 255,
        cav = r[i + 2] / 255;
      const factor = 1 - strength * (1 - ao * cav);
      data[i] = Math.round(data[i] * factor);
      data[i + 1] = Math.round(data[i + 1] * factor);
      data[i + 2] = Math.round(data[i + 2] * factor);
    }
  }

  if (
    sources.mask &&
    overlayDefaults &&
    overlayDefaults.some((c) => c.alpha > 0)
  ) {
    const m = sources.mask;
    const cols = overlayDefaults.map((c) => {
      const [r, g, b] = hexToRgb(c.color);
      return [r, g, b, c.alpha] as const;
    });
    for (let i = 0; i < data.length; i += 4) {
      for (let ch = 0; ch < 3; ch++) {
        const entry = cols[ch];
        if (!entry) continue;
        const [cr, cg, cb, alpha] = entry;
        if (alpha <= 0) continue;
        const cov = (m[i + ch] / 255) * alpha;
        if (cov <= 0) continue;
        data[i] = Math.round(data[i] * (1 - cov) + cr * cov);
        data[i + 1] = Math.round(data[i + 1] * (1 - cov) + cg * cov);
        data[i + 2] = Math.round(data[i + 2] * (1 - cov) + cb * cov);
      }
    }
  }

  if (sources.noise && noiseStrength > 0) {
    const n = sources.noise;
    for (let i = 0; i < data.length; i += 4) {
      const nv = n[i] / 255;
      const f = 1 - noiseStrength * (1 - nv);
      data[i] = Math.round(data[i] * f);
      data[i + 1] = Math.round(data[i + 1] * f);
      data[i + 2] = Math.round(data[i + 2] * f);
    }
  }

  const ctx = sources.canvas.getContext("2d")!;
  ctx.putImageData(new ImageData(data, W, H), 0, 0);
  const tex = new THREE.Texture(sources.canvas);
  tex.colorSpace = sources.colorSpace;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = sources.anisotropy;
  tex.generateMipmaps = true;
  tex.flipY = false;
  tex.needsUpdate = true;
  return tex;
}
