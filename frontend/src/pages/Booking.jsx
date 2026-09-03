// Owner's booking management page: create, edit, and delete
// services (with a photo, description, free-text workspace
// currency, timezone, max per slot capacity, and duration in
// minutes or hours), set weekly working hours (with edit and
// remove), and see upcoming bookings (with cancel confirmation
// and a status message).
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../lib/AuthContext.jsx";
import LanguageToggle from "../components/LanguageToggle.jsx";
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

export default function Booking() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-brand-50">
      <header className="bg-white border-b border-brand-100 px-8 py-4 flex justify-between items-center">
        <div>
          <Link
            to="/"
            aria-label="Back to dashboard"
            className="text-sm text-brand-600 underline transition-colors hover:text-brand-800 focus:outline-none focus:ring-2 focus:ring-brand-400 rounded"
          >
            &larr; {user.workspace_name}
          </Link>
          <h1 className="text-lg font-semibold mt-1">
            {t("booking.servicesTitle")}
          </h1>
        </div>
        <div className="flex items-center gap-4">
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
        <WorkingHoursSection />
        <BookingsSection />
      </main>
    </div>
  );
}

function ServicesSection() {
  const { t } = useTranslation();
  const [services, setServices] = useState([]);
  const [workspace, setWorkspace] = useState(null);
  const [currency, setCurrency] = useState("");
  const [timezoneValue, setTimezoneValue] = useState("UTC");
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [duration, setDuration] = useState("60");
  const [durationUnit, setDurationUnit] = useState("minutes");
  const [price, setPrice] = useState("");
  const [capacity, setCapacity] = useState("1");
  const [newPhoto, setNewPhoto] = useState(null);
  const [newPhotoPreview, setNewPhotoPreview] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editCapacity, setEditCapacity] = useState("1");
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

  async function onCreate(e) {
    e.preventDefault();
    const minutes =
      durationUnit === "hours"
        ? Math.round(parseFloat(duration) * 60)
        : parseInt(duration, 10);
    const res = await api.post("/services/", {
      name,
      description,
      duration_minutes: minutes,
      price: price || null,
      capacity,
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
    setNewPhoto(null);
    setNewPhotoPreview(null);
    setShowForm(false);
    setStatusMsg({ text: t("booking.serviceCreated"), type: "success" });
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
    });
    setEditingId(null);
    setStatusMsg({ text: t("booking.serviceUpdated"), type: "success" });
    load();
  }

  async function deleteService(serviceId, serviceName) {
    if (
      !window.confirm(t("booking.confirmDeleteService", { name: serviceName }))
    )
      return;
    await api.delete(`/services/${serviceId}/`);
    setStatusMsg({
      text: t("booking.serviceDeleted", { name: serviceName }),
      type: "error",
    });
    load();
  }

  return (
    <section className="bg-white border border-brand-100 rounded-xl p-6">
      <div className="flex justify-between items-center mb-3">
        <h2 className="font-medium">{t("booking.servicesTitle")}</h2>
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
          {statusMsg.text}
        </div>
      )}

      <div className="flex flex-wrap gap-4 mb-4">
        <div>
          <label
            htmlFor="workspace-currency"
            className="block text-xs text-gray-500 mb-1"
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
            className="w-24 px-3 py-2 border border-gray-300 rounded-lg text-sm uppercase transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
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
            className="block text-xs text-gray-500 mb-1"
          >
            {t("booking.timezoneLabel")}
          </label>
          <select
            id="workspace-timezone"
            value={timezoneValue}
            onChange={onTimezoneChange}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
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
      </div>

      {showForm && (
        <form
          onSubmit={onCreate}
          className="border border-gray-200 rounded-lg p-4 mb-4"
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
            className="w-full mb-2 px-3 py-2 border border-gray-300 rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
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
            className="w-full mb-2 px-3 py-2 border border-gray-300 rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
          />

          <label
            className="flex items-center gap-2 mb-2 cursor-pointer w-fit"
            title={t("booking.addPhotoOptional")}
          >
            {newPhotoPreview ? (
              <img
                src={newPhotoPreview}
                alt="Service photo preview"
                className="w-12 h-12 rounded-lg object-cover border border-gray-200"
              />
            ) : (
              <div
                aria-hidden="true"
                className="w-12 h-12 rounded-lg bg-gray-50 border border-dashed border-gray-300 flex items-center justify-center text-xs text-gray-400 transition-colors hover:bg-gray-100"
              >
                +
              </div>
            )}
            <span className="text-xs text-gray-500">
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
              min={durationUnit === "hours" ? "0.25" : "5"}
              step={durationUnit === "hours" ? "0.25" : "5"}
              placeholder={t("booking.serviceDuration")}
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              className="w-24 px-3 py-2 border border-gray-300 rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
            />
            <label htmlFor="service-duration-unit" className="sr-only">
              Duration unit
            </label>
            <select
              id="service-duration-unit"
              value={durationUnit}
              onChange={(e) => setDurationUnit(e.target.value)}
              className="px-2 py-2 border border-gray-300 rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400"
            >
              <option value="minutes">min</option>
              <option value="hours">hrs</option>
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
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
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
              className="w-28 px-3 py-2 border border-gray-300 rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
            />
          </div>
          <button
            aria-label={t("booking.createService")}
            className="bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400"
          >
            {t("booking.createService")}
          </button>
        </form>
      )}

      <ul className="divide-y divide-gray-100">
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
                  className="w-full mb-2 px-3 py-2 border border-gray-300 rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
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
                  className="w-full mb-2 px-3 py-2 border border-gray-300 rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
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
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
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
                    className="w-28 px-3 py-2 border border-gray-300 rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
                  />
                </div>
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
                    className="bg-gray-100 text-gray-700 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-400"
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
                      className="w-12 h-12 rounded-lg object-cover border border-gray-200 transition-opacity hover:opacity-80"
                    />
                  ) : (
                    <div
                      aria-hidden="true"
                      className="w-12 h-12 rounded-lg bg-gray-50 border border-dashed border-gray-300 flex items-center justify-center text-xs text-gray-400 transition-colors hover:bg-gray-100"
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
                  {service.duration_minutes} min
                  {service.price && ` \u00b7 ${service.price} ${currency}`}
                  {service.capacity > 1 &&
                    ` \u00b7 up to ${service.capacity} per slot`}
                  {service.description && (
                    <p className="text-gray-500 mt-0.5">
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
          <p className="text-gray-500 text-sm">{t("booking.noServices")}</p>
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
      text: t("booking.workingHoursAdded"),
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
      text: t("booking.workingHoursUpdated"),
      type: "success",
    });
    load();
  }

  async function deleteHours(hoursId) {
    if (!window.confirm(t("booking.confirmRemoveWorkingHours"))) return;
    await api.delete(`/working-hours/${hoursId}/`);
    setStatusMsg({
      text: t("booking.workingHoursRemoved"),
      type: "error",
    });
    load();
  }

  return (
    <section className="bg-white border border-brand-100 rounded-xl p-6">
      <div className="flex justify-between items-center mb-3">
        <h2 className="font-medium">{t("booking.workingHoursTitle")}</h2>
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
          {statusMsg.text}
        </div>
      )}

      {showForm && (
        <form
          onSubmit={onCreate}
          className="border border-gray-200 rounded-lg p-4 mb-4 flex flex-wrap gap-2 items-end"
        >
          <div>
            <label
              htmlFor="wh-weekday"
              className="block text-xs text-gray-500 mb-1"
            >
              {t("booking.weekday")}
            </label>
            <select
              id="wh-weekday"
              value={weekday}
              onChange={(e) => setWeekday(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
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
              className="block text-xs text-gray-500 mb-1"
            >
              {t("booking.startTime")}
            </label>
            <input
              id="wh-start"
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
            />
          </div>
          <div>
            <label
              htmlFor="wh-end"
              className="block text-xs text-gray-500 mb-1"
            >
              {t("booking.endTime")}
            </label>
            <input
              id="wh-end"
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
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

      <ul className="divide-y divide-gray-100">
        {hours.map((window) => (
          <li key={window.id} className="py-2 text-sm">
            {editingId === window.id ? (
              <div className="border border-brand-200 rounded-lg p-3 flex flex-wrap gap-2 items-end">
                <div>
                  <label
                    htmlFor={`edit-wh-weekday-${window.id}`}
                    className="block text-xs text-gray-500 mb-1"
                  >
                    {t("booking.weekday")}
                  </label>
                  <select
                    id={`edit-wh-weekday-${window.id}`}
                    value={editWeekday}
                    onChange={(e) => setEditWeekday(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
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
                    className="block text-xs text-gray-500 mb-1"
                  >
                    {t("booking.startTime")}
                  </label>
                  <input
                    id={`edit-wh-start-${window.id}`}
                    type="time"
                    value={editStartTime}
                    onChange={(e) => setEditStartTime(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
                  />
                </div>
                <div>
                  <label
                    htmlFor={`edit-wh-end-${window.id}`}
                    className="block text-xs text-gray-500 mb-1"
                  >
                    {t("booking.endTime")}
                  </label>
                  <input
                    id={`edit-wh-end-${window.id}`}
                    type="time"
                    value={editEndTime}
                    onChange={(e) => setEditEndTime(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
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
                  className="bg-gray-100 text-gray-700 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-400"
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
          <p className="text-gray-500 text-sm">{t("booking.noWorkingHours")}</p>
        )}
      </ul>
    </section>
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
      text: t("booking.bookingCancelledMsg"),
      type: "error",
    });
    load();
  }

  function startEdit(booking) {
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
        text: t("booking.bookingRescheduled"),
        type: "success",
      });
      load();
    } catch (err) {
      const data = err.response?.data;
      const message = data
        ? Object.values(data).flat().join(" ")
        : t("booking.couldNotReschedule");
      setStatusMsg({ text: message, type: "error" });
    }
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <section className="bg-white border border-brand-100 rounded-xl p-6">
      <h2 className="font-medium mb-3">{t("booking.bookingsTitle")}</h2>
      {statusMsg && (
        <div
          role="status"
          className={
            statusMsg.type === "success"
              ? "mb-4 text-sm text-green-700 bg-green-50 border border-green-200 rounded p-3"
              : "mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3"
          }
        >
          {statusMsg.text}
        </div>
      )}
      <ul className="divide-y divide-gray-100">
        {bookings
          .filter((b) => b.status === "confirmed")
          .map((booking) => (
            <li key={booking.id} className="py-2 text-sm">
              {editingId === booking.id ? (
                <div className="border border-brand-200 rounded-lg p-3 flex flex-wrap gap-2 items-end">
                  <div>
                    <label
                      htmlFor={`edit-booking-service-${booking.id}`}
                      className="block text-xs text-gray-500 mb-1"
                    >
                      {t("booking.selectService")}
                    </label>
                    <select
                      id={`edit-booking-service-${booking.id}`}
                      value={editService}
                      onChange={(e) => setEditService(e.target.value)}
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
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
                      className="block text-xs text-gray-500 mb-1"
                    >
                      {t("booking.selectDate")}
                    </label>
                    <input
                      id={`edit-booking-date-${booking.id}`}
                      type="date"
                      min={today}
                      value={editDate}
                      onChange={(e) => setEditDate(e.target.value)}
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor={`edit-booking-time-${booking.id}`}
                      className="block text-xs text-gray-500 mb-1"
                    >
                      {t("booking.startTime")}
                    </label>
                    <input
                      id={`edit-booking-time-${booking.id}`}
                      type="time"
                      value={editTime}
                      onChange={(e) => setEditTime(e.target.value)}
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
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
                    className="bg-gray-100 text-gray-700 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-400"
                  >
                    {t("booking.cancel")}
                  </button>
                </div>
              ) : (
                <div className="flex justify-between items-center">
                  <span>
                    {booking.service_name} {"\u00b7"} {booking.client_name}
                    {" \u00b7 "}
                    {new Date(booking.start_time).toLocaleString()}
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => startEdit(booking)}
                      aria-label={`${t("booking.edit")} booking for ${booking.client_name}`}
                      className="bg-brand-50 text-brand-700 text-sm px-3 py-1.5 rounded-lg font-medium transition-colors hover:bg-brand-100 focus:outline-none focus:ring-2 focus:ring-brand-400"
                    >
                      {t("booking.edit")}
                    </button>
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
          <p className="text-gray-500 text-sm">{t("booking.noBookings")}</p>
        )}
      </ul>
    </section>
  );
}
