// Turns one Activity entry into a translated sentence - shared by
// ActivityFeed (the full audit trail) and NotificationBell (the
// same events, just unread-filtered and dropdown-sized) so the two
// can never render a verb differently from each other.
export function describeActivity(entry, t) {
  const actor = entry.actor_name || t("activity.systemActor");
  const target = entry.target_repr;
  const activityStatus = entry.metadata?.status
    ? t(`activity.statuses.${entry.metadata.status}`, {
        defaultValue: entry.metadata.status,
      })
    : undefined;
  return t(`activity.verbs.${entry.verb}`, {
    actor,
    target,
    status: activityStatus,
    defaultValue: `${actor} - ${entry.verb} - ${target}`,
  });
}

export function formatActivityWhen(iso, language) {
  return new Date(iso).toLocaleString(language, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
