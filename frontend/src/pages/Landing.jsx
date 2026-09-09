// Public homepage for logged-out visitors: explains what the
// product does and links to register/login. Logged-in users
// never see this - App.jsx redirects them straight to their
// dashboard instead.
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import LanguageToggle from "../components/LanguageToggle.jsx";
import ThemeToggle from "../components/ThemeToggle.jsx";

const FEATURES = [
  ["featureProjectsTitle", "featureProjectsBody", "briefcase"],
  ["featureDocsTitle", "featureDocsBody", "document"],
  ["featureMessagesTitle", "featureMessagesBody", "chat"],
  ["featureInvoicesTitle", "featureInvoicesBody", "receipt"],
];

const ICONS = {
  briefcase: (
    <path d="M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8Z M8 6V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v1 M3 12h18" />
  ),
  document: (
    <path d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z M14 3v5h5 M9 13h6 M9 17h6" />
  ),
  chat: (
    <path d="M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-5 4v-4H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z" />
  ),
  receipt: (
    <path d="M6 2h12v19l-3-2-3 2-3-2-3 2V2Z M9 8h6 M9 12h6" />
  ),
};

function FeatureIcon({ name }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {ICONS[name]}
    </svg>
  );
}

export default function Landing() {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <header className="sticky top-0 z-10 glass-panel">
        <div className="max-w-5xl mx-auto px-8 py-4 flex justify-between items-center">
          <span className="text-lg font-semibold tracking-tight text-brand-700">
            Client Portal
          </span>
          <div className="flex items-center gap-4">
            <ThemeToggle />
            <LanguageToggle />
            <Link
              to="/login"
              aria-label={t("landing.signIn")}
              className="text-sm text-brand-600 underline transition-colors hover:text-brand-800 focus:outline-none focus:ring-2 focus:ring-brand-400 rounded"
            >
              {t("landing.signIn")}
            </Link>
            <Link
              to="/register"
              aria-label={t("landing.getStarted")}
              className="bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400"
            >
              {t("landing.getStarted")}
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-8">
        <section className="relative isolate py-20 sm:py-28 text-center overflow-hidden">
          <div
            aria-hidden="true"
            className="aurora-bg pointer-events-none absolute inset-0 -z-10"
          />
          <h1 className="animate-rise text-4xl sm:text-5xl font-bold tracking-tight text-ink max-w-2xl mx-auto">
            {t("landing.heroTitle")}
          </h1>
          <p
            className="animate-rise text-lg text-ink-soft mt-5 max-w-xl mx-auto"
            style={{ animationDelay: "0.08s" }}
          >
            {t("landing.heroSubtitle")}
          </p>
          <Link
            to="/register"
            aria-label={t("landing.heroCta")}
            style={{ animationDelay: "0.16s" }}
            className="animate-rise glow-brand inline-block mt-9 bg-brand-600 text-white px-7 py-3.5 rounded-xl font-medium transition-transform hover:-translate-y-0.5 hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400"
          >
            {t("landing.heroCta")}
          </Link>
        </section>

        <section className="grid sm:grid-cols-2 gap-5 pb-16">
          {FEATURES.map(([titleKey, bodyKey, icon], i) => (
            <div
              key={titleKey}
              className="animate-rise group bg-surface border border-line rounded-2xl p-6 transition-all hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-lg"
              style={{ animationDelay: `${0.1 + i * 0.06}s` }}
            >
              <div className="w-10 h-10 rounded-lg bg-brand-100 text-brand-700 flex items-center justify-center mb-4 transition-colors group-hover:bg-brand-200">
                <FeatureIcon name={icon} />
              </div>
              <h3 className="font-semibold text-ink mb-1.5">
                {t(`landing.${titleKey}`)}
              </h3>
              <p className="text-sm text-ink-soft leading-relaxed">
                {t(`landing.${bodyKey}`)}
              </p>
            </div>
          ))}
        </section>

        <section className="relative text-center pb-24 pt-4">
          <div className="bg-surface-2 border border-line rounded-2xl px-8 py-14">
            <h2 className="text-2xl font-semibold text-ink mb-4">
              {t("landing.footerCta")}
            </h2>
            <Link
              to="/register"
              aria-label={t("landing.footerCtaButton")}
              className="glow-brand inline-block bg-brand-600 text-white px-6 py-3 rounded-lg font-medium transition-transform hover:-translate-y-0.5 hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400"
            >
              {t("landing.footerCtaButton")}
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
