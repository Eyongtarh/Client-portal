// What a client sees when they log in: their project's
// progress, documents, messages, and invoices - read access
// scoped entirely to their own data by the backend.
import { useEffect, useState } from "react";
import { useAuth } from "../lib/AuthContext.jsx";
import api from "../lib/api";

export default function ClientPortal() {
  const { user, logout } = useAuth();
  const [project, setProject] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [messages, setMessages] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [body, setBody] = useState("");

  async function loadAll() {
    const projectsRes = await api.get(`/projects/?client=${user.client_id}`);
    const currentProject = projectsRes.data[0] || null;
    setProject(currentProject);
    if (currentProject) {
      const [docsRes, messagesRes, invoicesRes] = await Promise.all([
        api.get(`/documents/?project=${currentProject.id}`),
        api.get(`/messages/?project=${currentProject.id}`),
        api.get(`/invoices/?client=${user.client_id}`),
      ]);
      setDocuments(docsRes.data);
      setMessages(messagesRes.data);
      setInvoices(invoicesRes.data);
    }
  }
  useEffect(() => {
    loadAll();
  }, []);
  async function onSend(e) {
    e.preventDefault();
    if (!body.trim() || !project) return;
    await api.post("/messages/", {
      project: project.id,
      body,
    });
    setBody("");
    loadAll();
  }
  async function downloadPdf(invoiceId) {
    const res = await api.get(`/invoices/${invoiceId}/pdf/`, {
      responseType: "blob",
    });
    const url = URL.createObjectURL(res.data);
    window.open(url, "_blank");
  }

  return (
    <div className="min-h-screen bg-blue-50">
      <header className="bg-white border-b border-blue-100 px-8 py-4 flex justify-between items-center">
        <div>
          <h1 className="text-lg font-semibold">{user.company_name}</h1>
          <p className="text-sm text-gray-500">
            Welcome back, {user.first_name}
          </p>
        </div>
        <button onClick={logout} className="text-sm text-blue-600 underline">
          Sign out
        </button>
      </header>
      <main className="max-w-2xl mx-auto px-8 py-8 space-y-6">
        {!project && (
          <p className="text-gray-500">No project yet - check back soon.</p>
        )}
        {project && (
          <section className="bg-white border border-blue-100 rounded-xl p-6">
            <h2 className="text-xl font-semibold">{project.name}</h2>
            <div className="w-full bg-blue-100 rounded-full h-2 mt-2 mb-1">
              <div
                className="bg-blue-600 h-2 rounded-full"
                style={{
                  width: `${project.progress_percent}%`,
                }}
              />
            </div>
            <p className="text-xs text-gray-400 mb-4">
              {project.progress_percent}% complete
            </p>
            <ul className="space-y-1">
              {project.milestones.map((milestone) => (
                <li key={milestone.id} className="text-sm">
                  {milestone.is_complete ? "\u2611" : "\u25cb"}{" "}
                  {milestone.title}
                </li>
              ))}
            </ul>
          </section>
        )}
        {project && (
          <section className="bg-white border border-blue-100 rounded-xl p-6">
            <h3 className="font-medium mb-3">Documents</h3>
            <ul className="divide-y divide-gray-100">
              {documents.map((doc) => (
                <li key={doc.id} className="py-2 text-sm">
                  <a
                    href={doc.file}
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-700 hover:underline"
                  >
                    {doc.original_name}
                  </a>
                </li>
              ))}
              {documents.length === 0 && (
                <p className="text-gray-500 text-sm">No documents yet.</p>
              )}
            </ul>
          </section>
        )}
        {project && (
          <section className="bg-white border border-blue-100 rounded-xl p-6">
            <h3 className="font-medium mb-3">Invoices</h3>
            <ul className="divide-y divide-gray-100">
              {invoices.map((invoice) => (
                <li
                  key={invoice.id}
                  className="py-2 flex justify-between text-sm"
                >
                  <span>
                    #{invoice.number} - {invoice.total} - {invoice.status}
                  </span>
                  <button
                    onClick={() => downloadPdf(invoice.id)}
                    className="text-blue-700 underline"
                  >
                    PDF
                  </button>
                </li>
              ))}
              {invoices.length === 0 && (
                <p className="text-gray-500 text-sm">No invoices yet.</p>
              )}
            </ul>
          </section>
        )}
        {project && (
          <section className="bg-white border border-blue-100 rounded-xl p-6">
            <h3 className="font-medium mb-3">Messages</h3>
            <div className="space-y-3 mb-4 max-h-72 overflow-y-auto">
              {messages.map((message) => (
                <div key={message.id} className="text-sm">
                  <p className="text-xs text-gray-400">{message.sender_name}</p>
                  <p className="inline-block px-3 py-2 rounded-lg bg-blue-50">
                    {message.body}
                  </p>
                </div>
              ))}
              {messages.length === 0 && (
                <p className="text-gray-500 text-sm">No messages yet.</p>
              )}
            </div>
            <form onSubmit={onSend} className="flex gap-2">
              <input
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Write a message..."
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
              <button className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium">
                Send
              </button>
            </form>
          </section>
        )}
      </main>
    </div>
  );
}
