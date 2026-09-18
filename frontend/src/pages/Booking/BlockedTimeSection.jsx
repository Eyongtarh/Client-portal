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

// Holidays (BOOK-11, no staff set - blocks the whole workspace) and
// specific blocks (BOOK-12, staff set - blocks only that person),
// both the same BlockedTime row under the hood.
const BLOCK_TYPES = [
  "other", "holiday", "personal", "maintenance", "cleaning", "repair",
  "private_use",
];

export default function BlockedTimeSection() {
  const { t } = useTranslation();
  const [blockedTimes, setBlockedTimes] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [resources, setResources] = useState([]);
  const [locations, setLocations] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("00:00");
  const [endDate, setEndDate] = useState("");
  const [endTime, setEndTime] = useState("23:59");
  const [staffId, setStaffId] = useState("");
  const [resourceId, setResourceId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [blockType, setBlockType] = useState("other");
  const [reason, setReason] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editStartDate, setEditStartDate] = useState("");
  const [editStartTime, setEditStartTime] = useState("00:00");
  const [editEndDate, setEditEndDate] = useState("");
  const [editEndTime, setEditEndTime] = useState("23:59");
  const [editStaffId, setEditStaffId] = useState("");
  const [editResourceId, setEditResourceId] = useState("");
  const [editLocationId, setEditLocationId] = useState("");
  const [editBlockType, setEditBlockType] = useState("other");
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
  async function loadResources() {
    const res = await api.get("/resources/");
    setResources(res.data);
  }
  async function loadLocations() {
    const res = await api.get("/locations/");
    setLocations(res.data);
  }
  useEffect(() => {
    load();
    loadTeamMembers();
    loadResources();
    loadLocations();
  }, []);

  async function onCreate(e) {
    e.preventDefault();
    try {
      await api.post("/blocked-times/", {
        start_time: new Date(`${startDate}T${startTime}:00`).toISOString(),
        end_time: new Date(`${endDate}T${endTime}:00`).toISOString(),
        staff: staffId || null,
        resource: resourceId || null,
        location: locationId || null,
        block_type: blockType,
        reason,
      });
      setShowForm(false);
      setStartDate("");
      setStartTime("00:00");
      setEndDate("");
      setEndTime("23:59");
      setStaffId("");
      setResourceId("");
      setLocationId("");
      setBlockType("other");
      setReason("");
      setStatusMsg({ key: "booking.blockedTimeAdded", type: "success" });
      load();
    } catch (err) {
      const data = err.response?.data;
      const message = data ? Object.values(data).flat().join(" ") : null;
      setStatusMsg(
        message
          ? { raw: message, type: "error" }
          : { key: "booking.blockedTimeAdded", type: "error" },
      );
    }
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
    setEditResourceId(entry.resource ? String(entry.resource) : "");
    setEditLocationId(entry.location ? String(entry.location) : "");
    setEditBlockType(entry.block_type || "other");
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
      resource: editResourceId || null,
      location: editLocationId || null,
      block_type: editBlockType,
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
          className="text-sm text-brand-700 transition-colors hover:text-brand-800 focus:outline-none focus:ring-2 focus:ring-brand-400 rounded"
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
          {statusMsg.key ? t(statusMsg.key, statusMsg.params) : statusMsg.raw}
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
                onChange={(e) => {
                  setStaffId(e.target.value);
                  if (e.target.value) {
                    setResourceId("");
                    setLocationId("");
                  }
                }}
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
          {resources.length > 0 && (
            <div>
              <label htmlFor="bt-resource" className="block text-xs text-ink-soft mb-1">
                {t("resources.blockThisResource")}
              </label>
              <select
                id="bt-resource"
                value={resourceId}
                onChange={(e) => {
                  setResourceId(e.target.value);
                  if (e.target.value) {
                    setStaffId("");
                    setLocationId("");
                  }
                }}
                className="px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400"
              >
                <option value="">{t("resources.noResourceSelected")}</option>
                {resources.map((resource) => (
                  <option key={resource.id} value={resource.id}>
                    {resource.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          {locations.length > 0 && (
            <div>
              <label htmlFor="bt-location" className="block text-xs text-ink-soft mb-1">
                {t("locations.blockThisLocation")}
              </label>
              <select
                id="bt-location"
                value={locationId}
                onChange={(e) => {
                  setLocationId(e.target.value);
                  if (e.target.value) {
                    setStaffId("");
                    setResourceId("");
                  }
                }}
                className="px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400"
              >
                <option value="">{t("locations.noLocationSelected")}</option>
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label htmlFor="bt-block-type" className="block text-xs text-ink-soft mb-1">
              {t("resources.blockType")}
            </label>
            <select
              id="bt-block-type"
              value={blockType}
              onChange={(e) => setBlockType(e.target.value)}
              className="px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400"
            >
              {BLOCK_TYPES.map((value) => (
                <option key={value} value={value}>
                  {t(`resources.blockTypes.${value}`)}
                </option>
              ))}
            </select>
          </div>
          <button
            aria-label={t("booking.saveBlockedTime")}
            className="bg-brand-600-solid text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400"
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
                    onChange={(e) => {
                      setEditStaffId(e.target.value);
                      if (e.target.value) {
                        setEditResourceId("");
                        setEditLocationId("");
                      }
                    }}
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
                {resources.length > 0 && (
                  <select
                    aria-label={t("resources.blockThisResource")}
                    value={editResourceId}
                    onChange={(e) => {
                      setEditResourceId(e.target.value);
                      if (e.target.value) {
                        setEditStaffId("");
                        setEditLocationId("");
                      }
                    }}
                    className="px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400"
                  >
                    <option value="">{t("resources.noResourceSelected")}</option>
                    {resources.map((resource) => (
                      <option key={resource.id} value={resource.id}>
                        {resource.name}
                      </option>
                    ))}
                  </select>
                )}
                {locations.length > 0 && (
                  <select
                    aria-label={t("locations.blockThisLocation")}
                    value={editLocationId}
                    onChange={(e) => {
                      setEditLocationId(e.target.value);
                      if (e.target.value) {
                        setEditStaffId("");
                        setEditResourceId("");
                      }
                    }}
                    className="px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400"
                  >
                    <option value="">{t("locations.noLocationSelected")}</option>
                    {locations.map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.name}
                      </option>
                    ))}
                  </select>
                )}
                <select
                  aria-label={t("resources.blockType")}
                  value={editBlockType}
                  onChange={(e) => setEditBlockType(e.target.value)}
                  className="px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400"
                >
                  {BLOCK_TYPES.map((value) => (
                    <option key={value} value={value}>
                      {t(`resources.blockTypes.${value}`)}
                    </option>
                  ))}
                </select>
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
                  {entry.reason || t("booking.blockedTimesTitle")}
                  {" · "}
                  {new Date(entry.start_time).toLocaleString()}
                  {" – "}
                  {new Date(entry.end_time).toLocaleString()}
                  {" · "}
                  {entry.resource_name ||
                    entry.location_name ||
                    entry.staff_name ||
                    t("booking.wholeWorkspace")}
                  {entry.block_type && entry.block_type !== "other" && (
                    <span className="ml-1.5 text-xs bg-surface-2 text-ink-soft px-1.5 py-0.5 rounded">
                      {t(`resources.blockTypes.${entry.block_type}`)}
                    </span>
                  )}
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

