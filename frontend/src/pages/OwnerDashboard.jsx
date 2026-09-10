// Owner's (and staff's) home page: lists clients in the
// workspace and lets the owner invite new ones, upload a
// workspace logo, pick a brand color, manage the team, and
// view/change the subscription plan.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  FiAlertTriangle,
  FiArchive,
  FiCalendar,
  FiFolder,
  FiLogOut,
  FiRotateCcw,
  FiUser,
} from "react-icons/fi";
import { useAuth } from "../lib/AuthContext.jsx";
import LanguageToggle from "../components/LanguageToggle.jsx";
import ThemeToggle from "../components/ThemeToggle.jsx";
import ActivityFeed from "../components/ActivityFeed.jsx";
import SearchBar from "../components/SearchBar.jsx";
import MobileNav from "../components/MobileNav.jsx";
import SkipLink from "../components/SkipLink.jsx";
import api from "../lib/api";
import applyBrandColor from "../lib/applyBrandColor";

export default function OwnerDashboard() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const [clients, setClients] = useState([]);
  const [workspace, setWorkspace] = useState(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteCompany, setInviteCompany] = useState("");
  const [inviteError, setInviteError] = useState("");
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteSuccess, setInviteSuccess] = useState(false);
  const [colorMsg, setColorMsg] = useState(null);
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState("");
  const [nameMsg, setNameMsg] = useState(null);
  const [showArchived, setShowArchived] = useState(false);
  const isOwner = user.role === "owner";

  async function loadClients(archived = showArchived) {
    const res = await api.get(
      `/clients/${archived ? "?archived=true" : ""}`
    );
    setClients(res.data);
  }

  async function toggleArchived(e) {
    const next = e.target.checked;
    setShowArchived(next);
    loadClients(next);
  }

  async function archiveClient(e, clientId, isArchived) {
    e.preventDefault();
    e.stopPropagation();
    await api.patch(`/clients/${clientId}/`, { is_archived: !isArchived });
    loadClients();
  }
  async function loadWorkspace() {
    const res = await api.get("/workspace/");
    setWorkspace(res.data);
  }
  useEffect(() => {
    loadClients();
    loadWorkspace();
  }, []);

  async function onLogoChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    setLogoUploading(true);
    const formData = new FormData();
    formData.append("logo", file);
    try {
      const res = await api.patch("/workspace/", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setWorkspace(res.data);
    } finally {
      setLogoUploading(false);
    }
  }

  async function onColorChange(e) {
    const hex = e.target.value;
    applyBrandColor(hex);
    try {
      const res = await api.patch("/workspace/", { brand_color: hex });
      setWorkspace(res.data);
      setColorMsg({ key: "branding.colorUpdated", type: "success" });
    } catch (err) {
      applyBrandColor(workspace?.brand_color);
      setColorMsg({ key: "branding.couldNotUpdateColor", type: "error" });
    }
  }

  function startEditName() {
    setNameValue(workspace?.name || "");
    setEditingName(true);
    setNameMsg(null);
  }

  function cancelEditName() {
    setEditingName(false);
  }

  async function saveName() {
    try {
      const res = await api.patch("/workspace/", { name: nameValue });
      setWorkspace(res.data);
      setEditingName(false);
      setNameMsg({ key: "dashboard.workspaceNameUpdated", type: "success" });
    } catch (err) {
      setNameMsg({
        key: "dashboard.couldNotUpdateWorkspaceName",
        type: "error",
      });
    }
  }

  async function onInviteSubmit(e) {
    e.preventDefault();
    setInviteError("");
    setInviteBusy(true);
    try {
      await api.post("/invites/", {
        email: inviteEmail,
        company_name: inviteCompany,
      });
      setInviteEmail("");
      setInviteCompany("");
      setShowInviteForm(false);
      setInviteSuccess(true);
    } catch (err) {
      setInviteError("Could not send invite.");
    } finally {
      setInviteBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <SkipLink />
      <header className="sticky top-0 z-10 glass-panel px-8 py-4 flex justify-between items-center">
        <div className="flex items-center gap-3">
          {isOwner ? (
            <label
              className="cursor-pointer rounded-lg focus-within:ring-2 focus-within:ring-brand-400"
              title="Upload or change workspace logo"
            >
              {workspace?.logo ? (
                <img
                  src={workspace.logo}
                  alt={`${workspace.name} logo`}
                  className="w-10 h-10 rounded-lg object-cover border border-brand-100 transition-opacity hover:opacity-80"
                />
              ) : (
                <div
                  aria-hidden="true"
                  className="w-10 h-10 rounded-lg bg-brand-50 border border-dashed border-brand-200 flex items-center justify-center text-xs text-brand-600 transition-colors hover:bg-brand-100"
                >
                  {logoUploading ? "..." : "+"}
                </div>
              )}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={onLogoChange}
                disabled={logoUploading}
                aria-label="Upload workspace logo"
              />
            </label>
          ) : (
            workspace?.logo && (
              <img
                src={workspace.logo}
                alt={`${workspace.name} logo`}
                className="w-10 h-10 rounded-lg object-cover border border-brand-100"
              />
            )
          )}
          {isOwner && editingName ? (
            <div className="flex items-center gap-2">
              <label htmlFor="workspace-name-edit" className="sr-only">
                {t("dashboard.editWorkspaceName")}
              </label>
              <input
                id="workspace-name-edit"
                value={nameValue}
                onChange={(e) => setNameValue(e.target.value)}
                autoFocus
                className="px-2 py-1 bg-canvas border border-line rounded-lg text-lg font-semibold text-ink transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
              />
              <button
                onClick={saveName}
                aria-label={t("clientDetail.save")}
                className="bg-brand-600 text-white px-3 py-1 rounded-lg text-sm font-medium transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400"
              >
                {t("clientDetail.save")}
              </button>
              <button
                onClick={cancelEditName}
                aria-label={t("clientDetail.cancel")}
                className="bg-surface-2 text-ink-soft px-3 py-1 rounded-lg text-sm font-medium transition-colors hover:bg-line focus:outline-none focus:ring-2 focus:ring-brand-400"
              >
                {t("clientDetail.cancel")}
              </button>
            </div>
          ) : (
            <h1
              onClick={isOwner ? startEditName : undefined}
              className={
                isOwner
                  ? "text-lg font-semibold text-brand-700 cursor-pointer hover:underline"
                  : "text-lg font-semibold text-brand-700"
              }
              title={isOwner ? t("dashboard.editWorkspaceName") : undefined}
            >
              {workspace?.name || user.workspace_name}
            </h1>
          )}
          {isOwner && (
            <label
              className="flex items-center gap-1.5 cursor-pointer ml-2"
              title={t("branding.brandColor")}
            >
              <input
                type="color"
                value={workspace?.brand_color || "#3b7fc4"}
                onChange={onColorChange}
                className="w-7 h-7 rounded cursor-pointer border border-brand-100 focus:outline-none focus:ring-2 focus:ring-brand-400"
                aria-label={t("branding.brandColor")}
              />
            </label>
          )}
        </div>
        <MobileNav>
          <SearchBar />
          <Link
            to="/projects"
            aria-label={t("dashboard.projects")}
            className="text-sm text-brand-600 underline transition-colors hover:text-brand-800 focus:outline-none focus:ring-2 focus:ring-brand-400 rounded"
          >
            <FiFolder className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
            {t("dashboard.projects")}
          </Link>
          <Link
            to="/booking"
            aria-label="Manage bookings"
            className="text-sm text-white bg-brand-600 px-3 py-1.5 rounded-lg font-medium text-center transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400"
          >
            <FiCalendar className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
            Booking
          </Link>
          <ThemeToggle />
          <LanguageToggle />
          <Link
            to="/account"
            aria-label={t("account.title")}
            className="text-sm text-brand-600 underline transition-colors hover:text-brand-800 focus:outline-none focus:ring-2 focus:ring-brand-400 rounded"
          >
            <FiUser className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
            {t("account.title")}
          </Link>
          <button
            onClick={logout}
            aria-label={t("dashboard.signOut")}
            className="text-sm text-brand-600 underline transition-colors hover:text-brand-800 focus:outline-none focus:ring-2 focus:ring-brand-400 rounded"
          >
            <FiLogOut className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
            {t("dashboard.signOut")}
          </button>
        </MobileNav>
      </header>
      {nameMsg && (
        <div className="max-w-3xl mx-auto px-8 pt-4">
          <div
            role="status"
            className={
              nameMsg.type === "success"
                ? "text-sm text-green-700 bg-green-50 border border-green-200 rounded p-3"
                : "text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3"
            }
          >
            {t(nameMsg.key)}
          </div>
        </div>
      )}
      {colorMsg && (
        <div className="max-w-3xl mx-auto px-8 pt-4">
          <div
            role="status"
            className={
              colorMsg.type === "success"
                ? "text-sm text-green-700 bg-green-50 border border-green-200 rounded p-3"
                : "text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3"
            }
          >
            {t(colorMsg.key)}
          </div>
        </div>
      )}
      <main id="main-content" className="max-w-3xl mx-auto px-8 py-8 space-y-8">
        <div>
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-semibold">{t("dashboard.clients")}</h2>
            <button
              onClick={() => {
                setShowInviteForm(!showInviteForm);
                setInviteSuccess(false);
              }}
              aria-expanded={showInviteForm}
              aria-label={t("dashboard.inviteClient")}
              className="bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400"
            >
              {t("dashboard.inviteClient")}
            </button>
          </div>
          {inviteSuccess && (
            <div
              role="status"
              className="mb-4 text-sm text-green-700 bg-green-50 border border-green-200 rounded p-3"
            >
              Invite sent successfully.
            </div>
          )}
          {showInviteForm && (
            <form
              onSubmit={onInviteSubmit}
              className="bg-surface border border-line rounded-2xl p-6 mb-6"
            >
              {inviteError && (
                <div
                  role="alert"
                  className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-2.5"
                >
                  {inviteError}
                </div>
              )}
              <label
                htmlFor="invite-company"
                className="block text-sm mb-1 text-ink-soft"
              >
                {t("dashboard.companyName")}
              </label>
              <input
                id="invite-company"
                required
                value={inviteCompany}
                onChange={(e) => setInviteCompany(e.target.value)}
                className="w-full mb-4 px-3 py-2 bg-canvas border border-line rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
              />
              <label
                htmlFor="invite-email"
                className="block text-sm mb-1 text-ink-soft"
              >
                {t("dashboard.clientEmail")}
              </label>
              <input
                id="invite-email"
                type="email"
                required
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="w-full mb-4 px-3 py-2 bg-canvas border border-line rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
              />
              <button
                disabled={inviteBusy}
                aria-label={t("dashboard.sendInvite")}
                className="bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-brand-700 disabled:opacity-50 disabled:hover:bg-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-400"
              >
                {inviteBusy
                  ? t("dashboard.sending")
                  : t("dashboard.sendInvite")}
              </button>
            </form>
          )}
          <label className="flex items-center gap-2 mb-3 text-sm text-ink-soft cursor-pointer w-fit">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={toggleArchived}
              className="rounded"
            />
            {t("dashboard.showArchivedClients")}
          </label>
          <div className="space-y-3">
            {clients.map((client) => (
              <Link
                key={client.id}
                to={`/clients/${client.id}`}
                aria-label={`View ${client.company_name}`}
                className="flex justify-between items-center bg-surface border border-line rounded-2xl p-4 transition-all hover:-translate-y-0.5 hover:shadow-lg hover:border-brand-200 focus:outline-none focus:ring-2 focus:ring-brand-400"
              >
                <div>
                  <p className="font-medium text-ink">
                    {client.company_name}
                  </p>
                  <p className="text-sm text-ink-soft">
                    {client.contact_email}
                  </p>
                </div>
                {isOwner && (
                  <button
                    onClick={(e) =>
                      archiveClient(e, client.id, client.is_archived)
                    }
                    aria-label={`${
                      client.is_archived
                        ? t("dashboard.unarchiveClient")
                        : t("dashboard.archiveClient")
                    } ${client.company_name}`}
                    className="shrink-0 bg-surface-2 text-ink-soft text-xs px-2.5 py-1 rounded-lg font-medium transition-colors hover:bg-line focus:outline-none focus:ring-2 focus:ring-brand-400"
                  >
                    {client.is_archived ? (
                      <FiRotateCcw
                        className="inline -mt-0.5 mr-1 shrink-0"
                        aria-hidden="true"
                      />
                    ) : (
                      <FiArchive
                        className="inline -mt-0.5 mr-1 shrink-0"
                        aria-hidden="true"
                      />
                    )}
                    {client.is_archived
                      ? t("dashboard.unarchiveClient")
                      : t("dashboard.archiveClient")}
                  </button>
                )}
              </Link>
            ))}
            {clients.length === 0 && (
              <p className="text-ink-soft text-sm">
                {showArchived
                  ? t("dashboard.noArchivedClients")
                  : t("dashboard.noClients")}
              </p>
            )}
          </div>
        </div>

        <TeamSection isOwner={isOwner} />

        <PlanSection
          isOwner={isOwner}
          workspace={workspace}
          onPlanChanged={loadWorkspace}
        />

        <ActivityFeed />
      </main>
    </div>
  );
}

