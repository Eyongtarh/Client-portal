import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  FiCheck,
  FiEdit2,
  FiPlus,
  FiTrash2,
  FiX,
  FiXCircle,
} from "react-icons/fi";
import { SiStripe } from "react-icons/si";
import api from "../../lib/api";
import { formatDuration } from "./shared.js";
import PaymentMethodsSection from "./PaymentMethodsSection.jsx";

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


export default function ServicesSection() {
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
  const [locations, setLocations] = useState([]);
  const [location, setLocation] = useState("");
  const [locationRef, setLocationRef] = useState("");
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
  const [editLocationRef, setEditLocationRef] = useState("");
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
  async function loadLocations() {
    const res = await api.get("/locations/");
    setLocations(res.data);
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
    loadLocations();
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
      location_ref: locationRef || null,
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
    setLocationRef("");
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
    setEditLocationRef(service.location_ref ? String(service.location_ref) : "");
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
      location_ref: editLocationRef || null,
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
          className="text-sm text-brand-700 transition-colors hover:text-brand-800 focus:outline-none focus:ring-2 focus:ring-brand-400 rounded"
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
              className="bg-brand-600-solid text-white text-sm px-3 py-1.5 rounded-lg font-medium transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400"
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
          {locations.length > 0 && (
            <>
              <label htmlFor="service-location-ref" className="sr-only">
                {t("locations.locationsTitle")}
              </label>
              <select
                id="service-location-ref"
                value={locationRef}
                onChange={(e) => setLocationRef(e.target.value)}
                className="w-full mb-2 px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400"
              >
                <option value="">{t("locations.noLocationLinked")}</option>
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name}
                  </option>
                ))}
              </select>
            </>
          )}
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
            className="bg-brand-600-solid text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400"
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
                {locations.length > 0 && (
                  <>
                    <label
                      htmlFor={`edit-location-ref-${service.id}`}
                      className="sr-only"
                    >
                      {t("locations.locationsTitle")}
                    </label>
                    <select
                      id={`edit-location-ref-${service.id}`}
                      value={editLocationRef}
                      onChange={(e) => setEditLocationRef(e.target.value)}
                      className="w-full mb-2 px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400"
                    >
                      <option value="">{t("locations.noLocationLinked")}</option>
                      {locations.map((loc) => (
                        <option key={loc.id} value={loc.id}>
                          {loc.name}
                        </option>
                      ))}
                    </select>
                  </>
                )}
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
                    className="bg-brand-600-solid text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400"
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

