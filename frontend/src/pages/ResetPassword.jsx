// Second half of password reset: user arrives here from the
// email link with a uid + token in the URL, sets a new
// password, and is sent back to login.
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import api from "../lib/api";
import AuthShell from "../components/AuthShell.jsx";

export default function ResetPassword() {
  const { uid, token } = useParams();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await api.post("/auth/password-reset/confirm/", {
        uid,
        token,
        password,
      });
      navigate("/login");
    } catch (err) {
      const data = err.response?.data;
      const message = data
        ? Object.values(data).flat().join(" ")
        : "This reset link is invalid or has expired.";
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
        <h1 className="text-xl font-semibold mb-6 text-ink">
          Set a new password
        </h1>
        {error && (
          <div
            role="alert"
            className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-2.5"
          >
            {error}
          </div>
        )}
        <label
          htmlFor="reset-password"
          className="block text-sm mb-1 text-ink-soft"
        >
          New password (8+ characters)
        </label>
        <input
          id="reset-password"
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full mb-6 px-3 py-2 bg-canvas border border-line rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
        />
        <button
          disabled={busy}
          aria-label="Set new password"
          className="glow-brand w-full bg-brand-600 text-white rounded-lg py-2.5 font-medium transition-colors hover:bg-brand-700 disabled:opacity-50 disabled:hover:bg-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-400"
        >
          {busy ? "Saving..." : "Set new password"}
        </button>
        <p className="text-sm text-ink-soft mt-4 text-center">
          <Link
            to="/login"
            aria-label="Back to sign in"
            className="text-brand-600 underline transition-colors hover:text-brand-800 focus:outline-none focus:ring-2 focus:ring-brand-400 rounded"
          >
            Back to sign in
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
