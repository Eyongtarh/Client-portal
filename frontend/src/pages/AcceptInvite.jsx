// Client's onboarding page: they arrive here from the invite
// email, set a password, and their account is created and
// linked to the Client record the owner already made for them.
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../lib/AuthContext.jsx";
import LanguageToggle from "../components/LanguageToggle.jsx";
import api from "../lib/api";

export default function AcceptInvite() {
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
      await api.post("/auth/accept-invite/", {
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
        : t("acceptInvite.error");
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-brand-50 gap-4">
      <LanguageToggle />
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm bg-white p-8 rounded-xl shadow-sm border border-brand-100"
      >
        <h1 className="text-xl font-semibold mb-1">
          {t("acceptInvite.welcome")}
        </h1>
        <p className="text-sm text-gray-500 mb-6">
          {t("acceptInvite.subtitle")}
        </p>
        {error && (
          <div
            role="alert"
            className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2"
          >
            {error}
          </div>
        )}
        <label
          htmlFor="accept-email"
          className="block text-sm mb-1 text-gray-600"
        >
          {t("acceptInvite.emailFromInvite")}
        </label>
        <input
          id="accept-email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full mb-4 px-3 py-2 border border-gray-300 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
        />
        <label
          htmlFor="accept-name"
          className="block text-sm mb-1 text-gray-600"
        >
          {t("acceptInvite.yourName")}
        </label>
        <input
          id="accept-name"
          type="text"
          required
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className="w-full mb-4 px-3 py-2 border border-gray-300 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
        />
        <label
          htmlFor="accept-password"
          className="block text-sm mb-1 text-gray-600"
        >
          {t("acceptInvite.setPassword")}
        </label>
        <input
          id="accept-password"
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full mb-6 px-3 py-2 border border-gray-300 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
        />
        <button
          disabled={busy}
          aria-label={t("acceptInvite.submit")}
          className="w-full bg-brand-600 text-white rounded-lg py-2.5 font-medium transition-colors hover:bg-brand-700 disabled:opacity-50 disabled:hover:bg-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-400"
        >
          {busy ? t("acceptInvite.submitting") : t("acceptInvite.submit")}
        </button>
      </form>
    </div>
  );
}
