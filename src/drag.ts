export type ScreenPosition = { x: number; y: number };

export function clampToViewport(
  position: ScreenPosition,
  elementWidth: number,
  elementHeight: number,
  snapDistance = 14,
): ScreenPosition {
  const maxX = Math.max(0, window.innerWidth - elementWidth);
  const maxY = Math.max(0, window.innerHeight - elementHeight);
  const rawX = Math.max(0, Math.min(maxX, position.x));
  const rawY = Math.max(0, Math.min(maxY, position.y));
  return {
    x: rawX <= snapDistance ? 0 : rawX >= maxX - snapDistance ? maxX : rawX,
    y: rawY <= snapDistance ? 0 : rawY >= maxY - snapDistance ? maxY : rawY,
  };
}
