// What a client sees when they log in: their project's
// progress, documents, messages, invoices, approvals, and
// appointment booking (including weekly-repeating bookings and
// a waitlist for full slots).
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  FiAlertCircle,
  FiCalendar,
  FiCheck,
  FiCheckCircle,
  FiCreditCard,
  FiDownload,
  FiEdit2,
  FiInfo,
  FiLogOut,
  FiMapPin,
  FiPaperclip,
  FiSend,
  FiTrash2,
  FiUpload,
  FiUser,
  FiUserMinus,
  FiUserPlus,
  FiVideo,
  FiX,
} from "react-icons/fi";
import { useAuth } from "../lib/AuthContext.jsx";
import LanguageToggle from "../components/LanguageToggle.jsx";
import ThemeToggle from "../components/ThemeToggle.jsx";
import NotificationBell from "../components/NotificationBell.jsx";
import ActivityFeed from "../components/ActivityFeed.jsx";
import MobileNav from "../components/MobileNav.jsx";
import SkipLink from "../components/SkipLink.jsx";
import api from "../lib/api";

// Displays a duration in whichever unit it was most likely
// entered in - whole days if it divides evenly into days, whole
// hours if it divides evenly into hours, otherwise minutes.
function formatDuration(minutes) {
  if (minutes % 1440 === 0) {
    const days = minutes / 1440;
    return `${days} day${days !== 1 ? "s" : ""}`;
  }
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return `${hours} hr${hours !== 1 ? "s" : ""}`;
  }
  return `${minutes} min`;
}

