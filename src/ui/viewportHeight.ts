/**
 * Keeps `--app-height` on <html> equal to the window's real height. iPhone / iPad home-screen web apps
 * often keep the portrait height for `100vh` / `100dvh` (and `position: fixed` pages) after the phone
 * turns to landscape, so a full-height layout is cut off or left half empty; the measured height is
 * right. Re-measured after rotation settles. Returns the clean-up.
 */
export function trackViewportHeight(): () => void {
  const root = document.documentElement;
  const timers: ReturnType<typeof setTimeout>[] = [];
  const measure = () => root.style.setProperty('--app-height', `${Math.round(window.visualViewport?.height ?? window.innerHeight)}px`);
  const rotated = () => { measure(); timers.push(setTimeout(measure, 120), setTimeout(measure, 450)); };
  measure();
  window.addEventListener('resize', measure);
  window.addEventListener('orientationchange', rotated);
  window.visualViewport?.addEventListener('resize', measure);
  return () => {
    timers.forEach(clearTimeout);
    window.removeEventListener('resize', measure);
    window.removeEventListener('orientationchange', rotated);
    window.visualViewport?.removeEventListener('resize', measure);
    root.style.removeProperty('--app-height');
  };
}
