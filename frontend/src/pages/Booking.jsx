// Owner's booking management page: create, edit, and delete
// services (with a photo, description, a country-driven workspace
// currency, timezone, max per slot capacity, and duration in
// minutes or hours), set weekly working hours (with edit and
// remove), see upcoming bookings (with cancel confirmation,
// remaining capacity, and a status message), manage the
// waitlist, respond to reviews, and manage bookable resources
// (rooms, equipment, chairs, etc.) tied to services, with their
// own optional price and duration in minutes or hours (up to 24
// hours) for direct booking.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  FiCalendar,
  FiCheck,
  FiCheckCircle,
  FiCopy,
  FiEdit2,
  FiLogOut,
  FiMessageCircle,
  FiPlus,
  FiTrash2,
  FiUser,
  FiUserMinus,
  FiUserX,
  FiX,
  FiXCircle,
} from "react-icons/fi";
import { SiStripe } from "react-icons/si";
import { useAuth } from "../lib/AuthContext.jsx";
import LanguageToggle from "../components/LanguageToggle.jsx";
import ThemeToggle from "../components/ThemeToggle.jsx";
import MobileNav from "../components/MobileNav.jsx";
import SkipLink from "../components/SkipLink.jsx";
import api from "../lib/api";

const WEEKDAY_KEYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

// Displays a duration in whichever unit it was most likely
// entered in - whole days if it divides evenly into days, whole
// hours if it divides evenly into hours, otherwise minutes.
function formatDuration(minutes) {
  if (minutes % 1440 === 0) {
    const days = minutes / 1440;
    return `${days} day${days !== 1 ? "s" : ""}`;
  }
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return `${hours} hr${hours !== 1 ? "s" : ""}`;
  }
  return `${minutes} min`;
}

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
            className="text-sm text-brand-600 underline transition-colors hover:text-brand-800 focus:outline-none focus:ring-2 focus:ring-brand-400 rounded"
          >
            &larr; {user.workspace_name}
          </Link>
          <h1 className="text-lg font-semibold mt-1 text-ink">
            {t("booking.servicesTitle")}
          </h1>
        </div>
        <MobileNav>
          <ThemeToggle />
          <LanguageToggle />
          <Link
            to="/account"
            aria-label={t("account.title")}
            className="text-sm text-brand-600 underline transition-colors hover:text-brand-800 focus:outline-none focus:ring-2 focus:ring-brand-400 rounded"
          >
            <FiUser className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
            {t("account.title")}
          </Link>
          <button
            onClick={logout}
            aria-label={t("dashboard.signOut")}
            className="text-sm text-brand-600 underline transition-colors hover:text-brand-800 focus:outline-none focus:ring-2 focus:ring-brand-400 rounded"
          >
            <FiLogOut className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
            {t("dashboard.signOut")}
          </button>
        </MobileNav>
      </header>
      <main id="main-content" className="max-w-2xl mx-auto px-8 py-8 space-y-6">
        <ServicesSection />
        <ResourcesSection />
        <WorkingHoursSection />
        <BlockedTimeSection />
        <PublicBookingSection />
        <BookingsSection />
        <WaitlistSection />
        <ReviewsSection />
      </main>
    </div>
  );
}

// Payment-requirement + cancellation-policy fields, shared between
// the create and edit service forms so the two never drift apart.
function PolicyFields({
  idPrefix,
  paymentRequirement,
  setPaymentRequirement,
  depositPercent,
  setDepositPercent,
  noticeHours,
  setNoticeHours,
  feePercent,
  setFeePercent,
}) {
  const { t } = useTranslation();
  return (
    <div className="border border-line rounded-lg p-3 mb-2 space-y-2">
      <p className="text-xs font-medium text-ink-soft">
        {t("booking.paymentPolicyTitle")}
      </p>
      <div className="flex gap-2 flex-wrap">
        <label htmlFor={`${idPrefix}-payment-req`} className="sr-only">
          {t("booking.paymentPolicyTitle")}
        </label>
        <select
          id={`${idPrefix}-payment-req`}
          value={paymentRequirement}
          onChange={(e) => setPaymentRequirement(e.target.value)}
          className="px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400"
        >
          <option value="none">{t("booking.paymentNone")}</option>
          <option value="deposit">{t("booking.paymentDeposit")}</option>
          <option value="full">{t("booking.paymentFull")}</option>
        </select>
        {paymentRequirement === "deposit" && (
          <>
            <label htmlFor={`${idPrefix}-deposit-pct`} className="sr-only">
              {t("booking.depositPercent")}
            </label>
            <input
              id={`${idPrefix}-deposit-pct`}
              type="number"
              min="1"
              max="100"
              placeholder={t("booking.depositPercent")}
              value={depositPercent}
              onChange={(e) => setDepositPercent(e.target.value)}
              className="w-32 px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
          </>
        )}
      </div>
      <div className="flex gap-2 flex-wrap">
        <label htmlFor={`${idPrefix}-notice-hours`} className="sr-only">
          {t("booking.cancellationNoticeHours")}
        </label>
        <input
          id={`${idPrefix}-notice-hours`}
          type="number"
          min="0"
          placeholder={t("booking.cancellationNoticeHours")}
          value={noticeHours}
          onChange={(e) => setNoticeHours(e.target.value)}
          className="w-40 px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400"
        />
        <label htmlFor={`${idPrefix}-fee-pct`} className="sr-only">
          {t("booking.lateCancellationFeePercent")}
        </label>
        <input
          id={`${idPrefix}-fee-pct`}
          type="number"
          min="1"
          max="100"
          placeholder={t("booking.lateCancellationFeePercent")}
          value={feePercent}
          onChange={(e) => setFeePercent(e.target.value)}
          className="w-44 px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400"
        />
      </div>
    </div>
  );
}

// Prep/recovery buffers, notice window, advance-booking window, and
// daily/weekly caps (BOOK-13..16) - a second policy block alongside
// PolicyFields since these govern *when* a slot exists at all,
// rather than payment/cancellation terms for a slot that already
// does.
function SchedulingRuleFields({
  idPrefix,
  bufferBefore,
  setBufferBefore,
  bufferAfter,
  setBufferAfter,
  minNoticeHours,
  setMinNoticeHours,
  maxAdvanceDays,
  setMaxAdvanceDays,
  maxPerDay,
  setMaxPerDay,
  maxPerWeek,
  setMaxPerWeek,
}) {
  const { t } = useTranslation();
  return (
    <div className="border border-line rounded-lg p-3 mb-2 space-y-2">
      <p className="text-xs font-medium text-ink-soft">
        {t("booking.schedulingRulesTitle")}
      </p>
      <div className="flex gap-2 flex-wrap">
        <label htmlFor={`${idPrefix}-buffer-before`} className="sr-only">
          {t("booking.bufferBeforeMinutes")}
        </label>
        <input
          id={`${idPrefix}-buffer-before`}
          type="number"
          min="0"
          placeholder={t("booking.bufferBeforeMinutes")}
          value={bufferBefore}
          onChange={(e) => setBufferBefore(e.target.value)}
          className="w-36 px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400"
        />
        <label htmlFor={`${idPrefix}-buffer-after`} className="sr-only">
          {t("booking.bufferAfterMinutes")}
        </label>
        <input
          id={`${idPrefix}-buffer-after`}
          type="number"
          min="0"
          placeholder={t("booking.bufferAfterMinutes")}
          value={bufferAfter}
          onChange={(e) => setBufferAfter(e.target.value)}
          className="w-36 px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400"
        />
      </div>
      <div className="flex gap-2 flex-wrap">
        <label htmlFor={`${idPrefix}-min-notice`} className="sr-only">
          {t("booking.minNoticeHours")}
        </label>
        <input
          id={`${idPrefix}-min-notice`}
          type="number"
          min="0"
          placeholder={t("booking.minNoticeHours")}
          value={minNoticeHours}
          onChange={(e) => setMinNoticeHours(e.target.value)}
          className="w-36 px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400"
        />
        <label htmlFor={`${idPrefix}-max-advance`} className="sr-only">
          {t("booking.maxAdvanceDays")}
        </label>
        <input
          id={`${idPrefix}-max-advance`}
          type="number"
          min="0"
          placeholder={t("booking.maxAdvanceDays")}
          value={maxAdvanceDays}
          onChange={(e) => setMaxAdvanceDays(e.target.value)}
          className="w-36 px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400"
        />
      </div>
      <div className="flex gap-2 flex-wrap">
        <label htmlFor={`${idPrefix}-max-per-day`} className="sr-only">
          {t("booking.maxBookingsPerDay")}
        </label>
        <input
          id={`${idPrefix}-max-per-day`}
          type="number"
          min="0"
          placeholder={t("booking.maxBookingsPerDay")}
          value={maxPerDay}
          onChange={(e) => setMaxPerDay(e.target.value)}
          className="w-36 px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400"
        />
        <label htmlFor={`${idPrefix}-max-per-week`} className="sr-only">
          {t("booking.maxBookingsPerWeek")}
        </label>
        <input
          id={`${idPrefix}-max-per-week`}
          type="number"
          min="0"
          placeholder={t("booking.maxBookingsPerWeek")}
          value={maxPerWeek}
          onChange={(e) => setMaxPerWeek(e.target.value)}
          className="w-36 px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400"
        />
      </div>
    </div>
  );
}

