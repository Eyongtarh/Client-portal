// Owner's home page: lists clients in the workspace and lets the
// owner invite new ones, plus upload a workspace logo.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../lib/AuthContext.jsx";
import LanguageToggle from "../components/LanguageToggle.jsx";
import api from "../lib/api";

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

  async function loadClients() {
    const res = await api.get("/clients/");
    setClients(res.data);
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
    <div className="min-h-screen bg-brand-50">
      <header className="bg-white border-b border-brand-100 px-8 py-4 flex justify-between items-center">
        <div className="flex items-center gap-3">
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
          <h1 className="text-lg font-semibold text-brand-700">
            {user.workspace_name}
          </h1>
        </div>
        <div className="flex items-center gap-4">
          <Link
            to="/booking"
            aria-label="Manage bookings"
            className="text-sm text-white bg-brand-600 px-3 py-1.5 rounded-lg font-medium transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400"
          >
            Booking
          </Link>
          <LanguageToggle />
          <button
            onClick={logout}
            aria-label={t("dashboard.signOut")}
            className="text-sm text-brand-600 underline transition-colors hover:text-brand-800 focus:outline-none focus:ring-2 focus:ring-brand-400 rounded"
          >
            {t("dashboard.signOut")}
          </button>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-8 py-8">
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
            className="bg-white border border-brand-100 rounded-xl p-6 mb-6"
          >
            {inviteError && (
              <div
                role="alert"
                className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2"
              >
                {inviteError}
              </div>
            )}
            <label
              htmlFor="invite-company"
              className="block text-sm mb-1 text-gray-600"
            >
              {t("dashboard.companyName")}
            </label>
            <input
              id="invite-company"
              required
              value={inviteCompany}
              onChange={(e) => setInviteCompany(e.target.value)}
              className="w-full mb-4 px-3 py-2 border border-gray-300 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
            />
            <label
              htmlFor="invite-email"
              className="block text-sm mb-1 text-gray-600"
            >
              {t("dashboard.clientEmail")}
            </label>
            <input
              id="invite-email"
              type="email"
              required
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              className="w-full mb-4 px-3 py-2 border border-gray-300 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
            />
            <button
              disabled={inviteBusy}
              aria-label={t("dashboard.sendInvite")}
              className="bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-brand-700 disabled:opacity-50 disabled:hover:bg-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-400"
            >
              {inviteBusy ? t("dashboard.sending") : t("dashboard.sendInvite")}
            </button>
          </form>
        )}
        <div className="space-y-3">
          {clients.map((client) => (
            <Link
              key={client.id}
              to={`/clients/${client.id}`}
              aria-label={`View ${client.company_name}`}
              className="block bg-white border border-brand-100 rounded-xl p-4 transition-all hover:shadow-md hover:border-brand-200 focus:outline-none focus:ring-2 focus:ring-brand-400"
            >
              <p className="font-medium">{client.company_name}</p>
              <p className="text-sm text-gray-500">{client.contact_email}</p>
            </Link>
          ))}
          {clients.length === 0 && (
            <p className="text-gray-500 text-sm">{t("dashboard.noClients")}</p>
          )}
        </div>
      </main>
    </div>
  );
}
