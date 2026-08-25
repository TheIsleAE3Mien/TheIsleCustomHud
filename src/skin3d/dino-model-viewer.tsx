import { SkinViewer3D } from "./skin-viewer-3d";
import { hasSkin3D } from "./registry";
import { DEFAULT_GLITCH_LAB, DEFAULT_PALETTE, type SkinPalette } from "./types";

export function DinoModelViewer({
  species,
  palette = DEFAULT_PALETTE,
  controls = true,
}: {
  species: string;
  palette?: SkinPalette;
  controls?: boolean;
}) {
  if (!hasSkin3D(species)) {
    return <div className="skinViewerEmpty">No preview</div>;
  }
  return (
    <SkinViewer3D
      species={species}
      palette={palette}
      renderMode="standard"
      glitchLab={DEFAULT_GLITCH_LAB}
      controls={controls}
    />
  );
}
