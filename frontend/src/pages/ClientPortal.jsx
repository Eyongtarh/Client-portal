// What a client sees when they log in: their project's
// progress, documents, messages, invoices, and approvals.
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../lib/AuthContext.jsx";
import LanguageToggle from "../components/LanguageToggle.jsx";
import api from "../lib/api";

export default function ClientPortal() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const [project, setProject] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [messages, setMessages] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [approvals, setApprovals] = useState([]);
  const [comments, setComments] = useState({});
  const [body, setBody] = useState("");

  async function loadAll() {
    const projectsRes = await api.get(`/projects/?client=${user.client_id}`);
    const currentProject = projectsRes.data[0] || null;
    setProject(currentProject);
    if (currentProject) {
      const [docsRes, messagesRes, invoicesRes, approvalsRes] =
        await Promise.all([
          api.get(`/documents/?project=${currentProject.id}`),
          api.get(`/messages/?project=${currentProject.id}`),
          api.get(`/invoices/?client=${user.client_id}`),
          api.get(`/approvals/?project=${currentProject.id}`),
        ]);
      setDocuments(docsRes.data);
      setMessages(messagesRes.data);
      setInvoices(invoicesRes.data);
      setApprovals(approvalsRes.data);
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
  async function decide(approvalId, decisionStatus) {
    await api.post(`/approvals/${approvalId}/decide/`, {
      status: decisionStatus,
      client_comment: comments[approvalId] || "",
    });
    loadAll();
  }

  return (
    <div className="min-h-screen bg-brand-50">
      <header className="bg-white border-b border-brand-100 px-8 py-4 flex justify-between items-center">
        <div>
          <h1 className="text-lg font-semibold">{user.company_name}</h1>
          <p className="text-sm text-gray-500">
            {t("clientPortal.welcomeBack")} {user.first_name}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <LanguageToggle />
          <button
            onClick={logout}
            aria-label={t("dashboard.signOut")}
            className="text-sm text-brand-600 underline transition-colors hover:text-brand-800 focus:outline-none focus:ring-2 focus:ring-brand-400 rounded"
          >
            {t("dashboard.signOut")}
          </button>
        </div>
      </header>
      <main className="max-w-2xl mx-auto px-8 py-8 space-y-6">
        {!project && (
          <p className="text-gray-500">{t("clientPortal.noProjectYet")}</p>
        )}
        {project && (
          <section className="bg-white border border-brand-100 rounded-xl p-6">
            <h2 className="text-xl font-semibold">{project.name}</h2>
            <div className="w-full bg-brand-100 rounded-full h-2 mt-2 mb-1">
              <div
                className="bg-brand-600 h-2 rounded-full"
                style={{
                  width: `${project.progress_percent}%`,
                }}
              />
            </div>
            <p className="text-xs text-gray-400 mb-4">
              {project.progress_percent}
              {t("clientDetail.percentComplete")}
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
          <section className="bg-white border border-brand-100 rounded-xl p-6">
            <h3 className="font-medium mb-3">{t("clientPortal.documents")}</h3>
            <ul className="divide-y divide-gray-100">
              {documents.map((doc) => (
                <li key={doc.id} className="py-2 text-sm">
                  <a
                    href={doc.file}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Open ${doc.original_name} in a new tab`}
                    className="text-brand-700 transition-colors hover:text-brand-900 hover:underline focus:outline-none focus:ring-2 focus:ring-brand-400 rounded"
                  >
                    {doc.original_name}
                  </a>
                </li>
              ))}
              {documents.length === 0 && (
                <p className="text-gray-500 text-sm">
                  {t("clientPortal.noDocuments")}
                </p>
              )}
            </ul>
          </section>
        )}
        {project && (
          <section className="bg-white border border-brand-100 rounded-xl p-6">
            <h3 className="font-medium mb-3">{t("clientPortal.invoices")}</h3>
            <ul className="divide-y divide-gray-100">
              {invoices.map((invoice) => (
                <li
                  key={invoice.id}
                  className="py-2 flex justify-between text-sm"
                >
                  <span>
                    {`#${invoice.number} - ${invoice.total} - ${invoice.status}`}
                  </span>
                  <button
                    onClick={() => downloadPdf(invoice.id)}
                    aria-label={`Download invoice ${invoice.number} as PDF`}
                    className="text-brand-700 underline transition-colors hover:text-brand-900 focus:outline-none focus:ring-2 focus:ring-brand-400 rounded"
                  >
                    {t("clientPortal.pdf")}
                  </button>
                </li>
              ))}
              {invoices.length === 0 && (
                <p className="text-gray-500 text-sm">
                  {t("clientPortal.noInvoices")}
                </p>
              )}
            </ul>
          </section>
        )}
        {project && (
          <section className="bg-white border border-brand-100 rounded-xl p-6">
            <h3 className="font-medium mb-3">{t("clientPortal.approvals")}</h3>
            <ul className="space-y-3">
              {approvals.map((approval) => (
                <li
                  key={approval.id}
                  className="border border-gray-200 rounded-lg p-4"
                >
                  <p className="font-medium">{approval.title}</p>
                  {approval.description && (
                    <p className="text-sm text-gray-600 mb-2">
                      {approval.description}
                    </p>
                  )}
                  {approval.status === "pending" ? (
                    <div>
                      <label
                        htmlFor={`approval-comment-${approval.id}`}
                        className="sr-only"
                      >
                        Comment for {approval.title}
                      </label>
                      <input
                        id={`approval-comment-${approval.id}`}
                        value={comments[approval.id] || ""}
                        onChange={(e) =>
                          setComments({
                            ...comments,
                            [approval.id]: e.target.value,
                          })
                        }
                        placeholder={t("clientPortal.commentPlaceholder")}
                        className="w-full mb-2 px-3 py-2 border border-gray-300 rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => decide(approval.id, "approved")}
                          aria-label={`Approve ${approval.title}`}
                          className="bg-green-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-400"
                        >
                          {t("clientPortal.approve")}
                        </button>
                        <button
                          onClick={() =>
                            decide(approval.id, "changes_requested")
                          }
                          aria-label={`Request changes on ${approval.title}`}
                          className="bg-red-50 text-red-700 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-400"
                        >
                          {t("clientPortal.requestChanges")}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">
                      {approval.status === "approved"
                        ? t("clientDetail.statusApproved")
                        : t("clientDetail.statusChangesRequested")}
                      {approval.client_comment &&
                        ` \u2014 "${approval.client_comment}"`}
                    </p>
                  )}
                </li>
              ))}
              {approvals.length === 0 && (
                <p className="text-gray-500 text-sm">
                  {t("clientPortal.noApprovals")}
                </p>
              )}
            </ul>
          </section>
        )}
        {project && (
          <section className="bg-white border border-brand-100 rounded-xl p-6">
            <h3 className="font-medium mb-3">{t("clientPortal.messages")}</h3>
            <div className="space-y-3 mb-4 max-h-72 overflow-y-auto">
              {messages.map((message) => (
                <div key={message.id} className="text-sm">
                  <p className="text-xs text-gray-400">{message.sender_name}</p>
                  <p className="inline-block px-3 py-2 rounded-lg bg-brand-50">
                    {message.body}
                  </p>
                </div>
              ))}
              {messages.length === 0 && (
                <p className="text-gray-500 text-sm">
                  {t("clientPortal.noMessages")}
                </p>
              )}
            </div>
            <form onSubmit={onSend} className="flex gap-2">
              <label htmlFor="client-message" className="sr-only">
                {t("clientPortal.writeMessage")}
              </label>
              <input
                id="client-message"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={t("clientPortal.writeMessage")}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
              />
              <button
                aria-label={t("clientPortal.send")}
                className="bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400"
              >
                {t("clientPortal.send")}
              </button>
            </form>
          </section>
        )}
      </main>
    </div>
  );
}
