// Light/dark switch, same interaction pattern as LanguageToggle:
// persists the choice and applies it immediately.
import { useEffect, useState } from "react";
import { FiMoon, FiSun } from "react-icons/fi";
import { getTheme, setTheme } from "../lib/theme";

export default function ThemeToggle() {
  const [theme, setThemeState] = useState(getTheme());

  useEffect(() => {
    setTheme(theme);
  }, [theme]);

  const isDark = theme === "dark";

  return (
    <button
      onClick={() => setThemeState(isDark ? "light" : "dark")}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Light mode" : "Dark mode"}
      className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-line text-ink-soft transition-colors hover:bg-surface-2 hover:text-ink focus:outline-none focus:ring-2 focus:ring-brand-400"
    >
      {isDark ? (
        <FiSun aria-hidden="true" size={16} />
      ) : (
        <FiMoon aria-hidden="true" size={16} />
      )}
    </button>
  );
}
