
export type PaletteFieldKey =
  | "body"
  | "markings"
  | "flank"
  | "underbelly"
  | "detail"
  | "display"
  | "eyes"
  | "teeth"
  | "mouth"
  | "claws";
export type SkinPalette = Record<PaletteFieldKey, string>;

export type SkinSex = "female" | "male";
export type SkinRenderMode = "standard" | "glitched";

export type GlitchLayerKey = "m" | "f" | "b" | "u" | "d1" | "md" | "e";
export type GlitchVector = { x: number; y: number; z: number };
export type GlitchLayers = Record<GlitchLayerKey, GlitchVector>;
export type GlitchLabConfig = {
  sv: number;
  pi: number;
  layers: GlitchLayers;
};

export const DEFAULT_PALETTE: SkinPalette = {
  body: "#6f8d44",
  markings: "#364725",
  flank: "#7b6a42",
  underbelly: "#b2b08e",
  detail: "#71815d",
  display: "#d5f38f",
  eyes: "#ffd76b",
  teeth: "#e8e2d0",
  mouth: "#7a3b3b",
  claws: "#3a3a3a",
};

export const DEFAULT_GLITCH_LAB: GlitchLabConfig = {
  sv: 0,
  pi: 0,
  layers: {
    md: { x: 1, y: 1, z: 1 },
    m: { x: 1, y: 1, z: 1 },
    b: { x: 1, y: 1, z: 1 },
    f: { x: 1, y: 1, z: 1 },
    u: { x: 1, y: 1, z: 1 },
    d1: { x: 0, y: 0, z: 0 },
    e: { x: 0, y: 0, z: 0 },
  },
};
