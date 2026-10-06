export type Theme = "dark" | "light";

const STORAGE_KEY = "pfx-image-inspector:theme";

export function getInitialTheme(): Theme {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "dark" || stored === "light") {
      applyTheme(stored);
      return stored;
    }
  } catch {
    // Storage can be unavailable in restricted browser contexts.
  }

  applyTheme("dark");
  return "dark";
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

export function persistTheme(theme: Theme): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Theme still works for the current session without persistence.
  }
}
