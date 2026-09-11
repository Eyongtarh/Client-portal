// Renders the audit-trail feed from /activities/, optionally
// narrowed to one client (used on the client detail page). The
// backend sends a stable verb code + raw actor/target labels, not
// pre-built sentences, so this is the one place that turns those
// into a translated sentence for both EN and FR.
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import api from "../lib/api";
import { describeActivity, formatActivityWhen } from "../lib/activityText";

export default function ActivityFeed({ clientId }) {
  const { t, i18n } = useTranslation();
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = clientId ? { client: clientId } : {};
    api
      .get("/activities/", { params })
      .then((res) => {
        if (!cancelled) setActivities(res.data);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  return (
    <section>
      <h2 className="text-xl font-semibold mb-6 text-ink">
        {t("activity.title")}
      </h2>
      {loading ? (
        <p className="text-ink-soft text-sm">{"…"}</p>
      ) : activities.length === 0 ? (
        <p className="text-ink-soft text-sm">{t("activity.empty")}</p>
      ) : (
        <ol className="space-y-3">
          {activities.map((entry) => (
            <li
              key={entry.id}
              className="bg-surface border border-line rounded-2xl p-4"
            >
              <p className="text-sm text-ink">{describeActivity(entry, t)}</p>
              <p className="text-xs text-ink-soft mt-1">
                {formatActivityWhen(entry.created_at, i18n.language)}
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
