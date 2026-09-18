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
import { formatDuration } from "./shared.js";

const RESOURCE_TYPES = [
  "chair", "table", "car", "van", "hotel_room", "meeting_room", "studio",
  "desk", "office", "equipment", "machine", "court", "field", "boat",
  "bike", "parking_space", "room", "facility", "other", "custom",
];
const RESERVATION_MODES = ["reservation", "rental", "booking"];
const PRICING_MODES = [
  "none", "hourly", "daily", "nightly", "weekly", "monthly", "per_use",
  "custom",
];
const CAPACITY_MODES = ["exclusive", "shared"];
const RESOURCE_STATUSES = [
  "available", "blocked", "maintenance", "cleaning", "inactive", "retired",
];

export default function ResourcesSection() {
  const { t } = useTranslation();
  const [resources, setResources] = useState([]);
  const [services, setServices] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [duration, setDuration] = useState("60");
  const [durationUnit, setDurationUnit] = useState("minutes");
  const [price, setPrice] = useState("");
  const [selectedServices, setSelectedServices] = useState([]);
  const [newPhoto, setNewPhoto] = useState(null);
  const [newPhotoPreview, setNewPhotoPreview] = useState(null);
  const [type, setType] = useState("other");
  const [customType, setCustomType] = useState("");
  const [category, setCategory] = useState("");
  const [locations, setLocations] = useState([]);
  const [location, setLocation] = useState("");
  const [locationRef, setLocationRef] = useState("");
  const [reservationMode, setReservationMode] = useState("reservation");
  const [pricingMode, setPricingMode] = useState("none");
  const [capacity, setCapacity] = useState("");
  const [capacityMode, setCapacityMode] = useState("exclusive");
  const [bufferBefore, setBufferBefore] = useState("0");
  const [bufferAfter, setBufferAfter] = useState("0");
  const [minNotice, setMinNotice] = useState("0");
  const [maxAdvance, setMaxAdvance] = useState("");
  const [minDuration, setMinDuration] = useState("");
  const [maxDuration, setMaxDuration] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editQuantity, setEditQuantity] = useState("1");
  const [editPrice, setEditPrice] = useState("");
  const [editServices, setEditServices] = useState([]);
  const [editType, setEditType] = useState("other");
  const [editCustomType, setEditCustomType] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [editLocationRef, setEditLocationRef] = useState("");
  const [editStatus, setEditStatus] = useState("available");
  const [editReservationMode, setEditReservationMode] = useState("reservation");
  const [editPricingMode, setEditPricingMode] = useState("none");
  const [editCapacity, setEditCapacity] = useState("");
  const [editCapacityMode, setEditCapacityMode] = useState("exclusive");
  const [editBufferBefore, setEditBufferBefore] = useState("0");
  const [editBufferAfter, setEditBufferAfter] = useState("0");
  const [editMinNotice, setEditMinNotice] = useState("0");
  const [editMaxAdvance, setEditMaxAdvance] = useState("");
  const [editMinDuration, setEditMinDuration] = useState("");
  const [editMaxDuration, setEditMaxDuration] = useState("");
  const [statusMsg, setStatusMsg] = useState(null);

  async function load() {
    const res = await api.get("/resources/");
    setResources(res.data);
  }
  async function loadServices() {
    const res = await api.get("/services/");
    setServices(res.data);
  }
  async function loadLocations() {
    const res = await api.get("/locations/");
    setLocations(res.data);
  }
  useEffect(() => {
    load();
    loadServices();
    loadLocations();
  }, []);

  function toggleSelected(list, setList, serviceId) {
    if (list.includes(serviceId)) {
      setList(list.filter((id) => id !== serviceId));
    } else {
      setList([...list, serviceId]);
    }
  }

  async function onCreate(e) {
    e.preventDefault();
    const minutes =
      durationUnit === "days"
        ? Math.round(parseFloat(duration) * 1440)
        : durationUnit === "hours"
          ? Math.round(parseFloat(duration) * 60)
          : parseInt(duration, 10);
    try {
      const res = await api.post("/resources/", {
        name,
        description,
        quantity,
        duration_minutes: minutes,
        price: price || null,
        services: selectedServices,
        type,
        custom_type: type === "custom" ? customType : "",
        category,
        location,
        location_ref: locationRef || null,
        reservation_mode: reservationMode,
        pricing_mode: pricingMode,
        capacity: capacity || null,
        capacity_mode: capacityMode,
        booking_buffer_before_minutes: bufferBefore || 0,
        booking_buffer_after_minutes: bufferAfter || 0,
        min_booking_notice_hours: minNotice || 0,
        max_advance_days: maxAdvance || null,
        min_duration_minutes: minDuration || null,
        max_duration_minutes: maxDuration || null,
      });
      if (newPhoto) {
        const formData = new FormData();
        formData.append("photo", newPhoto);
        await api.patch(`/resources/${res.data.id}/`, formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });
      }
      setName("");
      setDescription("");
      setQuantity("1");
      setDuration("60");
      setDurationUnit("minutes");
      setPrice("");
      setSelectedServices([]);
      setNewPhoto(null);
      setNewPhotoPreview(null);
      setType("other");
      setCustomType("");
      setCategory("");
      setLocation("");
      setLocationRef("");
      setReservationMode("reservation");
      setPricingMode("none");
      setCapacity("");
      setCapacityMode("exclusive");
      setBufferBefore("0");
      setBufferAfter("0");
      setMinNotice("0");
      setMaxAdvance("");
      setMinDuration("");
      setMaxDuration("");
      setShowForm(false);
      setStatusMsg({ key: "resources.resourceCreated", type: "success" });
      load();
    } catch (err) {
      const data = err.response?.data;
      const message = data ? Object.values(data).flat().join(" ") : null;
      setStatusMsg(
        message
          ? { raw: message, type: "error" }
          : { key: "resources.couldNotCreateResource", type: "error" },
      );
    }
  }

  async function onPhotoChange(resourceId, file) {
    if (!file) return;
    const formData = new FormData();
    formData.append("photo", file);
    await api.patch(`/resources/${resourceId}/`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    load();
  }

  function startEdit(resource) {
    setEditingId(resource.id);
    setEditName(resource.name);
    setEditDescription(resource.description || "");
    setEditQuantity(String(resource.quantity));
    setEditPrice(resource.price || "");
    setEditServices(resource.services);
    setEditType(resource.type || "other");
    setEditCustomType(resource.custom_type || "");
    setEditCategory(resource.category || "");
    setEditLocation(resource.location || "");
    setEditLocationRef(resource.location_ref ? String(resource.location_ref) : "");
    setEditStatus(resource.status || "available");
    setEditReservationMode(resource.reservation_mode || "reservation");
    setEditPricingMode(resource.pricing_mode || "none");
    setEditCapacity(resource.capacity ?? "");
    setEditCapacityMode(resource.capacity_mode || "exclusive");
    setEditBufferBefore(String(resource.booking_buffer_before_minutes ?? 0));
    setEditBufferAfter(String(resource.booking_buffer_after_minutes ?? 0));
    setEditMinNotice(String(resource.min_booking_notice_hours ?? 0));
    setEditMaxAdvance(resource.max_advance_days ?? "");
    setEditMinDuration(resource.min_duration_minutes ?? "");
    setEditMaxDuration(resource.max_duration_minutes ?? "");
  }
  function cancelEdit() {
    setEditingId(null);
  }
  async function saveEdit(resourceId) {
    try {
      await api.patch(`/resources/${resourceId}/`, {
        name: editName,
        description: editDescription,
        quantity: editQuantity,
        price: editPrice || null,
        services: editServices,
        type: editType,
        custom_type: editType === "custom" ? editCustomType : "",
        category: editCategory,
        location: editLocation,
        location_ref: editLocationRef || null,
        status: editStatus,
        reservation_mode: editReservationMode,
        pricing_mode: editPricingMode,
        capacity: editCapacity || null,
        capacity_mode: editCapacityMode,
        booking_buffer_before_minutes: editBufferBefore || 0,
        booking_buffer_after_minutes: editBufferAfter || 0,
        min_booking_notice_hours: editMinNotice || 0,
        max_advance_days: editMaxAdvance || null,
        min_duration_minutes: editMinDuration || null,
        max_duration_minutes: editMaxDuration || null,
      });
      setEditingId(null);
      setStatusMsg({ key: "resources.resourceUpdated", type: "success" });
      load();
    } catch (err) {
      const data = err.response?.data;
      const message = data ? Object.values(data).flat().join(" ") : null;
      setStatusMsg(
        message
          ? { raw: message, type: "error" }
          : { key: "resources.couldNotUpdateResource", type: "error" },
      );
    }
  }

  async function deleteResource(resourceId) {
    if (!window.confirm(t("resources.confirmDeleteResource"))) return;
    try {
      await api.delete(`/resources/${resourceId}/`);
      setStatusMsg({ key: "resources.resourceDeleted", type: "error" });
      load();
    } catch (err) {
      setStatusMsg({
        key: "resources.couldNotDeleteResource",
        type: "error",
      });
    }
  }

  function serviceNames(ids) {
    return services
      .filter((s) => ids.includes(s.id))
      .map((s) => s.name)
      .join(", ");
  }

  return (
    <section className="bg-surface border border-line rounded-2xl p-6">
      <div className="flex justify-between items-center mb-3">
        <h2 className="font-medium text-ink">{t("resources.resourcesTitle")}</h2>
        <button
          onClick={() => {
            setShowForm(!showForm);
            setStatusMsg(null);
          }}
          aria-expanded={showForm}
          aria-label={t("resources.addResource")}
          className="text-sm text-brand-700 transition-colors hover:text-brand-800 focus:outline-none focus:ring-2 focus:ring-brand-400 rounded"
        >
          <FiPlus className="inline -mt-0.5 mr-1 shrink-0" aria-hidden="true" />{t("resources.addResource")}
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
          className="border border-line rounded-lg p-4 mb-4"
        >
          <label htmlFor="resource-name" className="sr-only">
            {t("resources.resourceName")}
          </label>
          <input
            id="resource-name"
            required
            placeholder={t("resources.resourceName")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full mb-2 px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
          />
          <label htmlFor="resource-description" className="sr-only">
            {t("resources.descriptionOptional")}
          </label>
          <textarea
            id="resource-description"
            placeholder={t("resources.descriptionOptional")}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full mb-2 px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
          />

          <label
            className="flex items-center gap-2 mb-2 cursor-pointer w-fit"
            title={t("resources.addPhotoOptional")}
          >
            {newPhotoPreview ? (
              <img
                src={newPhotoPreview}
                alt="Resource photo preview"
                className="w-12 h-12 rounded-lg object-cover border border-line"
              />
            ) : (
              <div
                aria-hidden="true"
                className="w-12 h-12 rounded-lg bg-surface-2 border border-dashed border-line flex items-center justify-center text-xs text-ink-soft transition-colors hover:bg-line"
              >
                +
              </div>
            )}
            <span className="text-xs text-ink-soft">
              {newPhotoPreview
                ? t("resources.changePhoto")
                : t("resources.addPhotoOptional")}
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
              aria-label={t("resources.addPhotoOptional")}
            />
          </label>

          <div className="flex flex-wrap gap-2 mb-2">
            <label htmlFor="resource-duration" className="sr-only">
              {t("resources.duration")}
            </label>
            <input
              id="resource-duration"
              required
              type="number"
              min={
                durationUnit === "days"
                  ? "1"
                  : durationUnit === "hours"
                    ? "0.25"
                    : "5"
              }
              step={
                durationUnit === "days"
                  ? "1"
                  : durationUnit === "hours"
                    ? "0.25"
                    : "5"
              }
              placeholder={t("resources.duration")}
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              className="w-24 px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
            />
            <label htmlFor="resource-duration-unit" className="sr-only">
              Duration unit
            </label>
            <select
              id="resource-duration-unit"
              value={durationUnit}
              onChange={(e) => setDurationUnit(e.target.value)}
              className="px-2 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400"
            >
              <option value="minutes">min</option>
              <option value="hours">hrs</option>
              <option value="days">days</option>
            </select>
            <label htmlFor="resource-price" className="sr-only">
              Price
            </label>
            <input
              id="resource-price"
              type="number"
              placeholder={t("resources.priceOptional")}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="flex-1 px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
            />
            <label htmlFor="resource-quantity" className="sr-only">
              {t("resources.quantity")}
            </label>
            <input
              id="resource-quantity"
              type="number"
              min="1"
              title={t("resources.quantity")}
              placeholder={t("resources.quantity")}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="w-24 px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
            />
          </div>

          <div className="flex flex-wrap gap-2 mb-2">
            <label htmlFor="resource-type" className="sr-only">
              {t("resources.type")}
            </label>
            <select
              id="resource-type"
              value={type}
              onChange={(e) => setType(e.target.value)}
              title={t("resources.type")}
              className="px-2 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400"
            >
              {RESOURCE_TYPES.map((value) => (
                <option key={value} value={value}>
                  {t(`resources.types.${value}`)}
                </option>
              ))}
            </select>
            {type === "custom" && (
              <>
                <label htmlFor="resource-custom-type" className="sr-only">
                  {t("resources.customTypePlaceholder")}
                </label>
                <input
                  id="resource-custom-type"
                  required
                  placeholder={t("resources.customTypePlaceholder")}
                  value={customType}
                  onChange={(e) => setCustomType(e.target.value)}
                  className="w-40 px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
                />
              </>
            )}
            <label htmlFor="resource-category" className="sr-only">
              {t("resources.categoryOptional")}
            </label>
            <input
              id="resource-category"
              placeholder={t("resources.categoryOptional")}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="flex-1 min-w-32 px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
            />
            <label htmlFor="resource-location" className="sr-only">
              {t("resources.locationOptional")}
            </label>
            <input
              id="resource-location"
              placeholder={t("resources.locationOptional")}
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="flex-1 min-w-32 px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
            />
            {locations.length > 0 && (
              <>
                <label htmlFor="resource-location-ref" className="sr-only">
                  {t("locations.locationsTitle")}
                </label>
                <select
                  id="resource-location-ref"
                  value={locationRef}
                  onChange={(e) => setLocationRef(e.target.value)}
                  className="px-2 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400"
                >
                  <option value="">{t("locations.noLocationLinked")}</option>
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name}
                    </option>
                  ))}
                </select>
              </>
            )}
          </div>

          <div className="flex flex-wrap gap-2 mb-3">
            <label htmlFor="resource-reservation-mode" className="sr-only">
              {t("resources.reservationMode")}
            </label>
            <select
              id="resource-reservation-mode"
              value={reservationMode}
              onChange={(e) => setReservationMode(e.target.value)}
              title={t("resources.reservationMode")}
              className="px-2 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400"
            >
              {RESERVATION_MODES.map((value) => (
                <option key={value} value={value}>
                  {t(`resources.reservationModes.${value}`)}
                </option>
              ))}
            </select>
            <label htmlFor="resource-pricing-mode" className="sr-only">
              {t("resources.pricingMode")}
            </label>
            <select
              id="resource-pricing-mode"
              value={pricingMode}
              onChange={(e) => setPricingMode(e.target.value)}
              title={t("resources.pricingMode")}
              className="px-2 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400"
            >
              {PRICING_MODES.map((value) => (
                <option key={value} value={value}>
                  {t(`resources.pricingModes.${value}`)}
                </option>
              ))}
            </select>
            <label htmlFor="resource-capacity" className="sr-only">
              {t("resources.capacityOptional")}
            </label>
            <input
              id="resource-capacity"
              type="number"
              min="1"
              placeholder={t("resources.capacityOptional")}
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
              className="w-32 px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
            />
            <label htmlFor="resource-capacity-mode" className="sr-only">
              {t("resources.capacityMode")}
            </label>
            <select
              id="resource-capacity-mode"
              value={capacityMode}
              onChange={(e) => setCapacityMode(e.target.value)}
              title={t("resources.capacityMode")}
              className="px-2 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400"
            >
              {CAPACITY_MODES.map((value) => (
                <option key={value} value={value}>
                  {t(`resources.capacityModes.${value}`)}
                </option>
              ))}
            </select>
          </div>

          <details className="mb-3">
            <summary className="text-xs text-ink-soft cursor-pointer select-none mb-2">
              {t("resources.advancedRules")}
            </summary>
            <div className="flex flex-wrap gap-2 pt-2">
              <label htmlFor="resource-buffer-before" className="sr-only">
                {t("resources.bufferBeforeMinutes")}
              </label>
              <input
                id="resource-buffer-before"
                type="number"
                min="0"
                placeholder={t("resources.bufferBeforeMinutes")}
                title={t("resources.bufferBeforeMinutes")}
                value={bufferBefore}
                onChange={(e) => setBufferBefore(e.target.value)}
                className="w-28 px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
              />
              <label htmlFor="resource-buffer-after" className="sr-only">
                {t("resources.bufferAfterMinutes")}
              </label>
              <input
                id="resource-buffer-after"
                type="number"
                min="0"
                placeholder={t("resources.bufferAfterMinutes")}
                title={t("resources.bufferAfterMinutes")}
                value={bufferAfter}
                onChange={(e) => setBufferAfter(e.target.value)}
                className="w-28 px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
              />
              <label htmlFor="resource-min-notice" className="sr-only">
                {t("resources.minNoticeHours")}
              </label>
              <input
                id="resource-min-notice"
                type="number"
                min="0"
                placeholder={t("resources.minNoticeHours")}
                title={t("resources.minNoticeHours")}
                value={minNotice}
                onChange={(e) => setMinNotice(e.target.value)}
                className="w-28 px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
              />
              <label htmlFor="resource-max-advance" className="sr-only">
                {t("resources.maxAdvanceDays")}
              </label>
              <input
                id="resource-max-advance"
                type="number"
                min="0"
                placeholder={t("resources.maxAdvanceDays")}
                title={t("resources.maxAdvanceDays")}
                value={maxAdvance}
                onChange={(e) => setMaxAdvance(e.target.value)}
                className="w-28 px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
              />
              <label htmlFor="resource-min-duration" className="sr-only">
                {t("resources.minDurationMinutes")}
              </label>
              <input
                id="resource-min-duration"
                type="number"
                min="0"
                placeholder={t("resources.minDurationMinutes")}
                title={t("resources.minDurationMinutes")}
                value={minDuration}
                onChange={(e) => setMinDuration(e.target.value)}
                className="w-28 px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
              />
              <label htmlFor="resource-max-duration" className="sr-only">
                {t("resources.maxDurationMinutes")}
              </label>
              <input
                id="resource-max-duration"
                type="number"
                min="0"
                placeholder={t("resources.maxDurationMinutes")}
                title={t("resources.maxDurationMinutes")}
                value={maxDuration}
                onChange={(e) => setMaxDuration(e.target.value)}
                className="w-28 px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
              />
            </div>
          </details>

          <p className="text-xs text-ink-soft mb-1">
            {t("resources.assignServices")}
          </p>
          <div className="flex flex-wrap gap-3 mb-3">
            {services.map((service) => (
              <label
                key={service.id}
                className="flex items-center gap-1.5 text-sm cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selectedServices.includes(service.id)}
                  onChange={() =>
                    toggleSelected(
                      selectedServices,
                      setSelectedServices,
                      service.id,
                    )
                  }
                  className="cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-400 rounded"
                />
                {service.name}
              </label>
            ))}
          </div>
          <button
            aria-label={t("resources.createResource")}
            className="bg-brand-600-solid text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400"
          >
            <FiPlus className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
            {t("resources.createResource")}
          </button>
        </form>
      )}

      <ul className="divide-y divide-line">
        {resources.map((resource) => (
          <li key={resource.id} className="py-3 text-sm">
            {editingId === resource.id ? (
              <div className="border border-brand-200 rounded-lg p-3">
                <label
                  htmlFor={`edit-resource-name-${resource.id}`}
                  className="sr-only"
                >
                  {t("resources.resourceName")}
                </label>
                <input
                  id={`edit-resource-name-${resource.id}`}
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full mb-2 px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
                />
                <label
                  htmlFor={`edit-resource-desc-${resource.id}`}
                  className="sr-only"
                >
                  {t("resources.descriptionOptional")}
                </label>
                <textarea
                  id={`edit-resource-desc-${resource.id}`}
                  placeholder={t("resources.descriptionOptional")}
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  rows={2}
                  className="w-full mb-2 px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
                />
                <div className="flex flex-wrap gap-2 mb-2">
                  <label
                    htmlFor={`edit-resource-price-${resource.id}`}
                    className="sr-only"
                  >
                    Price
                  </label>
                  <input
                    id={`edit-resource-price-${resource.id}`}
                    type="number"
                    placeholder={t("resources.priceOptional")}
                    value={editPrice}
                    onChange={(e) => setEditPrice(e.target.value)}
                    className="flex-1 px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
                  />
                  <label
                    htmlFor={`edit-resource-qty-${resource.id}`}
                    className="sr-only"
                  >
                    {t("resources.quantity")}
                  </label>
                  <input
                    id={`edit-resource-qty-${resource.id}`}
                    type="number"
                    min="1"
                    value={editQuantity}
                    onChange={(e) => setEditQuantity(e.target.value)}
                    className="w-28 px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
                  />
                </div>

                <div className="flex flex-wrap gap-2 mb-2">
                  <label
                    htmlFor={`edit-resource-type-${resource.id}`}
                    className="sr-only"
                  >
                    {t("resources.type")}
                  </label>
                  <select
                    id={`edit-resource-type-${resource.id}`}
                    value={editType}
                    onChange={(e) => setEditType(e.target.value)}
                    title={t("resources.type")}
                    className="px-2 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400"
                  >
                    {RESOURCE_TYPES.map((value) => (
                      <option key={value} value={value}>
                        {t(`resources.types.${value}`)}
                      </option>
                    ))}
                  </select>
                  {editType === "custom" && (
                    <>
                      <label
                        htmlFor={`edit-resource-custom-type-${resource.id}`}
                        className="sr-only"
                      >
                        {t("resources.customTypePlaceholder")}
                      </label>
                      <input
                        id={`edit-resource-custom-type-${resource.id}`}
                        required
                        placeholder={t("resources.customTypePlaceholder")}
                        value={editCustomType}
                        onChange={(e) => setEditCustomType(e.target.value)}
                        className="w-40 px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
                      />
                    </>
                  )}
                  <label
                    htmlFor={`edit-resource-category-${resource.id}`}
                    className="sr-only"
                  >
                    {t("resources.categoryOptional")}
                  </label>
                  <input
                    id={`edit-resource-category-${resource.id}`}
                    placeholder={t("resources.categoryOptional")}
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value)}
                    className="flex-1 min-w-32 px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
                  />
                  <label
                    htmlFor={`edit-resource-location-${resource.id}`}
                    className="sr-only"
                  >
                    {t("resources.locationOptional")}
                  </label>
                  <input
                    id={`edit-resource-location-${resource.id}`}
                    placeholder={t("resources.locationOptional")}
                    value={editLocation}
                    onChange={(e) => setEditLocation(e.target.value)}
                    className="flex-1 min-w-32 px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
                  />
                  {locations.length > 0 && (
                    <>
                      <label
                        htmlFor={`edit-resource-location-ref-${resource.id}`}
                        className="sr-only"
                      >
                        {t("locations.locationsTitle")}
                      </label>
                      <select
                        id={`edit-resource-location-ref-${resource.id}`}
                        value={editLocationRef}
                        onChange={(e) => setEditLocationRef(e.target.value)}
                        className="px-2 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400"
                      >
                        <option value="">{t("locations.noLocationLinked")}</option>
                        {locations.map((loc) => (
                          <option key={loc.id} value={loc.id}>
                            {loc.name}
                          </option>
                        ))}
                      </select>
                    </>
                  )}
                </div>

                <div className="flex flex-wrap gap-2 mb-3">
                  <label
                    htmlFor={`edit-resource-status-${resource.id}`}
                    className="sr-only"
                  >
                    {t("resources.status")}
                  </label>
                  <select
                    id={`edit-resource-status-${resource.id}`}
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value)}
                    title={t("resources.status")}
                    className="px-2 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400"
                  >
                    {RESOURCE_STATUSES.map((value) => (
                      <option key={value} value={value}>
                        {t(`resources.statuses.${value}`)}
                      </option>
                    ))}
                  </select>
                  <label
                    htmlFor={`edit-resource-reservation-mode-${resource.id}`}
                    className="sr-only"
                  >
                    {t("resources.reservationMode")}
                  </label>
                  <select
                    id={`edit-resource-reservation-mode-${resource.id}`}
                    value={editReservationMode}
                    onChange={(e) => setEditReservationMode(e.target.value)}
                    title={t("resources.reservationMode")}
                    className="px-2 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400"
                  >
                    {RESERVATION_MODES.map((value) => (
                      <option key={value} value={value}>
                        {t(`resources.reservationModes.${value}`)}
                      </option>
                    ))}
                  </select>
                  <label
                    htmlFor={`edit-resource-pricing-mode-${resource.id}`}
                    className="sr-only"
                  >
                    {t("resources.pricingMode")}
                  </label>
                  <select
                    id={`edit-resource-pricing-mode-${resource.id}`}
                    value={editPricingMode}
                    onChange={(e) => setEditPricingMode(e.target.value)}
                    title={t("resources.pricingMode")}
                    className="px-2 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400"
                  >
                    {PRICING_MODES.map((value) => (
                      <option key={value} value={value}>
                        {t(`resources.pricingModes.${value}`)}
                      </option>
                    ))}
                  </select>
                  <label
                    htmlFor={`edit-resource-capacity-${resource.id}`}
                    className="sr-only"
                  >
                    {t("resources.capacityOptional")}
                  </label>
                  <input
                    id={`edit-resource-capacity-${resource.id}`}
                    type="number"
                    min="1"
                    placeholder={t("resources.capacityOptional")}
                    value={editCapacity}
                    onChange={(e) => setEditCapacity(e.target.value)}
                    className="w-32 px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
                  />
                  <label
                    htmlFor={`edit-resource-capacity-mode-${resource.id}`}
                    className="sr-only"
                  >
                    {t("resources.capacityMode")}
                  </label>
                  <select
                    id={`edit-resource-capacity-mode-${resource.id}`}
                    value={editCapacityMode}
                    onChange={(e) => setEditCapacityMode(e.target.value)}
                    title={t("resources.capacityMode")}
                    className="px-2 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400"
                  >
                    {CAPACITY_MODES.map((value) => (
                      <option key={value} value={value}>
                        {t(`resources.capacityModes.${value}`)}
                      </option>
                    ))}
                  </select>
                </div>

                <details className="mb-3">
                  <summary className="text-xs text-ink-soft cursor-pointer select-none mb-2">
                    {t("resources.advancedRules")}
                  </summary>
                  <div className="flex flex-wrap gap-2 pt-2">
                    <label
                      htmlFor={`edit-resource-buffer-before-${resource.id}`}
                      className="sr-only"
                    >
                      {t("resources.bufferBeforeMinutes")}
                    </label>
                    <input
                      id={`edit-resource-buffer-before-${resource.id}`}
                      type="number"
                      min="0"
                      placeholder={t("resources.bufferBeforeMinutes")}
                      title={t("resources.bufferBeforeMinutes")}
                      value={editBufferBefore}
                      onChange={(e) => setEditBufferBefore(e.target.value)}
                      className="w-28 px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
                    />
                    <label
                      htmlFor={`edit-resource-buffer-after-${resource.id}`}
                      className="sr-only"
                    >
                      {t("resources.bufferAfterMinutes")}
                    </label>
                    <input
                      id={`edit-resource-buffer-after-${resource.id}`}
                      type="number"
                      min="0"
                      placeholder={t("resources.bufferAfterMinutes")}
                      title={t("resources.bufferAfterMinutes")}
                      value={editBufferAfter}
                      onChange={(e) => setEditBufferAfter(e.target.value)}
                      className="w-28 px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
                    />
                    <label
                      htmlFor={`edit-resource-min-notice-${resource.id}`}
                      className="sr-only"
                    >
                      {t("resources.minNoticeHours")}
                    </label>
                    <input
                      id={`edit-resource-min-notice-${resource.id}`}
                      type="number"
                      min="0"
                      placeholder={t("resources.minNoticeHours")}
                      title={t("resources.minNoticeHours")}
                      value={editMinNotice}
                      onChange={(e) => setEditMinNotice(e.target.value)}
                      className="w-28 px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
                    />
                    <label
                      htmlFor={`edit-resource-max-advance-${resource.id}`}
                      className="sr-only"
                    >
                      {t("resources.maxAdvanceDays")}
                    </label>
                    <input
                      id={`edit-resource-max-advance-${resource.id}`}
                      type="number"
                      min="0"
                      placeholder={t("resources.maxAdvanceDays")}
                      title={t("resources.maxAdvanceDays")}
                      value={editMaxAdvance}
                      onChange={(e) => setEditMaxAdvance(e.target.value)}
                      className="w-28 px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
                    />
                    <label
                      htmlFor={`edit-resource-min-duration-${resource.id}`}
                      className="sr-only"
                    >
                      {t("resources.minDurationMinutes")}
                    </label>
                    <input
                      id={`edit-resource-min-duration-${resource.id}`}
                      type="number"
                      min="0"
                      placeholder={t("resources.minDurationMinutes")}
                      title={t("resources.minDurationMinutes")}
                      value={editMinDuration}
                      onChange={(e) => setEditMinDuration(e.target.value)}
                      className="w-28 px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
                    />
                    <label
                      htmlFor={`edit-resource-max-duration-${resource.id}`}
                      className="sr-only"
                    >
                      {t("resources.maxDurationMinutes")}
                    </label>
                    <input
                      id={`edit-resource-max-duration-${resource.id}`}
                      type="number"
                      min="0"
                      placeholder={t("resources.maxDurationMinutes")}
                      title={t("resources.maxDurationMinutes")}
                      value={editMaxDuration}
                      onChange={(e) => setEditMaxDuration(e.target.value)}
                      className="w-28 px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
                    />
                  </div>
                </details>

                <p className="text-xs text-ink-soft mb-1">
                  {t("resources.assignServices")}
                </p>
                <div className="flex flex-wrap gap-3 mb-3">
                  {services.map((service) => (
                    <label
                      key={service.id}
                      className="flex items-center gap-1.5 text-sm cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={editServices.includes(service.id)}
                        onChange={() =>
                          toggleSelected(
                            editServices,
                            setEditServices,
                            service.id,
                          )
                        }
                        className="cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-400 rounded"
                      />
                      {service.name}
                    </label>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => saveEdit(resource.id)}
                    aria-label={t("resources.save")}
                    className="bg-brand-600-solid text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400"
                  >
                    <FiCheck className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
                    {t("resources.save")}
                  </button>
                  <button
                    onClick={cancelEdit}
                    aria-label={t("resources.cancel")}
                    className="bg-surface-2 text-ink-soft px-3 py-1.5 rounded-lg text-sm font-medium transition-colors hover:bg-line focus:outline-none focus:ring-2 focus:ring-brand-400"
                  >
                    <FiX className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
                    {t("resources.cancel")}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-3">
                <label
                  className="shrink-0 cursor-pointer rounded-lg focus-within:ring-2 focus-within:ring-brand-400"
                  title="Upload or change resource photo"
                >
                  {resource.photo ? (
                    <img
                      src={resource.photo}
                      alt={`${resource.name} photo`}
                      className="w-12 h-12 rounded-lg object-cover border border-line transition-opacity hover:opacity-80"
                    />
                  ) : (
                    <div
                      aria-hidden="true"
                      className="w-12 h-12 rounded-lg bg-surface-2 border border-dashed border-line flex items-center justify-center text-xs text-ink-soft transition-colors hover:bg-line"
                    >
                      +
                    </div>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) =>
                      onPhotoChange(resource.id, e.target.files[0])
                    }
                    aria-label={`Upload photo for ${resource.name}`}
                  />
                </label>
                <div className="flex-1 flex justify-between items-start">
                  <div>
                    <span className="font-medium">{resource.name}</span>
                    {" \u00b7 "}
                    {t(`resources.types.${resource.type || "other"}`)}
                    {resource.type === "custom" && resource.custom_type
                      ? ` (${resource.custom_type})`
                      : ""}
                    {resource.status && resource.status !== "available" && (
                      <span className="ml-1.5 text-xs bg-surface-2 text-ink-soft px-1.5 py-0.5 rounded">
                        {t(`resources.statuses.${resource.status}`)}
                      </span>
                    )}
                    {" \u00b7 "}
                    {formatDuration(resource.duration_minutes)}
                    {resource.price && ` \u00b7 ${resource.price}`}
                    {" \u00b7 "}
                    {t("resources.quantity")}: {resource.quantity}
                    {(resource.category || resource.location) && (
                      <p className="text-ink-soft mt-0.5">
                        {[resource.category, resource.location]
                          .filter(Boolean)
                          .join(" \u00b7 ")}
                      </p>
                    )}
                    {resource.services.length > 0 && (
                      <p className="text-ink-soft mt-0.5">
                        {serviceNames(resource.services)}
                      </p>
                    )}
                    {resource.description && (
                      <p className="text-ink-soft mt-0.5">
                        {resource.description}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => startEdit(resource)}
                      aria-label={`${t("resources.edit")} ${resource.name}`}
                      className="bg-brand-50 text-brand-700 text-xs px-2.5 py-1 rounded-lg font-medium transition-colors hover:bg-brand-100 focus:outline-none focus:ring-2 focus:ring-brand-400"
                    >
                      <FiEdit2 className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
                      {t("resources.edit")}
                    </button>
                    <button
                      onClick={() => deleteResource(resource.id)}
                      aria-label={`${t("resources.delete")} ${resource.name}`}
                      className="bg-red-600 text-white text-xs px-2.5 py-1 rounded-lg font-medium transition-colors hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-400"
                    >
                      <FiTrash2 className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
                      {t("resources.delete")}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </li>
        ))}
        {resources.length === 0 && (
          <p className="text-ink-soft text-sm">{t("resources.noResources")}</p>
        )}
      </ul>
    </section>
  );
}

