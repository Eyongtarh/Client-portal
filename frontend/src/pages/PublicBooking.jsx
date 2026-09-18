// Guest-facing booking page (BOOK-21/26/27/28): reachable at
// /book/:workspaceSlug by anyone with the link, with no account
// needed. Deliberately services-only (not resources) and free
// services only - a service with payment_requirement set tells the
// guest to contact the business directly rather than attempting a
// checkout flow no account exists to receive a receipt through.
import { useEffect, useRef, useState } from "react";
import { useSearchParams, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { FiCheckCircle, FiMapPin, FiVideo, FiInfo } from "react-icons/fi";
import LanguageToggle from "../components/LanguageToggle.jsx";
import ThemeToggle from "../components/ThemeToggle.jsx";
import applyBrandColor from "../lib/applyBrandColor";
import api from "../lib/api";

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

export default function PublicBooking() {
  const { t } = useTranslation();
  const { workspaceSlug } = useParams();
  const [searchParams] = useSearchParams();
  const preselectedService = searchParams.get("service") || "";

  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [workspace, setWorkspace] = useState(null);
  const [services, setServices] = useState([]);
  const [locations, setLocations] = useState([]);
  const [locationFilter, setLocationFilter] = useState(
    searchParams.get("location") || "",
  );

  const [selectedService, setSelectedService] = useState(preselectedService);
  const [selectedStaff, setSelectedStaff] = useState("");
  const [date, setDate] = useState("");
  const [slots, setSlots] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [confirmed, setConfirmed] = useState(false);
  const [customAnswers, setCustomAnswers] = useState({});

  const today = new Date().toISOString().slice(0, 10);
  const slotsRequestRef = useRef(0);

  useEffect(() => {
    api
      .get(`/public/${workspaceSlug}/`)
      .then((res) => {
        setWorkspace(res.data.workspace);
        setServices(res.data.services);
        setLocations(res.data.locations || []);
        applyBrandColor(res.data.workspace.brand_color);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [workspaceSlug]);

  useEffect(() => {
    if (!selectedService || !date) {
      setSlots([]);
      return;
    }
    const requestId = ++slotsRequestRef.current;
    setLoadingSlots(true);
    setSelectedSlot("");
    const staffParam = selectedStaff ? `&staff=${selectedStaff}` : "";
    api
      .get(
        `/public/${workspaceSlug}/availability/?service=${selectedService}&date=${date}${staffParam}`,
      )
      .then((res) => {
        // A slower-loading earlier request (e.g. for a date the
        // guest has since clicked past) can resolve after a later
        // one - without this guard its stale slots would overwrite
        // the ones for what's actually selected now.
        if (requestId === slotsRequestRef.current) {
          setSlots(res.data.slots);
        }
      })
      .finally(() => {
        if (requestId === slotsRequestRef.current) {
          setLoadingSlots(false);
        }
      });
  }, [workspaceSlug, selectedService, selectedStaff, date]);

  const visibleServices = locationFilter
    ? services.filter((s) => String(s.location_ref) === locationFilter)
    : services;
  const service = services.find((s) => String(s.id) === selectedService);
  const requiresPayment =
    service && service.payment_requirement && service.payment_requirement !== "none";

  async function confirmBooking(e) {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const startTime = new Date(`${date}T${selectedSlot}:00`).toISOString();
      await api.post(`/public/${workspaceSlug}/bookings/`, {
        service: selectedService,
        staff: selectedStaff || null,
        start_time: startTime,
        client_name: clientName,
        client_email: clientEmail,
        custom_answers: customAnswers,
      });
      setConfirmed(true);
    } catch (err) {
      const data = err.response?.data;
      const message = data ? Object.values(data).flat().join(" ") : null;
      setErrorMsg(message || t("booking.couldNotCreateBooking"));
    } finally {
      setSubmitting(false);
    }
  }

  function bookAnother() {
    setConfirmed(false);
    setSelectedService("");
    setSelectedStaff("");
    setDate("");
    setSlots([]);
    setSelectedSlot("");
    setClientName("");
    setClientEmail("");
    setCustomAnswers({});
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-ink-soft bg-canvas">
        …
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-canvas text-ink px-6">
        <div className="text-center max-w-sm">
          <h1 className="text-lg font-semibold mb-2">
            {t("publicBooking.notFound")}
          </h1>
          <p className="text-sm text-ink-soft">
            {t("publicBooking.notFoundDetail")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <header className="glass-panel px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-3">
          {workspace.logo && (
            <img
              src={workspace.logo}
              alt=""
              className="w-9 h-9 rounded-lg object-cover border border-line"
            />
          )}
          <h1 className="text-lg font-semibold text-ink">{workspace.name}</h1>
        </div>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <LanguageToggle />
        </div>
      </header>

      <main className="max-w-xl mx-auto px-6 py-8">
        {confirmed ? (
          <div className="bg-surface border border-line rounded-2xl p-8 text-center">
            <FiCheckCircle
              className="mx-auto mb-3 text-brand-600"
              size={40}
              aria-hidden="true"
            />
            <h2 className="text-lg font-semibold mb-1">
              {t("publicBooking.bookingConfirmedTitle")}
            </h2>
            <p className="text-sm text-ink-soft mb-6">
              {t("publicBooking.bookingConfirmedDetail")}
            </p>
            <button
              onClick={bookAnother}
              className="px-4 py-2 rounded-lg bg-brand-600-solid text-white text-sm hover:bg-brand-700 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400"
            >
              {t("publicBooking.bookAnother")}
            </button>
          </div>
        ) : (
          <div className="bg-surface border border-line rounded-2xl p-6">
            {locations.length > 1 && (
              <div className="mb-3">
                <label
                  htmlFor="pub-location-filter"
                  className="block text-xs text-ink-soft mb-1"
                >
                  {t("locations.locationsTitle")}
                </label>
                <select
                  id="pub-location-filter"
                  value={locationFilter}
                  onChange={(e) => {
                    setLocationFilter(e.target.value);
                    setSelectedService("");
                  }}
                  className="w-full px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
                >
                  <option value="">{t("publicBooking.allLocations")}</option>
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <p className="text-xs text-ink-soft mb-2">
              {t("booking.selectService")}
            </p>
            <div className="space-y-2 mb-4">
              {visibleServices.map((svc) => (
                <button
                  key={svc.id}
                  onClick={() => {
                    setSelectedService(String(svc.id));
                    setSelectedStaff("");
                    setCustomAnswers({});
                    setErrorMsg(null);
                  }}
                  aria-pressed={selectedService === String(svc.id)}
                  aria-label={`Select ${svc.name}`}
                  className={
                    selectedService === String(svc.id)
                      ? "w-full flex items-start gap-3 p-3 border-2 border-brand-600 bg-brand-50 rounded-lg text-left transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400"
                      : "w-full flex items-start gap-3 p-3 border border-line rounded-lg text-left transition-colors hover:border-brand-200 focus:outline-none focus:ring-2 focus:ring-brand-400"
                  }
                >
                  {svc.photo ? (
                    <img
                      src={svc.photo}
                      alt={`${svc.name} photo`}
                      className="w-12 h-12 rounded-lg object-cover border border-line shrink-0"
                    />
                  ) : (
                    <div
                      aria-hidden="true"
                      className="w-12 h-12 rounded-lg bg-surface-2 border border-dashed border-line-strong shrink-0"
                    />
                  )}
                  <div>
                    <p className="text-sm font-medium">
                      {svc.name}
                      {" · "}
                      {formatDuration(svc.duration_minutes)}
                      {svc.price && ` · ${svc.price} ${workspace.currency}`}
                    </p>
                    {svc.description && (
                      <p className="text-xs text-ink-soft mt-0.5">
                        {svc.description}
                      </p>
                    )}
                    {(svc.location_name || svc.location) && (
                      <p className="text-xs text-ink-soft mt-0.5">
                        <FiMapPin className="inline -mt-0.5 mr-1 shrink-0" aria-hidden="true" />
                        {svc.location_name || svc.location}
                      </p>
                    )}
                    {svc.is_online && (
                      <p className="text-xs text-ink-soft mt-0.5">
                        <FiVideo className="inline -mt-0.5 mr-1 shrink-0" aria-hidden="true" />
                        {t("booking.onlineAppointment")}
                      </p>
                    )}
                  </div>
                </button>
              ))}
              {visibleServices.length === 0 && (
                <p className="text-ink-soft text-sm">{t("booking.noServices")}</p>
              )}
            </div>

            {service && requiresPayment ? (
              <p className="text-sm text-ink-soft border border-line rounded-lg p-3">
                <FiInfo className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
                {t("publicBooking.paymentRequiredNotice", {
                  name: workspace.name,
                })}
              </p>
            ) : (
              service && (
                <form onSubmit={confirmBooking}>
                  {service.staff && service.staff.length > 0 && (
                    <div className="mb-3">
                      <label
                        htmlFor="pub-staff"
                        className="block text-xs text-ink-soft mb-1"
                      >
                        {t("booking.selectTeamMember")}
                      </label>
                      <select
                        id="pub-staff"
                        value={selectedStaff}
                        onChange={(e) => setSelectedStaff(e.target.value)}
                        className="w-full px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
                      >
                        <option value="">{t("booking.anyTeamMember")}</option>
                        {service.staff.map((staffId, index) => (
                          <option key={staffId} value={staffId}>
                            {service.staff_names?.[index] || staffId}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <label
                    htmlFor="pub-date"
                    className="block text-xs text-ink-soft mb-1"
                  >
                    {t("booking.selectDate")}
                  </label>
                  <input
                    id="pub-date"
                    type="date"
                    min={today}
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full mb-3 px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
                  />

                  {date && (
                    <div className="mb-4">
                      <p className="text-xs text-ink-soft mb-2">
                        {t("booking.availableSlots")}
                      </p>
                      {loadingSlots && (
                        <p className="text-sm text-ink-soft">
                          {t("booking.loadingSlots")}
                        </p>
                      )}
                      {!loadingSlots && slots.length === 0 && (
                        <p className="text-sm text-ink-soft">
                          {t("booking.noSlots")}
                        </p>
                      )}
                      {!loadingSlots && slots.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {slots.map((slot) => (
                            <button
                              type="button"
                              key={slot}
                              onClick={() => setSelectedSlot(slot)}
                              aria-pressed={selectedSlot === slot}
                              aria-label={`Select ${slot}`}
                              className={
                                selectedSlot === slot
                                  ? "px-3 py-1.5 rounded-lg text-sm bg-brand-600-solid text-white border border-brand-600-solid transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400"
                                  : "px-3 py-1.5 rounded-lg text-sm border border-line transition-colors hover:bg-brand-50 focus:outline-none focus:ring-2 focus:ring-brand-400"
                              }
                            >
                              {slot}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {selectedSlot && (
                    <>
                      {service.questions?.map((question) => (
                        <div key={question.id} className="mb-3">
                          <label
                            htmlFor={`pub-intake-${question.id}`}
                            className="block text-xs text-ink-soft mb-1"
                          >
                            {question.text}
                            {question.required ? " *" : ""}
                          </label>
                          {question.question_type === "choice" ? (
                            <select
                              id={`pub-intake-${question.id}`}
                              required={question.required}
                              value={customAnswers[question.id] || ""}
                              onChange={(e) =>
                                setCustomAnswers((prev) => ({
                                  ...prev,
                                  [question.id]: e.target.value,
                                }))
                              }
                              className="w-full px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
                            >
                              <option value="" disabled>
                                {t("booking.selectOne")}
                              </option>
                              {question.choices
                                .split(",")
                                .map((c) => c.trim())
                                .filter(Boolean)
                                .map((choice) => (
                                  <option key={choice} value={choice}>
                                    {choice}
                                  </option>
                                ))}
                            </select>
                          ) : (
                            <input
                              id={`pub-intake-${question.id}`}
                              type="text"
                              required={question.required}
                              value={customAnswers[question.id] || ""}
                              onChange={(e) =>
                                setCustomAnswers((prev) => ({
                                  ...prev,
                                  [question.id]: e.target.value,
                                }))
                              }
                              className="w-full px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
                            />
                          )}
                        </div>
                      ))}
                      <label
                        htmlFor="pub-name"
                        className="block text-xs text-ink-soft mb-1"
                      >
                        {t("publicBooking.yourName")}
                      </label>
                      <input
                        id="pub-name"
                        type="text"
                        required
                        value={clientName}
                        onChange={(e) => setClientName(e.target.value)}
                        className="w-full mb-3 px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
                      />
                      <label
                        htmlFor="pub-email"
                        className="block text-xs text-ink-soft mb-1"
                      >
                        {t("publicBooking.yourEmail")}
                      </label>
                      <input
                        id="pub-email"
                        type="email"
                        required
                        value={clientEmail}
                        onChange={(e) => setClientEmail(e.target.value)}
                        className="w-full mb-4 px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
                      />

                      {errorMsg && (
                        <p className="text-sm text-red-600 mb-3">{errorMsg}</p>
                      )}

                      <button
                        type="submit"
                        disabled={submitting}
                        className="w-full px-4 py-2 rounded-lg bg-brand-600-solid text-white text-sm hover:bg-brand-700 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 disabled:opacity-60"
                      >
                        {t("publicBooking.confirmBookingGuest")}
                      </button>
                    </>
                  )}
                </form>
              )
            )}
          </div>
        )}
        <p className="text-center text-xs text-ink-soft mt-6">
          {t("publicBooking.poweredBy")}
        </p>
      </main>
    </div>
  );
}
