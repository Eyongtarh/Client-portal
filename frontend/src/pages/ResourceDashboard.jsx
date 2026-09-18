// Day-to-day resource operations: the combined resource calendar/
// filter view (BOOK-82..86) and the rental check-in/out queue
// (BOOK-99..103). Resource *configuration* (creating resources,
// their hours, blocks) lives in Booking.jsx alongside every other
// setup section - this page is for what staff use constantly while
// running the business, so it gets its own bookmarkable route
// (App.jsx) rather than living inside the long settings page.
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { FiLogOut, FiUser } from "react-icons/fi";
import { useAuth } from "../lib/AuthContext.jsx";
import LanguageToggle from "../components/LanguageToggle.jsx";
import ThemeToggle from "../components/ThemeToggle.jsx";
import NotificationBell from "../components/NotificationBell.jsx";
import MobileNav from "../components/MobileNav.jsx";
import SkipLink from "../components/SkipLink.jsx";
import api from "../lib/api";

const RESOURCE_TYPES = [
  "chair", "table", "car", "van", "hotel_room", "meeting_room", "studio",
  "desk", "office", "equipment", "machine", "court", "field", "boat",
  "bike", "parking_space", "room", "facility", "other", "custom",
];
const BOOKING_STATUSES = ["confirmed", "cancelled", "completed", "no_show"];
const RENTAL_STATUSES = [
  "scheduled", "active", "overdue", "returned", "cancelled", "completed",
];

function ReservationsSection() {
  const { t } = useTranslation();
  const [reservations, setReservations] = useState([]);
  const [resources, setResources] = useState([]);
  const [resourceFilter, setResourceFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  async function loadResources() {
    const res = await api.get("/resources/");
    setResources(res.data);
  }

  const loadRequestRef = useRef(0);

  async function load() {
    const requestId = ++loadRequestRef.current;
    const params = {};
    if (resourceFilter) params.resource = resourceFilter;
    if (typeFilter) params.type = typeFilter;
    if (statusFilter) params.status = statusFilter;
    if (dateFrom) params.date_from = dateFrom;
    if (dateTo) params.date_to = dateTo;
    const res = await api.get("/resource-reservations/", { params });
    // A slower-loading earlier filter combination can resolve after
    // a later one - without this guard its stale results would
    // overwrite what's actually selected now.
    if (requestId === loadRequestRef.current) {
      setReservations(res.data);
    }
  }

  useEffect(() => {
    loadResources();
  }, []);
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resourceFilter, typeFilter, statusFilter, dateFrom, dateTo]);

  return (
    <section className="bg-surface border border-line rounded-2xl p-6">
      <h2 className="font-medium text-ink mb-3">
        {t("resourceDashboard.calendarTitle")}
      </h2>

      <div className="flex flex-wrap gap-2 mb-4">
        <label htmlFor="rd-resource-filter" className="sr-only">
          {t("resources.resourceName")}
        </label>
        <select
          id="rd-resource-filter"
          value={resourceFilter}
          onChange={(e) => setResourceFilter(e.target.value)}
          className="px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400"
        >
          <option value="">{t("resourceDashboard.allResources")}</option>
          {resources.map((resource) => (
            <option key={resource.id} value={resource.id}>
              {resource.name}
            </option>
          ))}
        </select>
        <label htmlFor="rd-type-filter" className="sr-only">
          {t("resources.type")}
        </label>
        <select
          id="rd-type-filter"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400"
        >
          <option value="">{t("resourceDashboard.allTypes")}</option>
          {RESOURCE_TYPES.map((value) => (
            <option key={value} value={value}>
              {t(`resources.types.${value}`)}
            </option>
          ))}
        </select>
        <label htmlFor="rd-status-filter" className="sr-only">
          {t("resourceDashboard.status")}
        </label>
        <select
          id="rd-status-filter"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400"
        >
          <option value="">{t("resourceDashboard.allStatuses")}</option>
          {BOOKING_STATUSES.map((value) => (
            <option key={value} value={value}>
              {t(`resourceDashboard.bookingStatuses.${value}`)}
            </option>
          ))}
        </select>
        <label htmlFor="rd-date-from" className="sr-only">
          {t("resourceDashboard.from")}
        </label>
        <input
          id="rd-date-from"
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          title={t("resourceDashboard.from")}
          className="px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400"
        />
        <label htmlFor="rd-date-to" className="sr-only">
          {t("resourceDashboard.to")}
        </label>
        <input
          id="rd-date-to"
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          title={t("resourceDashboard.to")}
          className="px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400"
        />
      </div>

      <ul className="divide-y divide-line">
        {reservations.map((reservation) => (
          <li key={reservation.id} className="py-2 text-sm flex justify-between items-center">
            <span>
              <span className="font-medium">{reservation.resource_name}</span>
              {" · "}
              {new Date(reservation.booking_start_time).toLocaleString()}
              {" – "}
              {new Date(reservation.booking_end_time).toLocaleString()}
              {" · "}
              {reservation.client_name}
            </span>
            <span className="text-xs bg-surface-2 text-ink-soft px-1.5 py-0.5 rounded shrink-0">
              {t(`resourceDashboard.bookingStatuses.${reservation.booking_status}`)}
            </span>
          </li>
        ))}
        {reservations.length === 0 && (
          <p className="text-ink-soft text-sm">
            {t("resourceDashboard.noReservations")}
          </p>
        )}
      </ul>
    </section>
  );
}

