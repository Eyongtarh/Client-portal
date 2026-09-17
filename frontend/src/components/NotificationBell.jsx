// A shared header control (NOTIF-01): shows an unread count badge
// pulled from /activities/unread-count/ and, on click, a dropdown
// of the same Activity feed ActivityFeed already renders elsewhere
// - just unread-filtered (per the viewer's own read state and
// muted categories, see NOTIF-02) and capped to a short list.
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { FiBell } from "react-icons/fi";
import api from "../lib/api";
import { describeActivity, formatActivityWhen } from "../lib/activityText";

const POLL_INTERVAL_MS = 60000;

export default function NotificationBell() {
  const { t, i18n } = useTranslation();
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const buttonRef = useRef(null);

  async function loadCount() {
    try {
      const res = await api.get("/activities/unread-count/");
      setCount(res.data.count);
    } catch {
      // A transient failure here just means a stale badge until
      // the next poll - not worth surfacing to the user.
    }
  }

  useEffect(() => {
    loadCount();
    const interval = setInterval(loadCount, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    api
      .get("/activities/", { params: { for_notifications: "true" } })
      .then((res) => setItems(res.data.slice(0, 10)))
      .finally(() => setLoading(false));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  async function markRead(entry) {
    if (entry.is_read) return;
    setItems((prev) =>
      prev.map((item) =>
        item.id === entry.id ? { ...item, is_read: true } : item,
      ),
    );
    setCount((prev) => Math.max(prev - 1, 0));
    await api.post(`/activities/${entry.id}/mark-read/`);
  }

  async function markAllRead() {
    setItems((prev) => prev.map((item) => ({ ...item, is_read: true })));
    setCount(0);
    await api.post("/activities/mark-all-read/");
  }

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => setOpen(!open)}
        aria-label={t("notifications.title")}
        aria-expanded={open}
        className="relative inline-flex items-center justify-center w-9 h-9 rounded-lg border border-line text-ink-soft transition-colors hover:bg-surface-2 focus:outline-none focus:ring-2 focus:ring-brand-400"
      >
        <FiBell aria-hidden="true" size={18} />
        {count > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[1.1rem] h-[1.1rem] px-1 rounded-full bg-red-600 text-white text-[10px] leading-[1.1rem] text-center">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      {open && (
        <>
          <div
            aria-hidden="true"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-10"
          />
          <div className="absolute right-0 mt-2 w-80 max-w-[90vw] bg-surface border border-line rounded-2xl shadow-xl z-20 max-h-96 overflow-y-auto">
            <div className="flex justify-between items-center px-4 py-3 border-b border-line">
              <p className="font-medium text-ink text-sm">{t("notifications.title")}</p>
              {count > 0 && (
                <button
                  onClick={markAllRead}
                  className="text-xs text-brand-700 transition-colors hover:text-brand-800 focus:outline-none focus:ring-2 focus:ring-brand-400 rounded"
                >
                  {t("notifications.markAllRead")}
                </button>
              )}
            </div>
            {loading ? (
              <p className="text-ink-soft text-sm p-4">{"…"}</p>
            ) : items.length === 0 ? (
              <p className="text-ink-soft text-sm p-4">{t("notifications.empty")}</p>
            ) : (
              <ul className="divide-y divide-line">
                {items.map((entry) => (
                  <li key={entry.id}>
                    <button
                      onClick={() => markRead(entry)}
                      className={
                        entry.is_read
                          ? "w-full text-left px-4 py-3 transition-colors hover:bg-surface-2 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-brand-400"
                          : "w-full text-left px-4 py-3 bg-brand-50 transition-colors hover:bg-brand-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-brand-400"
                      }
                    >
                      <p className="text-sm text-ink">{describeActivity(entry, t)}</p>
                      <p className="text-xs text-ink-soft mt-0.5">
                        {formatActivityWhen(entry.created_at, i18n.language)}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
