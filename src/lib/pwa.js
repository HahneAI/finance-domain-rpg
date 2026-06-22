// True when the app is running as an installed PWA (standalone display mode).
// Used to hide the "Install on home screen" triggers — no point showing the
// add-to-home-screen tutorial once the app is already installed.
export function isStandaloneDisplayMode() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // iOS Safari legacy flag
    window.navigator?.standalone === true
  );
}
