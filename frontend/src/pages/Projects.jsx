// Owner's workspace-wide project list (SEARCH-02): every project
// across every client, filterable by client, status, and deadline
// range. Elsewhere in the app, projects are only ever reached one
// client at a time via ClientDetail - this is the one place to see
// and prioritize the whole workload at once.
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { FiFolder, FiLogOut, FiUser } from "react-icons/fi";
import { useAuth } from "../lib/AuthContext.jsx";
import LanguageToggle from "../components/LanguageToggle.jsx";
import ThemeToggle from "../components/ThemeToggle.jsx";
import NotificationBell from "../components/NotificationBell.jsx";
import MobileNav from "../components/MobileNav.jsx";
import SkipLink from "../components/SkipLink.jsx";
import api from "../lib/api";

export default function Projects() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const [projects, setProjects] = useState([]);
  const [clients, setClients] = useState([]);
  const [clientFilter, setClientFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [deadlineAfter, setDeadlineAfter] = useState("");
  const [deadlineBefore, setDeadlineBefore] = useState("");
  const [assignedToMe, setAssignedToMe] = useState(false);
  const isStaff = user.role === "staff";
  const loadProjectsRequestRef = useRef(0);

  useEffect(() => {
    api.get("/clients/").then((res) => setClients(res.data));
  }, []);

  useEffect(() => {
    const requestId = ++loadProjectsRequestRef.current;
    const params = {};
    if (clientFilter) params.client = clientFilter;
    if (statusFilter) params.status = statusFilter;
    if (deadlineAfter) params.deadline_after = deadlineAfter;
    if (deadlineBefore) params.deadline_before = deadlineBefore;
    if (isStaff && assignedToMe) params.assigned_to_me = "true";
    api.get("/projects/", { params }).then((res) => {
      // A slower-loading earlier filter combination can resolve
      // after a later one - without this guard its stale results
      // would overwrite what's actually selected now.
      if (requestId === loadProjectsRequestRef.current) {
        setProjects(res.data);
      }
    });
  }, [
    clientFilter,
    statusFilter,
    deadlineAfter,
    deadlineBefore,
    assignedToMe,
    isStaff,
  ]);

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <SkipLink />
      <header className="sticky top-0 z-10 glass-panel px-8 py-4 flex justify-between items-center">
        <div>
          <Link
            to="/"
            aria-label="Back to dashboard"
            className="text-sm text-brand-700 underline transition-colors hover:text-brand-800 focus:outline-none focus:ring-2 focus:ring-brand-400 rounded"
          >
            &larr; {user.workspace_name}
          </Link>
          <h1 className="text-lg font-semibold mt-1 text-ink">
            <FiFolder className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
            {t("dashboard.projects")}
          </h1>
        </div>
        <MobileNav>
          <NotificationBell />
          <ThemeToggle />
          <LanguageToggle />
          <Link
            to="/account"
            aria-label={t("account.title")}
            className="text-sm text-brand-700 underline transition-colors hover:text-brand-800 focus:outline-none focus:ring-2 focus:ring-brand-400 rounded"
          >
            <FiUser className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
            {t("account.title")}
          </Link>
          <button
            onClick={logout}
            aria-label={t("dashboard.signOut")}
            className="text-sm text-brand-700 underline transition-colors hover:text-brand-800 focus:outline-none focus:ring-2 focus:ring-brand-400 rounded"
          >
            <FiLogOut className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
            {t("dashboard.signOut")}
          </button>
        </MobileNav>
      </header>
      <main id="main-content" className="max-w-3xl mx-auto px-8 py-8 space-y-6">
        <section className="bg-surface border border-line rounded-2xl p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label htmlFor="project-filter-client" className="block text-xs text-ink-soft mb-1">
                {t("projects.filterClient")}
              </label>
              <select
                id="project-filter-client"
                value={clientFilter}
                onChange={(e) => setClientFilter(e.target.value)}
                className="w-full px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
              >
                <option value="">{t("projects.allClients")}</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.company_name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="project-filter-status" className="block text-xs text-ink-soft mb-1">
                {t("projects.filterStatus")}
              </label>
              <select
                id="project-filter-status"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
              >
                <option value="">{t("projects.allStatuses")}</option>
                <option value="active">{t("activity.statuses.active")}</option>
                <option value="completed">{t("activity.statuses.completed")}</option>
                <option value="on_hold">{t("activity.statuses.on_hold")}</option>
              </select>
            </div>
            <div>
              <label htmlFor="project-filter-deadline-after" className="block text-xs text-ink-soft mb-1">
                {t("projects.deadlineAfter")}
              </label>
              <input
                id="project-filter-deadline-after"
                type="date"
                value={deadlineAfter}
                onChange={(e) => setDeadlineAfter(e.target.value)}
                className="w-full px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
              />
            </div>
            <div>
              <label htmlFor="project-filter-deadline-before" className="block text-xs text-ink-soft mb-1">
                {t("projects.deadlineBefore")}
              </label>
              <input
                id="project-filter-deadline-before"
                type="date"
                value={deadlineBefore}
                onChange={(e) => setDeadlineBefore(e.target.value)}
                className="w-full px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
              />
            </div>
          </div>
          {isStaff && (
            <label className="flex items-center gap-2 mt-3 text-sm text-ink-soft cursor-pointer w-fit">
              <input
                type="checkbox"
                checked={assignedToMe}
                onChange={(e) => setAssignedToMe(e.target.checked)}
                className="rounded"
              />
              {t("projects.assignedToMeOnly")}
            </label>
          )}
        </section>
        <section className="space-y-3">
          {projects.map((p) => (
            <Link
              key={p.id}
              to={`/clients/${p.client}`}
              className="block bg-surface border border-line rounded-2xl p-4 transition-colors hover:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-400"
            >
              <div className="flex justify-between items-start gap-3">
                <div>
                  <p className="font-medium text-ink">{p.name}</p>
                  <p className="text-xs text-ink-soft">{p.client_name}</p>
                </div>
                <span className="text-xs px-2 py-1 rounded-lg bg-surface-2 text-ink-soft shrink-0">
                  {t(`activity.statuses.${p.status}`, { defaultValue: p.status })}
                </span>
              </div>
              <div className="mt-2 flex justify-between items-center text-xs text-ink-soft">
                <span>
                  {p.deadline
                    ? t("projects.deadline", { date: p.deadline })
                    : t("projects.noDeadline")}
                </span>
                <span>{p.progress_percent}%</span>
              </div>
            </Link>
          ))}
          {projects.length === 0 && (
            <p className="text-ink-soft text-sm">{t("projects.noProjects")}</p>
          )}
        </section>
      </main>
    </div>
  );
}
