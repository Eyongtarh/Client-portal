// Owner's booking management page: create, edit, and delete
// services (with a photo, description, free-text workspace
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
import { useAuth } from "../lib/AuthContext.jsx";
import LanguageToggle from "../components/LanguageToggle.jsx";
import ThemeToggle from "../components/ThemeToggle.jsx";
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
        <div className="flex items-center gap-4">
          <ThemeToggle />
          <LanguageToggle />
          <button
            onClick={logout}
            aria-label={t("dashboard.signOut")}
            className="text-sm text-brand-600 underline transition-colors hover:text-brand-800 focus:outline-none focus:ring-2 focus:ring-brand-400 rounded"
          >
            {t("dashboard.signOut")}
          </button>
        </div>
      </header>
      <main className="max-w-2xl mx-auto px-8 py-8 space-y-6">
        <ServicesSection />
        <ResourcesSection />
        <WorkingHoursSection />
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

function ServicesSection() {
  const { t } = useTranslation();
  const [services, setServices] = useState([]);
  const [workspace, setWorkspace] = useState(null);
  const [currency, setCurrency] = useState("");
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
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editCapacity, setEditCapacity] = useState("1");
  const [editPaymentRequirement, setEditPaymentRequirement] = useState("none");
  const [editDepositPercent, setEditDepositPercent] = useState("");
  const [editNoticeHours, setEditNoticeHours] = useState("24");
  const [editFeePercent, setEditFeePercent] = useState("");
  const [statusMsg, setStatusMsg] = useState(null);

  async function load() {
    const res = await api.get("/services/");
    setServices(res.data);
  }
  async function loadWorkspace() {
    const res = await api.get("/workspace/");
    setWorkspace(res.data);
    setCurrency(res.data.currency);
    setTimezoneValue(res.data.timezone);
    setReminderHours(String(res.data.reminder_hours_before ?? "24"));
  }
  useEffect(() => {
    load();
    loadWorkspace();
  }, []);

  async function onCurrencyBlur() {
    if (!currency || currency === workspace?.currency) return;
    const res = await api.patch("/workspace/", { currency });
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
    });
    setEditingId(null);
    setStatusMsg({ key: "booking.serviceUpdated", type: "success" });
    load();
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
            htmlFor="workspace-currency"
            className="block text-xs text-ink-soft mb-1"
          >
            {t("booking.currencyLabel")}
          </label>
          <input
            id="workspace-currency"
            list="currency-suggestions"
            value={currency}
            onChange={(e) => setCurrency(e.target.value.toUpperCase())}
            onBlur={onCurrencyBlur}
            maxLength={5}
            placeholder={workspace?.currency || "EUR"}
            className="w-24 px-3 py-2 bg-canvas border border-line rounded-lg text-sm uppercase transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
          />
          <datalist id="currency-suggestions">
            <option value="EUR" />
            <option value="USD" />
            <option value="GBP" />
            <option value="SEK" />
            <option value="NOK" />
            <option value="DKK" />
            <option value="CHF" />
            <option value="CAD" />
            <option value="AUD" />
            <option value="XAF" />
          </datalist>
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

          <div className="flex gap-2 mb-2">
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
              placeholder={`Price (${currency || "EUR"}, optional)`}
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
          <button
            aria-label={t("booking.createService")}
            className="bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400"
          >
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
                <div className="flex gap-2 mb-2">
                  <label
                    htmlFor={`edit-price-${service.id}`}
                    className="sr-only"
                  >
                    Price
                  </label>
                  <input
                    id={`edit-price-${service.id}`}
                    type="number"
                    placeholder={`Price (${currency})`}
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
                <div className="flex gap-2">
                  <button
                    onClick={() => saveEdit(service.id)}
                    aria-label={t("booking.save")}
                    className="bg-brand-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400"
                  >
                    {t("booking.save")}
                  </button>
                  <button
                    onClick={cancelEdit}
                    aria-label={t("booking.cancel")}
                    className="bg-surface-2 text-ink-soft px-3 py-1.5 rounded-lg text-sm font-medium transition-colors hover:bg-line focus:outline-none focus:ring-2 focus:ring-brand-400"
                  >
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
                  {service.price && ` \u00b7 ${service.price} ${currency}`}
                  {service.capacity > 1 &&
                    ` \u00b7 up to ${service.capacity} per slot`}
                  {service.resource_names &&
                    service.resource_names.length > 0 &&
                    ` \u00b7 ${service.resource_names.join(", ")}`}
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
                      {t("booking.edit")}
                    </button>
                    <button
                      onClick={() => deleteService(service.id, service.name)}
                      aria-label={`${t("booking.delete")} ${service.name}`}
                      className="bg-red-600 text-white text-xs px-2.5 py-1 rounded-lg font-medium transition-colors hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-400"
                    >
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
          + {t("resources.addResource")}
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

          <div className="flex gap-2 mb-2">
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
                <div className="flex gap-2 mb-2">
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
                    {t("resources.save")}
                  </button>
                  <button
                    onClick={cancelEdit}
                    aria-label={t("resources.cancel")}
                    className="bg-surface-2 text-ink-soft px-3 py-1.5 rounded-lg text-sm font-medium transition-colors hover:bg-line focus:outline-none focus:ring-2 focus:ring-brand-400"
                  >
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
                      {t("resources.edit")}
                    </button>
                    <button
                      onClick={() => deleteResource(resource.id)}
                      aria-label={`${t("resources.delete")} ${resource.name}`}
                      className="bg-red-600 text-white text-xs px-2.5 py-1 rounded-lg font-medium transition-colors hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-400"
                    >
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
  const [showForm, setShowForm] = useState(false);
  const [weekday, setWeekday] = useState("0");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [editingId, setEditingId] = useState(null);
  const [editWeekday, setEditWeekday] = useState("0");
  const [editStartTime, setEditStartTime] = useState("09:00");
  const [editEndTime, setEditEndTime] = useState("17:00");
  const [statusMsg, setStatusMsg] = useState(null);

  async function load() {
    const res = await api.get("/working-hours/");
    setHours(res.data);
  }
  useEffect(() => {
    load();
  }, []);

  async function onCreate(e) {
    e.preventDefault();
    await api.post("/working-hours/", {
      weekday,
      start_time: `${startTime}:00`,
      end_time: `${endTime}:00`,
    });
    setShowForm(false);
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
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function saveEdit(hoursId) {
    await api.patch(`/working-hours/${hoursId}/`, {
      weekday: editWeekday,
      start_time: `${editStartTime}:00`,
      end_time: `${editEndTime}:00`,
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
          <button
            aria-label={t("booking.saveHours")}
            className="bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400"
          >
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
                <button
                  onClick={() => saveEdit(window.id)}
                  aria-label={t("booking.save")}
                  className="bg-brand-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400"
                >
                  {t("booking.save")}
                </button>
                <button
                  onClick={cancelEdit}
                  aria-label={t("booking.cancel")}
                  className="bg-surface-2 text-ink-soft px-3 py-1.5 rounded-lg text-sm font-medium transition-colors hover:bg-line focus:outline-none focus:ring-2 focus:ring-brand-400"
                >
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
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => startEdit(window)}
                    aria-label={`${t("booking.edit")} ${t(
                      `booking.${WEEKDAY_KEYS[window.weekday]}`,
                    )} hours`}
                    className="bg-brand-50 text-brand-700 text-sm px-3 py-1.5 rounded-lg font-medium transition-colors hover:bg-brand-100 focus:outline-none focus:ring-2 focus:ring-brand-400"
                  >
                    {t("booking.edit")}
                  </button>
                  <button
                    onClick={() => deleteHours(window.id)}
                    aria-label={`${t("booking.remove")} ${t(
                      `booking.${WEEKDAY_KEYS[window.weekday]}`,
                    )} hours`}
                    className="text-white text-sm bg-red-600 px-3 py-1.5 rounded-lg font-medium transition-colors hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-400"
                  >
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
  useEffect(() => {
    load();
    loadServices();
  }, []);

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

  async function markNoShow(bookingId) {
    if (!window.confirm(t("booking.confirmMarkNoShow"))) return;
    await api.post(`/bookings/${bookingId}/mark-no-show/`);
    setStatusMsg({ key: "booking.markedNoShow", type: "error" });
    load();
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
                    {t("booking.save")}
                  </button>
                  <button
                    onClick={cancelEdit}
                    aria-label={t("booking.cancel")}
                    className="bg-surface-2 text-ink-soft px-3 py-1.5 rounded-lg text-sm font-medium transition-colors hover:bg-line focus:outline-none focus:ring-2 focus:ring-brand-400"
                  >
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
                  <div className="flex gap-2">
                    {booking.service && (
                      <button
                        onClick={() => startEdit(booking)}
                        aria-label={`${t("booking.edit")} booking for ${booking.client_name}`}
                        className="bg-brand-50 text-brand-700 text-sm px-3 py-1.5 rounded-lg font-medium transition-colors hover:bg-brand-100 focus:outline-none focus:ring-2 focus:ring-brand-400"
                      >
                        {t("booking.edit")}
                      </button>
                    )}
                    <button
                      onClick={() => cancel(booking.id)}
                      aria-label={`Cancel booking for ${booking.client_name}`}
                      className="text-white text-sm bg-red-600 px-3 py-1.5 rounded-lg font-medium transition-colors hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-400"
                    >
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
                  {t("booking.save")}
                </button>
                <button
                  onClick={cancelEdit}
                  aria-label={t("booking.cancel")}
                  className="bg-surface-2 text-ink-soft px-3 py-1.5 rounded-lg text-sm font-medium transition-colors hover:bg-line focus:outline-none focus:ring-2 focus:ring-brand-400"
                >
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
                    {t("booking.edit")}
                  </button>
                  <button
                    onClick={() => remove(entry.id)}
                    aria-label={`Remove waitlist entry for ${entry.client_name}`}
                    className="text-white text-sm bg-red-600 px-3 py-1.5 rounded-lg font-medium transition-colors hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-400"
                  >
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
                    {t("booking.save")}
                  </button>
                  <button
                    onClick={cancelRespond}
                    aria-label={t("booking.cancel")}
                    className="bg-surface-2 text-ink-soft px-3 py-1.5 rounded-lg text-sm font-medium transition-colors hover:bg-line focus:outline-none focus:ring-2 focus:ring-brand-400"
                  >
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
                  {t("booking.respond")}
                </button>
                <button
                  onClick={() => deleteReview(review.id)}
                  aria-label={t("booking.deleteReview")}
                  className="bg-red-600 text-white text-xs px-2.5 py-1 rounded-lg font-medium transition-colors hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-400"
                >
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
