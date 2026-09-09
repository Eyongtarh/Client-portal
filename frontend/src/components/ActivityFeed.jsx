// Renders the audit-trail feed from /activities/, optionally
// narrowed to one client (used on the client detail page). The
// backend sends a stable verb code + raw actor/target labels, not
// pre-built sentences, so this is the one place that turns those
// into a translated sentence for both EN and FR.
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import api from "../lib/api";

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

  function describe(entry) {
    const actor = entry.actor_name || t("activity.systemActor");
    const target = entry.target_repr;
    const status = entry.metadata?.status
      ? t(`activity.statuses.${entry.metadata.status}`, {
          defaultValue: entry.metadata.status,
        })
      : undefined;
    return t(`activity.verbs.${entry.verb}`, {
      actor,
      target,
      status,
      defaultValue: `${actor} - ${entry.verb} - ${target}`,
    });
  }

  function formatWhen(iso) {
    return new Date(iso).toLocaleString(i18n.language, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  }

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
              <p className="text-sm text-ink">{describe(entry)}</p>
              <p className="text-xs text-ink-soft mt-1">
                {formatWhen(entry.created_at)}
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
