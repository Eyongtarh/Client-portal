// Owner's home page: lists clients in the workspace and lets the
// owner invite new ones. This replaces the placeholder Home
// component from App.jsx.
import { useEffect, useState } from "react";
import { useAuth } from "../lib/AuthContext.jsx";
import api from "../lib/api";
import { Link } from "react-router-dom";

export default function OwnerDashboard() {
  const { user, logout } = useAuth();
  const [clients, setClients] = useState([]);
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteCompany, setInviteCompany] = useState("");
  const [inviteError, setInviteError] = useState("");
  const [inviteBusy, setInviteBusy] = useState(false);

  async function loadClients() {
    const res = await api.get("/clients/");
    setClients(res.data);
  }
  useEffect(() => {
    loadClients();
  }, []);
  async function onInviteSubmit(e) {
    e.preventDefault();
    setInviteError("");
    setInviteBusy(true);
    try {
      await api.post("/invites/", {
        email: inviteEmail,
        company_name: inviteCompany,
      });
      setInviteEmail("");
      setInviteCompany("");
      setShowInviteForm(false);
    } catch (err) {
      setInviteError("Could not send invite.");
    } finally {
      setInviteBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-blue-50">
      <header
        className="bg-white border-b border-blue-100
        px-8 py-4 flex justify-between items-center"
      >
        <h1 className="text-lg font-semibold text-blue-700">
          {user.workspace_name}
        </h1>
        <button onClick={logout} className="text-sm text-blue-600 underline">
          Sign out
        </button>
      </header>
      <main className="max-w-3xl mx-auto px-8 py-8">
        <div
          className="flex justify-between items-center
          mb-6"
        >
          <h2 className="text-xl font-semibold">Clients</h2>
          <button
            onClick={() => setShowInviteForm(!showInviteForm)}
            className="bg-blue-600 text-white px-4 py-2
              rounded-lg text-sm font-medium"
          >
            + Invite client
          </button>
        </div>
        {showInviteForm && (
          <form
            onSubmit={onInviteSubmit}
            className="bg-white border border-blue-100
              rounded-xl p-6 mb-6"
          >
            {inviteError && (
              <div
                className="mb-4 text-sm text-red-600
                bg-red-50 border border-red-200 rounded p-2"
              >
                {inviteError}
              </div>
            )}
            <label
              className="block text-sm mb-1
              text-gray-600"
            >
              Company name
            </label>
            <input
              required
              value={inviteCompany}
              onChange={(e) => setInviteCompany(e.target.value)}
              className="w-full mb-4 px-3 py-2 border
                border-gray-300 rounded-lg"
            />
            <label
              className="block text-sm mb-1
              text-gray-600"
            >
              Client email
            </label>
            <input
              type="email"
              required
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              className="w-full mb-4 px-3 py-2 border
                border-gray-300 rounded-lg"
            />
            <button
              disabled={inviteBusy}
              className="bg-blue-600 text-white px-4 py-2
                rounded-lg text-sm font-medium
                disabled:opacity-50"
            >
              {inviteBusy ? "Sending..." : "Send invite"}
            </button>
          </form>
        )}
        <div className="space-y-3">
          {clients.map((client) => (
            <Link
              key={client.id}
              to={`/clients/${client.id}`}
              className="block bg-white border border-blue-100
                rounded-xl p-4 hover:shadow-md transition"
            >
              <p className="font-medium">{client.company_name}</p>
              <p className="text-sm text-gray-500">{client.contact_email}</p>
            </Link>
          ))}
          {clients.length === 0 && (
            <p className="text-gray-500 text-sm">No clients yet.</p>
          )}
        </div>
      </main>
    </div>
  );
}
