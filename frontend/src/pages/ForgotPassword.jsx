// First half of password reset: user enters their email, we
// always show a generic success message (never reveal whether
// that email exists in the system).
import { useState } from "react";
import { Link } from "react-router-dom";
import api from "../lib/api";
import LanguageToggle from "../components/LanguageToggle.jsx";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post("/auth/password-reset/", { email });
    } finally {
      setSent(true);
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-brand-50 gap-4">
      <LanguageToggle />
      <div className="w-full max-w-sm bg-white p-8 rounded-xl shadow-sm border border-brand-100">
        {sent ? (
          <p className="text-sm text-gray-700">
            If an account exists for that email, a reset link has been sent.
            Check your inbox.
          </p>
        ) : (
          <form onSubmit={onSubmit}>
            <h1 className="text-xl font-semibold mb-1">Reset your password</h1>
            <p className="text-sm text-gray-500 mb-6">
              Enter your email and we'll send you a reset link.
            </p>
            <label className="block text-sm mb-1 text-gray-600">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full mb-6 px-3 py-2 border border-gray-300 rounded-lg"
            />
            <button
              disabled={busy}
              className="w-full bg-brand-600 text-white rounded-lg py-2.5 font-medium disabled:opacity-50"
            >
              {busy ? "Sending..." : "Send reset link"}
            </button>
          </form>
        )}
        <p className="text-sm text-gray-500 mt-4 text-center">
          <Link to="/login" className="text-brand-600 underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
