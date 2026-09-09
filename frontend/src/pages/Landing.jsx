// Public homepage for logged-out visitors: explains what the
// product does and links to register/login. Logged-in users
// never see this - App.jsx redirects them straight to their
// dashboard instead.
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import LanguageToggle from "../components/LanguageToggle.jsx";
import ThemeToggle from "../components/ThemeToggle.jsx";
import LogoMark from "../components/LogoMark.jsx";

const STEPS = ["step1", "step2", "step3"];

const FEATURES = [
  ["featureProjectsTitle", "featureProjectsBody", "briefcase"],
  ["featureBookingsTitle", "featureBookingsBody", "calendar"],
  ["featureInvoicesTitle", "featureInvoicesBody", "card"],
  ["featureApprovalsTitle", "featureApprovalsBody", "check"],
  ["featureDocsTitle", "featureDocsBody", "document"],
  ["featureMessagesTitle", "featureMessagesBody", "chat"],
  ["featureTeamTitle", "featureTeamBody", "team"],
  ["featureBrandingTitle", "featureBrandingBody", "brand"],
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
  card: (
    <path d="M3 7a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7Z M3 11h18 M7 15h4" />
  ),
  calendar: (
    <path d="M8 3v4M16 3v4M4 9h16M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Z" />
  ),
  check: (
    <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z M8 12.5l2.5 2.5L16 9" />
  ),
  team: (
    <path d="M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5 M17 11a2.5 2.5 0 1 0 0-5 M16 14.3c2.3.5 4 2.3 4 5.2" />
  ),
  brand: (
    <path d="M12 2H5a1 1 0 0 0-1 1v7l10.5 10.5a1 1 0 0 0 1.4 0l6.6-6.6a1 1 0 0 0 0-1.4L12 2Z M7.5 6.5a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z" />
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
  const audiences = t("landing.audiences", { returnObjects: true });

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <header className="sticky top-0 z-10 glass-panel">
        <div className="max-w-6xl mx-auto px-8 py-4 flex justify-between items-center">
          <span className="flex items-center gap-2 text-lg font-semibold tracking-tight text-brand-700">
            <LogoMark className="w-7 h-7" />
            Clientflow
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

      <main className="max-w-6xl mx-auto px-8">
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

        <section className="pb-20">
          <h2 className="text-center text-2xl font-semibold text-ink mb-10">
            {t("landing.howItWorksTitle")}
          </h2>
          <div className="grid sm:grid-cols-3 gap-8">
            {STEPS.map((step, i) => (
              <div key={step} className="animate-rise text-center">
                <div className="w-9 h-9 mx-auto mb-4 rounded-full bg-brand-600 text-white flex items-center justify-center font-semibold">
                  {i + 1}
                </div>
                <h3 className="font-semibold text-ink mb-1.5">
                  {t(`landing.${step}Title`)}
                </h3>
                <p className="text-sm text-ink-soft leading-relaxed max-w-xs mx-auto">
                  {t(`landing.${step}Body`)}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 pb-16">
          {FEATURES.map(([titleKey, bodyKey, icon], i) => (
            <div
              key={titleKey}
              className="animate-rise group bg-surface border border-line rounded-2xl p-6 transition-all hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-lg"
              style={{ animationDelay: `${0.1 + i * 0.05}s` }}
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

        <section className="text-center pb-20">
          <h2 className="text-sm font-medium uppercase tracking-wide text-ink-soft mb-5">
            {t("landing.builtForTitle")}
          </h2>
          <div className="flex flex-wrap justify-center gap-2.5 max-w-3xl mx-auto">
            {audiences.map((name) => (
              <span
                key={name}
                className="px-3.5 py-1.5 rounded-full text-sm bg-surface border border-line text-ink-soft"
              >
                {name}
              </span>
            ))}
          </div>
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
