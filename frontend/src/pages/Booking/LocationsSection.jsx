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

// A workspace's physical locations (BOOK-06) - shops, studios,
// branches. Services and resources can each optionally link to one
// (see their own sections below); mounted first since it's the
// list those pickers read from.
export default function LocationsSection() {
  const { t } = useTranslation();
  const [locations, setLocations] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editIsActive, setEditIsActive] = useState(true);
  const [statusMsg, setStatusMsg] = useState(null);

  async function load() {
    const res = await api.get("/locations/");
    setLocations(res.data);
  }
  useEffect(() => {
    load();
  }, []);

  async function onCreate(e) {
    e.preventDefault();
    try {
      await api.post("/locations/", { name, address, phone });
      setName("");
      setAddress("");
      setPhone("");
      setShowForm(false);
      setStatusMsg({ key: "locations.locationCreated", type: "success" });
      load();
    } catch (err) {
      const data = err.response?.data;
      const message = data ? Object.values(data).flat().join(" ") : null;
      setStatusMsg(
        message
          ? { raw: message, type: "error" }
          : { key: "locations.couldNotCreateLocation", type: "error" },
      );
    }
  }

  function startEdit(location) {
    setEditingId(location.id);
    setEditName(location.name);
    setEditAddress(location.address || "");
    setEditPhone(location.phone || "");
    setEditIsActive(location.is_active);
  }
  function cancelEdit() {
    setEditingId(null);
  }
  async function saveEdit(locationId) {
    try {
      await api.patch(`/locations/${locationId}/`, {
        name: editName,
        address: editAddress,
        phone: editPhone,
        is_active: editIsActive,
      });
      setEditingId(null);
      setStatusMsg({ key: "locations.locationUpdated", type: "success" });
      load();
    } catch (err) {
      setStatusMsg({
        key: "locations.couldNotUpdateLocation",
        type: "error",
      });
    }
  }

  async function deleteLocation(locationId) {
    if (!window.confirm(t("locations.confirmDeleteLocation"))) return;
    try {
      await api.delete(`/locations/${locationId}/`);
      setStatusMsg({ key: "locations.locationDeleted", type: "error" });
      load();
    } catch (err) {
      setStatusMsg({
        key: "locations.couldNotDeleteLocation",
        type: "error",
      });
    }
  }

  return (
    <section className="bg-surface border border-line rounded-2xl p-6">
      <div className="flex justify-between items-center mb-3">
        <h2 className="font-medium text-ink">{t("locations.locationsTitle")}</h2>
        <button
          onClick={() => {
            setShowForm(!showForm);
            setStatusMsg(null);
          }}
          aria-expanded={showForm}
          aria-label={t("locations.addLocation")}
          className="text-sm text-brand-700 transition-colors hover:text-brand-800 focus:outline-none focus:ring-2 focus:ring-brand-400 rounded"
        >
          <FiPlus className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
          {t("locations.addLocation")}
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
          className="border border-line rounded-lg p-4 mb-4 space-y-2"
        >
          <label htmlFor="loc-name" className="sr-only">
            {t("locations.locationName")}
          </label>
          <input
            id="loc-name"
            required
            placeholder={t("locations.locationName")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
          />
          <label htmlFor="loc-address" className="sr-only">
            {t("locations.addressOptional")}
          </label>
          <textarea
            id="loc-address"
            rows={2}
            placeholder={t("locations.addressOptional")}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="w-full px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
          />
          <label htmlFor="loc-phone" className="sr-only">
            {t("locations.phoneOptional")}
          </label>
          <input
            id="loc-phone"
            placeholder={t("locations.phoneOptional")}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
          />
          <button
            aria-label={t("locations.createLocation")}
            className="bg-brand-600-solid text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400"
          >
            <FiPlus className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
            {t("locations.createLocation")}
          </button>
        </form>
      )}

      <ul className="divide-y divide-line">
        {locations.map((location) => (
          <li key={location.id} className="py-3 text-sm">
            {editingId === location.id ? (
              <div className="border border-brand-200 rounded-lg p-3 space-y-2">
                <label
                  htmlFor={`edit-loc-name-${location.id}`}
                  className="sr-only"
                >
                  {t("locations.locationName")}
                </label>
                <input
                  id={`edit-loc-name-${location.id}`}
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
                />
                <label
                  htmlFor={`edit-loc-address-${location.id}`}
                  className="sr-only"
                >
                  {t("locations.addressOptional")}
                </label>
                <textarea
                  id={`edit-loc-address-${location.id}`}
                  rows={2}
                  value={editAddress}
                  onChange={(e) => setEditAddress(e.target.value)}
                  className="w-full px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
                />
                <label
                  htmlFor={`edit-loc-phone-${location.id}`}
                  className="sr-only"
                >
                  {t("locations.phoneOptional")}
                </label>
                <input
                  id={`edit-loc-phone-${location.id}`}
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  className="w-full px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
                />
                <label className="flex items-center gap-1.5 text-sm cursor-pointer w-fit">
                  <input
                    type="checkbox"
                    checked={editIsActive}
                    onChange={(e) => setEditIsActive(e.target.checked)}
                    className="cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-400 rounded"
                  />
                  {t("locations.active")}
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={() => saveEdit(location.id)}
                    aria-label={t("locations.save")}
                    className="bg-brand-600-solid text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400"
                  >
                    <FiCheck className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
                    {t("locations.save")}
                  </button>
                  <button
                    onClick={cancelEdit}
                    aria-label={t("locations.cancel")}
                    className="bg-surface-2 text-ink-soft px-3 py-1.5 rounded-lg text-sm font-medium transition-colors hover:bg-line focus:outline-none focus:ring-2 focus:ring-brand-400"
                  >
                    <FiX className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
                    {t("locations.cancel")}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex justify-between items-start gap-3">
                <div>
                  <span className="font-medium">{location.name}</span>
                  {!location.is_active && (
                    <span className="ml-1.5 text-xs bg-surface-2 text-ink-soft px-1.5 py-0.5 rounded">
                      {t("locations.inactive")}
                    </span>
                  )}
                  {location.address && (
                    <p className="text-ink-soft mt-0.5 whitespace-pre-wrap">
                      {location.address}
                    </p>
                  )}
                  {location.phone && (
                    <p className="text-ink-soft mt-0.5">{location.phone}</p>
                  )}
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => startEdit(location)}
                    aria-label={`${t("locations.edit")} ${location.name}`}
                    className="bg-brand-50 text-brand-700 text-xs px-2.5 py-1 rounded-lg font-medium transition-colors hover:bg-brand-100 focus:outline-none focus:ring-2 focus:ring-brand-400"
                  >
                    <FiEdit2 className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
                    {t("locations.edit")}
                  </button>
                  <button
                    onClick={() => deleteLocation(location.id)}
                    aria-label={`${t("locations.delete")} ${location.name}`}
                    className="bg-red-600 text-white text-xs px-2.5 py-1 rounded-lg font-medium transition-colors hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-400"
                  >
                    <FiTrash2 className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
                    {t("locations.delete")}
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
        {locations.length === 0 && (
          <p className="text-ink-soft text-sm">{t("locations.noLocations")}</p>
        )}
      </ul>
    </section>
  );
}

