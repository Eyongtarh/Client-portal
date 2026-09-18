import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  FiCheck,
  FiEdit2,
  FiUserMinus,
  FiX,
} from "react-icons/fi";
import api from "../../lib/api";

export default function WaitlistSection() {
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

