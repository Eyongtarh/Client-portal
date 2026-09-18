import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  FiCalendar,
  FiCheck,
  FiCheckCircle,
  FiEdit2,
  FiUserX,
  FiX,
} from "react-icons/fi";
import api from "../../lib/api";

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

export default function BookingsSection() {
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

  function answersFor(booking) {
    if (!booking.custom_answers || !booking.service) return [];
    const service = services.find((s) => s.id === booking.service);
    if (!service || !service.questions) return [];
    return service.questions
      .map((q) => ({
        text: q.text,
        answer: booking.custom_answers[String(q.id)],
      }))
      .filter((a) => a.answer);
  }

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
              ) : (
                <>
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
                {answersFor(booking).length > 0 && (
                  <dl className="mt-1 text-xs text-ink-soft space-y-0.5">
                    {answersFor(booking).map((a) => (
                      <div key={a.text}>
                        <dt className="inline font-medium">{a.text}:</dt>{" "}
                        <dd className="inline">{a.answer}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                </>
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

