// Owner sign-up: creates the account + workspace in one request,
// then logs the new owner in automatically.
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/AuthContext.jsx";
import api from "../lib/api";

const FIELDS = [
  ["full_name", "Your name", "text"],
  ["workspace_name", "Workspace name", "text"],
  ["email", "Email", "email"],
  ["username", "Username", "text"],
  ["password", "Password (8+ characters)", "password"],
];

export default function Register() {
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
    <div
      className="min-h-screen flex items-center
      justify-center bg-blue-50"
    >
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm bg-white p-8
          rounded-xl shadow-sm border border-blue-100"
      >
        <h1 className="text-xl font-semibold mb-6">Create your workspace</h1>
        {error && (
          <div
            className="mb-4 text-sm text-red-600
            bg-red-50 border border-red-200 rounded p-2"
          >
            {error}
          </div>
        )}
        {FIELDS.map(([field, label, type]) => (
          <div key={field} className="mb-4">
            <label
              className="block text-sm mb-1
              text-gray-600"
            >
              {label}
            </label>
            <input
              type={type}
              required
              value={form[field]}
              onChange={setField(field)}
              className="w-full px-3 py-2 border
                border-gray-300 rounded-lg"
            />
          </div>
        ))}
        <button
          disabled={busy}
          className="w-full bg-blue-600 text-white
            rounded-lg py-2.5 font-medium disabled:opacity-50"
        >
          {busy ? "Creating..." : "Create workspace"}
        </button>
        <p className="text-sm text-gray-500 mt-4 text-center">
          Already have an account?{" "}
          <Link to="/login" className="text-blue-600 font-medium underline">
            Sign in
          </Link>
        </p>
      </form>
    </div>
  );
}
