import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  FiCopy,
} from "react-icons/fi";
import api from "../../lib/api";

// Lets the owner turn on the guest-facing booking page (BOOK-21/26)
// and copy its link - the whole page, or a single service pre-
// selected (BOOK-28) - to share however they like. Off by default:
// nothing here is reachable until the owner explicitly enables it.
export default function PublicBookingSection() {
  const { t } = useTranslation();
  const [enabled, setEnabled] = useState(false);
  const [slug, setSlug] = useState("");
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [copiedKey, setCopiedKey] = useState(null);

  useEffect(() => {
    Promise.all([api.get("/workspace/"), api.get("/services/")]).then(
      ([workspaceRes, servicesRes]) => {
        setEnabled(workspaceRes.data.public_booking_enabled);
        setSlug(workspaceRes.data.slug);
        setServices(servicesRes.data.filter((s) => s.is_active));
        setLoading(false);
      },
    );
  }, []);

  async function toggle() {
    const next = !enabled;
    setEnabled(next);
    await api.patch("/workspace/", { public_booking_enabled: next });
  }

  function linkFor(serviceId) {
    const base = `${window.location.origin}/book/${slug}`;
    return serviceId ? `${base}?service=${serviceId}` : base;
  }

  async function copy(key, serviceId) {
    try {
      await navigator.clipboard.writeText(linkFor(serviceId));
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 2000);
    } catch {
      // Clipboard access can be denied by the browser - the link
      // text is still visible on the page for the owner to select
      // and copy manually.
    }
  }

  if (loading) return null;

  return (
    <section className="bg-surface border border-line rounded-2xl p-6">
      <div className="flex justify-between items-center mb-3">
        <h2 className="font-medium text-ink">{t("booking.publicBookingTitle")}</h2>
        <button
          role="switch"
          aria-checked={enabled}
          aria-label={t("booking.publicBookingEnable")}
          onClick={toggle}
          className={`relative w-11 h-6 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 ${
            enabled ? "bg-brand-600" : "bg-line"
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
              enabled ? "translate-x-5" : ""
            }`}
          />
        </button>
      </div>
      <p className="text-sm text-ink-soft mb-4">
        {t("booking.publicBookingDescription")}
      </p>
      {enabled && (
        <div className="space-y-3">
          <div>
            <label className="text-xs text-ink-soft block mb-1">
              {t("booking.publicBookingLink")}
            </label>
            <div className="flex gap-2">
              <input
                readOnly
                value={linkFor()}
                onFocus={(e) => e.target.select()}
                className="flex-1 min-w-0 border border-line rounded-lg px-3 py-2 text-sm bg-canvas text-ink"
              />
              <button
                onClick={() => copy("workspace")}
                className="shrink-0 px-3 py-2 rounded-lg border border-line text-sm hover:bg-canvas focus:outline-none focus:ring-2 focus:ring-brand-400"
              >
                <FiCopy className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
                {copiedKey === "workspace" ? t("booking.linkCopied") : t("booking.copyLink")}
              </button>
            </div>
          </div>
          {services.length > 0 && (
            <div>
              <p className="text-xs text-ink-soft mb-1">
                {t("booking.perServiceLinks")}
              </p>
              <ul className="space-y-2">
                {services.map((service) => (
                  <li
                    key={service.id}
                    className="flex justify-between items-center gap-2 text-sm"
                  >
                    <span className="text-ink truncate">{service.name}</span>
                    <button
                      onClick={() => copy(`service-${service.id}`, service.id)}
                      className="shrink-0 px-3 py-1.5 rounded-lg border border-line text-xs hover:bg-canvas focus:outline-none focus:ring-2 focus:ring-brand-400"
                    >
                      <FiCopy className="inline -mt-0.5 mr-1 shrink-0" aria-hidden="true" />
                      {copiedKey === `service-${service.id}`
                        ? t("booking.linkCopied")
                        : t("booking.copyLink")}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

