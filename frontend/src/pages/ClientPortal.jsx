// What a client sees when they log in: their project's
// progress, documents, messages, invoices, approvals, and
// appointment booking (including weekly-repeating bookings).
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../lib/AuthContext.jsx";
import LanguageToggle from "../components/LanguageToggle.jsx";
import api from "../lib/api";

export default function ClientPortal() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const [project, setProject] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [messages, setMessages] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [approvals, setApprovals] = useState([]);
  const [comments, setComments] = useState({});
  const [body, setBody] = useState("");

  async function loadAll() {
    const projectsRes = await api.get(`/projects/?client=${user.client_id}`);
    const currentProject = projectsRes.data[0] || null;
    setProject(currentProject);
    if (currentProject) {
      const [docsRes, messagesRes, invoicesRes, approvalsRes] =
        await Promise.all([
          api.get(`/documents/?project=${currentProject.id}`),
          api.get(`/messages/?project=${currentProject.id}`),
          api.get(`/invoices/?client=${user.client_id}`),
          api.get(`/approvals/?project=${currentProject.id}`),
        ]);
      setDocuments(docsRes.data);
      setMessages(messagesRes.data);
      setInvoices(invoicesRes.data);
      setApprovals(approvalsRes.data);
    }
  }
  useEffect(() => {
    loadAll();
  }, []);
  async function onSend(e) {
    e.preventDefault();
    if (!body.trim() || !project) return;
    await api.post("/messages/", {
      project: project.id,
      body,
    });
    setBody("");
    loadAll();
  }
  async function downloadPdf(invoiceId) {
    const res = await api.get(`/invoices/${invoiceId}/pdf/`, {
      responseType: "blob",
    });
    const url = URL.createObjectURL(res.data);
    window.open(url, "_blank");
  }
  async function decide(approvalId, decisionStatus) {
    await api.post(`/approvals/${approvalId}/decide/`, {
      status: decisionStatus,
      client_comment: comments[approvalId] || "",
    });
    loadAll();
  }

  return (
    <div className="min-h-screen bg-brand-50">
      <header className="bg-white border-b border-brand-100 px-8 py-4 flex justify-between items-center">
        <div>
          <h1 className="text-lg font-semibold">{user.company_name}</h1>
          <p className="text-sm text-gray-500">
            {t("clientPortal.welcomeBack")} {user.first_name}
          </p>
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
        <BookingSection />
        {!project && (
          <p className="text-gray-500">{t("clientPortal.noProjectYet")}</p>
        )}
        {project && (
          <section className="bg-white border border-brand-100 rounded-xl p-6">
            <h2 className="text-xl font-semibold">{project.name}</h2>
            <div className="w-full bg-brand-100 rounded-full h-2 mt-2 mb-1">
              <div
                className="bg-brand-600 h-2 rounded-full"
                style={{
                  width: `${project.progress_percent}%`,
                }}
              />
            </div>
            <p className="text-xs text-gray-400 mb-4">
              {project.progress_percent}
              {t("clientDetail.percentComplete")}
            </p>
            <ul className="space-y-1">
              {project.milestones.map((milestone) => (
                <li key={milestone.id} className="text-sm">
                  {milestone.is_complete ? "\u2611" : "\u25cb"}{" "}
                  {milestone.title}
                </li>
              ))}
            </ul>
          </section>
        )}
        {project && (
          <section className="bg-white border border-brand-100 rounded-xl p-6">
            <h3 className="font-medium mb-3">{t("clientPortal.documents")}</h3>
            <ul className="divide-y divide-gray-100">
              {documents.map((doc) => (
                <li key={doc.id} className="py-2 text-sm">
                  <a
                    href={doc.file}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Open ${doc.original_name} in a new tab`}
                    className="text-brand-700 transition-colors hover:text-brand-900 hover:underline focus:outline-none focus:ring-2 focus:ring-brand-400 rounded"
                  >
                    {doc.original_name}
                  </a>
                </li>
              ))}
              {documents.length === 0 && (
                <p className="text-gray-500 text-sm">
                  {t("clientPortal.noDocuments")}
                </p>
              )}
            </ul>
          </section>
        )}
        {project && (
          <section className="bg-white border border-brand-100 rounded-xl p-6">
            <h3 className="font-medium mb-3">{t("clientPortal.invoices")}</h3>
            <ul className="divide-y divide-gray-100">
              {invoices.map((invoice) => (
                <li
                  key={invoice.id}
                  className="py-2 flex justify-between text-sm"
                >
                  <span>
                    {`#${invoice.number} - ${invoice.total} - ${invoice.status}`}
                  </span>
                  <button
                    onClick={() => downloadPdf(invoice.id)}
                    aria-label={`Download invoice ${invoice.number} as PDF`}
                    className="text-brand-700 underline transition-colors hover:text-brand-900 focus:outline-none focus:ring-2 focus:ring-brand-400 rounded"
                  >
                    {t("clientPortal.pdf")}
                  </button>
                </li>
              ))}
              {invoices.length === 0 && (
                <p className="text-gray-500 text-sm">
                  {t("clientPortal.noInvoices")}
                </p>
              )}
            </ul>
          </section>
        )}
        {project && (
          <section className="bg-white border border-brand-100 rounded-xl p-6">
            <h3 className="font-medium mb-3">{t("clientPortal.approvals")}</h3>
            <ul className="space-y-3">
              {approvals.map((approval) => (
                <li
                  key={approval.id}
                  className="border border-gray-200 rounded-lg p-4"
                >
                  <p className="font-medium">{approval.title}</p>
                  {approval.description && (
                    <p className="text-sm text-gray-600 mb-2">
                      {approval.description}
                    </p>
                  )}
                  {approval.status === "pending" ? (
                    <div>
                      <label
                        htmlFor={`approval-comment-${approval.id}`}
                        className="sr-only"
                      >
                        Comment for {approval.title}
                      </label>
                      <input
                        id={`approval-comment-${approval.id}`}
                        value={comments[approval.id] || ""}
                        onChange={(e) =>
                          setComments({
                            ...comments,
                            [approval.id]: e.target.value,
                          })
                        }
                        placeholder={t("clientPortal.commentPlaceholder")}
                        className="w-full mb-2 px-3 py-2 border border-gray-300 rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => decide(approval.id, "approved")}
                          aria-label={`Approve ${approval.title}`}
                          className="bg-green-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-400"
                        >
                          {t("clientPortal.approve")}
                        </button>
                        <button
                          onClick={() =>
                            decide(approval.id, "changes_requested")
                          }
                          aria-label={`Request changes on ${approval.title}`}
                          className="bg-red-50 text-red-700 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-400"
                        >
                          {t("clientPortal.requestChanges")}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">
                      {approval.status === "approved"
                        ? t("clientDetail.statusApproved")
                        : t("clientDetail.statusChangesRequested")}
                      {approval.client_comment &&
                        ` \u2014 "${approval.client_comment}"`}
                    </p>
                  )}
                </li>
              ))}
              {approvals.length === 0 && (
                <p className="text-gray-500 text-sm">
                  {t("clientPortal.noApprovals")}
                </p>
              )}
            </ul>
          </section>
        )}
        {project && (
          <section className="bg-white border border-brand-100 rounded-xl p-6">
            <h3 className="font-medium mb-3">{t("clientPortal.messages")}</h3>
            <div className="space-y-3 mb-4 max-h-72 overflow-y-auto">
              {messages.map((message) => (
                <div key={message.id} className="text-sm">
                  <p className="text-xs text-gray-400">{message.sender_name}</p>
                  <p className="inline-block px-3 py-2 rounded-lg bg-brand-50">
                    {message.body}
                  </p>
                </div>
              ))}
              {messages.length === 0 && (
                <p className="text-gray-500 text-sm">
                  {t("clientPortal.noMessages")}
                </p>
              )}
            </div>
            <form onSubmit={onSend} className="flex gap-2">
              <label htmlFor="client-message" className="sr-only">
                {t("clientPortal.writeMessage")}
              </label>
              <input
                id="client-message"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={t("clientPortal.writeMessage")}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
              />
              <button
                aria-label={t("clientPortal.send")}
                className="bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400"
              >
                {t("clientPortal.send")}
              </button>
            </form>
          </section>
        )}
      </main>
    </div>
  );
}

