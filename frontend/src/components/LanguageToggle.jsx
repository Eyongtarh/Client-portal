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
        className={
          isEnglish
            ? "px-3 py-1 bg-brand-600 text-white"
            : "px-3 py-1 bg-white text-gray-600"
        }
      >
        EN
      </button>
      <button
        onClick={() => setLanguage("fr")}
        className={
          !isEnglish
            ? "px-3 py-1 bg-brand-600 text-white"
            : "px-3 py-1 bg-white text-gray-600"
        }
      >
        FR
      </button>
    </div>
  );
}
