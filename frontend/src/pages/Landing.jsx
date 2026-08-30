// Public homepage for logged-out visitors: explains what the
// product does and links to register/login. Logged-in users
// never see this - App.jsx redirects them straight to their
// dashboard instead.
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import LanguageToggle from "../components/LanguageToggle.jsx";

const FEATURES = [
  ["featureProjectsTitle", "featureProjectsBody"],
  ["featureDocsTitle", "featureDocsBody"],
  ["featureMessagesTitle", "featureMessagesBody"],
  ["featureInvoicesTitle", "featureInvoicesBody"],
];

export default function Landing() {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-brand-50">
      <header className="max-w-5xl mx-auto px-8 py-6 flex justify-between items-center">
        <span className="text-lg font-semibold text-brand-700">
          Client Portal
        </span>
        <div className="flex items-center gap-4">
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
      </header>
      <main className="max-w-5xl mx-auto px-8">
        <section className="py-16 text-center">
          <h1 className="text-3xl sm:text-4xl font-bold text-brand-800 max-w-2xl mx-auto">
            {t("landing.heroTitle")}
          </h1>
          <p className="text-lg text-gray-600 mt-4 max-w-xl mx-auto">
            {t("landing.heroSubtitle")}
          </p>
          <Link
            to="/register"
            aria-label={t("landing.heroCta")}
            className="inline-block mt-8 bg-brand-600 text-white px-6 py-3 rounded-lg font-medium transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400"
          >
            {t("landing.heroCta")}
          </Link>
        </section>
        <section className="grid sm:grid-cols-2 gap-6 pb-16">
          {FEATURES.map(([titleKey, bodyKey]) => (
            <div
              key={titleKey}
              className="bg-white border border-brand-100 rounded-xl p-6 transition-shadow hover:shadow-md"
            >
              <h3 className="font-semibold text-brand-800 mb-2">
                {t(`landing.${titleKey}`)}
              </h3>
              <p className="text-sm text-gray-600">{t(`landing.${bodyKey}`)}</p>
            </div>
          ))}
        </section>
        <section className="text-center pb-20">
          <h2 className="text-xl font-semibold text-brand-800 mb-4">
            {t("landing.footerCta")}
          </h2>
          <Link
            to="/register"
            aria-label={t("landing.footerCtaButton")}
            className="inline-block bg-brand-600 text-white px-6 py-3 rounded-lg font-medium transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400"
          >
            {t("landing.footerCtaButton")}
          </Link>
        </section>
      </main>
    </div>
  );
}