function TeamSection({ isOwner }) {
  const { t } = useTranslation();
  const [members, setMembers] = useState([]);
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [statusMsg, setStatusMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const res = await api.get("/team/");
    setMembers(res.data);
  }
  useEffect(() => {
    load();
  }, []);

  async function onInviteSubmit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post("/team-invites/", { email: inviteEmail });
      setInviteEmail("");
      setShowInviteForm(false);
      setStatusMsg({ key: "team.inviteSent", type: "success" });
    } catch (err) {
      const data = err.response?.data;
      const emailErrors = data?.email;
      if (
        emailErrors &&
        emailErrors.some((msg) => msg.includes("already exists"))
      ) {
        setStatusMsg({ key: "team.emailAlreadyExists", type: "error" });
      } else {
        const message = data ? Object.values(data).flat().join(" ") : null;
        setStatusMsg(
          message
            ? { raw: message, type: "error" }
            : { key: "team.couldNotSendInvite", type: "error" },
        );
      }
    } finally {
      setBusy(false);
    }
  }

  async function removeMember(memberId) {
    if (!window.confirm(t("team.confirmRemoveMember"))) return;
    await api.delete(`/team/${memberId}/`);
    setStatusMsg({ key: "team.memberRemoved", type: "error" });
    load();
  }

  return (
    <section>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold">{t("team.teamTitle")}</h2>
        {isOwner && (
          <button
            onClick={() => {
              setShowInviteForm(!showInviteForm);
              setStatusMsg(null);
            }}
            aria-expanded={showInviteForm}
            aria-label={t("team.inviteTeamMember")}
            className="bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400"
          >
            {t("team.inviteTeamMember")}
          </button>
        )}
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

      {isOwner && showInviteForm && (
        <form
          onSubmit={onInviteSubmit}
          className="bg-surface border border-line rounded-2xl p-6 mb-6"
        >
          <label
            htmlFor="team-invite-email"
            className="block text-sm mb-1 text-ink-soft"
          >
            {t("team.emailAddress")}
          </label>
          <input
            id="team-invite-email"
            type="email"
            required
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            className="w-full mb-4 px-3 py-2 bg-canvas border border-line rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
          />
          <button
            disabled={busy}
            aria-label={t("team.sendInvite")}
            className="bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-brand-700 disabled:opacity-50 disabled:hover:bg-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-400"
          >
            {t("team.sendInvite")}
          </button>
        </form>
      )}

      <div className="space-y-3">
        {members.map((member) => (
          <div
            key={member.id}
            className="bg-surface border border-line rounded-2xl p-4 flex justify-between items-center"
          >
            <div>
              <p className="font-medium text-ink">{member.first_name}</p>
              <p className="text-sm text-ink-soft">{member.email}</p>
            </div>
            {isOwner && (
              <button
                onClick={() => removeMember(member.id)}
                aria-label={`${t("team.removeMember")} ${member.first_name}`}
                className="bg-red-600 text-white text-sm px-3 py-1.5 rounded-lg font-medium transition-colors hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-400"
              >
                {t("team.removeMember")}
              </button>
            )}
          </div>
        ))}
        {members.length === 0 && (
          <p className="text-ink-soft text-sm">{t("team.noTeamMembers")}</p>
        )}
      </div>
    </section>
  );
}

