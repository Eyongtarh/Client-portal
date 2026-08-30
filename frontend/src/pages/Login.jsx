// Login form: authenticates via useAuth().login and redirects
// to the dashboard on success.
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../lib/AuthContext.jsx";
import LanguageToggle from "../components/LanguageToggle.jsx";

export default function Login() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await login(email, password);
      navigate("/");
    } catch (err) {
      setError(t("login.error"));
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
        <h1 className="text-xl font-semibold mb-6">{t("login.title")}</h1>
        {error && (
          <div
            role="alert"
            className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2"
          >
            {error}
          </div>
        )}
        <label
          htmlFor="login-email"
          className="block text-sm mb-1 text-gray-600"
        >
          {t("login.email")}
        </label>
        <input
          id="login-email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full mb-4 px-3 py-2 border border-gray-300 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
        />
        <label
          htmlFor="login-password"
          className="block text-sm mb-1 text-gray-600"
        >
          {t("login.password")}
        </label>
        <input
          id="login-password"
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full mb-2 px-3 py-2 border border-gray-300 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
        />
        <p className="text-sm text-gray-500 mb-4 text-right">
          <Link
            to="/forgot-password"
            aria-label="Forgot your password? Reset it here"
            className="text-brand-600 underline transition-colors hover:text-brand-800 focus:outline-none focus:ring-2 focus:ring-brand-400 rounded"
          >
            {t("login.forgotPassword") || "Forgot your password?"}
          </Link>
        </p>
        <button
          disabled={busy}
          aria-label={t("login.submit")}
          className="w-full bg-brand-600 text-white rounded-lg py-2.5 font-medium transition-colors hover:bg-brand-700 disabled:opacity-50 disabled:hover:bg-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-400"
        >
          {busy ? t("login.submitting") : t("login.submit")}
        </button>
        <p className="text-sm text-gray-500 mt-4 text-center">
          {t("login.newHere")}{" "}
          <Link
            to="/register"
            aria-label="Create a new workspace account"
            className="text-brand-600 font-medium underline transition-colors hover:text-brand-800 focus:outline-none focus:ring-2 focus:ring-brand-400 rounded"
          >
            {t("login.createWorkspace")}
          </Link>
        </p>
      </form>
    </div>
  );
}
