import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  FiCheck,
  FiEdit2,
  FiPlus,
  FiTrash2,
  FiX,
} from "react-icons/fi";
import api from "../../lib/api";
import { WEEKDAY_KEYS } from "./shared.js";

// Per-resource weekly hours (BOOK-57/58) - a resource with no rows
// here is bookable across the full 24h day (see the backend's
// resource_availability.py); adding rows restricts it to them.
export default function ResourceRulesSection() {
  const { t } = useTranslation();
  const [windows, setWindows] = useState([]);
  const [resources, setResources] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [resourceId, setResourceId] = useState("");
  const [weekday, setWeekday] = useState("0");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [editingId, setEditingId] = useState(null);
  const [editWeekday, setEditWeekday] = useState("0");
  const [editStartTime, setEditStartTime] = useState("09:00");
  const [editEndTime, setEditEndTime] = useState("17:00");
  const [statusMsg, setStatusMsg] = useState(null);

  async function load() {
    const res = await api.get("/resource-availability/");
    setWindows(res.data);
  }
  async function loadResources() {
    const res = await api.get("/resources/");
    setResources(res.data);
    if (res.data.length > 0) setResourceId(String(res.data[0].id));
  }
  useEffect(() => {
    load();
    loadResources();
  }, []);

  function resourceName(id) {
    return resources.find((r) => r.id === id)?.name || "";
  }

  async function onCreate(e) {
    e.preventDefault();
    if (!resourceId) return;
    try {
      await api.post("/resource-availability/", {
        resource: resourceId,
        weekday,
        start_time: `${startTime}:00`,
        end_time: `${endTime}:00`,
      });
      setShowForm(false);
      setStatusMsg({ key: "resources.hoursAdded", type: "success" });
      load();
    } catch (err) {
      const data = err.response?.data;
      const message = data ? Object.values(data).flat().join(" ") : null;
      setStatusMsg(
        message
          ? { raw: message, type: "error" }
          : { key: "resources.couldNotAddHours", type: "error" },
      );
    }
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
  async function saveEdit(windowId) {
    await api.patch(`/resource-availability/${windowId}/`, {
      weekday: editWeekday,
      start_time: `${editStartTime}:00`,
      end_time: `${editEndTime}:00`,
    });
    setEditingId(null);
    setStatusMsg({ key: "resources.hoursUpdated", type: "success" });
    load();
  }

  async function deleteWindow(windowId) {
    if (!window.confirm(t("resources.confirmRemoveHours"))) return;
    await api.delete(`/resource-availability/${windowId}/`);
    setStatusMsg({ key: "resources.hoursRemoved", type: "error" });
    load();
  }

  if (resources.length === 0) return null;

  return (
    <section className="bg-surface border border-line rounded-2xl p-6">
      <div className="flex justify-between items-center mb-3">
        <h2 className="font-medium text-ink">{t("resources.rulesTitle")}</h2>
        <button
          onClick={() => {
            setShowForm(!showForm);
            setStatusMsg(null);
          }}
          aria-expanded={showForm}
          aria-label={t("resources.addHours")}
          className="text-sm text-brand-700 transition-colors hover:text-brand-800 focus:outline-none focus:ring-2 focus:ring-brand-400 rounded"
        >
          <FiPlus className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
          {t("resources.addHours")}
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
              htmlFor="rr-resource"
              className="block text-xs text-ink-soft mb-1"
            >
              {t("resources.resourceName")}
            </label>
            <select
              id="rr-resource"
              value={resourceId}
              onChange={(e) => setResourceId(e.target.value)}
              className="px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
            >
              {resources.map((resource) => (
                <option key={resource.id} value={resource.id}>
                  {resource.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor="rr-weekday"
              className="block text-xs text-ink-soft mb-1"
            >
              {t("booking.weekday")}
            </label>
            <select
              id="rr-weekday"
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
              htmlFor="rr-start"
              className="block text-xs text-ink-soft mb-1"
            >
              {t("booking.startTime")}
            </label>
            <input
              id="rr-start"
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
            />
          </div>
          <div>
            <label
              htmlFor="rr-end"
              className="block text-xs text-ink-soft mb-1"
            >
              {t("booking.endTime")}
            </label>
            <input
              id="rr-end"
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
            />
          </div>
          <button
            aria-label={t("booking.saveHours")}
            className="bg-brand-600-solid text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400"
          >
            <FiCheck className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
            {t("booking.saveHours")}
          </button>
        </form>
      )}

      <ul className="divide-y divide-line">
        {windows.map((window) => (
          <li key={window.id} className="py-2 text-sm">
            {editingId === window.id ? (
              <div className="border border-brand-200 rounded-lg p-3 flex flex-wrap gap-2 items-end">
                <div>
                  <label
                    htmlFor={`edit-rr-weekday-${window.id}`}
                    className="block text-xs text-ink-soft mb-1"
                  >
                    {t("booking.weekday")}
                  </label>
                  <select
                    id={`edit-rr-weekday-${window.id}`}
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
                    htmlFor={`edit-rr-start-${window.id}`}
                    className="block text-xs text-ink-soft mb-1"
                  >
                    {t("booking.startTime")}
                  </label>
                  <input
                    id={`edit-rr-start-${window.id}`}
                    type="time"
                    value={editStartTime}
                    onChange={(e) => setEditStartTime(e.target.value)}
                    className="px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
                  />
                </div>
                <div>
                  <label
                    htmlFor={`edit-rr-end-${window.id}`}
                    className="block text-xs text-ink-soft mb-1"
                  >
                    {t("booking.endTime")}
                  </label>
                  <input
                    id={`edit-rr-end-${window.id}`}
                    type="time"
                    value={editEndTime}
                    onChange={(e) => setEditEndTime(e.target.value)}
                    className="px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
                  />
                </div>
                <button
                  onClick={() => saveEdit(window.id)}
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
                  <span className="font-medium">
                    {window.resource_name || resourceName(window.resource)}
                  </span>
                  {" · "}
                  {t(`booking.${WEEKDAY_KEYS[window.weekday]}`)}
                  {" · "}
                  {window.start_time.slice(0, 5)}
                  {"–"}
                  {window.end_time.slice(0, 5)}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => startEdit(window)}
                    aria-label={`${t("booking.edit")} ${window.resource_name}`}
                    className="bg-brand-50 text-brand-700 text-sm px-3 py-1.5 rounded-lg font-medium transition-colors hover:bg-brand-100 focus:outline-none focus:ring-2 focus:ring-brand-400"
                  >
                    <FiEdit2 className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
                    {t("booking.edit")}
                  </button>
                  <button
                    onClick={() => deleteWindow(window.id)}
                    aria-label={`${t("booking.remove")} ${window.resource_name}`}
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
        {windows.length === 0 && (
          <p className="text-ink-soft text-sm">{t("resources.noHours")}</p>
        )}
      </ul>
    </section>
  );
}

