export const END_HOLD_MS = 1000;

/** One uninterrupted gesture; cancelled or superseded gestures can never fire later. */
export function holdToConfirm(confirm: () => void, changed: (holding: boolean) => void, canConfirm = () => true, delay = END_HOLD_MS) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let active = false;
  const cancel = () => {
    clearTimeout(timer); timer = undefined;
    if (active) { active = false; changed(false); }
  };
  return {
    start() {
      if (active || !canConfirm()) return;
      active = true; changed(true);
      timer = setTimeout(() => {
        if (!active) return;
        const allowed = canConfirm();
        cancel();
        if (allowed) confirm();
      }, delay);
    },
    cancel,
    dispose() { clearTimeout(timer); active = false; },
  };
}
