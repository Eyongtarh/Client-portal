// A simple EN/FR switch. Saves the choice to localStorage so
// it persists across page reloads and browser sessions.
import { useTranslation } from "react-i18next";

export default function LanguageToggle() {
  const { i18n } = useTranslation();

  function setLanguage(lang) {
    i18n.changeLanguage(lang);
    localStorage.setItem("language", lang);
  }

  const isEnglish = i18n.language === "en";

  return (
    <div className="inline-flex rounded-lg border border-gray-300 overflow-hidden text-sm">
      <button
        onClick={() => setLanguage("en")}
        aria-label="Switch to English"
        aria-pressed={isEnglish}
        title="English"
        className={
          isEnglish
            ? "px-3 py-1 bg-brand-600 text-white transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400"
            : "px-3 py-1 bg-white text-gray-600 transition-colors hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-400"
        }
      >
        EN
      </button>
      <button
        onClick={() => setLanguage("fr")}
        aria-label="Passer au français"
        aria-pressed={!isEnglish}
        title="Français"
        className={
          !isEnglish
            ? "px-3 py-1 bg-brand-600 text-white transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400"
            : "px-3 py-1 bg-white text-gray-600 transition-colors hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-400"
        }
      >
        FR
      </button>
    </div>
  );
}
