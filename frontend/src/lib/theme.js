// Reads/writes the "dark"/"light" theme, persisted in localStorage
// and applied as documentElement's data-theme attribute (already
// set synchronously by an inline script in index.html before first
// paint, so there's no flash of the wrong theme on load).
export function getTheme() {
  return document.documentElement.getAttribute("data-theme") === "dark"
    ? "dark"
    : "light";
}

export function setTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  try {
    localStorage.setItem("theme", theme);
  } catch {
    // Storage can be unavailable (private mode, disabled) - the
    // theme still applies for this page view, it just won't
    // persist across reloads.
  }
}
