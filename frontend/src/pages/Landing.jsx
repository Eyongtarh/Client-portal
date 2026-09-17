// Public homepage for logged-out visitors: explains what the
// product does and links to register/login. Logged-in users
// never see this - App.jsx redirects them straight to their
// dashboard instead.
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  FcAdvertising,
  FcAlarmClock,
  FcApproval,
  FcCalendar,
  FcConferenceCall,
  FcDocument,
  FcGlobe,
  FcMoneyTransfer,
  FcPackage,
  FcSms,
  FcSurvey,
  FcWorkflow,
} from "react-icons/fc";
import LanguageToggle from "../components/LanguageToggle.jsx";
import ThemeToggle from "../components/ThemeToggle.jsx";
import LogoMark from "../components/LogoMark.jsx";
import MobileNav from "../components/MobileNav.jsx";
import SkipLink from "../components/SkipLink.jsx";

const STEPS = ["step1", "step2", "step3"];

// Flat Color Icons (react-icons/fc) carry their own fixed palette
// rather than following currentColor like the outline Fi set does,
// so each one is picked to suit its card rather than recoloured -
// see the icon container's own background decision below for how
// they stay legible in both light and dark theme.
const FEATURES = [
  ["featureProjectsTitle", "featureProjectsBody", FcWorkflow],
  ["featureBookingsTitle", "featureBookingsBody", FcCalendar],
  ["featureResourcesTitle", "featureResourcesBody", FcPackage],
  ["featureLocationsTitle", "featureLocationsBody", FcGlobe],
  ["featureInvoicesTitle", "featureInvoicesBody", FcMoneyTransfer],
  ["featureApprovalsTitle", "featureApprovalsBody", FcApproval],
  ["featureDocsTitle", "featureDocsBody", FcDocument],
  ["featureMessagesTitle", "featureMessagesBody", FcSms],
  ["featureTeamTitle", "featureTeamBody", FcConferenceCall],
  ["featureFeedbackTitle", "featureFeedbackBody", FcSurvey],
  ["featureNotificationsTitle", "featureNotificationsBody", FcAlarmClock],
  ["featureBrandingTitle", "featureBrandingBody", FcAdvertising],
];

export default function Landing() {
  const { t } = useTranslation();
  const audiences = t("landing.audiences", { returnObjects: true });

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <SkipLink />
      <header className="sticky top-0 z-10 glass-panel">
        <div className="max-w-6xl mx-auto px-8 py-4 flex justify-between items-center">
          <span className="flex items-center gap-2 text-lg font-semibold tracking-tight text-brand-700">
            <LogoMark className="w-7 h-7" />
            Clientflow
          </span>
          <MobileNav>
            <ThemeToggle />
            <LanguageToggle />
            <Link
              to="/login"
              aria-label={t("landing.signIn")}
              className="text-sm text-brand-700 underline transition-colors hover:text-brand-800 focus:outline-none focus:ring-2 focus:ring-brand-400 rounded"
            >
              {t("landing.signIn")}
            </Link>
            <Link
              to="/register"
              aria-label={t("landing.getStarted")}
              className="bg-brand-600-solid text-white px-4 py-2 rounded-lg text-sm font-medium text-center transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400"
            >
              {t("landing.getStarted")}
            </Link>
          </MobileNav>
        </div>
      </header>

      <main id="main-content" className="max-w-6xl mx-auto px-8">
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
            className="animate-rise glow-brand inline-block mt-9 bg-brand-600-solid text-white px-7 py-3.5 rounded-xl font-medium transition-transform hover:-translate-y-0.5 hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400"
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
                <div className="w-9 h-9 mx-auto mb-4 rounded-full bg-brand-600-solid text-white flex items-center justify-center font-semibold">
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
          {FEATURES.map(([titleKey, bodyKey, Icon], i) => (
            <div
              key={titleKey}
              className="animate-rise group bg-surface border border-line rounded-2xl p-6 transition-all hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-lg"
              style={{ animationDelay: `${0.1 + i * 0.05}s` }}
            >
              <div className="w-10 h-10 rounded-lg bg-white border border-line flex items-center justify-center mb-4 shadow-sm transition-shadow group-hover:shadow-md">
                <Icon aria-hidden="true" size={24} />
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
              className="glow-brand inline-block bg-brand-600-solid text-white px-6 py-3 rounded-lg font-medium transition-transform hover:-translate-y-0.5 hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400"
            >
              {t("landing.footerCtaButton")}
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