function PlanSection({ isOwner, workspace, onPlanChanged }) {
  const { t } = useTranslation();
  const [plans, setPlans] = useState([]);
  const [showPlans, setShowPlans] = useState(false);
  const [statusMsg, setStatusMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  async function loadPlans() {
    const res = await api.get("/plans/");
    setPlans(res.data);
  }
  useEffect(() => {
    loadPlans();
  }, []);

  async function switchPlan(planId) {
    setBusy(true);
    try {
      await api.post("/workspace/change-plan/", { plan_id: planId });
      setShowPlans(false);
      setStatusMsg({ key: "subscription.planChanged", type: "success" });
      onPlanChanged();
    } catch (err) {
      const data = err.response?.data;
      const message = data ? Object.values(data).flat().join(" ") : null;
      setStatusMsg(
        message
          ? { raw: message, type: "error" }
          : { key: "subscription.couldNotChangePlan", type: "error" },
      );
    } finally {
      setBusy(false);
    }
  }

  if (!workspace) return null;

  const plan = workspace.plan;
  const clientLimit =
    plan?.max_clients === null || plan?.max_clients === undefined
      ? null
      : plan.max_clients;
  const teamLimit =
    plan?.max_team_members === null || plan?.max_team_members === undefined
      ? null
      : plan.max_team_members;

  // Warn once usage reaches 80% of a limit (LIMIT-02), well before
  // the hard block in InviteClientView/TeamInviteView kicks in at
  // 100% - the point is to give the owner time to upgrade instead
  // of finding out mid-invite.
  const nearingLimits = [];
  if (clientLimit !== null && workspace.client_count / clientLimit >= 0.8) {
    nearingLimits.push({
      key: "clients",
      used: workspace.client_count,
      limit: clientLimit,
    });
  }
  if (teamLimit !== null && workspace.team_member_count / teamLimit >= 0.8) {
    nearingLimits.push({
      key: "teamMembers",
      used: workspace.team_member_count,
      limit: teamLimit,
    });
  }

  return (
    <section>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold">{t("subscription.planTitle")}</h2>
        {isOwner && (
          <button
            onClick={() => {
              setShowPlans(!showPlans);
              setStatusMsg(null);
            }}
            aria-expanded={showPlans}
            aria-label={t("subscription.changePlan")}
            className="bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400"
          >
            {t("subscription.changePlan")}
          </button>
        )}
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

      {nearingLimits.length > 0 && (
        <div className="mb-4 space-y-2">
          {nearingLimits.map((item) => (
            <div
              key={item.key}
              role="status"
              className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded p-3 flex items-center justify-between gap-3"
            >
              <span>
                <FiAlertTriangle className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
                {t(`subscription.nearingLimit_${item.key}`, {
                  used: item.used,
                  limit: item.limit,
                })}
              </span>
              {isOwner && (
                <button
                  onClick={() => setShowPlans(true)}
                  className="text-amber-800 underline font-medium shrink-0"
                >
                  {t("subscription.changePlan")}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="bg-surface border border-line rounded-2xl p-6 mb-4">
        <p className="text-xs text-ink-soft mb-1">
          {t("subscription.currentPlan")}
        </p>
        <p className="text-lg font-semibold mb-4 text-ink">
          {plan?.name || "\u2014"}
          {plan && (
            <span className="text-sm font-normal text-ink-soft">
              {" "}
              {"\u00b7"} {plan.price_per_month} {t("subscription.perMonth")}
            </span>
          )}
        </p>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-ink-soft">
              {t("subscription.clientsUsed")}
            </span>
            <span className="font-medium text-ink">
              {workspace.client_count}
              {clientLimit !== null
                ? ` / ${clientLimit}`
                : ` (${t("subscription.unlimited")})`}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-ink-soft">
              {t("subscription.teamMembersUsed")}
            </span>
            <span className="font-medium text-ink">
              {workspace.team_member_count}
              {teamLimit !== null
                ? ` / ${teamLimit}`
                : ` (${t("subscription.unlimited")})`}
            </span>
          </div>
        </div>
      </div>

      {isOwner && showPlans && (
        <div className="grid gap-3 sm:grid-cols-3">
          {plans.map((p) => (
            <div
              key={p.id}
              className={
                p.id === plan?.id
                  ? "border-2 border-brand-600 bg-brand-50 rounded-2xl p-4"
                  : "border border-line rounded-2xl p-4"
              }
            >
              <p className="font-medium text-ink">{p.name}</p>
              <p className="text-sm text-ink-soft mb-3">
                {p.price_per_month} {t("subscription.perMonth")}
              </p>
              <button
                onClick={() => switchPlan(p.id)}
                disabled={busy || p.id === plan?.id}
                aria-label={`${t("subscription.switchTo")} ${p.name}`}
                className="w-full bg-brand-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors hover:bg-brand-700 disabled:opacity-50 disabled:hover:bg-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-400"
              >
                {p.id === plan?.id
                  ? t("subscription.currentPlan")
                  : `${t("subscription.switchTo")} ${p.name}`}
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
