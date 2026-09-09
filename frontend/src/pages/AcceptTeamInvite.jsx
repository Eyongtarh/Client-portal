// Team member's onboarding page: they arrive here from the
// team invite email, set a password, and their staff account
// is created and linked to the workspace they were invited to.
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../lib/AuthContext.jsx";
import AuthShell from "../components/AuthShell.jsx";
import api from "../lib/api";

export default function AcceptTeamInvite() {
  const { t } = useTranslation();
  const { token } = useParams();
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await api.post("/auth/accept-team-invite/", {
        token,
        full_name: fullName,
        password,
      });
      await login(email, password);
      navigate("/");
    } catch (err) {
      const data = err.response?.data;
      const message = data
        ? Object.values(data).flat().join(" ")
        : t("team.error");
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell>
      <form
        onSubmit={onSubmit}
        className="bg-surface border border-line rounded-2xl shadow-xl shadow-black/5 p-8"
      >
        <h1 className="text-xl font-semibold mb-1 text-ink">
          {t("team.acceptTitle")}
        </h1>
        <p className="text-sm text-ink-soft mb-6">{t("team.acceptSubtitle")}</p>
        {error && (
          <div
            role="alert"
            className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-2.5"
          >
            {error}
          </div>
        )}
        <label
          htmlFor="team-accept-email"
          className="block text-sm mb-1 text-ink-soft"
        >
          {t("team.emailFromInvite")}
        </label>
        <input
          id="team-accept-email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full mb-4 px-3 py-2 bg-canvas border border-line rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
        />
        <label
          htmlFor="team-accept-name"
          className="block text-sm mb-1 text-ink-soft"
        >
          {t("team.yourName")}
        </label>
        <input
          id="team-accept-name"
          type="text"
          required
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className="w-full mb-4 px-3 py-2 bg-canvas border border-line rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
        />
        <label
          htmlFor="team-accept-password"
          className="block text-sm mb-1 text-ink-soft"
        >
          {t("team.setPassword")}
        </label>
        <input
          id="team-accept-password"
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full mb-6 px-3 py-2 bg-canvas border border-line rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
        />
        <button
          disabled={busy}
          aria-label={t("team.submit")}
          className="glow-brand w-full bg-brand-600 text-white rounded-lg py-2.5 font-medium transition-colors hover:bg-brand-700 disabled:opacity-50 disabled:hover:bg-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-400"
        >
          {busy ? t("team.submitting") : t("team.submit")}
        </button>
      </form>
    </AuthShell>
  );
}
