import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import api from "../../lib/api";

// A single labeled horizontal bar, width proportional to `max` -
// shared by every breakdown list in AnalyticsSection (BOOK-77) so a
// service/team member/location with more bookings visibly stands
// out, without pulling in a charting library for what's otherwise
// a short list of counts.
function AnalyticsBar({ label, count, max }) {
  const width = max > 0 ? Math.max((count / max) * 100, 4) : 0;
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="w-32 shrink-0 truncate text-ink-soft" title={label}>
        {label}
      </span>
      <div className="flex-1 h-2 rounded-full bg-surface-2 overflow-hidden">
        <div
          className="h-full rounded-full bg-brand-600"
          style={{ width: `${width}%` }}
        />
      </div>
      <span className="w-8 text-right text-ink-soft">{count}</span>
    </div>
  );
}

// Booking demand, cancellation/no-show rates, breakdowns, and
// revenue (BOOK-76..79) - a read-only summary, so there's nothing
// here to edit, just numbers pulled from /booking-analytics/.
export default function AnalyticsSection() {
  const { t } = useTranslation();
  const [data, setData] = useState(null);
  const [currency, setCurrency] = useState("EUR");

  useEffect(() => {
    api.get("/booking-analytics/").then((res) => setData(res.data));
    api.get("/workspace/").then((res) => setCurrency(res.data.currency));
  }, []);

  if (!data) return null;

  const maxService = Math.max(0, ...data.by_service.map((r) => r.count));
  const maxStaff = Math.max(0, ...data.by_staff.map((r) => r.count));
  const maxLocation = Math.max(0, ...data.by_location.map((r) => r.count));
  const maxDaily = Math.max(0, ...data.daily_counts.map((r) => r.count));

  return (
    <section className="bg-surface border border-line rounded-2xl p-6">
      <h2 className="font-medium text-ink mb-4">{t("booking.analyticsTitle")}</h2>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="border border-line rounded-lg p-3">
          <p className="text-xs text-ink-soft">{t("booking.totalBookings")}</p>
          <p className="text-xl font-semibold text-ink">{data.total_bookings}</p>
        </div>
        <div className="border border-line rounded-lg p-3">
          <p className="text-xs text-ink-soft">{t("booking.cancellationRate")}</p>
          <p className="text-xl font-semibold text-ink">{data.cancellation_rate}%</p>
        </div>
        <div className="border border-line rounded-lg p-3">
          <p className="text-xs text-ink-soft">{t("booking.noShowRate")}</p>
          <p className="text-xl font-semibold text-ink">{data.no_show_rate}%</p>
        </div>
        <div className="border border-line rounded-lg p-3">
          <p className="text-xs text-ink-soft">{t("booking.revenueCollected")}</p>
          <p className="text-xl font-semibold text-ink">
            {data.revenue.paid} {currency}
          </p>
          {Number(data.revenue.pending) > 0 && (
            <p className="text-xs text-ink-soft mt-0.5">
              {data.revenue.pending} {currency} {t("booking.revenuePending")}
            </p>
          )}
        </div>
      </div>

      {data.daily_counts.length > 0 && (
        <div className="mb-6">
          <p className="text-xs font-medium text-ink-soft mb-2">
            {t("booking.bookingsLast30Days")}
          </p>
          <div className="flex items-end gap-0.5 h-16">
            {data.daily_counts.map((row) => (
              <div
                key={row.date}
                title={`${row.date}: ${row.count}`}
                className="flex-1 bg-brand-600 rounded-t"
                style={{
                  height: maxDaily > 0 ? `${(row.count / maxDaily) * 100}%` : "2%",
                  minHeight: "2px",
                }}
              />
            ))}
          </div>
        </div>
      )}

      <div className="grid sm:grid-cols-3 gap-6">
        <div>
          <p className="text-xs font-medium text-ink-soft mb-2">
            {t("booking.bookingsByService")}
          </p>
          <div className="space-y-1.5">
            {data.by_service.map((row) => (
              <AnalyticsBar
                key={row.service_id}
                label={row.name}
                count={row.count}
                max={maxService}
              />
            ))}
            {data.by_service.length === 0 && (
              <p className="text-xs text-ink-soft">{t("booking.noAnalyticsData")}</p>
            )}
          </div>
        </div>
        <div>
          <p className="text-xs font-medium text-ink-soft mb-2">
            {t("booking.bookingsByTeamMember")}
          </p>
          <div className="space-y-1.5">
            {data.by_staff.map((row) => (
              <AnalyticsBar
                key={row.staff_id ?? "unassigned"}
                label={row.name}
                count={row.count}
                max={maxStaff}
              />
            ))}
            {data.by_staff.length === 0 && (
              <p className="text-xs text-ink-soft">{t("booking.noAnalyticsData")}</p>
            )}
          </div>
        </div>
        <div>
          <p className="text-xs font-medium text-ink-soft mb-2">
            {t("booking.bookingsByLocation")}
          </p>
          <div className="space-y-1.5">
            {data.by_location.map((row) => (
              <AnalyticsBar
                key={row.location}
                label={row.location}
                count={row.count}
                max={maxLocation}
              />
            ))}
            {data.by_location.length === 0 && (
              <p className="text-xs text-ink-soft">{t("booking.noAnalyticsData")}</p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

