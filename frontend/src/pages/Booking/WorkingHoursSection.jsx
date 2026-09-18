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

export default function WorkingHoursSection() {
  const { t } = useTranslation();
  const [hours, setHours] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [locations, setLocations] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [weekday, setWeekday] = useState("0");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [staffId, setStaffId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editWeekday, setEditWeekday] = useState("0");
  const [editStartTime, setEditStartTime] = useState("09:00");
  const [editEndTime, setEditEndTime] = useState("17:00");
  const [editStaffId, setEditStaffId] = useState("");
  const [editLocationId, setEditLocationId] = useState("");
  const [statusMsg, setStatusMsg] = useState(null);

  async function load() {
    const res = await api.get("/working-hours/");
    setHours(res.data);
  }
  async function loadTeamMembers() {
    const res = await api.get("/team/");
    setTeamMembers(res.data);
  }
  async function loadLocations() {
    const res = await api.get("/locations/");
    setLocations(res.data);
  }
  useEffect(() => {
    load();
    loadTeamMembers();
    loadLocations();
  }, []);

  async function onCreate(e) {
    e.preventDefault();
    await api.post("/working-hours/", {
      weekday,
      start_time: `${startTime}:00`,
      end_time: `${endTime}:00`,
      staff: staffId || null,
      location: locationId || null,
    });
    setShowForm(false);
    setStaffId("");
    setLocationId("");
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
    setEditStaffId(window.staff ? String(window.staff) : "");
    setEditLocationId(window.location ? String(window.location) : "");
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function saveEdit(hoursId) {
    await api.patch(`/working-hours/${hoursId}/`, {
      weekday: editWeekday,
      start_time: `${editStartTime}:00`,
      end_time: `${editEndTime}:00`,
      staff: editStaffId || null,
      location: editLocationId || null,
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
          className="text-sm text-brand-700 transition-colors hover:text-brand-800 focus:outline-none focus:ring-2 focus:ring-brand-400 rounded"
        >
          <FiPlus className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
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
          {teamMembers.length > 0 && (
            <div>
              <label
                htmlFor="wh-staff"
                className="block text-xs text-ink-soft mb-1"
              >
                {t("booking.hoursForStaff")}
              </label>
              <select
                id="wh-staff"
                value={staffId}
                onChange={(e) => {
                  setStaffId(e.target.value);
                  if (e.target.value) setLocationId("");
                }}
                className="px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
              >
                <option value="">{t("booking.workspaceDefaultHours")}</option>
                {teamMembers.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.first_name || member.email}
                  </option>
                ))}
              </select>
            </div>
          )}
          {locations.length > 0 && (
            <div>
              <label
                htmlFor="wh-location"
                className="block text-xs text-ink-soft mb-1"
              >
                {t("locations.hoursForLocation")}
              </label>
              <select
                id="wh-location"
                value={locationId}
                onChange={(e) => {
                  setLocationId(e.target.value);
                  if (e.target.value) setStaffId("");
                }}
                className="px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
              >
                <option value="">{t("booking.workspaceDefaultHours")}</option>
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name}
                  </option>
                ))}
              </select>
            </div>
          )}
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
                {teamMembers.length > 0 && (
                  <div>
                    <label
                      htmlFor={`edit-wh-staff-${window.id}`}
                      className="block text-xs text-ink-soft mb-1"
                    >
                      {t("booking.hoursForStaff")}
                    </label>
                    <select
                      id={`edit-wh-staff-${window.id}`}
                      value={editStaffId}
                      onChange={(e) => {
                        setEditStaffId(e.target.value);
                        if (e.target.value) setEditLocationId("");
                      }}
                      className="px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
                    >
                      <option value="">
                        {t("booking.workspaceDefaultHours")}
                      </option>
                      {teamMembers.map((member) => (
                        <option key={member.id} value={member.id}>
                          {member.first_name || member.email}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {locations.length > 0 && (
                  <div>
                    <label
                      htmlFor={`edit-wh-location-${window.id}`}
                      className="block text-xs text-ink-soft mb-1"
                    >
                      {t("locations.hoursForLocation")}
                    </label>
                    <select
                      id={`edit-wh-location-${window.id}`}
                      value={editLocationId}
                      onChange={(e) => {
                        setEditLocationId(e.target.value);
                        if (e.target.value) setEditStaffId("");
                      }}
                      className="px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
                    >
                      <option value="">
                        {t("booking.workspaceDefaultHours")}
                      </option>
                      {locations.map((loc) => (
                        <option key={loc.id} value={loc.id}>
                          {loc.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
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
                  {t(`booking.${WEEKDAY_KEYS[window.weekday]}`)}
                  {" \u00b7 "}
                  {window.start_time.slice(0, 5)}
                  {"\u2013"}
                  {window.end_time.slice(0, 5)}
                  {window.staff_name && ` \u00b7 ${window.staff_name}`}
                  {window.location_name && ` \u00b7 ${window.location_name}`}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => startEdit(window)}
                    aria-label={`${t("booking.edit")} ${t(
                      `booking.${WEEKDAY_KEYS[window.weekday]}`,
                    )} hours`}
                    className="bg-brand-50 text-brand-700 text-sm px-3 py-1.5 rounded-lg font-medium transition-colors hover:bg-brand-100 focus:outline-none focus:ring-2 focus:ring-brand-400"
                  >
                    <FiEdit2 className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
                    {t("booking.edit")}
                  </button>
                  <button
                    onClick={() => deleteHours(window.id)}
                    aria-label={`${t("booking.remove")} ${t(
                      `booking.${WEEKDAY_KEYS[window.weekday]}`,
                    )} hours`}
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
        {hours.length === 0 && (
          <p className="text-ink-soft text-sm">{t("booking.noWorkingHours")}</p>
        )}
      </ul>
    </section>
  );
}

