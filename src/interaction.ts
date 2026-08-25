let locked = 0;
export const lockInteract = () => {
  locked += 1;
};
export const unlockInteract = () => {
  locked = Math.max(0, locked - 1);
};
export const isInteractLocked = () => locked > 0;
