// Second half of password reset: user arrives here from the
// email link with a uid + token in the URL, sets a new
// password, and is sent back to login.
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import api from "../lib/api";
import LanguageToggle from "../components/LanguageToggle.jsx";

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
    <div className="min-h-screen flex flex-col items-center justify-center bg-brand-50 gap-4">
      <LanguageToggle />
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm bg-white p-8 rounded-xl shadow-sm border border-brand-100"
      >
        <h1 className="text-xl font-semibold mb-6">Set a new password</h1>
        {error && (
          <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">
            {error}
          </div>
        )}
        <label className="block text-sm mb-1 text-gray-600">
          New password (8+ characters)
        </label>
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full mb-6 px-3 py-2 border border-gray-300 rounded-lg"
        />
        <button
          disabled={busy}
          className="w-full bg-brand-600 text-white rounded-lg py-2.5 font-medium disabled:opacity-50"
        >
          {busy ? "Saving..." : "Set new password"}
        </button>
        <p className="text-sm text-gray-500 mt-4 text-center">
          <Link to="/login" className="text-brand-600 underline">
            Back to sign in
          </Link>
        </p>
      </form>
    </div>
  );
}
