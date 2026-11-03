// When the app restarts or a new version is published, an open tab can try to
// load a page file that no longer exists ("Importing a module script failed").
// Reload once to pick up the fresh files instead of leaving a blank screen.

const FLAG = "thara.chunkReloadAt";
const PATTERN =
  /Importing a module script failed|Failed to fetch dynamically imported module|error loading dynamically imported module|Unable to preload CSS/i;

export function isStaleChunkError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  return PATTERN.test(msg);
}

/** Reloads the page once per 10 seconds; returns true if a reload was triggered. */
export function reloadForStaleChunk(error: unknown): boolean {
  if (typeof window === "undefined" || !isStaleChunkError(error)) return false;
  const last = Number(window.sessionStorage.getItem(FLAG) ?? 0);
  if (Date.now() - last < 10_000) return false;
  window.sessionStorage.setItem(FLAG, String(Date.now()));
  window.location.reload();
  return true;
}

export function installStaleChunkReload(): () => void {
  const onRejection = (e: PromiseRejectionEvent) => {
    if (reloadForStaleChunk(e.reason)) e.preventDefault();
  };
  const onError = (e: ErrorEvent) => {
    if (reloadForStaleChunk(e.error ?? e.message)) e.preventDefault();
  };
  const onPreload = (e: Event) => {
    const payload = (e as Event & { payload?: unknown }).payload;
    if (reloadForStaleChunk(payload ?? "Failed to fetch dynamically imported module")) e.preventDefault();
  };
  window.addEventListener("unhandledrejection", onRejection);
  window.addEventListener("error", onError);
  window.addEventListener("vite:preloadError", onPreload);
  return () => {
    window.removeEventListener("unhandledrejection", onRejection);
    window.removeEventListener("error", onError);
    window.removeEventListener("vite:preloadError", onPreload);
  };
}
