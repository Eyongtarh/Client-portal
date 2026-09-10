// Self-service profile editing (AUTH-05, PORTAL-04), shared by
// owners, staff, and clients alike - the fields and actions are
// identical regardless of role, so this is one page rather than
// duplicating the form into every dashboard.
import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { FiArrowLeft, FiCheck } from "react-icons/fi";
import { useAuth } from "../lib/AuthContext.jsx";
import SkipLink from "../components/SkipLink.jsx";
import api from "../lib/api";

export default function Account() {
  const { t } = useTranslation();
  const { user, setUser } = useAuth();
  const [firstName, setFirstName] = useState(user.first_name || "");
  const [email, setEmail] = useState(user.email || "");
  const [profileMsg, setProfileMsg] = useState(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordMsg, setPasswordMsg] = useState(null);

  async function saveProfile(e) {
    e.preventDefault();
    try {
      const res = await api.patch("/auth/me/", {
        first_name: firstName,
        email,
      });
      setUser(res.data);
      setProfileMsg({ text: t("account.profileUpdated"), type: "success" });
    } catch (err) {
      setProfileMsg({
        text:
          err.response?.data?.email?.[0] || t("account.couldNotUpdateProfile"),
        type: "error",
      });
    }
  }

  async function changePassword(e) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setPasswordMsg({
        text: t("account.passwordsDoNotMatch"),
        type: "error",
      });
      return;
    }
    try {
      await api.post("/auth/change-password/", {
        current_password: currentPassword,
        new_password: newPassword,
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordMsg({ text: t("account.passwordUpdated"), type: "success" });
    } catch (err) {
      setPasswordMsg({
        text:
          err.response?.data?.current_password?.[0] ||
          err.response?.data?.new_password?.[0] ||
          t("account.couldNotUpdatePassword"),
        type: "error",
      });
    }
  }

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <SkipLink />
      <header className="sticky top-0 z-10 glass-panel px-8 py-4">
        <Link
          to="/"
          aria-label={t("account.backToDashboard")}
          className="text-sm text-brand-600 underline transition-colors hover:text-brand-800 focus:outline-none focus:ring-2 focus:ring-brand-400 rounded inline-flex items-center gap-1"
        >
          <FiArrowLeft aria-hidden="true" size={16} />
          {t("account.backToDashboard")}
        </Link>
        <h1 className="text-lg font-semibold mt-1 text-ink">
          {t("account.title")}
        </h1>
      </header>

      <main
        id="main-content"
        className="max-w-lg mx-auto px-8 py-8 space-y-6"
      >
        <section className="bg-surface border border-line rounded-2xl p-6">
          <h2 className="font-medium text-ink mb-4">
            {t("account.profileSection")}
          </h2>
          {profileMsg && (
            <div
              role="status"
              className={
                profileMsg.type === "success"
                  ? "mb-4 text-sm text-green-700 bg-green-50 border border-green-200 rounded p-3"
                  : "mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3"
              }
            >
              {profileMsg.text}
            </div>
          )}
          <form onSubmit={saveProfile} className="space-y-3">
            <div>
              <label
                htmlFor="account-name"
                className="block text-xs text-ink-soft mb-1"
              >
                {t("account.name")}
              </label>
              <input
                id="account-name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
              />
            </div>
            <div>
              <label
                htmlFor="account-email"
                className="block text-xs text-ink-soft mb-1"
              >
                {t("account.email")}
              </label>
              <input
                id="account-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
              />
            </div>
            <button
              type="submit"
              className="bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400"
            >
              <FiCheck
                className="inline -mt-0.5 mr-1.5 shrink-0"
                aria-hidden="true"
              />
              {t("account.saveProfile")}
            </button>
          </form>
        </section>

        <section className="bg-surface border border-line rounded-2xl p-6">
          <h2 className="font-medium text-ink mb-4">
            {t("account.passwordSection")}
          </h2>
          {passwordMsg && (
            <div
              role="status"
              className={
                passwordMsg.type === "success"
                  ? "mb-4 text-sm text-green-700 bg-green-50 border border-green-200 rounded p-3"
                  : "mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3"
              }
            >
              {passwordMsg.text}
            </div>
          )}
          <form onSubmit={changePassword} className="space-y-3">
            <div>
              <label
                htmlFor="account-current-password"
                className="block text-xs text-ink-soft mb-1"
              >
                {t("account.currentPassword")}
              </label>
              <input
                id="account-current-password"
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
              />
            </div>
            <div>
              <label
                htmlFor="account-new-password"
                className="block text-xs text-ink-soft mb-1"
              >
                {t("account.newPassword")}
              </label>
              <input
                id="account-new-password"
                type="password"
                required
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
              />
            </div>
            <div>
              <label
                htmlFor="account-confirm-password"
                className="block text-xs text-ink-soft mb-1"
              >
                {t("account.confirmPassword")}
              </label>
              <input
                id="account-confirm-password"
                type="password"
                required
                minLength={8}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
              />
            </div>
            <button
              type="submit"
              className="bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400"
            >
              <FiCheck
                className="inline -mt-0.5 mr-1.5 shrink-0"
                aria-hidden="true"
              />
              {t("account.changePassword")}
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}
