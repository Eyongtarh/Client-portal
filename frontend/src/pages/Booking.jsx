// Owner's booking management page: create, edit, and delete
// services (with a photo, description, free-text workspace
// currency, max per slot capacity, and duration in minutes or
// hours), set weekly working hours (with remove), and see
// upcoming bookings (with cancel confirmation and a status
// message).
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
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [duration, setDuration] = useState("60");
  const [durationUnit, setDurationUnit] = useState("minutes");
  const [price, setPrice] = useState("");
  const [capacity, setCapacity] = useState("1");
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

  async function onCreate(e) {
    e.preventDefault();
    const minutes =
      durationUnit === "hours"
        ? Math.round(parseFloat(duration) * 60)
        : parseInt(duration, 10);
    await api.post("/services/", {
      name,
      description,
      duration_minutes: minutes,
      price: price || null,
      capacity,
    });
    setName("");
    setDescription("");
    setDuration("60");
    setDurationUnit("minutes");
    setPrice("");
    setCapacity("1");
    setShowForm(false);
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
    setStatusMsg({ text: "Service updated.", type: "success" });
    load();
  }

  async function deleteService(serviceId, serviceName) {
    if (!window.confirm(`Delete "${serviceName}"? This cannot be undone.`))
      return;
    await api.delete(`/services/${serviceId}/`);
    setStatusMsg({ text: `"${serviceName}" deleted.`, type: "error" });
    load();
  }

  return (
    <section className="bg-white border border-brand-100 rounded-xl p-6">
      <div className="flex justify-between items-center mb-3">
        <h2 className="font-medium">{t("booking.servicesTitle")}</h2>
        <button
          onClick={() => setShowForm(!showForm)}
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

      <div className="mb-4">
        <label
          htmlFor="workspace-currency"
          className="block text-xs text-gray-500 mb-1"
        >
          Currency (e.g. EUR, USD, SEK)
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
            Description
          </label>
          <textarea
            id="service-description"
            placeholder="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full mb-2 px-3 py-2 border border-gray-300 rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
          />
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
              Max per slot
            </label>
            <input
              id="service-capacity"
              type="number"
              min="1"
              title="Maximum clients per time slot"
              placeholder="Max per slot"
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
                  Description
                </label>
                <textarea
                  id={`edit-desc-${service.id}`}
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
                    Max per slot
                  </label>
                  <input
                    id={`edit-capacity-${service.id}`}
                    type="number"
                    min="1"
                    placeholder="Max per slot"
                    value={editCapacity}
                    onChange={(e) => setEditCapacity(e.target.value)}
                    className="w-28 px-3 py-2 border border-gray-300 rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => saveEdit(service.id)}
                    aria-label="Save changes"
                    className="bg-brand-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400"
                  >
                    Save
                  </button>
                  <button
                    onClick={cancelEdit}
                    aria-label="Cancel editing"
                    className="text-gray-600 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors hover:text-gray-800 focus:outline-none focus:ring-2 focus:ring-brand-400"
                  >
                    Cancel
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
                      aria-label={`Edit ${service.name}`}
                      className="bg-brand-50 text-brand-700 text-xs px-2.5 py-1 rounded-lg font-medium transition-colors hover:bg-brand-100 focus:outline-none focus:ring-2 focus:ring-brand-400"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => deleteService(service.id, service.name)}
                      aria-label={`Delete ${service.name}`}
                      className="bg-red-600 text-white text-xs px-2.5 py-1 rounded-lg font-medium transition-colors hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-400"
                    >
                      Delete
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
    load();
  }

  async function deleteHours(hoursId) {
    if (!window.confirm("Remove these working hours?")) return;
    await api.delete(`/working-hours/${hoursId}/`);
    load();
  }

  return (
    <section className="bg-white border border-brand-100 rounded-xl p-6">
      <div className="flex justify-between items-center mb-3">
        <h2 className="font-medium">{t("booking.workingHoursTitle")}</h2>
        <button
          onClick={() => setShowForm(!showForm)}
          aria-expanded={showForm}
          aria-label={t("booking.addWorkingHours")}
          className="text-sm text-brand-600 transition-colors hover:text-brand-800 focus:outline-none focus:ring-2 focus:ring-brand-400 rounded"
        >
          {t("booking.addWorkingHours")}
        </button>
      </div>

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
          <li
            key={window.id}
            className="py-2 flex justify-between items-center text-sm"
          >
            <span>
              {t(`booking.${WEEKDAY_KEYS[window.weekday]}`)}
              {" \u00b7 "}
              {window.start_time.slice(0, 5)}
              {"\u2013"}
              {window.end_time.slice(0, 5)}
            </span>
            <button
              onClick={() => deleteHours(window.id)}
              aria-label={`Remove ${t(`booking.${WEEKDAY_KEYS[window.weekday]}`)} hours`}
              className="text-white text-sm bg-red-600 px-3 py-1.5 rounded-lg font-medium transition-colors hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-400"
            >
              Remove
            </button>
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
  const [cancelledMsg, setCancelledMsg] = useState(false);

  async function load() {
    const res = await api.get("/bookings/");
    setBookings(res.data);
  }
  useEffect(() => {
    load();
  }, []);

  async function cancel(bookingId) {
    if (!window.confirm("Cancel this booking?")) return;
    await api.patch(`/bookings/${bookingId}/`, {
      status: "cancelled",
    });
    setCancelledMsg(true);
    load();
  }

  return (
    <section className="bg-white border border-brand-100 rounded-xl p-6">
      <h2 className="font-medium mb-3">{t("booking.bookingsTitle")}</h2>
      {cancelledMsg && (
        <div
          role="status"
          className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3"
        >
          Booking cancelled.
        </div>
      )}
      <ul className="divide-y divide-gray-100">
        {bookings
          .filter((b) => b.status === "confirmed")
          .map((booking) => (
            <li
              key={booking.id}
              className="py-2 flex justify-between items-center text-sm"
            >
              <span>
                {booking.service_name} {"\u00b7"} {booking.client_name}
                {" \u00b7 "}
                {new Date(booking.start_time).toLocaleString()}
              </span>
              <button
                onClick={() => cancel(booking.id)}
                aria-label={`Cancel booking for ${booking.client_name}`}
                className="text-white text-sm bg-red-600 px-3 py-1.5 rounded-lg font-medium transition-colors hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-400"
              >
                {t("booking.cancelBooking")}
              </button>
            </li>
          ))}
        {bookings.filter((b) => b.status === "confirmed").length === 0 && (
          <p className="text-gray-500 text-sm">{t("booking.noBookings")}</p>
        )}
      </ul>
    </section>
  );
}