function ServicesSection() {
  const { t } = useTranslation();
  const [services, setServices] = useState([]);
  const [workspace, setWorkspace] = useState(null);
  const [countries, setCountries] = useState([]);
  const [countryValue, setCountryValue] = useState("");
  const [timezoneValue, setTimezoneValue] = useState("UTC");
  const [reminderHours, setReminderHours] = useState("24");
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [duration, setDuration] = useState("60");
  const [durationUnit, setDurationUnit] = useState("minutes");
  const [price, setPrice] = useState("");
  const [capacity, setCapacity] = useState("1");
  const [paymentRequirement, setPaymentRequirement] = useState("none");
  const [depositPercent, setDepositPercent] = useState("");
  const [noticeHours, setNoticeHours] = useState("24");
  const [feePercent, setFeePercent] = useState("");
  const [newPhoto, setNewPhoto] = useState(null);
  const [newPhotoPreview, setNewPhotoPreview] = useState(null);
  const [staffIds, setStaffIds] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [location, setLocation] = useState("");
  const [isOnline, setIsOnline] = useState(false);
  const [meetingLink, setMeetingLink] = useState("");
  const [instructions, setInstructions] = useState("");
  const [bufferBefore, setBufferBefore] = useState("");
  const [bufferAfter, setBufferAfter] = useState("");
  const [minNoticeHours, setMinNoticeHours] = useState("");
  const [maxAdvanceDays, setMaxAdvanceDays] = useState("");
  const [maxPerDay, setMaxPerDay] = useState("");
  const [maxPerWeek, setMaxPerWeek] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editCapacity, setEditCapacity] = useState("1");
  const [editPaymentRequirement, setEditPaymentRequirement] = useState("none");
  const [editDepositPercent, setEditDepositPercent] = useState("");
  const [editNoticeHours, setEditNoticeHours] = useState("24");
  const [editFeePercent, setEditFeePercent] = useState("");
  const [editStaffIds, setEditStaffIds] = useState([]);
  const [editLocation, setEditLocation] = useState("");
  const [editIsOnline, setEditIsOnline] = useState(false);
  const [editMeetingLink, setEditMeetingLink] = useState("");
  const [editInstructions, setEditInstructions] = useState("");
  const [editBufferBefore, setEditBufferBefore] = useState("");
  const [editBufferAfter, setEditBufferAfter] = useState("");
  const [editMinNoticeHours, setEditMinNoticeHours] = useState("");
  const [editMaxAdvanceDays, setEditMaxAdvanceDays] = useState("");
  const [editMaxPerDay, setEditMaxPerDay] = useState("");
  const [editMaxPerWeek, setEditMaxPerWeek] = useState("");
  const [statusMsg, setStatusMsg] = useState(null);
  const [stripeConnectBanner, setStripeConnectBanner] = useState(null);

  async function load() {
    const res = await api.get("/services/");
    setServices(res.data);
  }
  async function loadTeamMembers() {
    const res = await api.get("/team/");
    setTeamMembers(res.data);
  }
  async function loadWorkspace() {
    const res = await api.get("/workspace/");
    setWorkspace(res.data);
    setCountryValue(res.data.country || "");
    setTimezoneValue(res.data.timezone);
    setReminderHours(String(res.data.reminder_hours_before ?? "24"));
  }
  async function loadCountries() {
    const res = await api.get("/countries/");
    setCountries(res.data);
  }
  useEffect(() => {
    load();
    loadWorkspace();
    loadCountries();
    loadTeamMembers();
    const params = new URLSearchParams(window.location.search);
    const stripeConnect = params.get("stripe_connect");
    if (stripeConnect === "success" || stripeConnect === "error") {
      setStripeConnectBanner(stripeConnect);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  async function connectStripe() {
    try {
      const res = await api.get("/workspace/stripe/connect/");
      window.location.href = res.data.url;
    } catch (err) {
      setStatusMsg({
        raw:
          err.response?.data?.[0] || t("booking.stripeConnectError"),
        type: "error",
      });
    }
  }

  async function disconnectStripe() {
    if (!window.confirm(t("booking.confirmDisconnectStripe"))) return;
    try {
      const res = await api.post("/workspace/stripe/connect/disconnect/");
      setWorkspace(res.data);
    } catch {
      setStatusMsg({ raw: t("booking.stripeConnectError"), type: "error" });
    }
  }

  async function onCountryChange(e) {
    const code = e.target.value;
    setCountryValue(code);
    if (!code) return;
    const match = countries.find((c) => c.code === code);
    if (!match) return;
    const res = await api.patch("/workspace/", {
      country: code,
      currency: match.currency,
    });
    setWorkspace(res.data);
  }

  async function onTimezoneChange(e) {
    const value = e.target.value;
    setTimezoneValue(value);
    const res = await api.patch("/workspace/", { timezone: value });
    setWorkspace(res.data);
  }

  async function onReminderHoursBlur() {
    const hours = parseInt(reminderHours, 10);
    if (!hours || hours === workspace?.reminder_hours_before) return;
    const res = await api.patch("/workspace/", {
      reminder_hours_before: hours,
    });
    setWorkspace(res.data);
  }

  async function onCreate(e) {
    e.preventDefault();
    const minutes =
      durationUnit === "days"
        ? Math.round(parseFloat(duration) * 1440)
        : durationUnit === "hours"
          ? Math.round(parseFloat(duration) * 60)
          : parseInt(duration, 10);
    const res = await api.post("/services/", {
      name,
      description,
      duration_minutes: minutes,
      price: price || null,
      capacity,
      payment_requirement: paymentRequirement,
      deposit_percent:
        paymentRequirement === "deposit" ? depositPercent || null : null,
      cancellation_notice_hours: noticeHours || 0,
      late_cancellation_fee_percent: feePercent || null,
      staff: staffIds,
      location,
      is_online: isOnline,
      meeting_link: isOnline ? meetingLink : "",
      instructions,
      buffer_before_minutes: bufferBefore || 0,
      buffer_after_minutes: bufferAfter || 0,
      min_notice_hours: minNoticeHours || 0,
      max_advance_days: maxAdvanceDays || null,
      max_bookings_per_day: maxPerDay || null,
      max_bookings_per_week: maxPerWeek || null,
    });
    if (newPhoto) {
      const formData = new FormData();
      formData.append("photo", newPhoto);
      await api.patch(`/services/${res.data.id}/`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
    }
    setName("");
    setDescription("");
    setDuration("60");
    setDurationUnit("minutes");
    setPrice("");
    setCapacity("1");
    setPaymentRequirement("none");
    setDepositPercent("");
    setNoticeHours("24");
    setFeePercent("");
    setNewPhoto(null);
    setNewPhotoPreview(null);
    setStaffIds([]);
    setLocation("");
    setIsOnline(false);
    setMeetingLink("");
    setInstructions("");
    setBufferBefore("");
    setBufferAfter("");
    setMinNoticeHours("");
    setMaxAdvanceDays("");
    setMaxPerDay("");
    setMaxPerWeek("");
    setShowForm(false);
    setStatusMsg({ key: "booking.serviceCreated", type: "success" });
    load();
  }

  async function onPhotoChange(serviceId, file) {
    if (!file) return;
    const formData = new FormData();
    formData.append("photo", file);
    await api.patch(`/services/${serviceId}/`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    load();
  }

  function startEdit(service) {
    setEditingId(service.id);
    setEditName(service.name);
    setEditDescription(service.description || "");
    setEditPrice(service.price || "");
    setEditCapacity(String(service.capacity));
    setEditPaymentRequirement(service.payment_requirement || "none");
    setEditDepositPercent(service.deposit_percent || "");
    setEditNoticeHours(String(service.cancellation_notice_hours ?? "24"));
    setEditFeePercent(service.late_cancellation_fee_percent || "");
    setEditStaffIds(service.staff || []);
    setEditLocation(service.location || "");
    setEditIsOnline(service.is_online || false);
    setEditMeetingLink(service.meeting_link || "");
    setEditInstructions(service.instructions || "");
    setEditBufferBefore(String(service.buffer_before_minutes ?? ""));
    setEditBufferAfter(String(service.buffer_after_minutes ?? ""));
    setEditMinNoticeHours(String(service.min_notice_hours ?? ""));
    setEditMaxAdvanceDays(service.max_advance_days ?? "");
    setEditMaxPerDay(service.max_bookings_per_day ?? "");
    setEditMaxPerWeek(service.max_bookings_per_week ?? "");
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function saveEdit(serviceId) {
    await api.patch(`/services/${serviceId}/`, {
      name: editName,
      description: editDescription,
      price: editPrice || null,
      capacity: editCapacity,
      payment_requirement: editPaymentRequirement,
      deposit_percent:
        editPaymentRequirement === "deposit"
          ? editDepositPercent || null
          : null,
      cancellation_notice_hours: editNoticeHours || 0,
      late_cancellation_fee_percent: editFeePercent || null,
      staff: editStaffIds,
      location: editLocation,
      is_online: editIsOnline,
      meeting_link: editIsOnline ? editMeetingLink : "",
      instructions: editInstructions,
      buffer_before_minutes: editBufferBefore || 0,
      buffer_after_minutes: editBufferAfter || 0,
      min_notice_hours: editMinNoticeHours || 0,
      max_advance_days: editMaxAdvanceDays || null,
      max_bookings_per_day: editMaxPerDay || null,
      max_bookings_per_week: editMaxPerWeek || null,
    });
    setEditingId(null);
    setStatusMsg({ key: "booking.serviceUpdated", type: "success" });
    load();
  }

  function toggleStaffId(ids, setIds, staffId) {
    setIds(
      ids.includes(staffId)
        ? ids.filter((id) => id !== staffId)
        : [...ids, staffId],
    );
  }

  async function deleteService(serviceId, serviceName) {
    if (
      !window.confirm(t("booking.confirmDeleteService", { name: serviceName }))
    )
      return;
    await api.delete(`/services/${serviceId}/`);
    setStatusMsg({
      key: "booking.serviceDeleted",
      params: { name: serviceName },
      type: "error",
    });
    load();
  }

  return (
    <section className="bg-surface border border-line rounded-2xl p-6">
      <div className="flex justify-between items-center mb-3">
        <h2 className="font-medium text-ink">{t("booking.servicesTitle")}</h2>
        <button
          onClick={() => {
            setShowForm(!showForm);
            setStatusMsg(null);
          }}
          aria-expanded={showForm}
          aria-label={t("booking.addService")}
          className="text-sm text-brand-600 transition-colors hover:text-brand-800 focus:outline-none focus:ring-2 focus:ring-brand-400 rounded"
        >
          <FiPlus className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
          {t("booking.addService")}
        </button>
      </div>

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

      <div className="flex flex-wrap gap-4 mb-4">
        <div>
          <label
            htmlFor="workspace-country"
            className="block text-xs text-ink-soft mb-1"
          >
            {t("booking.countryLabel")}
          </label>
          <select
            id="workspace-country"
            value={countryValue}
            onChange={onCountryChange}
            className="px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
          >
            <option value="">{t("booking.selectCountry")}</option>
            {countries.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
          {workspace?.currency && (
            <p className="text-xs text-ink-soft mt-1">
              {t("booking.currencySetTo", { currency: workspace.currency })}
            </p>
          )}
        </div>

        <div>
          <label
            htmlFor="workspace-timezone"
            className="block text-xs text-ink-soft mb-1"
          >
            {t("booking.timezoneLabel")}
          </label>
          <select
            id="workspace-timezone"
            value={timezoneValue}
            onChange={onTimezoneChange}
            className="px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
          >
            <option value="UTC">UTC</option>
            <option value="Europe/Stockholm">Europe/Stockholm</option>
            <option value="Europe/London">Europe/London</option>
            <option value="Europe/Paris">Europe/Paris</option>
            <option value="Europe/Berlin">Europe/Berlin</option>
            <option value="Africa/Douala">Africa/Douala</option>
            <option value="Africa/Lagos">Africa/Lagos</option>
            <option value="America/New_York">America/New_York</option>
            <option value="America/Los_Angeles">America/Los_Angeles</option>
            <option value="Asia/Dubai">Asia/Dubai</option>
          </select>
        </div>

        <div>
          <label
            htmlFor="workspace-reminder-hours"
            className="block text-xs text-ink-soft mb-1"
          >
            {t("booking.reminderHoursLabel")}
          </label>
          <input
            id="workspace-reminder-hours"
            type="number"
            min="1"
            value={reminderHours}
            onChange={(e) => setReminderHours(e.target.value)}
            onBlur={onReminderHoursBlur}
            className="w-28 px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
          />
        </div>
      </div>

      <div className="border border-line rounded-lg p-4 mb-4">
        <h3 className="text-sm font-medium mb-1">
          {t("booking.paymentsTitle")}
        </h3>
        {stripeConnectBanner && (
          <div
            role="status"
            className={
              stripeConnectBanner === "success"
                ? "mb-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded p-3"
                : "mb-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3"
            }
          >
            {stripeConnectBanner === "success"
              ? t("booking.stripeConnectSuccess")
              : t("booking.stripeConnectError")}
          </div>
        )}
        {workspace?.stripe_connected ? (
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-ink-soft">
              {t("booking.stripeConnected")}
            </p>
            <button
              onClick={disconnectStripe}
              className="text-sm text-red-600 underline transition-colors hover:text-red-800 focus:outline-none focus:ring-2 focus:ring-brand-400 rounded"
            >
              <FiXCircle className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
              {t("booking.disconnectStripe")}
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-ink-soft">
              {t("booking.stripeNotConnected")}
            </p>
            <button
              onClick={connectStripe}
              className="bg-brand-600 text-white text-sm px-3 py-1.5 rounded-lg font-medium transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400"
            >
              <SiStripe className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
              {t("booking.connectStripe")}
            </button>
          </div>
        )}

        <PaymentMethodsSection />
      </div>

      {showForm && (
        <form
          onSubmit={onCreate}
          className="border border-line rounded-lg p-4 mb-4"
        >
          <label htmlFor="service-name" className="sr-only">
            {t("booking.serviceName")}
          </label>
          <input
            id="service-name"
            required
            placeholder={t("booking.serviceName")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full mb-2 px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
          />
          <label htmlFor="service-description" className="sr-only">
            {t("booking.descriptionOptional")}
          </label>
          <textarea
            id="service-description"
            placeholder={t("booking.descriptionOptional")}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full mb-2 px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
          />

          <label
            className="flex items-center gap-2 mb-2 cursor-pointer w-fit"
            title={t("booking.addPhotoOptional")}
          >
            {newPhotoPreview ? (
              <img
                src={newPhotoPreview}
                alt="Service photo preview"
                className="w-12 h-12 rounded-lg object-cover border border-line"
              />
            ) : (
              <div
                aria-hidden="true"
                className="w-12 h-12 rounded-lg bg-surface-2 border border-dashed border-line flex items-center justify-center text-xs text-ink-soft transition-colors hover:bg-line"
              >
                +
              </div>
            )}
            <span className="text-xs text-ink-soft">
              {newPhotoPreview
                ? t("booking.changePhoto")
                : t("booking.addPhotoOptional")}
            </span>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files[0];
                if (!file) return;
                setNewPhoto(file);
                setNewPhotoPreview(URL.createObjectURL(file));
              }}
              aria-label={t("booking.addPhotoOptional")}
            />
          </label>

          <div className="flex flex-wrap gap-2 mb-2">
            <label htmlFor="service-duration" className="sr-only">
              {t("booking.serviceDuration")}
            </label>
            <input
              id="service-duration"
              required
              type="number"
              min={
                durationUnit === "days"
                  ? "1"
                  : durationUnit === "hours"
                    ? "0.25"
                    : "5"
              }
              step={
                durationUnit === "days"
                  ? "1"
                  : durationUnit === "hours"
                    ? "0.25"
                    : "5"
              }
              placeholder={t("booking.serviceDuration")}
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              className="w-24 px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
            />
            <label htmlFor="service-duration-unit" className="sr-only">
              Duration unit
            </label>
            <select
              id="service-duration-unit"
              value={durationUnit}
              onChange={(e) => setDurationUnit(e.target.value)}
              className="px-2 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400"
            >
              <option value="minutes">min</option>
              <option value="hours">hrs</option>
              <option value="days">days</option>
            </select>
            <label htmlFor="service-price" className="sr-only">
              Price
            </label>
            <input
              id="service-price"
              type="number"
              placeholder={`Price (${workspace?.currency || "EUR"}, optional)`}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="flex-1 px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
            />
            <label htmlFor="service-capacity" className="sr-only">
              {t("booking.maxPerSlot")}
            </label>
            <input
              id="service-capacity"
              type="number"
              min="1"
              title={t("booking.maxPerSlot")}
              placeholder={t("booking.maxPerSlot")}
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
              className="w-28 px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
            />
          </div>
          <label htmlFor="service-location" className="sr-only">
            {t("booking.serviceLocation")}
          </label>
          <input
            id="service-location"
            placeholder={t("booking.serviceLocation")}
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="w-full mb-2 px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
          />
          <label className="flex items-center gap-2 mb-2 text-sm text-ink cursor-pointer w-fit">
            <input
              type="checkbox"
              checked={isOnline}
              onChange={(e) => setIsOnline(e.target.checked)}
              className="rounded"
            />
            {t("booking.isOnlineService")}
          </label>
          {isOnline && (
            <>
              <label htmlFor="service-meeting-link" className="sr-only">
                {t("booking.meetingLink")}
              </label>
              <input
                id="service-meeting-link"
                type="url"
                placeholder={t("booking.meetingLink")}
                value={meetingLink}
                onChange={(e) => setMeetingLink(e.target.value)}
                className="w-full mb-2 px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
              />
            </>
          )}
          <label htmlFor="service-instructions" className="sr-only">
            {t("booking.serviceInstructions")}
          </label>
          <textarea
            id="service-instructions"
            placeholder={t("booking.serviceInstructions")}
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            rows={2}
            className="w-full mb-2 px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
          />
          <PolicyFields
            idPrefix="new-service"
            paymentRequirement={paymentRequirement}
            setPaymentRequirement={setPaymentRequirement}
            depositPercent={depositPercent}
            setDepositPercent={setDepositPercent}
            noticeHours={noticeHours}
            setNoticeHours={setNoticeHours}
            feePercent={feePercent}
            setFeePercent={setFeePercent}
          />
          <SchedulingRuleFields
            idPrefix="new-service"
            bufferBefore={bufferBefore}
            setBufferBefore={setBufferBefore}
            bufferAfter={bufferAfter}
            setBufferAfter={setBufferAfter}
            minNoticeHours={minNoticeHours}
            setMinNoticeHours={setMinNoticeHours}
            maxAdvanceDays={maxAdvanceDays}
            setMaxAdvanceDays={setMaxAdvanceDays}
            maxPerDay={maxPerDay}
            setMaxPerDay={setMaxPerDay}
            maxPerWeek={maxPerWeek}
            setMaxPerWeek={setMaxPerWeek}
          />
          {teamMembers.length > 0 && (
            <fieldset className="mb-2">
              <legend className="text-xs text-ink-soft mb-1">
                {t("booking.staffForService")}
              </legend>
              <div className="flex flex-wrap gap-3">
                {teamMembers.map((member) => (
                  <label
                    key={member.id}
                    className="flex items-center gap-1.5 text-sm text-ink cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={staffIds.includes(member.id)}
                      onChange={() =>
                        toggleStaffId(staffIds, setStaffIds, member.id)
                      }
                      className="rounded"
                    />
                    {member.first_name || member.email}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          <button
            aria-label={t("booking.createService")}
            className="bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400"
          >
            <FiPlus className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
            {t("booking.createService")}
          </button>
        </form>
      )}

      <ul className="divide-y divide-line">
        {services.map((service) => (
          <li key={service.id} className="py-3 text-sm">
            {editingId === service.id ? (
              <div className="border border-brand-200 rounded-lg p-3">
                <label htmlFor={`edit-name-${service.id}`} className="sr-only">
                  Name
                </label>
                <input
                  id={`edit-name-${service.id}`}
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full mb-2 px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
                />
                <label htmlFor={`edit-desc-${service.id}`} className="sr-only">
                  {t("booking.descriptionOptional")}
                </label>
                <textarea
                  id={`edit-desc-${service.id}`}
                  placeholder={t("booking.descriptionOptional")}
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  rows={2}
                  className="w-full mb-2 px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
                />
                <div className="flex flex-wrap gap-2 mb-2">
                  <label
                    htmlFor={`edit-price-${service.id}`}
                    className="sr-only"
                  >
                    Price
                  </label>
                  <input
                    id={`edit-price-${service.id}`}
                    type="number"
                    placeholder={`Price (${workspace?.currency})`}
                    value={editPrice}
                    onChange={(e) => setEditPrice(e.target.value)}
                    className="flex-1 px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
                  />
                  <label
                    htmlFor={`edit-capacity-${service.id}`}
                    className="sr-only"
                  >
                    {t("booking.maxPerSlot")}
                  </label>
                  <input
                    id={`edit-capacity-${service.id}`}
                    type="number"
                    min="1"
                    placeholder={t("booking.maxPerSlot")}
                    value={editCapacity}
                    onChange={(e) => setEditCapacity(e.target.value)}
                    className="w-28 px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
                  />
                </div>
                <label
                  htmlFor={`edit-location-${service.id}`}
                  className="sr-only"
                >
                  {t("booking.serviceLocation")}
                </label>
                <input
                  id={`edit-location-${service.id}`}
                  placeholder={t("booking.serviceLocation")}
                  value={editLocation}
                  onChange={(e) => setEditLocation(e.target.value)}
                  className="w-full mb-2 px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
                />
                <label className="flex items-center gap-2 mb-2 text-sm text-ink cursor-pointer w-fit">
                  <input
                    type="checkbox"
                    checked={editIsOnline}
                    onChange={(e) => setEditIsOnline(e.target.checked)}
                    className="rounded"
                  />
                  {t("booking.isOnlineService")}
                </label>
                {editIsOnline && (
                  <>
                    <label
                      htmlFor={`edit-meeting-link-${service.id}`}
                      className="sr-only"
                    >
                      {t("booking.meetingLink")}
                    </label>
                    <input
                      id={`edit-meeting-link-${service.id}`}
                      type="url"
                      placeholder={t("booking.meetingLink")}
                      value={editMeetingLink}
                      onChange={(e) => setEditMeetingLink(e.target.value)}
                      className="w-full mb-2 px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
                    />
                  </>
                )}
                <label
                  htmlFor={`edit-instructions-${service.id}`}
                  className="sr-only"
                >
                  {t("booking.serviceInstructions")}
                </label>
                <textarea
                  id={`edit-instructions-${service.id}`}
                  placeholder={t("booking.serviceInstructions")}
                  value={editInstructions}
                  onChange={(e) => setEditInstructions(e.target.value)}
                  rows={2}
                  className="w-full mb-2 px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
                />
                <PolicyFields
                  idPrefix={`edit-service-${service.id}`}
                  paymentRequirement={editPaymentRequirement}
                  setPaymentRequirement={setEditPaymentRequirement}
                  depositPercent={editDepositPercent}
                  setDepositPercent={setEditDepositPercent}
                  noticeHours={editNoticeHours}
                  setNoticeHours={setEditNoticeHours}
                  feePercent={editFeePercent}
                  setFeePercent={setEditFeePercent}
                />
                <SchedulingRuleFields
                  idPrefix={`edit-service-${service.id}`}
                  bufferBefore={editBufferBefore}
                  setBufferBefore={setEditBufferBefore}
                  bufferAfter={editBufferAfter}
                  setBufferAfter={setEditBufferAfter}
                  minNoticeHours={editMinNoticeHours}
                  setMinNoticeHours={setEditMinNoticeHours}
                  maxAdvanceDays={editMaxAdvanceDays}
                  setMaxAdvanceDays={setEditMaxAdvanceDays}
                  maxPerDay={editMaxPerDay}
                  setMaxPerDay={setEditMaxPerDay}
                  maxPerWeek={editMaxPerWeek}
                  setMaxPerWeek={setEditMaxPerWeek}
                />
                {teamMembers.length > 0 && (
                  <fieldset className="mb-2">
                    <legend className="text-xs text-ink-soft mb-1">
                      {t("booking.staffForService")}
                    </legend>
                    <div className="flex flex-wrap gap-3">
                      {teamMembers.map((member) => (
                        <label
                          key={member.id}
                          className="flex items-center gap-1.5 text-sm text-ink cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={editStaffIds.includes(member.id)}
                            onChange={() =>
                              toggleStaffId(
                                editStaffIds,
                                setEditStaffIds,
                                member.id,
                              )
                            }
                            className="rounded"
                          />
                          {member.first_name || member.email}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={() => saveEdit(service.id)}
                    aria-label={t("booking.save")}
                    className="bg-brand-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400"
                  >
                    <FiCheck className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
                    {t("booking.save")}
                  </button>
                  <button
                    onClick={cancelEdit}
                    aria-label={t("booking.cancel")}
                    className="bg-surface-2 text-ink-soft px-3 py-1.5 rounded-lg text-sm font-medium transition-colors hover:bg-line focus:outline-none focus:ring-2 focus:ring-brand-400"
                  >
                    <FiX className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
                    {t("booking.cancel")}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-3">
                <label
                  className="shrink-0 cursor-pointer rounded-lg focus-within:ring-2 focus-within:ring-brand-400"
                  title="Upload or change service photo"
                >
                  {service.photo ? (
                    <img
                      src={service.photo}
                      alt={`${service.name} photo`}
                      className="w-12 h-12 rounded-lg object-cover border border-line transition-opacity hover:opacity-80"
                    />
                  ) : (
                    <div
                      aria-hidden="true"
                      className="w-12 h-12 rounded-lg bg-surface-2 border border-dashed border-line flex items-center justify-center text-xs text-ink-soft transition-colors hover:bg-line"
                    >
                      +
                    </div>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) =>
                      onPhotoChange(service.id, e.target.files[0])
                    }
                    aria-label={`Upload photo for ${service.name}`}
                  />
                </label>
                <div className="flex-1">
                  <span className="font-medium">{service.name}</span>
                  {" \u00b7 "}
                  {formatDuration(service.duration_minutes)}
                  {service.price &&
                    ` \u00b7 ${service.price} ${workspace?.currency}`}
                  {service.capacity > 1 &&
                    ` \u00b7 up to ${service.capacity} per slot`}
                  {service.resource_names &&
                    service.resource_names.length > 0 &&
                    ` \u00b7 ${service.resource_names.join(", ")}`}
                  {service.staff_names &&
                    service.staff_names.length > 0 &&
                    ` \u00b7 ${service.staff_names.join(", ")}`}
                  {service.location && ` \u00b7 ${service.location}`}
                  {service.is_online && ` \u00b7 ${t("booking.onlineAppointment")}`}
                  {service.payment_requirement === "deposit" &&
                    ` \u00b7 ${service.deposit_percent}% ${t("booking.depositAtBooking")}`}
                  {service.payment_requirement === "full" &&
                    ` \u00b7 ${t("booking.fullPaymentAtBooking")}`}
                  {service.description && (
                    <p className="text-ink-soft mt-0.5">
                      {service.description}
                    </p>
                  )}
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => startEdit(service)}
                      aria-label={`${t("booking.edit")} ${service.name}`}
                      className="bg-brand-50 text-brand-700 text-xs px-2.5 py-1 rounded-lg font-medium transition-colors hover:bg-brand-100 focus:outline-none focus:ring-2 focus:ring-brand-400"
                    >
                      <FiEdit2 className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
                      {t("booking.edit")}
                    </button>
                    <button
                      onClick={() => deleteService(service.id, service.name)}
                      aria-label={`${t("booking.delete")} ${service.name}`}
                      className="bg-red-600 text-white text-xs px-2.5 py-1 rounded-lg font-medium transition-colors hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-400"
                    >
                      <FiTrash2 className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
                      {t("booking.delete")}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </li>
        ))}
        {services.length === 0 && (
          <p className="text-ink-soft text-sm">{t("booking.noServices")}</p>
        )}
      </ul>
    </section>
  );
}

function PaymentMethodsSection() {
  const { t } = useTranslation();
  const [methods, setMethods] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [accountDetails, setAccountDetails] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editAccountDetails, setEditAccountDetails] = useState("");
  const [statusMsg, setStatusMsg] = useState(null);

  async function load() {
    const res = await api.get("/payment-methods/");
    setMethods(res.data);
  }
  useEffect(() => {
    load();
  }, []);

  async function onCreate(e) {
    e.preventDefault();
    try {
      await api.post("/payment-methods/", {
        name,
        account_details: accountDetails,
      });
      setName("");
      setAccountDetails("");
      setShowForm(false);
      setStatusMsg({ key: "booking.paymentMethodAdded", type: "success" });
      load();
    } catch {
      setStatusMsg({
        key: "booking.couldNotAddPaymentMethod",
        type: "error",
      });
    }
  }

  function startEdit(method) {
    setEditingId(method.id);
    setEditName(method.name);
    setEditAccountDetails(method.account_details);
  }
  function cancelEdit() {
    setEditingId(null);
  }
  async function saveEdit(methodId) {
    try {
      await api.patch(`/payment-methods/${methodId}/`, {
        name: editName,
        account_details: editAccountDetails,
      });
      setEditingId(null);
      setStatusMsg({
        key: "booking.paymentMethodUpdated",
        type: "success",
      });
      load();
    } catch {
      setStatusMsg({
        key: "booking.couldNotUpdatePaymentMethod",
        type: "error",
      });
    }
  }

  async function deletePaymentMethod(methodId) {
    if (!window.confirm(t("booking.confirmDeletePaymentMethod"))) return;
    try {
      await api.delete(`/payment-methods/${methodId}/`);
      setStatusMsg({ key: "booking.paymentMethodDeleted", type: "error" });
      load();
    } catch {
      setStatusMsg({
        key: "booking.couldNotDeletePaymentMethod",
        type: "error",
      });
    }
  }

  return (
    <div className="mt-4 pt-4 border-t border-line">
      <div className="flex justify-between items-center mb-2">
        <h4 className="text-sm font-medium">
          {t("booking.manualPaymentMethods")}
        </h4>
        <button
          onClick={() => {
            setShowForm(!showForm);
            setStatusMsg(null);
          }}
          aria-expanded={showForm}
          className="text-sm text-brand-600 transition-colors hover:text-brand-800 focus:outline-none focus:ring-2 focus:ring-brand-400 rounded"
        >
          <FiPlus className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
          {t("booking.addPaymentMethod")}
        </button>
      </div>
      <p className="text-xs text-ink-soft mb-3">
        {t("booking.manualPaymentMethodsHint")}
      </p>

      {statusMsg && (
        <div
          role="status"
          className={
            statusMsg.type === "success"
              ? "mb-3 text-sm text-green-700 bg-green-50 border border-green-200 rounded p-3"
              : "mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3"
          }
        >
          {t(statusMsg.key)}
        </div>
      )}

      {showForm && (
        <form
          onSubmit={onCreate}
          className="border border-line rounded-lg p-3 mb-3 space-y-2"
        >
          <label htmlFor="pm-name" className="sr-only">
            {t("booking.paymentMethodName")}
          </label>
          <input
            id="pm-name"
            required
            placeholder={t("booking.paymentMethodNamePlaceholder")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
          />
          <label htmlFor="pm-details" className="sr-only">
            {t("booking.paymentMethodDetails")}
          </label>
          <textarea
            id="pm-details"
            required
            rows={2}
            placeholder={t("booking.paymentMethodDetailsPlaceholder")}
            value={accountDetails}
            onChange={(e) => setAccountDetails(e.target.value)}
            className="w-full px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
          />
          <button
            type="submit"
            className="bg-brand-600 text-white text-sm px-3 py-1.5 rounded-lg font-medium transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400"
          >
            <FiCheck className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
            {t("booking.save")}
          </button>
        </form>
      )}

      <ul className="divide-y divide-line">
        {methods.map((method) =>
          editingId === method.id ? (
            <li key={method.id} className="py-2 space-y-2">
              <label htmlFor={`edit-pm-name-${method.id}`} className="sr-only">
                {t("booking.paymentMethodName")}
              </label>
              <input
                id={`edit-pm-name-${method.id}`}
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
              />
              <label
                htmlFor={`edit-pm-details-${method.id}`}
                className="sr-only"
              >
                {t("booking.paymentMethodDetails")}
              </label>
              <textarea
                id={`edit-pm-details-${method.id}`}
                rows={2}
                value={editAccountDetails}
                onChange={(e) => setEditAccountDetails(e.target.value)}
                className="w-full px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => saveEdit(method.id)}
                  className="bg-brand-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400"
                >
                  <FiCheck className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
                  {t("booking.save")}
                </button>
                <button
                  onClick={cancelEdit}
                  className="bg-surface-2 text-ink-soft px-3 py-1.5 rounded-lg text-sm font-medium transition-colors hover:bg-line focus:outline-none focus:ring-2 focus:ring-brand-400"
                >
                  <FiX className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
                  {t("booking.cancel")}
                </button>
              </div>
            </li>
          ) : (
            <li
              key={method.id}
              className="py-2 flex justify-between items-start gap-3"
            >
              <div>
                <p className="text-sm font-medium">{method.name}</p>
                <p className="text-xs text-ink-soft whitespace-pre-wrap">
                  {method.account_details}
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => startEdit(method)}
                  aria-label={`${t("booking.edit")} ${method.name}`}
                  className="bg-brand-50 text-brand-700 text-xs px-2.5 py-1 rounded-lg font-medium transition-colors hover:bg-brand-100 focus:outline-none focus:ring-2 focus:ring-brand-400"
                >
                  <FiEdit2 className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
                  {t("booking.edit")}
                </button>
                <button
                  onClick={() => deletePaymentMethod(method.id)}
                  aria-label={`${t("booking.remove")} ${method.name}`}
                  className="text-white text-xs bg-red-600 px-2.5 py-1 rounded-lg font-medium transition-colors hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-400"
                >
                  <FiTrash2 className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
                  {t("booking.remove")}
                </button>
              </div>
            </li>
          ),
        )}
        {methods.length === 0 && !showForm && (
          <p className="text-ink-soft text-sm">
            {t("booking.noPaymentMethods")}
          </p>
        )}
      </ul>
    </div>
  );
}

function ResourcesSection() {
  const { t } = useTranslation();
  const [resources, setResources] = useState([]);
  const [services, setServices] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [duration, setDuration] = useState("60");
  const [durationUnit, setDurationUnit] = useState("minutes");
  const [price, setPrice] = useState("");
  const [selectedServices, setSelectedServices] = useState([]);
  const [newPhoto, setNewPhoto] = useState(null);
  const [newPhotoPreview, setNewPhotoPreview] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editQuantity, setEditQuantity] = useState("1");
  const [editPrice, setEditPrice] = useState("");
  const [editServices, setEditServices] = useState([]);
  const [statusMsg, setStatusMsg] = useState(null);

  async function load() {
    const res = await api.get("/resources/");
    setResources(res.data);
  }
  async function loadServices() {
    const res = await api.get("/services/");
    setServices(res.data);
  }
  useEffect(() => {
    load();
    loadServices();
  }, []);

  function toggleSelected(list, setList, serviceId) {
    if (list.includes(serviceId)) {
      setList(list.filter((id) => id !== serviceId));
    } else {
      setList([...list, serviceId]);
    }
  }

  async function onCreate(e) {
    e.preventDefault();
    const minutes =
      durationUnit === "days"
        ? Math.round(parseFloat(duration) * 1440)
        : durationUnit === "hours"
          ? Math.round(parseFloat(duration) * 60)
          : parseInt(duration, 10);
    try {
      const res = await api.post("/resources/", {
        name,
        description,
        quantity,
        duration_minutes: minutes,
        price: price || null,
        services: selectedServices,
      });
      if (newPhoto) {
        const formData = new FormData();
        formData.append("photo", newPhoto);
        await api.patch(`/resources/${res.data.id}/`, formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });
      }
      setName("");
      setDescription("");
      setQuantity("1");
      setDuration("60");
      setDurationUnit("minutes");
      setPrice("");
      setSelectedServices([]);
      setNewPhoto(null);
      setNewPhotoPreview(null);
      setShowForm(false);
      setStatusMsg({ key: "resources.resourceCreated", type: "success" });
      load();
    } catch (err) {
      setStatusMsg({
        key: "resources.couldNotCreateResource",
        type: "error",
      });
    }
  }

  async function onPhotoChange(resourceId, file) {
    if (!file) return;
    const formData = new FormData();
    formData.append("photo", file);
    await api.patch(`/resources/${resourceId}/`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    load();
  }

  function startEdit(resource) {
    setEditingId(resource.id);
    setEditName(resource.name);
    setEditDescription(resource.description || "");
    setEditQuantity(String(resource.quantity));
    setEditPrice(resource.price || "");
    setEditServices(resource.services);
  }
  function cancelEdit() {
    setEditingId(null);
  }
  async function saveEdit(resourceId) {
    try {
      await api.patch(`/resources/${resourceId}/`, {
        name: editName,
        description: editDescription,
        quantity: editQuantity,
        price: editPrice || null,
        services: editServices,
      });
      setEditingId(null);
      setStatusMsg({ key: "resources.resourceUpdated", type: "success" });
      load();
    } catch (err) {
      setStatusMsg({
        key: "resources.couldNotUpdateResource",
        type: "error",
      });
    }
  }

  async function deleteResource(resourceId) {
    if (!window.confirm(t("resources.confirmDeleteResource"))) return;
    try {
      await api.delete(`/resources/${resourceId}/`);
      setStatusMsg({ key: "resources.resourceDeleted", type: "error" });
      load();
    } catch (err) {
      setStatusMsg({
        key: "resources.couldNotDeleteResource",
        type: "error",
      });
    }
  }

  function serviceNames(ids) {
    return services
      .filter((s) => ids.includes(s.id))
      .map((s) => s.name)
      .join(", ");
  }

  return (
    <section className="bg-surface border border-line rounded-2xl p-6">
      <div className="flex justify-between items-center mb-3">
        <h2 className="font-medium text-ink">{t("resources.resourcesTitle")}</h2>
        <button
          onClick={() => {
            setShowForm(!showForm);
            setStatusMsg(null);
          }}
          aria-expanded={showForm}
          aria-label={t("resources.addResource")}
          className="text-sm text-brand-600 transition-colors hover:text-brand-800 focus:outline-none focus:ring-2 focus:ring-brand-400 rounded"
        >
          <FiPlus className="inline -mt-0.5 mr-1 shrink-0" aria-hidden="true" />{t("resources.addResource")}
        </button>
      </div>

      {statusMsg && (
        <div
          role="status"
          className={
            statusMsg.type === "success"
              ? "mb-4 text-sm text-green-700 bg-green-50 border border-green-200 rounded p-3"
              : "mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3"
          }
        >
          {t(statusMsg.key)}
        </div>
      )}

      {showForm && (
        <form
          onSubmit={onCreate}
          className="border border-line rounded-lg p-4 mb-4"
        >
          <label htmlFor="resource-name" className="sr-only">
            {t("resources.resourceName")}
          </label>
          <input
            id="resource-name"
            required
            placeholder={t("resources.resourceName")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full mb-2 px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
          />
          <label htmlFor="resource-description" className="sr-only">
            {t("resources.descriptionOptional")}
          </label>
          <textarea
            id="resource-description"
            placeholder={t("resources.descriptionOptional")}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full mb-2 px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
          />

          <label
            className="flex items-center gap-2 mb-2 cursor-pointer w-fit"
            title={t("resources.addPhotoOptional")}
          >
            {newPhotoPreview ? (
              <img
                src={newPhotoPreview}
                alt="Resource photo preview"
                className="w-12 h-12 rounded-lg object-cover border border-line"
              />
            ) : (
              <div
                aria-hidden="true"
                className="w-12 h-12 rounded-lg bg-surface-2 border border-dashed border-line flex items-center justify-center text-xs text-ink-soft transition-colors hover:bg-line"
              >
                +
              </div>
            )}
            <span className="text-xs text-ink-soft">
              {newPhotoPreview
                ? t("resources.changePhoto")
                : t("resources.addPhotoOptional")}
            </span>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files[0];
                if (!file) return;
                setNewPhoto(file);
                setNewPhotoPreview(URL.createObjectURL(file));
              }}
              aria-label={t("resources.addPhotoOptional")}
            />
          </label>

          <div className="flex flex-wrap gap-2 mb-2">
            <label htmlFor="resource-duration" className="sr-only">
              {t("resources.duration")}
            </label>
            <input
              id="resource-duration"
              required
              type="number"
              min={
                durationUnit === "days"
                  ? "1"
                  : durationUnit === "hours"
                    ? "0.25"
                    : "5"
              }
              step={
                durationUnit === "days"
                  ? "1"
                  : durationUnit === "hours"
                    ? "0.25"
                    : "5"
              }
              placeholder={t("resources.duration")}
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              className="w-24 px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
            />
            <label htmlFor="resource-duration-unit" className="sr-only">
              Duration unit
            </label>
            <select
              id="resource-duration-unit"
              value={durationUnit}
              onChange={(e) => setDurationUnit(e.target.value)}
              className="px-2 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400"
            >
              <option value="minutes">min</option>
              <option value="hours">hrs</option>
              <option value="days">days</option>
            </select>
            <label htmlFor="resource-price" className="sr-only">
              Price
            </label>
            <input
              id="resource-price"
              type="number"
              placeholder={t("resources.priceOptional")}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="flex-1 px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
            />
            <label htmlFor="resource-quantity" className="sr-only">
              {t("resources.quantity")}
            </label>
            <input
              id="resource-quantity"
              type="number"
              min="1"
              title={t("resources.quantity")}
              placeholder={t("resources.quantity")}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="w-24 px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
            />
          </div>
          <p className="text-xs text-ink-soft mb-1">
            {t("resources.assignServices")}
          </p>
          <div className="flex flex-wrap gap-3 mb-3">
            {services.map((service) => (
              <label
                key={service.id}
                className="flex items-center gap-1.5 text-sm cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selectedServices.includes(service.id)}
                  onChange={() =>
                    toggleSelected(
                      selectedServices,
                      setSelectedServices,
                      service.id,
                    )
                  }
                  className="cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-400 rounded"
                />
                {service.name}
              </label>
            ))}
          </div>
          <button
            aria-label={t("resources.createResource")}
            className="bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400"
          >
            <FiPlus className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
            {t("resources.createResource")}
          </button>
        </form>
      )}

      <ul className="divide-y divide-line">
        {resources.map((resource) => (
          <li key={resource.id} className="py-3 text-sm">
            {editingId === resource.id ? (
              <div className="border border-brand-200 rounded-lg p-3">
                <label
                  htmlFor={`edit-resource-name-${resource.id}`}
                  className="sr-only"
                >
                  {t("resources.resourceName")}
                </label>
                <input
                  id={`edit-resource-name-${resource.id}`}
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full mb-2 px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
                />
                <label
                  htmlFor={`edit-resource-desc-${resource.id}`}
                  className="sr-only"
                >
                  {t("resources.descriptionOptional")}
                </label>
                <textarea
                  id={`edit-resource-desc-${resource.id}`}
                  placeholder={t("resources.descriptionOptional")}
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  rows={2}
                  className="w-full mb-2 px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
                />
                <div className="flex flex-wrap gap-2 mb-2">
                  <label
                    htmlFor={`edit-resource-price-${resource.id}`}
                    className="sr-only"
                  >
                    Price
                  </label>
                  <input
                    id={`edit-resource-price-${resource.id}`}
                    type="number"
                    placeholder={t("resources.priceOptional")}
                    value={editPrice}
                    onChange={(e) => setEditPrice(e.target.value)}
                    className="flex-1 px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
                  />
                  <label
                    htmlFor={`edit-resource-qty-${resource.id}`}
                    className="sr-only"
                  >
                    {t("resources.quantity")}
                  </label>
                  <input
                    id={`edit-resource-qty-${resource.id}`}
                    type="number"
                    min="1"
                    value={editQuantity}
                    onChange={(e) => setEditQuantity(e.target.value)}
                    className="w-28 px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
                  />
                </div>
                <p className="text-xs text-ink-soft mb-1">
                  {t("resources.assignServices")}
                </p>
                <div className="flex flex-wrap gap-3 mb-3">
                  {services.map((service) => (
                    <label
                      key={service.id}
                      className="flex items-center gap-1.5 text-sm cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={editServices.includes(service.id)}
                        onChange={() =>
                          toggleSelected(
                            editServices,
                            setEditServices,
                            service.id,
                          )
                        }
                        className="cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-400 rounded"
                      />
                      {service.name}
                    </label>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => saveEdit(resource.id)}
                    aria-label={t("resources.save")}
                    className="bg-brand-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400"
                  >
                    <FiCheck className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
                    {t("resources.save")}
                  </button>
                  <button
                    onClick={cancelEdit}
                    aria-label={t("resources.cancel")}
                    className="bg-surface-2 text-ink-soft px-3 py-1.5 rounded-lg text-sm font-medium transition-colors hover:bg-line focus:outline-none focus:ring-2 focus:ring-brand-400"
                  >
                    <FiX className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
                    {t("resources.cancel")}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-3">
                <label
                  className="shrink-0 cursor-pointer rounded-lg focus-within:ring-2 focus-within:ring-brand-400"
                  title="Upload or change resource photo"
                >
                  {resource.photo ? (
                    <img
                      src={resource.photo}
                      alt={`${resource.name} photo`}
                      className="w-12 h-12 rounded-lg object-cover border border-line transition-opacity hover:opacity-80"
                    />
                  ) : (
                    <div
                      aria-hidden="true"
                      className="w-12 h-12 rounded-lg bg-surface-2 border border-dashed border-line flex items-center justify-center text-xs text-ink-soft transition-colors hover:bg-line"
                    >
                      +
                    </div>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) =>
                      onPhotoChange(resource.id, e.target.files[0])
                    }
                    aria-label={`Upload photo for ${resource.name}`}
                  />
                </label>
                <div className="flex-1 flex justify-between items-start">
                  <div>
                    <span className="font-medium">{resource.name}</span>
                    {" \u00b7 "}
                    {formatDuration(resource.duration_minutes)}
                    {resource.price && ` \u00b7 ${resource.price}`}
                    {" \u00b7 "}
                    {t("resources.quantity")}: {resource.quantity}
                    {resource.services.length > 0 && (
                      <p className="text-ink-soft mt-0.5">
                        {serviceNames(resource.services)}
                      </p>
                    )}
                    {resource.description && (
                      <p className="text-ink-soft mt-0.5">
                        {resource.description}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => startEdit(resource)}
                      aria-label={`${t("resources.edit")} ${resource.name}`}
                      className="bg-brand-50 text-brand-700 text-xs px-2.5 py-1 rounded-lg font-medium transition-colors hover:bg-brand-100 focus:outline-none focus:ring-2 focus:ring-brand-400"
                    >
                      <FiEdit2 className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
                      {t("resources.edit")}
                    </button>
                    <button
                      onClick={() => deleteResource(resource.id)}
                      aria-label={`${t("resources.delete")} ${resource.name}`}
                      className="bg-red-600 text-white text-xs px-2.5 py-1 rounded-lg font-medium transition-colors hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-400"
                    >
                      <FiTrash2 className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
                      {t("resources.delete")}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </li>
        ))}
        {resources.length === 0 && (
          <p className="text-ink-soft text-sm">{t("resources.noResources")}</p>
        )}
      </ul>
    </section>
  );
}

function WorkingHoursSection() {
  const { t } = useTranslation();
  const [hours, setHours] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [weekday, setWeekday] = useState("0");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [staffId, setStaffId] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editWeekday, setEditWeekday] = useState("0");
  const [editStartTime, setEditStartTime] = useState("09:00");
  const [editEndTime, setEditEndTime] = useState("17:00");
  const [editStaffId, setEditStaffId] = useState("");
  const [statusMsg, setStatusMsg] = useState(null);

  async function load() {
    const res = await api.get("/working-hours/");
    setHours(res.data);
  }
  async function loadTeamMembers() {
    const res = await api.get("/team/");
    setTeamMembers(res.data);
  }
  useEffect(() => {
    load();
    loadTeamMembers();
  }, []);

  async function onCreate(e) {
    e.preventDefault();
    await api.post("/working-hours/", {
      weekday,
      start_time: `${startTime}:00`,
      end_time: `${endTime}:00`,
      staff: staffId || null,
    });
    setShowForm(false);
    setStaffId("");
    setStatusMsg({
      key: "booking.workingHoursAdded",
      type: "success",
    });
    load();
  }

  function startEdit(window) {
    setEditingId(window.id);
    setEditWeekday(String(window.weekday));
    setEditStartTime(window.start_time.slice(0, 5));
    setEditEndTime(window.end_time.slice(0, 5));
    setEditStaffId(window.staff ? String(window.staff) : "");
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function saveEdit(hoursId) {
    await api.patch(`/working-hours/${hoursId}/`, {
      weekday: editWeekday,
      start_time: `${editStartTime}:00`,
      end_time: `${editEndTime}:00`,
      staff: editStaffId || null,
    });
    setEditingId(null);
    setStatusMsg({
      key: "booking.workingHoursUpdated",
      type: "success",
    });
    load();
  }

  async function deleteHours(hoursId) {
    if (!window.confirm(t("booking.confirmRemoveWorkingHours"))) return;
    await api.delete(`/working-hours/${hoursId}/`);
    setStatusMsg({
      key: "booking.workingHoursRemoved",
      type: "error",
    });
    load();
  }

  return (
    <section className="bg-surface border border-line rounded-2xl p-6">
      <div className="flex justify-between items-center mb-3">
        <h2 className="font-medium text-ink">{t("booking.workingHoursTitle")}</h2>
        <button
          onClick={() => {
            setShowForm(!showForm);
            setStatusMsg(null);
          }}
          aria-expanded={showForm}
          aria-label={t("booking.addWorkingHours")}
          className="text-sm text-brand-600 transition-colors hover:text-brand-800 focus:outline-none focus:ring-2 focus:ring-brand-400 rounded"
        >
          <FiPlus className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
          {t("booking.addWorkingHours")}
        </button>
      </div>

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

      {showForm && (
        <form
          onSubmit={onCreate}
          className="border border-line rounded-lg p-4 mb-4 flex flex-wrap gap-2 items-end"
        >
          <div>
            <label
              htmlFor="wh-weekday"
              className="block text-xs text-ink-soft mb-1"
            >
              {t("booking.weekday")}
            </label>
            <select
              id="wh-weekday"
              value={weekday}
              onChange={(e) => setWeekday(e.target.value)}
              className="px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
            >
              {WEEKDAY_KEYS.map((key, index) => (
                <option key={key} value={index}>
                  {t(`booking.${key}`)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor="wh-start"
              className="block text-xs text-ink-soft mb-1"
            >
              {t("booking.startTime")}
            </label>
            <input
              id="wh-start"
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
            />
          </div>
          <div>
            <label
              htmlFor="wh-end"
              className="block text-xs text-ink-soft mb-1"
            >
              {t("booking.endTime")}
            </label>
            <input
              id="wh-end"
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
            />
          </div>
          {teamMembers.length > 0 && (
            <div>
              <label
                htmlFor="wh-staff"
                className="block text-xs text-ink-soft mb-1"
              >
                {t("booking.hoursForStaff")}
              </label>
              <select
                id="wh-staff"
                value={staffId}
                onChange={(e) => setStaffId(e.target.value)}
                className="px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
              >
                <option value="">{t("booking.workspaceDefaultHours")}</option>
                {teamMembers.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.first_name || member.email}
                  </option>
                ))}
              </select>
            </div>
          )}
          <button
            aria-label={t("booking.saveHours")}
            className="bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400"
          >
            <FiCheck className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
            {t("booking.saveHours")}
          </button>
        </form>
      )}

      <ul className="divide-y divide-line">
        {hours.map((window) => (
          <li key={window.id} className="py-2 text-sm">
            {editingId === window.id ? (
              <div className="border border-brand-200 rounded-lg p-3 flex flex-wrap gap-2 items-end">
                <div>
                  <label
                    htmlFor={`edit-wh-weekday-${window.id}`}
                    className="block text-xs text-ink-soft mb-1"
                  >
                    {t("booking.weekday")}
                  </label>
                  <select
                    id={`edit-wh-weekday-${window.id}`}
                    value={editWeekday}
                    onChange={(e) => setEditWeekday(e.target.value)}
                    className="px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
                  >
                    {WEEKDAY_KEYS.map((key, index) => (
                      <option key={key} value={index}>
                        {t(`booking.${key}`)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label
                    htmlFor={`edit-wh-start-${window.id}`}
                    className="block text-xs text-ink-soft mb-1"
                  >
                    {t("booking.startTime")}
                  </label>
                  <input
                    id={`edit-wh-start-${window.id}`}
                    type="time"
                    value={editStartTime}
                    onChange={(e) => setEditStartTime(e.target.value)}
                    className="px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
                  />
                </div>
                <div>
                  <label
                    htmlFor={`edit-wh-end-${window.id}`}
                    className="block text-xs text-ink-soft mb-1"
                  >
                    {t("booking.endTime")}
                  </label>
                  <input
                    id={`edit-wh-end-${window.id}`}
                    type="time"
                    value={editEndTime}
                    onChange={(e) => setEditEndTime(e.target.value)}
                    className="px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
                  />
                </div>
                {teamMembers.length > 0 && (
                  <div>
                    <label
                      htmlFor={`edit-wh-staff-${window.id}`}
                      className="block text-xs text-ink-soft mb-1"
                    >
                      {t("booking.hoursForStaff")}
                    </label>
                    <select
                      id={`edit-wh-staff-${window.id}`}
                      value={editStaffId}
                      onChange={(e) => setEditStaffId(e.target.value)}
                      className="px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
                    >
                      <option value="">
                        {t("booking.workspaceDefaultHours")}
                      </option>
                      {teamMembers.map((member) => (
                        <option key={member.id} value={member.id}>
                          {member.first_name || member.email}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <button
                  onClick={() => saveEdit(window.id)}
                  aria-label={t("booking.save")}
                  className="bg-brand-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400"
                >
                  <FiCheck className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
                  {t("booking.save")}
                </button>
                <button
                  onClick={cancelEdit}
                  aria-label={t("booking.cancel")}
                  className="bg-surface-2 text-ink-soft px-3 py-1.5 rounded-lg text-sm font-medium transition-colors hover:bg-line focus:outline-none focus:ring-2 focus:ring-brand-400"
                >
                  <FiX className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
                  {t("booking.cancel")}
                </button>
              </div>
            ) : (
              <div className="flex justify-between items-center">
                <span>
                  {t(`booking.${WEEKDAY_KEYS[window.weekday]}`)}
                  {" \u00b7 "}
                  {window.start_time.slice(0, 5)}
                  {"\u2013"}
                  {window.end_time.slice(0, 5)}
                  {window.staff_name && ` \u00b7 ${window.staff_name}`}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => startEdit(window)}
                    aria-label={`${t("booking.edit")} ${t(
                      `booking.${WEEKDAY_KEYS[window.weekday]}`,
                    )} hours`}
                    className="bg-brand-50 text-brand-700 text-sm px-3 py-1.5 rounded-lg font-medium transition-colors hover:bg-brand-100 focus:outline-none focus:ring-2 focus:ring-brand-400"
                  >
                    <FiEdit2 className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
                    {t("booking.edit")}
                  </button>
                  <button
                    onClick={() => deleteHours(window.id)}
                    aria-label={`${t("booking.remove")} ${t(
                      `booking.${WEEKDAY_KEYS[window.weekday]}`,
                    )} hours`}
                    className="text-white text-sm bg-red-600 px-3 py-1.5 rounded-lg font-medium transition-colors hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-400"
                  >
                    <FiTrash2 className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
                    {t("booking.remove")}
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
        {hours.length === 0 && (
          <p className="text-ink-soft text-sm">{t("booking.noWorkingHours")}</p>
        )}
      </ul>
    </section>
  );
}

// Holidays (BOOK-11, no staff set - blocks the whole workspace) and
// specific blocks (BOOK-12, staff set - blocks only that person),
// both the same BlockedTime row under the hood.
function BlockedTimeSection() {
  const { t } = useTranslation();
  const [blockedTimes, setBlockedTimes] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("00:00");
  const [endDate, setEndDate] = useState("");
  const [endTime, setEndTime] = useState("23:59");
  const [staffId, setStaffId] = useState("");
  const [reason, setReason] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editStartDate, setEditStartDate] = useState("");
  const [editStartTime, setEditStartTime] = useState("00:00");
  const [editEndDate, setEditEndDate] = useState("");
  const [editEndTime, setEditEndTime] = useState("23:59");
  const [editStaffId, setEditStaffId] = useState("");
  const [editReason, setEditReason] = useState("");
  const [statusMsg, setStatusMsg] = useState(null);

  async function load() {
    const res = await api.get("/blocked-times/");
    setBlockedTimes(res.data);
  }
  async function loadTeamMembers() {
    const res = await api.get("/team/");
    setTeamMembers(res.data);
  }
  useEffect(() => {
    load();
    loadTeamMembers();
  }, []);

  async function onCreate(e) {
    e.preventDefault();
    await api.post("/blocked-times/", {
      start_time: new Date(`${startDate}T${startTime}:00`).toISOString(),
      end_time: new Date(`${endDate}T${endTime}:00`).toISOString(),
      staff: staffId || null,
      reason,
    });
    setShowForm(false);
    setStartDate("");
    setStartTime("00:00");
    setEndDate("");
    setEndTime("23:59");
    setStaffId("");
    setReason("");
    setStatusMsg({ key: "booking.blockedTimeAdded", type: "success" });
    load();
  }

  function startEdit(entry) {
    const start = new Date(entry.start_time);
    const end = new Date(entry.end_time);
    setEditingId(entry.id);
    setEditStartDate(start.toISOString().slice(0, 10));
    setEditStartTime(start.toTimeString().slice(0, 5));
    setEditEndDate(end.toISOString().slice(0, 10));
    setEditEndTime(end.toTimeString().slice(0, 5));
    setEditStaffId(entry.staff ? String(entry.staff) : "");
    setEditReason(entry.reason || "");
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function saveEdit(entryId) {
    await api.patch(`/blocked-times/${entryId}/`, {
      start_time: new Date(
        `${editStartDate}T${editStartTime}:00`,
      ).toISOString(),
      end_time: new Date(`${editEndDate}T${editEndTime}:00`).toISOString(),
      staff: editStaffId || null,
      reason: editReason,
    });
    setEditingId(null);
    setStatusMsg({ key: "booking.blockedTimeUpdated", type: "success" });
    load();
  }

  async function deleteBlockedTime(entryId) {
    if (!window.confirm(t("booking.confirmRemoveBlockedTime"))) return;
    await api.delete(`/blocked-times/${entryId}/`);
    setStatusMsg({ key: "booking.blockedTimeRemoved", type: "error" });
    load();
  }

  return (
    <section className="bg-surface border border-line rounded-2xl p-6">
      <div className="flex justify-between items-center mb-3">
        <h2 className="font-medium text-ink">{t("booking.blockedTimesTitle")}</h2>
        <button
          onClick={() => {
            setShowForm(!showForm);
            setStatusMsg(null);
          }}
          aria-expanded={showForm}
          aria-label={t("booking.addBlockedTime")}
          className="text-sm text-brand-600 transition-colors hover:text-brand-800 focus:outline-none focus:ring-2 focus:ring-brand-400 rounded"
        >
          <FiPlus className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
          {t("booking.addBlockedTime")}
        </button>
      </div>

      {statusMsg && (
        <div
          role="status"
          className={
            statusMsg.type === "success"
              ? "mb-4 text-sm text-green-700 bg-green-50 border border-green-200 rounded p-3"
              : "mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3"
          }
        >
          {t(statusMsg.key)}
        </div>
      )}

      {showForm && (
        <form
          onSubmit={onCreate}
          className="border border-line rounded-lg p-4 mb-4 flex flex-wrap gap-2 items-end"
        >
          <div>
            <label htmlFor="bt-reason" className="block text-xs text-ink-soft mb-1">
              {t("booking.blockedTimeReason")}
            </label>
            <input
              id="bt-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
            />
          </div>
          <div>
            <label htmlFor="bt-start-date" className="block text-xs text-ink-soft mb-1">
              {t("booking.blockedTimeStart")}
            </label>
            <div className="flex gap-1">
              <input
                id="bt-start-date"
                type="date"
                required
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
              />
              <input
                type="time"
                aria-label={t("booking.startTime")}
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
              />
            </div>
          </div>
          <div>
            <label htmlFor="bt-end-date" className="block text-xs text-ink-soft mb-1">
              {t("booking.blockedTimeEnd")}
            </label>
            <div className="flex gap-1">
              <input
                id="bt-end-date"
                type="date"
                required
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
              />
              <input
                type="time"
                aria-label={t("booking.endTime")}
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
              />
            </div>
          </div>
          {teamMembers.length > 0 && (
            <div>
              <label htmlFor="bt-staff" className="block text-xs text-ink-soft mb-1">
                {t("booking.blockedTimeForStaff")}
              </label>
              <select
                id="bt-staff"
                value={staffId}
                onChange={(e) => setStaffId(e.target.value)}
                className="px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400"
              >
                <option value="">{t("booking.wholeWorkspace")}</option>
                {teamMembers.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.first_name || member.email}
                  </option>
                ))}
              </select>
            </div>
          )}
          <button
            aria-label={t("booking.saveBlockedTime")}
            className="bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400"
          >
            <FiCheck className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
            {t("booking.saveBlockedTime")}
          </button>
        </form>
      )}

      <ul className="divide-y divide-line">
        {blockedTimes.map((entry) => (
          <li key={entry.id} className="py-2 text-sm">
            {editingId === entry.id ? (
              <div className="border border-brand-200 rounded-lg p-3 flex flex-wrap gap-2 items-end">
                <div>
                  <label
                    htmlFor={`edit-bt-reason-${entry.id}`}
                    className="block text-xs text-ink-soft mb-1"
                  >
                    {t("booking.blockedTimeReason")}
                  </label>
                  <input
                    id={`edit-bt-reason-${entry.id}`}
                    value={editReason}
                    onChange={(e) => setEditReason(e.target.value)}
                    className="px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
                  />
                </div>
                <div className="flex gap-1">
                  <input
                    type="date"
                    aria-label={t("booking.blockedTimeStart")}
                    value={editStartDate}
                    onChange={(e) => setEditStartDate(e.target.value)}
                    className="px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
                  />
                  <input
                    type="time"
                    aria-label={t("booking.startTime")}
                    value={editStartTime}
                    onChange={(e) => setEditStartTime(e.target.value)}
                    className="px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
                  />
                </div>
                <div className="flex gap-1">
                  <input
                    type="date"
                    aria-label={t("booking.blockedTimeEnd")}
                    value={editEndDate}
                    onChange={(e) => setEditEndDate(e.target.value)}
                    className="px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
                  />
                  <input
                    type="time"
                    aria-label={t("booking.endTime")}
                    value={editEndTime}
                    onChange={(e) => setEditEndTime(e.target.value)}
                    className="px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
                  />
                </div>
                {teamMembers.length > 0 && (
                  <select
                    aria-label={t("booking.blockedTimeForStaff")}
                    value={editStaffId}
                    onChange={(e) => setEditStaffId(e.target.value)}
                    className="px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400"
                  >
                    <option value="">{t("booking.wholeWorkspace")}</option>
                    {teamMembers.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.first_name || member.email}
                      </option>
                    ))}
                  </select>
                )}
                <button
                  onClick={() => saveEdit(entry.id)}
                  aria-label={t("booking.save")}
                  className="bg-brand-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400"
                >
                  <FiCheck className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
                  {t("booking.save")}
                </button>
                <button
                  onClick={cancelEdit}
                  aria-label={t("booking.cancel")}
                  className="bg-surface-2 text-ink-soft px-3 py-1.5 rounded-lg text-sm font-medium transition-colors hover:bg-line focus:outline-none focus:ring-2 focus:ring-brand-400"
                >
                  <FiX className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
                  {t("booking.cancel")}
                </button>
              </div>
            ) : (
              <div className="flex justify-between items-center">
                <span>
                  {entry.reason || t("booking.blockedTimesTitle")}
                  {" · "}
                  {new Date(entry.start_time).toLocaleString()}
                  {" – "}
                  {new Date(entry.end_time).toLocaleString()}
                  {" · "}
                  {entry.staff_name || t("booking.wholeWorkspace")}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => startEdit(entry)}
                    aria-label={t("booking.edit")}
                    className="bg-brand-50 text-brand-700 text-sm px-3 py-1.5 rounded-lg font-medium transition-colors hover:bg-brand-100 focus:outline-none focus:ring-2 focus:ring-brand-400"
                  >
                    <FiEdit2 className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
                    {t("booking.edit")}
                  </button>
                  <button
                    onClick={() => deleteBlockedTime(entry.id)}
                    aria-label={t("booking.remove")}
                    className="text-white text-sm bg-red-600 px-3 py-1.5 rounded-lg font-medium transition-colors hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-400"
                  >
                    <FiTrash2 className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
                    {t("booking.remove")}
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
        {blockedTimes.length === 0 && (
          <p className="text-ink-soft text-sm">{t("booking.noBlockedTimes")}</p>
        )}
      </ul>
    </section>
  );
}

// Lets the owner turn on the guest-facing booking page (BOOK-21/26)
// and copy its link - the whole page, or a single service pre-
// selected (BOOK-28) - to share however they like. Off by default:
// nothing here is reachable until the owner explicitly enables it.
function PublicBookingSection() {
  const { t } = useTranslation();
  const [enabled, setEnabled] = useState(false);
  const [slug, setSlug] = useState("");
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [copiedKey, setCopiedKey] = useState(null);

  useEffect(() => {
    Promise.all([api.get("/workspace/"), api.get("/services/")]).then(
      ([workspaceRes, servicesRes]) => {
        setEnabled(workspaceRes.data.public_booking_enabled);
        setSlug(workspaceRes.data.slug);
        setServices(servicesRes.data.filter((s) => s.is_active));
        setLoading(false);
      },
    );
  }, []);

  async function toggle() {
    const next = !enabled;
    setEnabled(next);
    await api.patch("/workspace/", { public_booking_enabled: next });
  }

  function linkFor(serviceId) {
    const base = `${window.location.origin}/book/${slug}`;
    return serviceId ? `${base}?service=${serviceId}` : base;
  }

  async function copy(key, serviceId) {
    try {
      await navigator.clipboard.writeText(linkFor(serviceId));
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 2000);
    } catch {
      // Clipboard access can be denied by the browser - the link
      // text is still visible on the page for the owner to select
      // and copy manually.
    }
  }

  if (loading) return null;

  return (
    <section className="bg-surface border border-line rounded-2xl p-6">
      <div className="flex justify-between items-center mb-3">
        <h2 className="font-medium text-ink">{t("booking.publicBookingTitle")}</h2>
        <button
          role="switch"
          aria-checked={enabled}
          aria-label={t("booking.publicBookingEnable")}
          onClick={toggle}
          className={`relative w-11 h-6 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 ${
            enabled ? "bg-brand-600" : "bg-line"
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
              enabled ? "translate-x-5" : ""
            }`}
          />
        </button>
      </div>
      <p className="text-sm text-ink-soft mb-4">
        {t("booking.publicBookingDescription")}
      </p>
      {enabled && (
        <div className="space-y-3">
          <div>
            <label className="text-xs text-ink-soft block mb-1">
              {t("booking.publicBookingLink")}
            </label>
            <div className="flex gap-2">
              <input
                readOnly
                value={linkFor()}
                onFocus={(e) => e.target.select()}
                className="flex-1 min-w-0 border border-line rounded-lg px-3 py-2 text-sm bg-canvas text-ink"
              />
              <button
                onClick={() => copy("workspace")}
                className="shrink-0 px-3 py-2 rounded-lg border border-line text-sm hover:bg-canvas focus:outline-none focus:ring-2 focus:ring-brand-400"
              >
                <FiCopy className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
                {copiedKey === "workspace" ? t("booking.linkCopied") : t("booking.copyLink")}
              </button>
            </div>
          </div>
          {services.length > 0 && (
            <div>
              <p className="text-xs text-ink-soft mb-1">
                {t("booking.perServiceLinks")}
              </p>
              <ul className="space-y-2">
                {services.map((service) => (
                  <li
                    key={service.id}
                    className="flex justify-between items-center gap-2 text-sm"
                  >
                    <span className="text-ink truncate">{service.name}</span>
                    <button
                      onClick={() => copy(`service-${service.id}`, service.id)}
                      className="shrink-0 px-3 py-1.5 rounded-lg border border-line text-xs hover:bg-canvas focus:outline-none focus:ring-2 focus:ring-brand-400"
                    >
                      <FiCopy className="inline -mt-0.5 mr-1 shrink-0" aria-hidden="true" />
                      {copiedKey === `service-${service.id}`
                        ? t("booking.linkCopied")
                        : t("booking.copyLink")}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// Small colored label for a booking's payment_status - shared
// between the owner's booking list and (later) any client-facing
// booking summary.
function PaymentBadge({ status }) {
  const { t } = useTranslation();
  if (!status || status === "not_required") return null;
  const styles = {
    pending: "bg-amber-50 text-amber-700 border-amber-200",
    paid: "bg-green-50 text-green-700 border-green-200",
    refunded: "bg-gray-50 text-gray-600 border-gray-200",
  };
  return (
    <span
      className={`text-xs px-2 py-0.5 rounded-full border ${styles[status] || styles.pending}`}
    >
      {t(`booking.paymentStatus.${status}`)}
    </span>
  );
}

function BookingsSection() {
  const { t } = useTranslation();
  const [bookings, setBookings] = useState([]);
  const [services, setServices] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [statusMsg, setStatusMsg] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editDate, setEditDate] = useState("");
  const [editTime, setEditTime] = useState("");
  const [editService, setEditService] = useState("");

  async function load() {
    const res = await api.get("/bookings/");
    setBookings(res.data);
  }
  async function loadServices() {
    const res = await api.get("/services/");
    setServices(res.data);
  }
  async function loadTeamMembers() {
    const res = await api.get("/team/");
    setTeamMembers(res.data);
  }
  useEffect(() => {
    load();
    loadServices();
    loadTeamMembers();
  }, []);

  async function assignStaff(bookingId, staffId) {
    await api.patch(`/bookings/${bookingId}/`, {
      staff: staffId || null,
    });
    load();
  }

  async function cancel(bookingId) {
    if (!window.confirm(t("booking.confirmCancelBooking"))) return;
    await api.patch(`/bookings/${bookingId}/`, {
      status: "cancelled",
    });
    setStatusMsg({
      key: "booking.bookingCancelledMsg",
      type: "error",
    });
    load();
  }

  async function downloadIcs(bookingId) {
    const res = await api.get(`/bookings/${bookingId}/ics/`, {
      responseType: "blob",
    });
    const url = URL.createObjectURL(res.data);
    window.open(url, "_blank");
  }

  async function markNoShow(bookingId) {
    if (!window.confirm(t("booking.confirmMarkNoShow"))) return;
    await api.post(`/bookings/${bookingId}/mark-no-show/`);
    setStatusMsg({ key: "booking.markedNoShow", type: "error" });
    load();
  }

  async function markBookingPaid(bookingId) {
    if (!window.confirm(t("booking.confirmMarkBookingPaid"))) return;
    try {
      await api.post(`/bookings/${bookingId}/mark-paid/`);
      setStatusMsg({ key: "booking.bookingMarkedPaid", type: "success" });
      load();
    } catch {
      setStatusMsg({
        key: "booking.couldNotMarkBookingPaid",
        type: "error",
      });
    }
  }

  function startEdit(booking) {
    if (!booking.service) return;
    const start = new Date(booking.start_time);
    setEditingId(booking.id);
    setEditDate(start.toISOString().slice(0, 10));
    setEditTime(start.toTimeString().slice(0, 5));
    setEditService(String(booking.service));
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function saveEdit(bookingId) {
    try {
      const startTime = new Date(`${editDate}T${editTime}:00`).toISOString();
      await api.patch(`/bookings/${bookingId}/`, {
        service: editService,
        start_time: startTime,
      });
      setEditingId(null);
      setStatusMsg({
        key: "booking.bookingRescheduled",
        type: "success",
      });
      load();
    } catch (err) {
      const data = err.response?.data;
      const message = data ? Object.values(data).flat().join(" ") : null;
      setStatusMsg(
        message
          ? { raw: message, type: "error" }
          : { key: "booking.couldNotReschedule", type: "error" },
      );
    }
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <section className="bg-surface border border-line rounded-2xl p-6">
      <h2 className="font-medium mb-3 text-ink">{t("booking.bookingsTitle")}</h2>
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
      <ul className="divide-y divide-line">
        {bookings
          .filter((b) => b.status === "confirmed")
          .map((booking) => (
            <li key={booking.id} className="py-2 text-sm">
              {editingId === booking.id ? (
                <div className="border border-brand-200 rounded-lg p-3 flex flex-wrap gap-2 items-end">
                  <div>
                    <label
                      htmlFor={`edit-booking-service-${booking.id}`}
                      className="block text-xs text-ink-soft mb-1"
                    >
                      {t("booking.selectService")}
                    </label>
                    <select
                      id={`edit-booking-service-${booking.id}`}
                      value={editService}
                      onChange={(e) => setEditService(e.target.value)}
                      className="px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
                    >
                      {services.map((service) => (
                        <option key={service.id} value={service.id}>
                          {service.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label
                      htmlFor={`edit-booking-date-${booking.id}`}
                      className="block text-xs text-ink-soft mb-1"
                    >
                      {t("booking.selectDate")}
                    </label>
                    <input
                      id={`edit-booking-date-${booking.id}`}
                      type="date"
                      min={today}
                      value={editDate}
                      onChange={(e) => setEditDate(e.target.value)}
                      className="px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor={`edit-booking-time-${booking.id}`}
                      className="block text-xs text-ink-soft mb-1"
                    >
                      {t("booking.startTime")}
                    </label>
                    <input
                      id={`edit-booking-time-${booking.id}`}
                      type="time"
                      value={editTime}
                      onChange={(e) => setEditTime(e.target.value)}
                      className="px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
                    />
                  </div>
                  <button
                    onClick={() => saveEdit(booking.id)}
                    aria-label={t("booking.save")}
                    className="bg-brand-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400"
                  >
                    <FiCheck className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
                    {t("booking.save")}
                  </button>
                  <button
                    onClick={cancelEdit}
                    aria-label={t("booking.cancel")}
                    className="bg-surface-2 text-ink-soft px-3 py-1.5 rounded-lg text-sm font-medium transition-colors hover:bg-line focus:outline-none focus:ring-2 focus:ring-brand-400"
                  >
                    <FiX className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
                    {t("booking.cancel")}
                  </button>
                </div>
              ) : (
                <div className="flex justify-between items-center">
                  <span>
                    {booking.service_name || booking.resource_name} {"\u00b7"}{" "}
                    {booking.client_name}
                    {" \u00b7 "}
                    {new Date(booking.start_time).toLocaleString()}
                    {" \u00b7 "}
                    <span className="text-xs text-ink-soft">
                      {booking.remaining_capacity}{" "}
                      {t("resources.remainingCapacity")}
                    </span>{" "}
                    <PaymentBadge status={booking.payment_status} />
                  </span>
                  <div className="flex gap-2 items-center">
                    {teamMembers.length > 0 && (
                      <label className="sr-only" htmlFor={`booking-staff-${booking.id}`}>
                        {t("booking.assignStaff")}
                      </label>
                    )}
                    {teamMembers.length > 0 && (
                      <select
                        id={`booking-staff-${booking.id}`}
                        value={booking.staff || ""}
                        onChange={(e) =>
                          assignStaff(booking.id, e.target.value)
                        }
                        title={t("booking.assignStaff")}
                        className="px-2 py-1.5 bg-canvas border border-line rounded-lg text-xs transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400"
                      >
                        <option value="">{t("booking.unassigned")}</option>
                        {teamMembers.map((member) => (
                          <option key={member.id} value={member.id}>
                            {member.first_name || member.email}
                          </option>
                        ))}
                      </select>
                    )}
                    {booking.payment_status === "pending" && (
                      <button
                        onClick={() => markBookingPaid(booking.id)}
                        aria-label={`${t("booking.markBookingPaid")} - ${booking.client_name}`}
                        className="bg-green-50 text-green-700 text-sm px-3 py-1.5 rounded-lg font-medium transition-colors hover:bg-green-100 focus:outline-none focus:ring-2 focus:ring-brand-400"
                      >
                        <FiCheckCircle className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
                        {t("booking.markBookingPaid")}
                      </button>
                    )}
                    {booking.service && (
                      <button
                        onClick={() => startEdit(booking)}
                        aria-label={`${t("booking.edit")} booking for ${booking.client_name}`}
                        className="bg-brand-50 text-brand-700 text-sm px-3 py-1.5 rounded-lg font-medium transition-colors hover:bg-brand-100 focus:outline-none focus:ring-2 focus:ring-brand-400"
                      >
                        <FiEdit2 className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
                        {t("booking.edit")}
                      </button>
                    )}
                    <button
                      onClick={() => downloadIcs(booking.id)}
                      aria-label={`${t("booking.addToCalendar")} - ${booking.client_name}`}
                      className="bg-surface-2 text-ink text-sm px-3 py-1.5 rounded-lg font-medium transition-colors hover:bg-line focus:outline-none focus:ring-2 focus:ring-brand-400"
                    >
                      <FiCalendar className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
                      {t("booking.addToCalendar")}
                    </button>
                    <button
                      onClick={() => cancel(booking.id)}
                      aria-label={`Cancel booking for ${booking.client_name}`}
                      className="text-white text-sm bg-red-600 px-3 py-1.5 rounded-lg font-medium transition-colors hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-400"
                    >
                      <FiX className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
                      {t("booking.cancelBooking")}
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        {bookings.filter((b) => b.status === "confirmed").length === 0 && (
          <p className="text-ink-soft text-sm">{t("booking.noBookings")}</p>
        )}
      </ul>

      {bookings.filter((b) => b.status === "completed").length > 0 && (
        <div className="mt-6 pt-4 border-t border-line">
          <h3 className="text-xs font-medium text-ink-soft mb-2">
            {t("booking.recentlyCompleted")}
          </h3>
          <ul className="divide-y divide-line">
            {bookings
              .filter((b) => b.status === "completed")
              .slice(0, 10)
              .map((booking) => (
                <li
                  key={booking.id}
                  className="py-2 text-sm flex justify-between items-center"
                >
                  <span>
                    {booking.service_name || booking.resource_name} {"\u00b7"}{" "}
                    {booking.client_name}
                    {" \u00b7 "}
                    {new Date(booking.start_time).toLocaleString()}{" "}
                    <PaymentBadge status={booking.payment_status} />
                  </span>
                  <button
                    onClick={() => markNoShow(booking.id)}
                    aria-label={`${t("booking.markNoShow")} - ${booking.client_name}`}
                    className="bg-surface-2 text-ink-soft text-xs px-2.5 py-1 rounded-lg font-medium transition-colors hover:bg-line focus:outline-none focus:ring-2 focus:ring-brand-400"
                  >
                    <FiUserX className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
                    {t("booking.markNoShow")}
                  </button>
                </li>
              ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function WaitlistSection() {
  const { t } = useTranslation();
  const [entries, setEntries] = useState([]);
  const [services, setServices] = useState([]);
  const [statusMsg, setStatusMsg] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editService, setEditService] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editTime, setEditTime] = useState("");

  async function load() {
    const res = await api.get("/waitlist/");
    setEntries(res.data);
  }
  async function loadServices() {
    const res = await api.get("/services/");
    setServices(res.data);
  }
  useEffect(() => {
    load();
    loadServices();
  }, []);

  async function remove(entryId) {
    if (!window.confirm(t("booking.confirmRemoveWaitlistEntry"))) return;
    await api.delete(`/waitlist/${entryId}/`);
    setStatusMsg({
      key: "booking.waitlistEntryRemoved",
      type: "error",
    });
    load();
  }

  function startEdit(entry) {
    const start = new Date(entry.start_time);
    setEditingId(entry.id);
    setEditService(String(entry.service));
    setEditDate(start.toISOString().slice(0, 10));
    setEditTime(start.toTimeString().slice(0, 5));
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function saveEdit(entryId) {
    try {
      const startTime = new Date(`${editDate}T${editTime}:00`).toISOString();
      await api.patch(`/waitlist/${entryId}/`, {
        service: editService,
        start_time: startTime,
      });
      setEditingId(null);
      setStatusMsg({
        key: "booking.waitlistEntryUpdated",
        type: "success",
      });
      load();
    } catch (err) {
      const data = err.response?.data;
      const message = data ? Object.values(data).flat().join(" ") : null;
      setStatusMsg(
        message
          ? { raw: message, type: "error" }
          : { key: "booking.couldNotUpdateWaitlist", type: "error" },
      );
    }
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <section className="bg-surface border border-line rounded-2xl p-6">
      <h2 className="font-medium mb-3 text-ink">{t("booking.waitlistTitle")}</h2>
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
      <ul className="divide-y divide-line">
        {entries.map((entry) => (
          <li key={entry.id} className="py-2 text-sm">
            {editingId === entry.id ? (
              <div className="border border-brand-200 rounded-lg p-3 flex flex-wrap gap-2 items-end">
                <div>
                  <label
                    htmlFor={`edit-waitlist-owner-service-${entry.id}`}
                    className="block text-xs text-ink-soft mb-1"
                  >
                    {t("booking.selectService")}
                  </label>
                  <select
                    id={`edit-waitlist-owner-service-${entry.id}`}
                    value={editService}
                    onChange={(e) => setEditService(e.target.value)}
                    className="px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
                  >
                    {services.map((service) => (
                      <option key={service.id} value={service.id}>
                        {service.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label
                    htmlFor={`edit-waitlist-owner-date-${entry.id}`}
                    className="block text-xs text-ink-soft mb-1"
                  >
                    {t("booking.selectDate")}
                  </label>
                  <input
                    id={`edit-waitlist-owner-date-${entry.id}`}
                    type="date"
                    min={today}
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    className="px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
                  />
                </div>
                <div>
                  <label
                    htmlFor={`edit-waitlist-owner-time-${entry.id}`}
                    className="block text-xs text-ink-soft mb-1"
                  >
                    {t("booking.startTime")}
                  </label>
                  <input
                    id={`edit-waitlist-owner-time-${entry.id}`}
                    type="time"
                    value={editTime}
                    onChange={(e) => setEditTime(e.target.value)}
                    className="px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
                  />
                </div>
                <button
                  onClick={() => saveEdit(entry.id)}
                  aria-label={t("booking.save")}
                  className="bg-brand-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400"
                >
                  <FiCheck className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
                  {t("booking.save")}
                </button>
                <button
                  onClick={cancelEdit}
                  aria-label={t("booking.cancel")}
                  className="bg-surface-2 text-ink-soft px-3 py-1.5 rounded-lg text-sm font-medium transition-colors hover:bg-line focus:outline-none focus:ring-2 focus:ring-brand-400"
                >
                  <FiX className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
                  {t("booking.cancel")}
                </button>
              </div>
            ) : (
              <div className="flex justify-between items-center">
                <span>
                  {entry.service_name} {"\u00b7"} {entry.client_name}
                  {" \u00b7 "}
                  {new Date(entry.start_time).toLocaleString()}
                  {" \u00b7 "}
                  <span className="text-xs text-ink-soft">
                    {entry.notified
                      ? t("booking.notified")
                      : t("booking.waiting")}
                  </span>
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => startEdit(entry)}
                    aria-label={`${t("booking.edit")} waitlist entry for ${entry.client_name}`}
                    className="bg-brand-50 text-brand-700 text-sm px-3 py-1.5 rounded-lg font-medium transition-colors hover:bg-brand-100 focus:outline-none focus:ring-2 focus:ring-brand-400"
                  >
                    <FiEdit2 className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
                    {t("booking.edit")}
                  </button>
                  <button
                    onClick={() => remove(entry.id)}
                    aria-label={`Remove waitlist entry for ${entry.client_name}`}
                    className="text-white text-sm bg-red-600 px-3 py-1.5 rounded-lg font-medium transition-colors hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-400"
                  >
                    <FiUserMinus className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
                    {t("booking.leaveWaitlist")}
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
        {entries.length === 0 && (
          <p className="text-ink-soft text-sm">
            {t("booking.noWaitlistEntries")}
          </p>
        )}
      </ul>
    </section>
  );
}

function ReviewsSection() {
  const { t } = useTranslation();
  const [reviews, setReviews] = useState([]);
  const [statusMsg, setStatusMsg] = useState(null);
  const [respondingId, setRespondingId] = useState(null);
  const [responseText, setResponseText] = useState("");

  async function load() {
    const res = await api.get("/reviews/");
    setReviews(res.data);
  }
  useEffect(() => {
    load();
  }, []);

  function startRespond(review) {
    setRespondingId(review.id);
    setResponseText(review.owner_response || "");
  }

  function cancelRespond() {
    setRespondingId(null);
  }

  async function submitResponse(reviewId) {
    await api.post(`/reviews/${reviewId}/respond/`, {
      owner_response: responseText,
    });
    setRespondingId(null);
    setStatusMsg({ key: "booking.responseSubmitted", type: "success" });
    load();
  }

  async function deleteReview(reviewId) {
    if (!window.confirm(t("booking.confirmDeleteReview"))) return;
    await api.delete(`/reviews/${reviewId}/`);
    setStatusMsg({ key: "booking.reviewDeleted", type: "error" });
    load();
  }

  const averageRating =
    reviews.length > 0
      ? (
          reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
        ).toFixed(1)
      : null;

  return (
    <section className="bg-surface border border-line rounded-2xl p-6">
      <div className="flex justify-between items-center mb-3">
        <h2 className="font-medium text-ink">{t("booking.reviewsTitle")}</h2>
        {averageRating && (
          <span className="text-sm text-ink-soft">
            {t("booking.averageRating")}: {averageRating} {"\u2605"} (
            {reviews.length})
          </span>
        )}
      </div>
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
      <ul className="divide-y divide-line">
        {reviews.map((review) => (
          <li key={review.id} className="py-3 text-sm">
            <p className="font-medium mb-1">
              {review.service_name} {"\u00b7"} {review.client_name}
            </p>
            <div className="flex text-yellow-500 mb-1">
              {"\u2605".repeat(review.rating)}
              <span className="text-ink-soft">
                {"\u2605".repeat(5 - review.rating)}
              </span>
            </div>
            {review.comment && (
              <p className="text-ink-soft mb-2">{review.comment}</p>
            )}
            {review.owner_response && respondingId !== review.id && (
              <p className="text-xs bg-brand-50 rounded p-2 mb-2">
                <span className="font-medium">
                  {t("booking.ownerResponse")}:
                </span>{" "}
                {review.owner_response}
              </p>
            )}
            {respondingId === review.id ? (
              <div className="border border-brand-200 rounded-lg p-3">
                <label htmlFor={`respond-${review.id}`} className="sr-only">
                  {t("booking.respondToReview")}
                </label>
                <textarea
                  id={`respond-${review.id}`}
                  value={responseText}
                  onChange={(e) => setResponseText(e.target.value)}
                  rows={2}
                  className="w-full mb-2 px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => submitResponse(review.id)}
                    aria-label={t("booking.save")}
                    className="bg-brand-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400"
                  >
                    <FiCheck className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
                    {t("booking.save")}
                  </button>
                  <button
                    onClick={cancelRespond}
                    aria-label={t("booking.cancel")}
                    className="bg-surface-2 text-ink-soft px-3 py-1.5 rounded-lg text-sm font-medium transition-colors hover:bg-line focus:outline-none focus:ring-2 focus:ring-brand-400"
                  >
                    <FiX className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
                    {t("booking.cancel")}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={() => startRespond(review)}
                  aria-label={t("booking.respond")}
                  className="bg-brand-50 text-brand-700 text-xs px-2.5 py-1 rounded-lg font-medium transition-colors hover:bg-brand-100 focus:outline-none focus:ring-2 focus:ring-brand-400"
                >
                  <FiMessageCircle className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
                  {t("booking.respond")}
                </button>
                <button
                  onClick={() => deleteReview(review.id)}
                  aria-label={t("booking.deleteReview")}
                  className="bg-red-600 text-white text-xs px-2.5 py-1 rounded-lg font-medium transition-colors hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-400"
                >
                  <FiTrash2 className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
                  {t("booking.deleteReview")}
                </button>
              </div>
            )}
          </li>
        ))}
        {reviews.length === 0 && (
          <p className="text-ink-soft text-sm">{t("booking.noReviewsYet")}</p>
        )}
      </ul>
    </section>
  );
}
