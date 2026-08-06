import type { GlitchLabConfig, SkinPalette } from "./types";

import { JSON_KEY_TO_COLOR, type ColorState, type GlitchState } from "./bake";

export function paletteToColorState(palette: SkinPalette): ColorState {
  return {
    maleColor: palette.display,
    bottomColor: palette.underbelly,
    highColor: palette.flank,
    lowColor: palette.body,
    midColor: palette.markings,
    mid2Color: palette.detail,
    eyeColor: palette.eyes,
    teethColor: palette.teeth,
    mouthColor: palette.mouth,
    clawsColor: palette.claws,
  };
}

export function glitchLabToGlitchState(
  glitchLab: GlitchLabConfig,
  active: boolean,
): GlitchState {
  if (!active) return {};
  const out: GlitchState = {};
  for (const [key, vec] of Object.entries(glitchLab.layers)) {
    const slot = JSON_KEY_TO_COLOR[key];
    if (!slot) continue;
    const isGlitch =
      vec.x < 0 || vec.x > 1 || vec.y < 0 || vec.y > 1 || vec.z < 0 || vec.z > 1;
    if (isGlitch) out[slot] = `X=${vec.x},Y=${vec.y},Z=${vec.z}`;
  }
  return out;
}