function BookingSection() {
  const { t } = useTranslation();
  const [services, setServices] = useState([]);
  const [selectedService, setSelectedService] = useState("");
  const [date, setDate] = useState("");
  const [slots, setSlots] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState("");
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [myBookings, setMyBookings] = useState([]);
  const [statusMsg, setStatusMsg] = useState(null);
  const [currency, setCurrency] = useState("EUR");
  const [repeatWeekly, setRepeatWeekly] = useState(false);
  const [numberOfWeeks, setNumberOfWeeks] = useState("4");
  const [editingId, setEditingId] = useState(null);
  const [editDate, setEditDate] = useState("");
  const [editTime, setEditTime] = useState("");
  const [editService, setEditService] = useState("");

  async function loadServices() {
    const res = await api.get("/services/");
    setServices(res.data);
    const workspaceRes = await api.get("/workspace/");
    setCurrency(workspaceRes.data.currency);
  }
  async function loadMyBookings() {
    const res = await api.get("/bookings/");
    setMyBookings(res.data);
  }
  useEffect(() => {
    loadServices();
    loadMyBookings();
  }, []);

  async function loadSlots() {
    if (!selectedService || !date) {
      setSlots([]);
      return;
    }
    setLoadingSlots(true);
    setSelectedSlot("");
    try {
      const res = await api.get(
        `/availability/?service=${selectedService}&date=${date}`,
      );
      setSlots(res.data.slots);
    } finally {
      setLoadingSlots(false);
    }
  }
  useEffect(() => {
    loadSlots();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedService, date]);

  function selectSlot(time) {
    setSelectedSlot(time);
    setStatusMsg(null);
  }

  async function confirmBooking() {
    try {
      const startTime = new Date(`${date}T${selectedSlot}:00`).toISOString();
      if (repeatWeekly) {
        await api.post("/recurring-series/", {
          service: selectedService,
          start_time: startTime,
          occurrences: parseInt(numberOfWeeks, 10),
        });
        setStatusMsg({
          text: t("booking.recurringBookingConfirmed"),
          type: "success",
        });
      } else {
        await api.post("/bookings/", {
          service: selectedService,
          start_time: startTime,
        });
        setStatusMsg({
          text: t("booking.bookingConfirmed"),
          type: "success",
        });
      }
      setSlots([]);
      setSelectedSlot("");
      setDate("");
      setRepeatWeekly(false);
      setNumberOfWeeks("4");
      loadMyBookings();
    } catch (err) {
      const data = err.response?.data;
      const message = data
        ? Object.values(data).flat().join(" ")
        : "Could not create this booking.";
      setStatusMsg({ text: message, type: "error" });
      loadSlots();
    }
  }

  async function cancelMine(bookingId) {
    if (!window.confirm("Cancel this booking?")) return;
    await api.patch(`/bookings/${bookingId}/`, {
      status: "cancelled",
    });
    setStatusMsg({ text: "Booking cancelled.", type: "error" });
    loadMyBookings();
  }

  function startEditMine(booking) {
    const start = new Date(booking.start_time);
    setEditingId(booking.id);
    setEditDate(start.toISOString().slice(0, 10));
    setEditTime(start.toTimeString().slice(0, 5));
    setEditService(String(booking.service));
  }

  function cancelEditMine() {
    setEditingId(null);
  }

  async function saveEditMine(bookingId) {
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
      loadMyBookings();
    } catch (err) {
      const data = err.response?.data;
      const message = data
        ? Object.values(data).flat().join(" ")
        : t("booking.couldNotReschedule");
      setStatusMsg({ text: message, type: "error" });
    }
  }

  async function cancelSeries(seriesId) {
    if (!window.confirm("Cancel the whole recurring series?")) return;
    await api.post(`/recurring-series/${seriesId}/cancel/`);
    setStatusMsg({ text: "Recurring series cancelled.", type: "error" });
    loadMyBookings();
  }

  const today = new Date().toISOString().slice(0, 10);
  const confirmedBookings = myBookings.filter((b) => b.status === "confirmed");

  return (
    <section className="bg-white border border-brand-100 rounded-xl p-6">
      <h3 className="font-medium mb-3 text-blue-700">
        {t("booking.bookAppointment")}
      </h3>

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

      <p className="text-xs text-gray-500 mb-2">{t("booking.selectService")}</p>
      <div className="space-y-2 mb-3">
        {services.map((service) => (
          <button
            key={service.id}
            onClick={() => setSelectedService(String(service.id))}
            aria-pressed={selectedService === String(service.id)}
            aria-label={`Select ${service.name}`}
            className={
              selectedService === String(service.id)
                ? "w-full flex items-start gap-3 p-3 border-2 border-brand-600 bg-brand-50 rounded-lg text-left transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400"
                : "w-full flex items-start gap-3 p-3 border border-gray-200 rounded-lg text-left transition-colors hover:border-brand-200 focus:outline-none focus:ring-2 focus:ring-brand-400"
            }
          >
            {service.photo ? (
              <img
                src={service.photo}
                alt={`${service.name} photo`}
                className="w-12 h-12 rounded-lg object-cover border border-gray-200 shrink-0"
              />
            ) : (
              <div
                aria-hidden="true"
                className="w-12 h-12 rounded-lg bg-gray-50 border border-dashed border-gray-300 shrink-0"
              />
            )}
            <div>
              <p className="text-sm font-medium">
                {service.name}
                {" \u00b7 "}
                {service.duration_minutes} min
                {service.price && ` \u00b7 ${service.price} ${currency}`}
              </p>
              {service.description && (
                <p className="text-xs text-gray-500 mt-0.5">
                  {service.description}
                </p>
              )}
            </div>
          </button>
        ))}
        {services.length === 0 && (
          <p className="text-gray-500 text-sm">{t("booking.noServices")}</p>
        )}
      </div>

      <label htmlFor="book-date" className="block text-xs text-gray-500 mb-1">
        {t("booking.selectDate")}
      </label>
      <input
        id="book-date"
        type="date"
        min={today}
        value={date}
        onChange={(e) => setDate(e.target.value)}
        className="w-full mb-3 px-3 py-2 border border-gray-300 rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
      />

      <label className="flex items-center gap-2 mb-3 cursor-pointer w-fit">
        <input
          type="checkbox"
          checked={repeatWeekly}
          onChange={(e) => setRepeatWeekly(e.target.checked)}
          className="cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-400 rounded"
        />
        <span className="text-sm text-gray-700">
          {t("booking.repeatWeekly")}
        </span>
      </label>
      {repeatWeekly && (
        <div className="mb-3">
          <label
            htmlFor="number-of-weeks"
            className="block text-xs text-gray-500 mb-1"
          >
            {t("booking.numberOfWeeks")}
          </label>
          <input
            id="number-of-weeks"
            type="number"
            min="2"
            max="52"
            value={numberOfWeeks}
            onChange={(e) => setNumberOfWeeks(e.target.value)}
            className="w-24 px-3 py-2 border border-gray-300 rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
          />
        </div>
      )}

      {selectedService && date && (
        <div className="mb-4">
          <p className="text-xs text-gray-500 mb-2">
            {t("booking.availableSlots")}
          </p>
          {loadingSlots && (
            <p className="text-sm text-gray-500">{t("booking.loadingSlots")}</p>
          )}
          {!loadingSlots && slots.length === 0 && (
            <p className="text-sm text-gray-500">{t("booking.noSlots")}</p>
          )}
          {!loadingSlots && slots.length > 0 && (
            <div>
              <div className="flex flex-wrap gap-2 mb-3">
                {slots.map((slot) => (
                  <button
                    key={slot}
                    onClick={() => selectSlot(slot)}
                    aria-pressed={selectedSlot === slot}
                    aria-label={`Select ${slot}`}
                    className={
                      selectedSlot === slot
                        ? "px-3 py-1.5 rounded-lg text-sm bg-brand-600 text-white border border-brand-600 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400"
                        : "px-3 py-1.5 rounded-lg text-sm border border-brand-200 transition-colors hover:bg-brand-50 focus:outline-none focus:ring-2 focus:ring-brand-400"
                    }
                  >
                    {slot}
                  </button>
                ))}
              </div>
              {selectedSlot && (
                <button
                  onClick={confirmBooking}
                  aria-label={t("booking.confirmBooking")}
                  className="bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400"
                >
                  {t("booking.confirmBooking")} ({selectedSlot})
                </button>
              )}
            </div>
          )}
        </div>
      )}

      <h4 className="text-xs text-gray-500 mb-2 mt-4">
        {t("booking.bookingsTitle")}
      </h4>
      <ul className="divide-y divide-gray-100">
        {confirmedBookings.map((booking) => (
          <li key={booking.id} className="py-2 text-sm">
            {editingId === booking.id ? (
              <div className="border border-brand-200 rounded-lg p-3 flex flex-wrap gap-2 items-end">
                <div>
                  <label
                    htmlFor={`edit-mybooking-service-${booking.id}`}
                    className="block text-xs text-gray-500 mb-1"
                  >
                    {t("booking.selectService")}
                  </label>
                  <select
                    id={`edit-mybooking-service-${booking.id}`}
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
                    htmlFor={`edit-mybooking-date-${booking.id}`}
                    className="block text-xs text-gray-500 mb-1"
                  >
                    {t("booking.selectDate")}
                  </label>
                  <input
                    id={`edit-mybooking-date-${booking.id}`}
                    type="date"
                    min={today}
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
                  />
                </div>
                <div>
                  <label
                    htmlFor={`edit-mybooking-time-${booking.id}`}
                    className="block text-xs text-gray-500 mb-1"
                  >
                    {t("booking.startTime")}
                  </label>
                  <input
                    id={`edit-mybooking-time-${booking.id}`}
                    type="time"
                    value={editTime}
                    onChange={(e) => setEditTime(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
                  />
                </div>
                <button
                  onClick={() => saveEditMine(booking.id)}
                  aria-label={t("booking.save")}
                  className="bg-brand-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400"
                >
                  {t("booking.save")}
                </button>
                <button
                  onClick={cancelEditMine}
                  aria-label={t("booking.cancel")}
                  className="bg-gray-100 text-gray-700 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-400"
                >
                  {t("booking.cancel")}
                </button>
              </div>
            ) : (
              <>
                <div className="flex justify-between items-center">
                  <span>
                    {booking.service_name}
                    {" \u00b7 "}
                    {new Date(booking.start_time).toLocaleString()}
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => startEditMine(booking)}
                      aria-label={`${t("booking.edit")} booking for ${booking.service_name}`}
                      className="bg-brand-50 text-brand-700 text-sm px-3 py-1.5 rounded-lg font-medium transition-colors hover:bg-brand-100 focus:outline-none focus:ring-2 focus:ring-brand-400"
                    >
                      {t("booking.edit")}
                    </button>
                    <button
                      onClick={() => cancelMine(booking.id)}
                      aria-label={`Cancel booking for ${booking.service_name}`}
                      className="text-white text-sm bg-red-600 px-3 py-1.5 rounded-lg font-medium transition-colors hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-400"
                    >
                      {t("booking.cancelThisOne")}
                    </button>
                  </div>
                </div>
                {booking.series && (
                  <div className="flex justify-between items-center mt-1">
                    <span className="text-xs text-gray-400">
                      {t("booking.partOfSeries")}
                    </span>
                    <button
                      onClick={() => cancelSeries(booking.series)}
                      aria-label="Cancel the whole recurring series"
                      className="text-red-700 text-xs underline transition-colors hover:text-red-900 focus:outline-none focus:ring-2 focus:ring-red-400 rounded"
                    >
                      {t("booking.cancelWholeSeries")}
                    </button>
                  </div>
                )}
              </>
            )}
          </li>
        ))}
        {confirmedBookings.length === 0 && (
          <p className="text-gray-500 text-sm">{t("booking.noBookings")}</p>
        )}
      </ul>
    </section>
  );
}
