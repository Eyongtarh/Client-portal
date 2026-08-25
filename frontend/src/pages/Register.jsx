// Owner sign-up: creates the account + workspace in one request,
// then logs the new owner in automatically.
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../lib/AuthContext.jsx";
import LanguageToggle from "../components/LanguageToggle.jsx";
import api from "../lib/api";

export default function Register() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    full_name: "",
    workspace_name: "",
    email: "",
    username: "",
    password: "",
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const fields = [
    ["full_name", t("register.fullName"), "text"],
    ["workspace_name", t("register.workspaceName"), "text"],
    ["email", t("register.email"), "email"],
    ["username", t("register.username"), "text"],
    ["password", t("register.password"), "password"],
  ];

  function setField(field) {
    return (e) => {
      setForm({ ...form, [field]: e.target.value });
    };
  }
  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await api.post("/auth/register/", form);
      await login(form.email, form.password);
      navigate("/");
    } catch (err) {
      const data = err.response?.data;
      const message = data
        ? Object.values(data).flat().join(" ")
        : "Something went wrong.";
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
        <h1 className="text-xl font-semibold mb-6">{t("register.title")}</h1>
        {error && (
          <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">
            {error}
          </div>
        )}
        {fields.map(([field, label, type]) => (
          <div key={field} className="mb-4">
            <label className="block text-sm mb-1 text-gray-600">{label}</label>
            <input
              type={type}
              required
              value={form[field]}
              onChange={setField(field)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
        ))}
        <button
          disabled={busy}
          className="w-full bg-brand-600 text-white rounded-lg py-2.5 font-medium disabled:opacity-50"
        >
          {busy ? t("register.submitting") : t("register.submit")}
        </button>
        <p className="text-sm text-gray-500 mt-4 text-center">
          {t("register.haveAccount")}{" "}
          <Link to="/login" className="text-brand-600 font-medium underline">
            {t("register.signIn")}
          </Link>
        </p>
      </form>
    </div>
  );
}