// Checkout endpoints raise DRF ValidationError with a plain
// string (e.g. "Online payments aren't configured for this
// workspace yet."), which DRF serializes as a one-item array
// rather than {detail: ...}.
function checkoutErrorMessage(err) {
  const data = err.response?.data;
  if (Array.isArray(data) && typeof data[0] === "string") return data[0];
  if (typeof data?.detail === "string") return data.detail;
  return null;
}

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
  const [attachment, setAttachment] = useState(null);
  const [paymentBanner, setPaymentBanner] = useState(null);
  const [invoiceError, setInvoiceError] = useState(null);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [docUploading, setDocUploading] = useState(false);
  const [workspace, setWorkspace] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const payment = params.get("payment");
    if (payment === "success" || payment === "cancelled") {
      setPaymentBanner(payment);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  useEffect(() => {
    api.get("/payment-methods/").then((res) => setPaymentMethods(res.data));
  }, []);

  async function loadAll() {
    const workspaceRes = await api.get("/workspace/");
    setWorkspace(workspaceRes.data);
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
  async function onUploadDocument(e) {
    const file = e.target.files[0];
    if (!file || !project) return;
    setDocUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("project", project.id);
    try {
      await api.post("/documents/", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      await loadAll();
    } finally {
      setDocUploading(false);
    }
  }
  async function onSend(e) {
    e.preventDefault();
    if ((!body.trim() && !attachment) || !project) return;
    const formData = new FormData();
    formData.append("project", project.id);
    formData.append("body", body);
    if (attachment) formData.append("attachment", attachment);
    await api.post("/messages/", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    setBody("");
    setAttachment(null);
    loadAll();
  }
  async function downloadPdf(invoiceId) {
    const res = await api.get(`/invoices/${invoiceId}/pdf/`, {
      responseType: "blob",
    });
    const url = URL.createObjectURL(res.data);
    window.open(url, "_blank");
  }
  async function openFile(url) {
    const res = await api.get(url, { responseType: "blob" });
    const blobUrl = URL.createObjectURL(res.data);
    window.open(blobUrl, "_blank");
  }
  async function payInvoice(invoiceId) {
    setInvoiceError(null);
    try {
      const res = await api.post(`/invoices/${invoiceId}/checkout/`);
      window.location.href = res.data.url;
    } catch (err) {
      setInvoiceError(checkoutErrorMessage(err) || t("clientPortal.paymentFailed"));
    }
  }
  async function decide(approvalId, decisionStatus) {
    await api.post(`/approvals/${approvalId}/decide/`, {
      status: decisionStatus,
      client_comment: comments[approvalId] || "",
    });
    loadAll();
  }

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <SkipLink />
      <header className="sticky top-0 z-10 glass-panel px-8 py-4 flex justify-between items-center">
        <div>
          <h1 className="text-lg font-semibold text-ink">{user.company_name}</h1>
          <p className="text-sm text-ink-soft">
            {t("clientPortal.welcomeBack")} {user.first_name}
          </p>
        </div>
        <MobileNav>
          <NotificationBell />
          <ThemeToggle />
          <LanguageToggle />
          <Link
            to="/account"
            aria-label={t("account.title")}
            className="text-sm text-brand-600 underline transition-colors hover:text-brand-800 focus:outline-none focus:ring-2 focus:ring-brand-400 rounded"
          >
            <FiUser className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
            {t("account.title")}
          </Link>
          <button
            onClick={logout}
            aria-label={t("dashboard.signOut")}
            className="text-sm text-brand-600 underline transition-colors hover:text-brand-800 focus:outline-none focus:ring-2 focus:ring-brand-400 rounded"
          >
            <FiLogOut className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
            {t("dashboard.signOut")}
          </button>
        </MobileNav>
      </header>
      {paymentBanner && (
        <div className="max-w-2xl mx-auto px-8 pt-4">
          <div
            role="status"
            className={
              paymentBanner === "success"
                ? "text-sm text-green-700 bg-green-50 border border-green-200 rounded p-3"
                : "text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded p-3"
            }
          >
            {paymentBanner === "success"
              ? t("clientPortal.paymentSuccess")
              : t("clientPortal.paymentCancelled")}
          </div>
        </div>
      )}
      <main id="main-content" className="max-w-2xl mx-auto px-8 py-8 space-y-6">
        <BookingSection />
        <ReviewsSection />
        {!project && (
          <p className="text-ink-soft">{t("clientPortal.noProjectYet")}</p>
        )}
        {project && (
          <section className="bg-surface border border-line rounded-2xl p-6">
            <h2 className="text-xl font-semibold text-ink">{project.name}</h2>
            <div className="w-full bg-brand-100 rounded-full h-2 mt-2 mb-1">
              <div
                className="bg-brand-600 h-2 rounded-full"
                style={{
                  width: `${project.progress_percent}%`,
                }}
              />
            </div>
            <p className="text-xs text-ink-soft mb-4">
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
          <section className="bg-surface border border-line rounded-2xl p-6">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-medium text-ink">
                {t("clientPortal.documents")}
              </h3>
              <label
                className="inline-flex items-center gap-1.5 text-sm text-brand-600 underline cursor-pointer transition-colors hover:text-brand-800 focus-within:ring-2 focus-within:ring-brand-400 rounded"
                title={t("clientPortal.uploadDocument")}
              >
                <FiUpload aria-hidden="true" size={14} />
                {docUploading
                  ? t("clientPortal.uploading")
                  : t("clientPortal.uploadDocument")}
                <input
                  type="file"
                  className="hidden"
                  onChange={onUploadDocument}
                  disabled={docUploading}
                  aria-label={t("clientPortal.uploadDocument")}
                />
              </label>
            </div>
            <ul className="divide-y divide-line">
              {documents.map((doc) => (
                <li key={doc.id} className="py-2 text-sm">
                  <button
                    onClick={() => openFile(doc.file_url)}
                    aria-label={`Open ${doc.original_name} in a new tab`}
                    className="text-brand-700 transition-colors hover:text-brand-900 hover:underline focus:outline-none focus:ring-2 focus:ring-brand-400 rounded"
                  >
                    {doc.original_name}
                  </button>
                  {doc.category && doc.category !== "other" && (
                    <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-surface-2 text-ink-soft">
                      {t(`clientPortal.category_${doc.category}`)}
                    </span>
                  )}
                </li>
              ))}
              {documents.length === 0 && (
                <p className="text-ink-soft text-sm">
                  {t("clientPortal.noDocuments")}
                </p>
              )}
            </ul>
          </section>
        )}
        {project && (
          <section className="bg-surface border border-line rounded-2xl p-6">
            <h3 className="font-medium mb-3 text-ink">{t("clientPortal.invoices")}</h3>
            {invoiceError && (
              <div
                role="alert"
                className="mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3"
              >
                {invoiceError}
              </div>
            )}
            <ul className="divide-y divide-line">
              {invoices.map((invoice) => (
                <li
                  key={invoice.id}
                  className="py-2 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 text-sm"
                >
                  <span>
                    {`#${invoice.number} - ${invoice.total} ${workspace?.currency ?? ""} - ${invoice.status}`}
                  </span>
                  <span className="flex gap-3 items-center">
                    {invoice.status !== "paid" && (
                      <button
                        onClick={() => payInvoice(invoice.id)}
                        aria-label={`Pay invoice ${invoice.number} online`}
                        className="bg-brand-600 text-white text-xs px-2.5 py-1 rounded-lg font-medium transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400"
                      >
                        <FiCreditCard className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
                        {t("clientPortal.payNow")}
                      </button>
                    )}
                    <button
                      onClick={() => downloadPdf(invoice.id)}
                      aria-label={`Download invoice ${invoice.number} as PDF`}
                      className="text-brand-700 underline transition-colors hover:text-brand-900 focus:outline-none focus:ring-2 focus:ring-brand-400 rounded"
                    >
                      <FiDownload className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
                      {t("clientPortal.pdf")}
                    </button>
                  </span>
                </li>
              ))}
              {invoices.length === 0 && (
                <p className="text-ink-soft text-sm">
                  {t("clientPortal.noInvoices")}
                </p>
              )}
            </ul>
            {paymentMethods.length > 0 &&
              invoices.some((inv) => inv.status !== "paid") && (
                <div className="mt-4 pt-3 border-t border-line">
                  <p className="text-xs font-medium text-ink-soft mb-2">
                    {t("clientPortal.otherWaysToPay")}
                  </p>
                  <ul className="space-y-2">
                    {paymentMethods.map((method) => (
                      <li key={method.id} className="text-xs">
                        <span className="font-medium">{method.name}</span>
                        {": "}
                        <span className="text-ink-soft whitespace-pre-wrap">
                          {method.account_details}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
          </section>
        )}
        {project && (
          <section className="bg-surface border border-line rounded-2xl p-6">
            <h3 className="font-medium mb-3 text-ink">{t("clientPortal.approvals")}</h3>
            <ul className="space-y-3">
              {approvals.map((approval) => (
                <li
                  key={approval.id}
                  className="border border-line rounded-lg p-4"
                >
                  <p className="font-medium">{approval.title}</p>
                  {approval.description && (
                    <p className="text-sm text-ink-soft mb-2">
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
                        className="w-full mb-2 px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => decide(approval.id, "approved")}
                          aria-label={`Approve ${approval.title}`}
                          className="bg-green-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-400"
                        >
                          <FiCheckCircle className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
                          {t("clientPortal.approve")}
                        </button>
                        <button
                          onClick={() =>
                            decide(approval.id, "changes_requested")
                          }
                          aria-label={`Request changes on ${approval.title}`}
                          className="bg-red-50 text-red-700 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-400"
                        >
                          <FiAlertCircle className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
                          {t("clientPortal.requestChanges")}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-ink-soft">
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
                <p className="text-ink-soft text-sm">
                  {t("clientPortal.noApprovals")}
                </p>
              )}
            </ul>
          </section>
        )}
        {project && (
          <section className="bg-surface border border-line rounded-2xl p-6">
            <h3 className="font-medium mb-3 text-ink">{t("clientPortal.messages")}</h3>
            <div className="space-y-3 mb-4 max-h-72 overflow-y-auto">
              {messages.map((message) => (
                <div key={message.id} className="text-sm">
                  <p className="text-xs text-ink-soft">{message.sender_name}</p>
                  <div className="flex items-center gap-2">
                    {message.body && (
                      <p className="inline-block px-3 py-2 rounded-lg bg-brand-50">
                        {message.body}
                      </p>
                    )}
                    {message.attachment_url && (
                      <button
                        onClick={() => openFile(message.attachment_url)}
                        className="inline-flex items-center px-3 py-2 rounded-lg bg-brand-50 text-brand-700 text-sm font-medium hover:bg-brand-100"
                      >
                        <FiPaperclip className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
                        {message.attachment_name}
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {messages.length === 0 && (
                <p className="text-ink-soft text-sm">
                  {t("clientPortal.noMessages")}
                </p>
              )}
            </div>
            {attachment && (
              <p className="text-xs text-ink-soft mb-1.5 flex items-center gap-1.5">
                <FiPaperclip className="shrink-0" aria-hidden="true" />
                {attachment.name}
                <button
                  type="button"
                  onClick={() => setAttachment(null)}
                  aria-label={t("clientPortal.removeAttachment")}
                  className="text-red-600 hover:underline"
                >
                  {t("clientPortal.removeAttachment")}
                </button>
              </p>
            )}
            <form onSubmit={onSend} className="flex gap-2">
              <label htmlFor="client-message" className="sr-only">
                {t("clientPortal.writeMessage")}
              </label>
              <input
                id="client-message"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={t("clientPortal.writeMessage")}
                className="flex-1 px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
              />
              <label
                htmlFor="client-message-attachment"
                aria-label={t("clientPortal.attachFile")}
                className="flex items-center px-3 py-2 bg-surface-2 text-ink-soft rounded-lg text-sm font-medium cursor-pointer transition-colors hover:bg-line focus-within:ring-2 focus-within:ring-brand-400"
              >
                <FiPaperclip className="shrink-0" aria-hidden="true" />
                <input
                  id="client-message-attachment"
                  type="file"
                  className="sr-only"
                  onChange={(e) => setAttachment(e.target.files[0] || null)}
                />
              </label>
              <button
                aria-label={t("clientPortal.send")}
                className="bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400"
              >
                <FiSend className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
                {t("clientPortal.send")}
              </button>
            </form>
          </section>
        )}
        <ActivityFeed />
      </main>
    </div>
  );
}

function ClientPaymentBadge({ status }) {
  const { t } = useTranslation();
  if (!status || status === "not_required") return null;
  const styles = {
    pending: "bg-amber-50 text-amber-700 border-amber-200",
    paid: "bg-green-50 text-green-700 border-green-200",
    refunded: "bg-gray-50 text-ink-soft border-line",
  };
  return (
    <span
      className={`text-xs px-2 py-0.5 rounded-full border ${styles[status] || styles.pending}`}
    >
      {t(`booking.paymentStatus.${status}`)}
    </span>
  );
}

// Shown right before the client confirms a booking, so payment and
// cancellation terms are always seen before the appointment is
// created (BOOK-23, BOOK-43) rather than discovered afterward.
function BookingPolicyNotice({ service, currency }) {
  const { t } = useTranslation();
  if (!service) return null;
  const hasPaymentTerm = service.payment_requirement !== "none";
  const hasCancellationTerm = !!service.late_cancellation_fee_percent;
  if (!hasPaymentTerm && !hasCancellationTerm) return null;
  const depositAmount =
    service.payment_requirement === "deposit" && service.price
      ? ((service.price * service.deposit_percent) / 100).toFixed(2)
      : null;
  return (
    <div className="mb-3 text-xs text-ink-soft bg-surface-2 border border-line rounded-lg p-3 space-y-1">
      {service.payment_requirement === "deposit" && (
        <p>
          {t("booking.policyDepositRequired", {
            percent: service.deposit_percent,
            amount: depositAmount,
            currency,
          })}
        </p>
      )}
      {service.payment_requirement === "full" && (
        <p>
          {t("booking.policyFullPaymentRequired", {
            amount: service.price,
            currency,
          })}
        </p>
      )}
      {hasCancellationTerm && (
        <p>
          {t("booking.policyCancellationFee", {
            hours: service.cancellation_notice_hours,
            percent: service.late_cancellation_fee_percent,
          })}
        </p>
      )}
    </div>
  );
}

function BookingSection() {
  const { t } = useTranslation();
  const [bookingType, setBookingType] = useState("service");
  const [services, setServices] = useState([]);
  const [resources, setResources] = useState([]);
  const [selectedService, setSelectedService] = useState("");
  const [selectedResource, setSelectedResource] = useState("");
  const [selectedStaff, setSelectedStaff] = useState("");
  const [date, setDate] = useState("");
  const [slots, setSlots] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState("");
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [myBookings, setMyBookings] = useState([]);
  const [statusMsg, setStatusMsg] = useState(null);
  const [currency, setCurrency] = useState("EUR");
  const [repeatWeekly, setRepeatWeekly] = useState(false);
  const [numberOfWeeks, setNumberOfWeeks] = useState("4");
  const [editingId, setEditingId] = useState(null);
  const [editDate, setEditDate] = useState("");
  const [editTime, setEditTime] = useState("");
  const [editService, setEditService] = useState("");
  const [myWaitlist, setMyWaitlist] = useState([]);
  const [waitlistDate, setWaitlistDate] = useState("");
  const [waitlistTime, setWaitlistTime] = useState("");
  const [editingWaitlistId, setEditingWaitlistId] = useState(null);
  const [editWaitlistService, setEditWaitlistService] = useState("");
  const [editWaitlistDate, setEditWaitlistDate] = useState("");
  const [editWaitlistTime, setEditWaitlistTime] = useState("");
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [customAnswers, setCustomAnswers] = useState({});

  async function loadServices() {
    const res = await api.get("/services/");
    setServices(res.data);
    const workspaceRes = await api.get("/workspace/");
    setCurrency(workspaceRes.data.currency);
  }
  async function loadResources() {
    const res = await api.get("/resources/");
    setResources(res.data);
  }
  async function loadMyBookings() {
    const res = await api.get("/bookings/");
    setMyBookings(res.data);
  }
  async function loadMyWaitlist() {
    const res = await api.get("/waitlist/");
    setMyWaitlist(res.data);
  }
  useEffect(() => {
    loadServices();
    loadResources();
    loadMyBookings();
    loadMyWaitlist();
    api.get("/payment-methods/").then((res) => setPaymentMethods(res.data));
  }, []);

  async function loadSlots() {
    const itemId =
      bookingType === "service" ? selectedService : selectedResource;
    if (!itemId || !date) {
      setSlots([]);
      return;
    }
    setLoadingSlots(true);
    setSelectedSlot("");
    try {
      const param = bookingType === "service" ? "service" : "resource";
      const staffParam =
        bookingType === "service" && selectedStaff
          ? `&staff=${selectedStaff}`
          : "";
      const res = await api.get(
        `/availability/?${param}=${itemId}&date=${date}${staffParam}`,
      );
      setSlots(res.data.slots);
    } finally {
      setLoadingSlots(false);
    }
  }
  useEffect(() => {
    loadSlots();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedService, selectedResource, selectedStaff, bookingType, date]);

  function selectSlot(time) {
    setSelectedSlot(time);
    setStatusMsg(null);
  }

  async function confirmBooking() {
    try {
      const startTime = new Date(`${date}T${selectedSlot}:00`).toISOString();
      if (bookingType === "service" && repeatWeekly) {
        await api.post("/recurring-series/", {
          service: selectedService,
          start_time: startTime,
          occurrences: parseInt(numberOfWeeks, 10),
        });
        setStatusMsg({
          key: "booking.recurringBookingConfirmed",
          type: "success",
        });
      } else if (bookingType === "service") {
        await api.post("/bookings/", {
          service: selectedService,
          staff: selectedStaff || null,
          start_time: startTime,
          custom_answers: customAnswers,
        });
        setStatusMsg({
          key: "booking.bookingConfirmed",
          type: "success",
        });
      } else {
        await api.post("/bookings/", {
          resource: selectedResource,
          start_time: startTime,
        });
        setStatusMsg({
          key: "booking.bookingConfirmed",
          type: "success",
        });
      }
      setSlots([]);
      setSelectedSlot("");
      setDate("");
      setSelectedStaff("");
      setRepeatWeekly(false);
      setNumberOfWeeks("4");
      setCustomAnswers({});
      loadMyBookings();
    } catch (err) {
      const data = err.response?.data;
      const message = data ? Object.values(data).flat().join(" ") : null;
      setStatusMsg(
        message
          ? { raw: message, type: "error" }
          : { key: "booking.couldNotCreateBooking", type: "error" },
      );
      loadSlots();
    }
  }

  async function cancelMine(bookingId) {
    if (!window.confirm(t("booking.confirmCancelBooking"))) return;
    await api.patch(`/bookings/${bookingId}/`, {
      status: "cancelled",
    });
    setStatusMsg({ key: "booking.bookingCancelledMsg", type: "error" });
    loadMyBookings();
  }

  async function downloadIcs(bookingId) {
    const res = await api.get(`/bookings/${bookingId}/ics/`, {
      responseType: "blob",
    });
    const url = URL.createObjectURL(res.data);
    window.open(url, "_blank");
  }

  async function payForBooking(bookingId) {
    try {
      const res = await api.post(`/bookings/${bookingId}/checkout/`);
      window.location.href = res.data.url;
    } catch (err) {
      setStatusMsg({
        raw: checkoutErrorMessage(err) || t("booking.paymentFailed"),
        type: "error",
      });
    }
  }

  function startEditMine(booking) {
    if (!booking.service) return;
    const start = new Date(booking.start_time);
    setEditingId(booking.id);
    setEditDate(start.toISOString().slice(0, 10));
    setEditTime(start.toTimeString().slice(0, 5));
    setEditService(String(booking.service));
  }

  function cancelEditMine() {
    setEditingId(null);
  }

  async function saveEditMine(bookingId) {
    try {
      const startTime = new Date(`${editDate}T${editTime}:00`).toISOString();
      await api.patch(`/bookings/${bookingId}/`, {
        service: editService,
        start_time: startTime,
      });
      setEditingId(null);
      setStatusMsg({
        key: "booking.bookingRescheduled",
        type: "success",
      });
      loadMyBookings();
    } catch (err) {
      const data = err.response?.data;
      const message = data ? Object.values(data).flat().join(" ") : null;
      setStatusMsg(
        message
          ? { raw: message, type: "error" }
          : { key: "booking.couldNotReschedule", type: "error" },
      );
    }
  }

  async function cancelSeries(seriesId) {
    if (!window.confirm(t("booking.cancelWholeSeries"))) return;
    await api.post(`/recurring-series/${seriesId}/cancel/`);
    setStatusMsg({ key: "booking.recurringSeriesCancelled", type: "error" });
    loadMyBookings();
  }

  async function joinWaitlist() {
    try {
      const startTime = new Date(
        `${waitlistDate}T${waitlistTime}:00`,
      ).toISOString();
      await api.post("/waitlist/", {
        service: selectedService,
        start_time: startTime,
      });
      setStatusMsg({
        key: "booking.joinedWaitlist",
        type: "success",
      });
      setWaitlistDate("");
      setWaitlistTime("");
      loadMyWaitlist();
    } catch (err) {
      const data = err.response?.data;
      const message = data ? Object.values(data).flat().join(" ") : null;
      setStatusMsg(
        message
          ? { raw: message, type: "error" }
          : { key: "booking.couldNotJoinWaitlist", type: "error" },
      );
    }
  }

  async function leaveWaitlist(entryId) {
    if (!window.confirm(t("booking.confirmLeaveWaitlist"))) return;
    await api.delete(`/waitlist/${entryId}/`);
    setStatusMsg({ key: "booking.leftWaitlist", type: "error" });
    loadMyWaitlist();
  }

  function startEditWaitlist(entry) {
    const start = new Date(entry.start_time);
    setEditingWaitlistId(entry.id);
    setEditWaitlistService(String(entry.service));
    setEditWaitlistDate(start.toISOString().slice(0, 10));
    setEditWaitlistTime(start.toTimeString().slice(0, 5));
  }

  function cancelEditWaitlist() {
    setEditingWaitlistId(null);
  }

  async function saveEditWaitlist(entryId) {
    try {
      const startTime = new Date(
        `${editWaitlistDate}T${editWaitlistTime}:00`,
      ).toISOString();
      await api.patch(`/waitlist/${entryId}/`, {
        service: editWaitlistService,
        start_time: startTime,
      });
      setEditingWaitlistId(null);
      setStatusMsg({ key: "booking.waitlistEntryUpdated", type: "success" });
      loadMyWaitlist();
    } catch (err) {
      const data = err.response?.data;
      const message = data ? Object.values(data).flat().join(" ") : null;
      setStatusMsg(
        message
          ? { raw: message, type: "error" }
          : { key: "booking.couldNotUpdateWaitlist", type: "error" },
      );
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  const confirmedBookings = myBookings.filter((b) => b.status === "confirmed");

  return (
    <section className="bg-surface border border-line rounded-2xl p-6">
      <h3 className="font-medium mb-3 text-brand-700">
        {t("booking.bookAppointment")}
      </h3>

      {statusMsg && (
        <div
          role="status"
          className={
            statusMsg.type === "success"
              ? "mb-4 text-sm text-green-700 bg-green-50 border border-green-200 rounded p-3"
              : "mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3"
          }
        >
          {statusMsg.key ? t(statusMsg.key, statusMsg.params) : statusMsg.raw}
        </div>
      )}

      <p className="text-xs text-ink-soft mb-2">{t("booking.bookingType")}</p>
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => {
            setBookingType("service");
            setSelectedResource("");
            setSlots([]);
            setSelectedSlot("");
          }}
          aria-pressed={bookingType === "service"}
          aria-label={t("booking.aService")}
          className={
            bookingType === "service"
              ? "px-3 py-1.5 rounded-lg text-sm bg-brand-600 text-white border border-brand-600 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400"
              : "px-3 py-1.5 rounded-lg text-sm border border-line transition-colors hover:bg-brand-50 focus:outline-none focus:ring-2 focus:ring-brand-400"
          }
        >
          {t("booking.aService")}
        </button>
        <button
          onClick={() => {
            setBookingType("resource");
            setSelectedService("");
            setRepeatWeekly(false);
            setSlots([]);
            setSelectedSlot("");
          }}
          aria-pressed={bookingType === "resource"}
          aria-label={t("booking.aResource")}
          className={
            bookingType === "resource"
              ? "px-3 py-1.5 rounded-lg text-sm bg-brand-600 text-white border border-brand-600 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400"
              : "px-3 py-1.5 rounded-lg text-sm border border-line transition-colors hover:bg-brand-50 focus:outline-none focus:ring-2 focus:ring-brand-400"
          }
        >
          {t("booking.aResource")}
        </button>
      </div>

      {bookingType === "service" && (
        <>
          <p className="text-xs text-ink-soft mb-2">
            {t("booking.selectService")}
          </p>
          <div className="space-y-2 mb-3">
            {services.map((service) => (
              <button
                key={service.id}
                onClick={() => {
                  setSelectedService(String(service.id));
                  setSelectedStaff("");
                  setCustomAnswers({});
                }}
                aria-pressed={selectedService === String(service.id)}
                aria-label={`Select ${service.name}`}
                className={
                  selectedService === String(service.id)
                    ? "w-full flex items-start gap-3 p-3 border-2 border-brand-600 bg-brand-50 rounded-lg text-left transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400"
                    : "w-full flex items-start gap-3 p-3 border border-line rounded-lg text-left transition-colors hover:border-brand-200 focus:outline-none focus:ring-2 focus:ring-brand-400"
                }
              >
                {service.photo ? (
                  <img
                    src={service.photo}
                    alt={`${service.name} photo`}
                    className="w-12 h-12 rounded-lg object-cover border border-line shrink-0"
                  />
                ) : (
                  <div
                    aria-hidden="true"
                    className="w-12 h-12 rounded-lg bg-surface-2 border border-dashed border-line-strong shrink-0"
                  />
                )}
                <div>
                  <p className="text-sm font-medium">
                    {service.name}
                    {" \u00b7 "}
                    {formatDuration(service.duration_minutes)}
                    {service.price && ` \u00b7 ${service.price} ${currency}`}
                  </p>
                  {service.description && (
                    <p className="text-xs text-ink-soft mt-0.5">
                      {service.description}
                    </p>
                  )}
                  {service.resource_names &&
                    service.resource_names.length > 0 && (
                      <p className="text-xs text-ink-soft mt-0.5">
                        {t("booking.usesResources")}
                        {": "}
                        {service.resource_names.join(", ")}
                      </p>
                    )}
                  {service.location && (
                    <p className="text-xs text-ink-soft mt-0.5">
                      <FiMapPin className="inline -mt-0.5 mr-1 shrink-0" aria-hidden="true" />
                      {service.location}
                    </p>
                  )}
                  {service.is_online && (
                    <p className="text-xs text-ink-soft mt-0.5">
                      <FiVideo className="inline -mt-0.5 mr-1 shrink-0" aria-hidden="true" />
                      {t("booking.onlineAppointment")}
                    </p>
                  )}
                  {service.instructions && (
                    <p className="text-xs text-ink-soft mt-0.5">
                      <FiInfo className="inline -mt-0.5 mr-1 shrink-0" aria-hidden="true" />
                      {service.instructions}
                    </p>
                  )}
                </div>
              </button>
            ))}
            {services.length === 0 && (
              <p className="text-ink-soft text-sm">{t("booking.noServices")}</p>
            )}
          </div>
        </>
      )}

      {bookingType === "resource" && (
        <>
          <p className="text-xs text-ink-soft mb-2">
            {t("booking.selectResource")}
          </p>
          <div className="space-y-2 mb-3">
            {resources.map((resource) => (
              <button
                key={resource.id}
                onClick={() => setSelectedResource(String(resource.id))}
                aria-pressed={selectedResource === String(resource.id)}
                aria-label={`Select ${resource.name}`}
                className={
                  selectedResource === String(resource.id)
                    ? "w-full flex items-start gap-3 p-3 border-2 border-brand-600 bg-brand-50 rounded-lg text-left transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400"
                    : "w-full flex items-start gap-3 p-3 border border-line rounded-lg text-left transition-colors hover:border-brand-200 focus:outline-none focus:ring-2 focus:ring-brand-400"
                }
              >
                {resource.photo ? (
                  <img
                    src={resource.photo}
                    alt={`${resource.name} photo`}
                    className="w-12 h-12 rounded-lg object-cover border border-line shrink-0"
                  />
                ) : (
                  <div
                    aria-hidden="true"
                    className="w-12 h-12 rounded-lg bg-surface-2 border border-dashed border-line-strong shrink-0"
                  />
                )}
                <div>
                  <p className="text-sm font-medium">
                    {resource.name}
                    {" \u00b7 "}
                    {formatDuration(resource.duration_minutes)}
                  </p>
                  {resource.description && (
                    <p className="text-xs text-ink-soft mt-0.5">
                      {resource.description}
                    </p>
                  )}
                </div>
              </button>
            ))}
            {resources.length === 0 && (
              <p className="text-ink-soft text-sm">
                {t("booking.noResources")}
              </p>
            )}
          </div>
        </>
      )}

      {bookingType === "service" &&
        selectedService &&
        (() => {
          const service = services.find(
            (s) => String(s.id) === selectedService,
          );
          if (!service || !service.staff || service.staff.length === 0) {
            return null;
          }
          return (
            <div className="mb-3">
              <label
                htmlFor="book-staff"
                className="block text-xs text-ink-soft mb-1"
              >
                {t("booking.selectTeamMember")}
              </label>
              <select
                id="book-staff"
                value={selectedStaff}
                onChange={(e) => setSelectedStaff(e.target.value)}
                className="w-full px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
              >
                <option value="">{t("booking.anyTeamMember")}</option>
                {service.staff.map((staffId, index) => (
                  <option key={staffId} value={staffId}>
                    {service.staff_names?.[index] || staffId}
                  </option>
                ))}
              </select>
            </div>
          );
        })()}

      <label htmlFor="book-date" className="block text-xs text-ink-soft mb-1">
        {t("booking.selectDate")}
      </label>
      <input
        id="book-date"
        type="date"
        min={today}
        value={date}
        onChange={(e) => setDate(e.target.value)}
        className="w-full mb-3 px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
      />

      {bookingType === "service" && (
        <label className="flex items-center gap-2 mb-3 cursor-pointer w-fit">
          <input
            type="checkbox"
            checked={repeatWeekly}
            onChange={(e) => setRepeatWeekly(e.target.checked)}
            className="cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-400 rounded"
          />
          <span className="text-sm text-ink">
            {t("booking.repeatWeekly")}
          </span>
        </label>
      )}
      {bookingType === "service" && repeatWeekly && (
        <div className="mb-3">
          <label
            htmlFor="number-of-weeks"
            className="block text-xs text-ink-soft mb-1"
          >
            {t("booking.numberOfWeeks")}
          </label>
          <input
            id="number-of-weeks"
            type="number"
            min="2"
            max="52"
            value={numberOfWeeks}
            onChange={(e) => setNumberOfWeeks(e.target.value)}
            className="w-24 px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
          />
        </div>
      )}

      {(bookingType === "service" ? selectedService : selectedResource) &&
        date && (
          <div className="mb-4">
            <p className="text-xs text-ink-soft mb-2">
              {t("booking.availableSlots")}
            </p>
            {loadingSlots && (
              <p className="text-sm text-ink-soft">
                {t("booking.loadingSlots")}
              </p>
            )}
            {!loadingSlots && slots.length === 0 && (
              <p className="text-sm text-ink-soft">{t("booking.noSlots")}</p>
            )}
            {!loadingSlots && slots.length > 0 && (
              <div>
                <div className="flex flex-wrap gap-2 mb-3">
                  {slots.map((slot) => (
                    <button
                      key={slot}
                      onClick={() => selectSlot(slot)}
                      aria-pressed={selectedSlot === slot}
                      aria-label={`Select ${slot}`}
                      className={
                        selectedSlot === slot
                          ? "px-3 py-1.5 rounded-lg text-sm bg-brand-600 text-white border border-brand-600 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400"
                          : "px-3 py-1.5 rounded-lg text-sm border border-brand-200 transition-colors hover:bg-brand-50 focus:outline-none focus:ring-2 focus:ring-brand-400"
                      }
                    >
                      {slot}
                    </button>
                  ))}
                </div>
                {selectedSlot && bookingType === "service" && (
                  <BookingPolicyNotice
                    service={services.find(
                      (s) => String(s.id) === selectedService,
                    )}
                    currency={currency}
                  />
                )}
                {selectedSlot &&
                  bookingType === "service" &&
                  services
                    .find((s) => String(s.id) === selectedService)
                    ?.questions?.map((question) => (
                      <div key={question.id} className="mb-3">
                        <label
                          htmlFor={`intake-${question.id}`}
                          className="block text-xs text-ink-soft mb-1"
                        >
                          {question.text}
                          {question.required ? " *" : ""}
                        </label>
                        {question.question_type === "choice" ? (
                          <select
                            id={`intake-${question.id}`}
                            required={question.required}
                            value={customAnswers[question.id] || ""}
                            onChange={(e) =>
                              setCustomAnswers((prev) => ({
                                ...prev,
                                [question.id]: e.target.value,
                              }))
                            }
                            className="w-full px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
                          >
                            <option value="" disabled>
                              {t("booking.selectOne")}
                            </option>
                            {question.choices
                              .split(",")
                              .map((c) => c.trim())
                              .filter(Boolean)
                              .map((choice) => (
                                <option key={choice} value={choice}>
                                  {choice}
                                </option>
                              ))}
                          </select>
                        ) : (
                          <input
                            id={`intake-${question.id}`}
                            type="text"
                            required={question.required}
                            value={customAnswers[question.id] || ""}
                            onChange={(e) =>
                              setCustomAnswers((prev) => ({
                                ...prev,
                                [question.id]: e.target.value,
                              }))
                            }
                            className="w-full px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
                          />
                        )}
                      </div>
                    ))}
                {selectedSlot && (
                  <button
                    onClick={confirmBooking}
                    aria-label={t("booking.confirmBooking")}
                    className="bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400"
                  >
                    <FiCheck className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />{t("booking.confirmBooking")} ({selectedSlot})
                  </button>
                )}
              </div>
            )}
          </div>
        )}

      <div className="mb-4 border-t border-line pt-4">
        <p className="text-xs text-ink-soft mb-2">
          {t("booking.waitlistTitle")}
        </p>
        <div className="flex flex-wrap gap-2 mb-2">
          <div>
            <label
              htmlFor="waitlist-service"
              className="block text-xs text-ink-soft mb-1"
            >
              {t("booking.selectService")}
            </label>
            <select
              id="waitlist-service"
              value={selectedService}
              onChange={(e) => setSelectedService(e.target.value)}
              className="px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
            >
              <option value="">{t("booking.selectService")}</option>
              {services.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor="waitlist-date"
              className="block text-xs text-ink-soft mb-1"
            >
              {t("booking.selectDate")}
            </label>
            <input
              id="waitlist-date"
              type="date"
              min={today}
              value={waitlistDate}
              onChange={(e) => setWaitlistDate(e.target.value)}
              className="px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
            />
          </div>
          <div>
            <label
              htmlFor="waitlist-time"
              className="block text-xs text-ink-soft mb-1"
            >
              {t("booking.startTime")}
            </label>
            <input
              id="waitlist-time"
              type="time"
              value={waitlistTime}
              onChange={(e) => setWaitlistTime(e.target.value)}
              className="px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
            />
          </div>
          <button
            onClick={joinWaitlist}
            disabled={!selectedService || !waitlistDate || !waitlistTime}
            aria-label={t("booking.joinWaitlist")}
            className="bg-brand-50 text-brand-700 px-3 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-brand-100 focus:outline-none focus:ring-2 focus:ring-brand-400 disabled:opacity-50 disabled:cursor-not-allowed self-end"
          >
            <FiUserPlus className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
            {t("booking.joinWaitlist")}
          </button>
        </div>
        <ul className="divide-y divide-line">
          {myWaitlist.map((entry) => (
            <li key={entry.id} className="py-2 text-sm">
              {editingWaitlistId === entry.id ? (
                <div className="border border-brand-200 rounded-lg p-3 flex flex-wrap gap-2 items-end">
                  <div>
                    <label
                      htmlFor={`edit-waitlist-service-${entry.id}`}
                      className="block text-xs text-ink-soft mb-1"
                    >
                      {t("booking.selectService")}
                    </label>
                    <select
                      id={`edit-waitlist-service-${entry.id}`}
                      value={editWaitlistService}
                      onChange={(e) => setEditWaitlistService(e.target.value)}
                      className="px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
                    >
                      {services.map((service) => (
                        <option key={service.id} value={service.id}>
                          {service.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label
                      htmlFor={`edit-waitlist-date-${entry.id}`}
                      className="block text-xs text-ink-soft mb-1"
                    >
                      {t("booking.selectDate")}
                    </label>
                    <input
                      id={`edit-waitlist-date-${entry.id}`}
                      type="date"
                      min={today}
                      value={editWaitlistDate}
                      onChange={(e) => setEditWaitlistDate(e.target.value)}
                      className="px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor={`edit-waitlist-time-${entry.id}`}
                      className="block text-xs text-ink-soft mb-1"
                    >
                      {t("booking.startTime")}
                    </label>
                    <input
                      id={`edit-waitlist-time-${entry.id}`}
                      type="time"
                      value={editWaitlistTime}
                      onChange={(e) => setEditWaitlistTime(e.target.value)}
                      className="px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
                    />
                  </div>
                  <button
                    onClick={() => saveEditWaitlist(entry.id)}
                    aria-label={t("booking.save")}
                    className="bg-brand-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400"
                  >
                    <FiCheck className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
                    {t("booking.save")}
                  </button>
                  <button
                    onClick={cancelEditWaitlist}
                    aria-label={t("booking.cancel")}
                    className="bg-surface-2 text-ink-soft px-3 py-1.5 rounded-lg text-sm font-medium transition-colors hover:bg-line focus:outline-none focus:ring-2 focus:ring-brand-400"
                  >
                    <FiX className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
                    {t("booking.cancel")}
                  </button>
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
                  <span>
                    {entry.service_name}
                    {" \u00b7 "}
                    {new Date(entry.start_time).toLocaleString()}
                    {" \u00b7 "}
                    <span className="text-xs text-ink-soft">
                      {entry.notified
                        ? t("booking.notified")
                        : t("booking.waiting")}
                    </span>
                  </span>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => startEditWaitlist(entry)}
                      aria-label={`${t("booking.edit")} waitlist entry`}
                      className="bg-brand-50 text-brand-700 text-sm px-3 py-1.5 rounded-lg font-medium transition-colors hover:bg-brand-100 focus:outline-none focus:ring-2 focus:ring-brand-400"
                    >
                      <FiEdit2 className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
                      {t("booking.edit")}
                    </button>
                    <button
                      onClick={() => leaveWaitlist(entry.id)}
                      aria-label={t("booking.leaveWaitlist")}
                      className="bg-surface-2 text-ink-soft text-sm px-3 py-1.5 rounded-lg font-medium transition-colors hover:bg-line focus:outline-none focus:ring-2 focus:ring-brand-400"
                    >
                      <FiUserMinus className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
                      {t("booking.leaveWaitlist")}
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
          {myWaitlist.length === 0 && (
            <p className="text-ink-soft text-xs">
              {t("booking.noWaitlistEntries")}
            </p>
          )}
        </ul>
      </div>

      <h4 className="text-xs text-ink-soft mb-2 mt-4">
        {t("booking.bookingsTitle")}
      </h4>
      <ul className="divide-y divide-line">
        {confirmedBookings.map((booking) => (
          <li key={booking.id} className="py-2 text-sm">
            {editingId === booking.id ? (
              <div className="border border-brand-200 rounded-lg p-3 flex flex-wrap gap-2 items-end">
                <div>
                  <label
                    htmlFor={`edit-mybooking-service-${booking.id}`}
                    className="block text-xs text-ink-soft mb-1"
                  >
                    {t("booking.selectService")}
                  </label>
                  <select
                    id={`edit-mybooking-service-${booking.id}`}
                    value={editService}
                    onChange={(e) => setEditService(e.target.value)}
                    className="px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
                  >
                    {services.map((service) => (
                      <option key={service.id} value={service.id}>
                        {service.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label
                    htmlFor={`edit-mybooking-date-${booking.id}`}
                    className="block text-xs text-ink-soft mb-1"
                  >
                    {t("booking.selectDate")}
                  </label>
                  <input
                    id={`edit-mybooking-date-${booking.id}`}
                    type="date"
                    min={today}
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    className="px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
                  />
                </div>
                <div>
                  <label
                    htmlFor={`edit-mybooking-time-${booking.id}`}
                    className="block text-xs text-ink-soft mb-1"
                  >
                    {t("booking.startTime")}
                  </label>
                  <input
                    id={`edit-mybooking-time-${booking.id}`}
                    type="time"
                    value={editTime}
                    onChange={(e) => setEditTime(e.target.value)}
                    className="px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
                  />
                </div>
                <button
                  onClick={() => saveEditMine(booking.id)}
                  aria-label={t("booking.save")}
                  className="bg-brand-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400"
                >
                  <FiCheck className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
                  {t("booking.save")}
                </button>
                <button
                  onClick={cancelEditMine}
                  aria-label={t("booking.cancel")}
                  className="bg-surface-2 text-ink-soft px-3 py-1.5 rounded-lg text-sm font-medium transition-colors hover:bg-line focus:outline-none focus:ring-2 focus:ring-brand-400"
                >
                  <FiX className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
                  {t("booking.cancel")}
                </button>
              </div>
            ) : (
              <>
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
                  <span>
                    {booking.service_name || booking.resource_name}
                    {" \u00b7 "}
                    {new Date(booking.start_time).toLocaleString()}
                    {booking.staff_name && ` \u00b7 ${booking.staff_name}`}{" "}
                    <ClientPaymentBadge status={booking.payment_status} />
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {booking.payment_status === "pending" && (
                      <button
                        onClick={() => payForBooking(booking.id)}
                        aria-label={`${t("booking.payNow")} - ${booking.service_name}`}
                        className="bg-brand-600 text-white text-sm px-3 py-1.5 rounded-lg font-medium transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400"
                      >
                        <FiCreditCard className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
                        {t("booking.payNow")}
                      </button>
                    )}
                    {booking.service && (
                      <button
                        onClick={() => startEditMine(booking)}
                        aria-label={`${t("booking.edit")} booking for ${booking.service_name}`}
                        className="bg-brand-50 text-brand-700 text-sm px-3 py-1.5 rounded-lg font-medium transition-colors hover:bg-brand-100 focus:outline-none focus:ring-2 focus:ring-brand-400"
                      >
                        <FiEdit2 className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
                        {t("booking.edit")}
                      </button>
                    )}
                    <button
                      onClick={() => downloadIcs(booking.id)}
                      aria-label={`${t("booking.addToCalendar")} - ${booking.service_name || booking.resource_name}`}
                      className="bg-surface-2 text-ink text-sm px-3 py-1.5 rounded-lg font-medium transition-colors hover:bg-line focus:outline-none focus:ring-2 focus:ring-brand-400"
                    >
                      <FiCalendar className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
                      {t("booking.addToCalendar")}
                    </button>
                    <button
                      onClick={() => cancelMine(booking.id)}
                      aria-label={`Cancel booking for ${booking.service_name || booking.resource_name}`}
                      className="text-white text-sm bg-red-600 px-3 py-1.5 rounded-lg font-medium transition-colors hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-400"
                    >
                      <FiX className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
                      {t("booking.cancelThisOne")}
                    </button>
                  </div>
                </div>
                {(booking.service_location || booking.service_is_online) && (
                  <p className="text-xs text-ink-soft mt-1">
                    {booking.service_location && (
                      <>
                        <FiMapPin className="inline -mt-0.5 mr-1 shrink-0" aria-hidden="true" />
                        {booking.service_location}
                      </>
                    )}
                    {booking.service_location && booking.service_is_online && " · "}
                    {booking.service_is_online && booking.service_meeting_link ? (
                      <a
                        href={booking.service_meeting_link}
                        target="_blank"
                        rel="noreferrer"
                        className="text-brand-700 underline hover:text-brand-900"
                      >
                        <FiVideo className="inline -mt-0.5 mr-1 shrink-0" aria-hidden="true" />
                        {t("booking.joinOnlineMeeting")}
                      </a>
                    ) : (
                      booking.service_is_online && (
                        <>
                          <FiVideo className="inline -mt-0.5 mr-1 shrink-0" aria-hidden="true" />
                          {t("booking.onlineAppointment")}
                        </>
                      )
                    )}
                  </p>
                )}
                {booking.payment_status === "pending" &&
                  paymentMethods.length > 0 && (
                    <p className="text-xs text-ink-soft mt-1">
                      {t("clientPortal.otherWaysToPay")}{" "}
                      {paymentMethods
                        .map((m) => `${m.name}: ${m.account_details}`)
                        .join(" · ")}
                    </p>
                  )}
                {booking.series && (
                  <div className="flex justify-between items-center mt-1">
                    <span className="text-xs text-ink-soft">
                      {t("booking.partOfSeries")}
                    </span>
                    <button
                      onClick={() => cancelSeries(booking.series)}
                      aria-label="Cancel the whole recurring series"
                      className="text-red-700 text-xs underline transition-colors hover:text-red-900 focus:outline-none focus:ring-2 focus:ring-red-400 rounded"
                    >
                      <FiX className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
                      {t("booking.cancelWholeSeries")}
                    </button>
                  </div>
                )}
              </>
            )}
          </li>
        ))}
        {confirmedBookings.length === 0 && (
          <p className="text-ink-soft text-sm">{t("booking.noBookings")}</p>
        )}
      </ul>
    </section>
  );
}

function ReviewsSection() {
  const { t } = useTranslation();
  const [completedBookings, setCompletedBookings] = useState([]);
  const [myReviews, setMyReviews] = useState([]);
  const [statusMsg, setStatusMsg] = useState(null);
  const [draftRating, setDraftRating] = useState({});
  const [draftComment, setDraftComment] = useState({});
  const [editingId, setEditingId] = useState(null);
  const [editRating, setEditRating] = useState(0);
  const [editComment, setEditComment] = useState("");

  async function loadBookings() {
    const res = await api.get("/bookings/");
    setCompletedBookings(res.data.filter((b) => b.status === "completed"));
  }
  async function loadReviews() {
    const res = await api.get("/reviews/");
    setMyReviews(res.data);
  }
  useEffect(() => {
    loadBookings();
    loadReviews();
  }, []);

  function reviewFor(bookingId) {
    return myReviews.find((r) => r.booking === bookingId);
  }

  async function submitReview(bookingId) {
    try {
      await api.post("/reviews/", {
        booking: bookingId,
        rating: draftRating[bookingId] || 5,
        comment: draftComment[bookingId] || "",
      });
      setStatusMsg({ key: "booking.reviewSubmitted", type: "success" });
      loadReviews();
    } catch (err) {
      const data = err.response?.data;
      const message = data ? Object.values(data).flat().join(" ") : null;
      setStatusMsg(
        message
          ? { raw: message, type: "error" }
          : { key: "booking.couldNotSubmitReview", type: "error" },
      );
    }
  }

  function startEdit(review) {
    setEditingId(review.id);
    setEditRating(review.rating);
    setEditComment(review.comment);
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function saveEdit(reviewId) {
    try {
      await api.patch(`/reviews/${reviewId}/`, {
        rating: editRating,
        comment: editComment,
      });
      setEditingId(null);
      setStatusMsg({ key: "booking.reviewUpdated", type: "success" });
      loadReviews();
    } catch (err) {
      const data = err.response?.data;
      const message = data ? Object.values(data).flat().join(" ") : null;
      setStatusMsg(
        message
          ? { raw: message, type: "error" }
          : { key: "booking.couldNotUpdateReview", type: "error" },
      );
    }
  }

  async function deleteReview(reviewId) {
    if (!window.confirm(t("booking.confirmDeleteReview"))) return;
    await api.delete(`/reviews/${reviewId}/`);
    setStatusMsg({ key: "booking.reviewDeleted", type: "error" });
    loadReviews();
  }

  function StarPicker({ value, onChange }) {
    return (
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            aria-label={`${n} star${n > 1 ? "s" : ""}`}
            className={
              n <= value
                ? "text-xl text-yellow-500 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 rounded"
                : "text-xl text-ink-soft transition-colors hover:text-yellow-400 focus:outline-none focus:ring-2 focus:ring-brand-400 rounded"
            }
          >
            {"\u2605"}
          </button>
        ))}
      </div>
    );
  }

  if (completedBookings.length === 0) return null;

  return (
    <section className="bg-surface border border-line rounded-2xl p-6">
      <h3 className="font-medium mb-3 text-ink">{t("booking.reviewsTitle")}</h3>
      {statusMsg && (
        <div
          role="status"
          className={
            statusMsg.type === "success"
              ? "mb-4 text-sm text-green-700 bg-green-50 border border-green-200 rounded p-3"
              : "mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3"
          }
        >
          {statusMsg.key ? t(statusMsg.key, statusMsg.params) : statusMsg.raw}
        </div>
      )}
      <ul className="divide-y divide-line">
        {completedBookings.map((booking) => {
          const review = reviewFor(booking.id);
          return (
            <li key={booking.id} className="py-3 text-sm">
              <p className="font-medium mb-1">
                {booking.service_name}
                {" \u00b7 "}
                {new Date(booking.start_time).toLocaleDateString()}
              </p>
              {!review && (
                <div className="border border-line rounded-lg p-3">
                  <p className="text-xs text-ink-soft mb-1">
                    {t("booking.yourRating")}
                  </p>
                  <StarPicker
                    value={draftRating[booking.id] || 0}
                    onChange={(n) =>
                      setDraftRating({ ...draftRating, [booking.id]: n })
                    }
                  />
                  <label
                    htmlFor={`review-comment-${booking.id}`}
                    className="sr-only"
                  >
                    {t("booking.commentOptional")}
                  </label>
                  <textarea
                    id={`review-comment-${booking.id}`}
                    placeholder={t("booking.commentOptional")}
                    value={draftComment[booking.id] || ""}
                    onChange={(e) =>
                      setDraftComment({
                        ...draftComment,
                        [booking.id]: e.target.value,
                      })
                    }
                    rows={2}
                    className="w-full mt-2 mb-2 px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
                  />
                  <button
                    onClick={() => submitReview(booking.id)}
                    aria-label={t("booking.leaveReview")}
                    className="bg-brand-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400"
                  >
                    {t("booking.leaveReview")}
                  </button>
                </div>
              )}
              {review && editingId !== review.id && (
                <div className="border border-line rounded-lg p-3">
                  <div className="flex text-yellow-500 mb-1">
                    {"\u2605".repeat(review.rating)}
                    <span className="text-ink-soft">
                      {"\u2605".repeat(5 - review.rating)}
                    </span>
                  </div>
                  {review.comment && (
                    <p className="text-ink-soft mb-2">{review.comment}</p>
                  )}
                  {review.owner_response && (
                    <p className="text-xs bg-brand-50 rounded p-2 mb-2">
                      <span className="font-medium">
                        {t("booking.ownerResponse")}:
                      </span>{" "}
                      {review.owner_response}
                    </p>
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={() => startEdit(review)}
                      aria-label={t("booking.editReview")}
                      className="bg-brand-50 text-brand-700 text-xs px-2.5 py-1 rounded-lg font-medium transition-colors hover:bg-brand-100 focus:outline-none focus:ring-2 focus:ring-brand-400"
                    >
                      <FiEdit2 className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
                      {t("booking.editReview")}
                    </button>
                    <button
                      onClick={() => deleteReview(review.id)}
                      aria-label={t("booking.deleteReview")}
                      className="bg-red-600 text-white text-xs px-2.5 py-1 rounded-lg font-medium transition-colors hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-400"
                    >
                      <FiTrash2 className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
                      {t("booking.deleteReview")}
                    </button>
                  </div>
                </div>
              )}
              {review && editingId === review.id && (
                <div className="border border-brand-200 rounded-lg p-3">
                  <p className="text-xs text-ink-soft mb-1">
                    {t("booking.yourRating")}
                  </p>
                  <StarPicker value={editRating} onChange={setEditRating} />
                  <label
                    htmlFor={`edit-review-comment-${review.id}`}
                    className="sr-only"
                  >
                    {t("booking.commentOptional")}
                  </label>
                  <textarea
                    id={`edit-review-comment-${review.id}`}
                    value={editComment}
                    onChange={(e) => setEditComment(e.target.value)}
                    rows={2}
                    className="w-full mt-2 mb-2 px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => saveEdit(review.id)}
                      aria-label={t("booking.save")}
                      className="bg-brand-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400"
                    >
                      <FiCheck className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
                      {t("booking.save")}
                    </button>
                    <button
                      onClick={cancelEdit}
                      aria-label={t("booking.cancel")}
                      className="bg-surface-2 text-ink-soft px-3 py-1.5 rounded-lg text-sm font-medium transition-colors hover:bg-line focus:outline-none focus:ring-2 focus:ring-brand-400"
                    >
                      <FiX className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
                      {t("booking.cancel")}
                    </button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