function RentalsSection() {
  const { t } = useTranslation();
  const [rentals, setRentals] = useState([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [statusMsg, setStatusMsg] = useState(null);
  const loadRequestRef = useRef(0);

  async function load() {
    const requestId = ++loadRequestRef.current;
    const params = {};
    if (statusFilter) params.status = statusFilter;
    const res = await api.get("/resource-rentals/", { params });
    if (requestId === loadRequestRef.current) {
      setRentals(res.data);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  async function checkOut(rentalId) {
    try {
      await api.post(`/resource-rentals/${rentalId}/check-out/`);
      setStatusMsg({ key: "resourceDashboard.checkedOut", type: "success" });
      load();
    } catch (err) {
      const data = err.response?.data;
      const message = data ? Object.values(data).flat().join(" ") : null;
      setStatusMsg(
        message
          ? { raw: message, type: "error" }
          : { key: "resourceDashboard.actionFailed", type: "error" },
      );
    }
  }

  async function checkIn(rentalId) {
    try {
      await api.post(`/resource-rentals/${rentalId}/check-in/`);
      setStatusMsg({ key: "resourceDashboard.checkedIn", type: "success" });
      load();
    } catch (err) {
      const data = err.response?.data;
      const message = data ? Object.values(data).flat().join(" ") : null;
      setStatusMsg(
        message
          ? { raw: message, type: "error" }
          : { key: "resourceDashboard.actionFailed", type: "error" },
      );
    }
  }

  return (
    <section className="bg-surface border border-line rounded-2xl p-6">
      <h2 className="font-medium text-ink mb-3">
        {t("resourceDashboard.rentalsTitle")}
      </h2>

      {statusMsg && (
        <div
          role="status"
          className={
            statusMsg.type === "success"
              ? "mb-4 text-sm text-green-700 bg-green-50 border border-green-200 rounded p-3"
              : "mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3"
          }
        >
          {statusMsg.key ? t(statusMsg.key, statusMsg.params) : statusMsg.raw}
        </div>
      )}

      <div className="flex flex-wrap gap-2 mb-4">
        <label htmlFor="rd-rental-status" className="sr-only">
          {t("resourceDashboard.status")}
        </label>
        <select
          id="rd-rental-status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400"
        >
          <option value="">{t("resourceDashboard.allStatuses")}</option>
          {RENTAL_STATUSES.map((value) => (
            <option key={value} value={value}>
              {t(`resourceDashboard.rentalStatuses.${value}`)}
            </option>
          ))}
        </select>
      </div>

      <ul className="divide-y divide-line">
        {rentals.map((rental) => (
          <li key={rental.id} className="py-2 text-sm flex justify-between items-center gap-2">
            <span>
              <span className="font-medium">{rental.resource_name}</span>
              {" · "}
              {rental.client_name}
              <span
                className={
                  rental.rental_status === "overdue"
                    ? "ml-1.5 text-xs bg-red-50 text-red-700 border border-red-200 px-1.5 py-0.5 rounded"
                    : "ml-1.5 text-xs bg-surface-2 text-ink-soft px-1.5 py-0.5 rounded"
                }
              >
                {t(`resourceDashboard.rentalStatuses.${rental.rental_status}`)}
              </span>
            </span>
            <div className="flex gap-2 shrink-0">
              {rental.rental_status === "scheduled" && (
                <button
                  onClick={() => checkOut(rental.id)}
                  className="bg-brand-50 text-brand-700 text-xs px-2.5 py-1 rounded-lg font-medium transition-colors hover:bg-brand-100 focus:outline-none focus:ring-2 focus:ring-brand-400"
                >
                  {t("resourceDashboard.checkOut")}
                </button>
              )}
              {(rental.rental_status === "active" ||
                rental.rental_status === "overdue") && (
                <button
                  onClick={() => checkIn(rental.id)}
                  className="bg-brand-50 text-brand-700 text-xs px-2.5 py-1 rounded-lg font-medium transition-colors hover:bg-brand-100 focus:outline-none focus:ring-2 focus:ring-brand-400"
                >
                  {t("resourceDashboard.checkIn")}
                </button>
              )}
            </div>
          </li>
        ))}
        {rentals.length === 0 && (
          <p className="text-ink-soft text-sm">
            {t("resourceDashboard.noRentals")}
          </p>
        )}
      </ul>
    </section>
  );
}

export default function ResourceDashboard() {
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
            {t("resourceDashboard.title")}
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
        <ReservationsSection />
        <RentalsSection />
      </main>
    </div>
  );
}
