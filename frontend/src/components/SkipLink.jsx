// WCAG 2.4.1 "Bypass Blocks": lets keyboard/screen-reader users jump
// straight past the header's nav links/toggles to the page's main
// content instead of tabbing through every one of them on every
// page load. Visually hidden until it receives focus (the first Tab
// press on the page), per the standard skip-link pattern.
import { useTranslation } from "react-i18next";

export default function SkipLink({ targetId = "main-content" }) {
  const { t } = useTranslation();

  return (
    <a
      href={`#${targetId}`}
      className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:bg-brand-600-solid focus:text-white focus:px-4 focus:py-2 focus:rounded-lg focus:text-sm focus:font-medium focus:outline-none focus:ring-2 focus:ring-brand-400"
    >
      {t("common.skipToContent")}
    </a>
  );
}
