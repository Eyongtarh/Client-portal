// Login form: authenticates via useAuth().login and redirects
// to the dashboard on success.
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/AuthContext.jsx";

export default function Login() {
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
      setError("Invalid email or password.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div
      className="min-h-screen flex items-center
      justify-center bg-blue-50"
    >
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm bg-white p-8
          rounded-xl shadow-sm border border-blue-100"
      >
        <h1 className="text-xl font-semibold mb-6">Sign in</h1>
        {error && (
          <div
            className="mb-4 text-sm text-red-600
            bg-red-50 border border-red-200 rounded p-2"
          >
            {error}
          </div>
        )}
        <label className="block text-sm mb-1 text-gray-600">Email</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full mb-4 px-3 py-2 border
            border-gray-300 rounded-lg"
        />
        <label className="block text-sm mb-1 text-gray-600">Password</label>
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full mb-6 px-3 py-2 border
            border-gray-300 rounded-lg"
        />
        <button
          disabled={busy}
          className="w-full bg-blue-600 text-white
            rounded-lg py-2.5 font-medium disabled:opacity-50"
        >
          {busy ? "Signing in..." : "Sign in"}
        </button>
        <p className="text-sm text-gray-500 mt-4 text-center">
          New here?{" "}
          <Link to="/register" className="text-blue-600 font-medium underline">
            Create a workspace
          </Link>
        </p>
      </form>
    </div>
  );
}
