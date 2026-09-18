// Owner's booking management page: the sections below (each
// its own file) cover services, locations, resources, working
// hours, blocked time, intake questions, the public booking
// page, bookings, waitlist, reviews, and analytics. This file
// is just the shared header/nav chrome plus the section order.
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { FiLogOut, FiUser } from "react-icons/fi";
import { useAuth } from "../../lib/AuthContext.jsx";
import LanguageToggle from "../../components/LanguageToggle.jsx";
import ThemeToggle from "../../components/ThemeToggle.jsx";
import NotificationBell from "../../components/NotificationBell.jsx";
import MobileNav from "../../components/MobileNav.jsx";
import SkipLink from "../../components/SkipLink.jsx";
import LocationsSection from "./LocationsSection.jsx";
import ServicesSection from "./ServicesSection.jsx";
import ResourcesSection from "./ResourcesSection.jsx";
import ResourceRulesSection from "./ResourceRulesSection.jsx";
import WorkingHoursSection from "./WorkingHoursSection.jsx";
import BlockedTimeSection from "./BlockedTimeSection.jsx";
import IntakeQuestionsSection from "./IntakeQuestionsSection.jsx";
import PublicBookingSection from "./PublicBookingSection.jsx";
import BookingsSection from "./BookingsSection.jsx";
import WaitlistSection from "./WaitlistSection.jsx";
import ReviewsSection from "./ReviewsSection.jsx";
import AnalyticsSection from "./AnalyticsSection.jsx";

export default function Booking() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <SkipLink />
      <header className="sticky top-0 z-10 glass-panel px-8 py-4 flex justify-between items-center">
        <div>
          <Link
            to="/"
            aria-label="Back to dashboard"
            className="text-sm text-brand-700 underline transition-colors hover:text-brand-800 focus:outline-none focus:ring-2 focus:ring-brand-400 rounded"
          >
            &larr; {user.workspace_name}
          </Link>
          <h1 className="text-lg font-semibold mt-1 text-ink">
            {t("booking.servicesTitle")}
          </h1>
        </div>
        <MobileNav>
          <NotificationBell />
          <ThemeToggle />
          <LanguageToggle />
          <Link
            to="/account"
            aria-label={t("account.title")}
            className="text-sm text-brand-700 underline transition-colors hover:text-brand-800 focus:outline-none focus:ring-2 focus:ring-brand-400 rounded"
          >
            <FiUser className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
            {t("account.title")}
          </Link>
          <button
            onClick={logout}
            aria-label={t("dashboard.signOut")}
            className="text-sm text-brand-700 underline transition-colors hover:text-brand-800 focus:outline-none focus:ring-2 focus:ring-brand-400 rounded"
          >
            <FiLogOut className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
            {t("dashboard.signOut")}
          </button>
        </MobileNav>
      </header>
      <main id="main-content" className="max-w-2xl mx-auto px-8 py-8 space-y-6">
        <LocationsSection />
        <ServicesSection />
        <ResourcesSection />
        <ResourceRulesSection />
        <WorkingHoursSection />
        <BlockedTimeSection />
        <IntakeQuestionsSection />
        <PublicBookingSection />
        <BookingsSection />
        <WaitlistSection />
        <ReviewsSection />
        <AnalyticsSection />
      </main>
    </div>
  );
}

