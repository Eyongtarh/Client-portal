import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  FiCheck,
  FiEdit2,
  FiPlus,
  FiTrash2,
  FiX,
} from "react-icons/fi";
import api from "../../lib/api";

export default function PaymentMethodsSection() {
  const { t } = useTranslation();
  const [methods, setMethods] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [accountDetails, setAccountDetails] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editAccountDetails, setEditAccountDetails] = useState("");
  const [statusMsg, setStatusMsg] = useState(null);

  async function load() {
    const res = await api.get("/payment-methods/");
    setMethods(res.data);
  }
  useEffect(() => {
    load();
  }, []);

  async function onCreate(e) {
    e.preventDefault();
    try {
      await api.post("/payment-methods/", {
        name,
        account_details: accountDetails,
      });
      setName("");
      setAccountDetails("");
      setShowForm(false);
      setStatusMsg({ key: "booking.paymentMethodAdded", type: "success" });
      load();
    } catch {
      setStatusMsg({
        key: "booking.couldNotAddPaymentMethod",
        type: "error",
      });
    }
  }

  function startEdit(method) {
    setEditingId(method.id);
    setEditName(method.name);
    setEditAccountDetails(method.account_details);
  }
  function cancelEdit() {
    setEditingId(null);
  }
  async function saveEdit(methodId) {
    try {
      await api.patch(`/payment-methods/${methodId}/`, {
        name: editName,
        account_details: editAccountDetails,
      });
      setEditingId(null);
      setStatusMsg({
        key: "booking.paymentMethodUpdated",
        type: "success",
      });
      load();
    } catch {
      setStatusMsg({
        key: "booking.couldNotUpdatePaymentMethod",
        type: "error",
      });
    }
  }

  async function deletePaymentMethod(methodId) {
    if (!window.confirm(t("booking.confirmDeletePaymentMethod"))) return;
    try {
      await api.delete(`/payment-methods/${methodId}/`);
      setStatusMsg({ key: "booking.paymentMethodDeleted", type: "error" });
      load();
    } catch {
      setStatusMsg({
        key: "booking.couldNotDeletePaymentMethod",
        type: "error",
      });
    }
  }

  return (
    <div className="mt-4 pt-4 border-t border-line">
      <div className="flex justify-between items-center mb-2">
        <h4 className="text-sm font-medium">
          {t("booking.manualPaymentMethods")}
        </h4>
        <button
          onClick={() => {
            setShowForm(!showForm);
            setStatusMsg(null);
          }}
          aria-expanded={showForm}
          className="text-sm text-brand-700 transition-colors hover:text-brand-800 focus:outline-none focus:ring-2 focus:ring-brand-400 rounded"
        >
          <FiPlus className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
          {t("booking.addPaymentMethod")}
        </button>
      </div>
      <p className="text-xs text-ink-soft mb-3">
        {t("booking.manualPaymentMethodsHint")}
      </p>

      {statusMsg && (
        <div
          role="status"
          className={
            statusMsg.type === "success"
              ? "mb-3 text-sm text-green-700 bg-green-50 border border-green-200 rounded p-3"
              : "mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3"
          }
        >
          {t(statusMsg.key)}
        </div>
      )}

      {showForm && (
        <form
          onSubmit={onCreate}
          className="border border-line rounded-lg p-3 mb-3 space-y-2"
        >
          <label htmlFor="pm-name" className="sr-only">
            {t("booking.paymentMethodName")}
          </label>
          <input
            id="pm-name"
            required
            placeholder={t("booking.paymentMethodNamePlaceholder")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
          />
          <label htmlFor="pm-details" className="sr-only">
            {t("booking.paymentMethodDetails")}
          </label>
          <textarea
            id="pm-details"
            required
            rows={2}
            placeholder={t("booking.paymentMethodDetailsPlaceholder")}
            value={accountDetails}
            onChange={(e) => setAccountDetails(e.target.value)}
            className="w-full px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
          />
          <button
            type="submit"
            className="bg-brand-600-solid text-white text-sm px-3 py-1.5 rounded-lg font-medium transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400"
          >
            <FiCheck className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
            {t("booking.save")}
          </button>
        </form>
      )}

      <ul className="divide-y divide-line">
        {methods.map((method) =>
          editingId === method.id ? (
            <li key={method.id} className="py-2 space-y-2">
              <label htmlFor={`edit-pm-name-${method.id}`} className="sr-only">
                {t("booking.paymentMethodName")}
              </label>
              <input
                id={`edit-pm-name-${method.id}`}
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
              />
              <label
                htmlFor={`edit-pm-details-${method.id}`}
                className="sr-only"
              >
                {t("booking.paymentMethodDetails")}
              </label>
              <textarea
                id={`edit-pm-details-${method.id}`}
                rows={2}
                value={editAccountDetails}
                onChange={(e) => setEditAccountDetails(e.target.value)}
                className="w-full px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => saveEdit(method.id)}
                  className="bg-brand-600-solid text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400"
                >
                  <FiCheck className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
                  {t("booking.save")}
                </button>
                <button
                  onClick={cancelEdit}
                  className="bg-surface-2 text-ink-soft px-3 py-1.5 rounded-lg text-sm font-medium transition-colors hover:bg-line focus:outline-none focus:ring-2 focus:ring-brand-400"
                >
                  <FiX className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
                  {t("booking.cancel")}
                </button>
              </div>
            </li>
          ) : (
            <li
              key={method.id}
              className="py-2 flex justify-between items-start gap-3"
            >
              <div>
                <p className="text-sm font-medium">{method.name}</p>
                <p className="text-xs text-ink-soft whitespace-pre-wrap">
                  {method.account_details}
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => startEdit(method)}
                  aria-label={`${t("booking.edit")} ${method.name}`}
                  className="bg-brand-50 text-brand-700 text-xs px-2.5 py-1 rounded-lg font-medium transition-colors hover:bg-brand-100 focus:outline-none focus:ring-2 focus:ring-brand-400"
                >
                  <FiEdit2 className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
                  {t("booking.edit")}
                </button>
                <button
                  onClick={() => deletePaymentMethod(method.id)}
                  aria-label={`${t("booking.remove")} ${method.name}`}
                  className="text-white text-xs bg-red-600 px-2.5 py-1 rounded-lg font-medium transition-colors hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-400"
                >
                  <FiTrash2 className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
                  {t("booking.remove")}
                </button>
              </div>
            </li>
          ),
        )}
        {methods.length === 0 && !showForm && (
          <p className="text-ink-soft text-sm">
            {t("booking.noPaymentMethods")}
          </p>
        )}
      </ul>
    </div>
  );
}

