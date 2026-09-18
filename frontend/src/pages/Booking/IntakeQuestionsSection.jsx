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

// Lets the owner attach custom intake questions to a service
// (BOOK-69) - a client or guest answers them while booking
// (BOOK-70, see ServicesSection's service.questions and the answer
// fields in ClientPortal.jsx/PublicBooking.jsx) and the owner
// reviews the answers from the booking list (BOOK-71).
export default function IntakeQuestionsSection() {
  const { t } = useTranslation();
  const [services, setServices] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [serviceId, setServiceId] = useState("");
  const [text, setText] = useState("");
  const [questionType, setQuestionType] = useState("text");
  const [choices, setChoices] = useState("");
  const [required, setRequired] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editServiceId, setEditServiceId] = useState("");
  const [editText, setEditText] = useState("");
  const [editQuestionType, setEditQuestionType] = useState("text");
  const [editChoices, setEditChoices] = useState("");
  const [editRequired, setEditRequired] = useState(true);
  const [statusMsg, setStatusMsg] = useState(null);

  async function load() {
    const res = await api.get("/service-questions/");
    setQuestions(res.data);
  }
  async function loadServices() {
    const res = await api.get("/services/");
    setServices(res.data);
  }
  useEffect(() => {
    load();
    loadServices();
  }, []);

  function serviceName(id) {
    return services.find((s) => s.id === id)?.name || "";
  }

  async function onCreate(e) {
    e.preventDefault();
    await api.post("/service-questions/", {
      service: serviceId,
      text,
      question_type: questionType,
      choices: questionType === "choice" ? choices : "",
      required,
    });
    setShowForm(false);
    setServiceId("");
    setText("");
    setQuestionType("text");
    setChoices("");
    setRequired(true);
    setStatusMsg({ key: "booking.intakeQuestionAdded", type: "success" });
    load();
  }

  function startEdit(question) {
    setEditingId(question.id);
    setEditServiceId(String(question.service));
    setEditText(question.text);
    setEditQuestionType(question.question_type);
    setEditChoices(question.choices);
    setEditRequired(question.required);
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function saveEdit(questionId) {
    await api.patch(`/service-questions/${questionId}/`, {
      service: editServiceId,
      text: editText,
      question_type: editQuestionType,
      choices: editQuestionType === "choice" ? editChoices : "",
      required: editRequired,
    });
    setEditingId(null);
    setStatusMsg({ key: "booking.intakeQuestionUpdated", type: "success" });
    load();
  }

  async function deleteQuestion(questionId) {
    if (!window.confirm(t("booking.confirmRemoveIntakeQuestion"))) return;
    await api.delete(`/service-questions/${questionId}/`);
    setStatusMsg({ key: "booking.intakeQuestionRemoved", type: "error" });
    load();
  }

  return (
    <section className="bg-surface border border-line rounded-2xl p-6">
      <div className="flex justify-between items-center mb-3">
        <h2 className="font-medium text-ink">{t("booking.intakeQuestionsTitle")}</h2>
        <button
          onClick={() => {
            setShowForm(!showForm);
            setStatusMsg(null);
          }}
          aria-expanded={showForm}
          aria-label={t("booking.addIntakeQuestion")}
          className="text-sm text-brand-700 transition-colors hover:text-brand-800 focus:outline-none focus:ring-2 focus:ring-brand-400 rounded"
        >
          <FiPlus className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
          {t("booking.addIntakeQuestion")}
        </button>
      </div>

      {statusMsg && (
        <div
          role="status"
          className={
            statusMsg.type === "success"
              ? "mb-4 text-sm text-green-700 bg-green-50 border border-green-200 rounded p-3"
              : "mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3"
          }
        >
          {t(statusMsg.key)}
        </div>
      )}

      {showForm && (
        <form
          onSubmit={onCreate}
          className="border border-line rounded-lg p-4 mb-4 flex flex-wrap gap-2 items-end"
        >
          <div>
            <label htmlFor="iq-service" className="block text-xs text-ink-soft mb-1">
              {t("booking.selectService")}
            </label>
            <select
              id="iq-service"
              required
              value={serviceId}
              onChange={(e) => setServiceId(e.target.value)}
              className="px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400"
            >
              <option value="" disabled>
                {t("booking.selectService")}
              </option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="iq-text" className="block text-xs text-ink-soft mb-1">
              {t("booking.intakeQuestionText")}
            </label>
            <input
              id="iq-text"
              required
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
            />
          </div>
          <div>
            <label htmlFor="iq-type" className="block text-xs text-ink-soft mb-1">
              {t("booking.intakeQuestionType")}
            </label>
            <select
              id="iq-type"
              value={questionType}
              onChange={(e) => setQuestionType(e.target.value)}
              className="px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400"
            >
              <option value="text">{t("booking.intakeTypeText")}</option>
              <option value="choice">{t("booking.intakeTypeChoice")}</option>
            </select>
          </div>
          {questionType === "choice" && (
            <div>
              <label htmlFor="iq-choices" className="block text-xs text-ink-soft mb-1">
                {t("booking.intakeQuestionChoices")}
              </label>
              <input
                id="iq-choices"
                required
                placeholder={t("booking.intakeQuestionChoicesPlaceholder")}
                value={choices}
                onChange={(e) => setChoices(e.target.value)}
                className="w-56 px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
              />
            </div>
          )}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={required}
              onChange={(e) => setRequired(e.target.checked)}
              className="cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-400 rounded"
            />
            <span className="text-sm text-ink">{t("booking.intakeQuestionRequired")}</span>
          </label>
          <button
            type="submit"
            className="bg-brand-600-solid text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400"
          >
            {t("booking.saveIntakeQuestion")}
          </button>
        </form>
      )}

      <ul className="space-y-3">
        {questions.map((question) => (
          <li key={question.id} className="border border-line rounded-lg p-3 text-sm">
            {editingId === question.id ? (
              <div className="flex flex-wrap gap-2 items-end">
                <select
                  value={editServiceId}
                  onChange={(e) => setEditServiceId(e.target.value)}
                  aria-label={t("booking.selectService")}
                  className="px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400"
                >
                  {services.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <input
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  aria-label={t("booking.intakeQuestionText")}
                  className="px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
                />
                <select
                  value={editQuestionType}
                  onChange={(e) => setEditQuestionType(e.target.value)}
                  aria-label={t("booking.intakeQuestionType")}
                  className="px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400"
                >
                  <option value="text">{t("booking.intakeTypeText")}</option>
                  <option value="choice">{t("booking.intakeTypeChoice")}</option>
                </select>
                {editQuestionType === "choice" && (
                  <input
                    value={editChoices}
                    onChange={(e) => setEditChoices(e.target.value)}
                    aria-label={t("booking.intakeQuestionChoices")}
                    placeholder={t("booking.intakeQuestionChoicesPlaceholder")}
                    className="w-56 px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
                  />
                )}
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editRequired}
                    onChange={(e) => setEditRequired(e.target.checked)}
                    className="cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-400 rounded"
                  />
                  <span className="text-sm text-ink">{t("booking.intakeQuestionRequired")}</span>
                </label>
                <button
                  onClick={() => saveEdit(question.id)}
                  aria-label={t("booking.save")}
                  className="bg-brand-600-solid text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400"
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
            ) : (
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
                <span>
                  <span className="text-ink-soft">{serviceName(question.service)}</span>
                  {" · "}
                  {question.text}
                  {question.required && (
                    <span className="text-ink-soft"> ({t("booking.intakeQuestionRequired")})</span>
                  )}
                </span>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => startEdit(question)}
                    aria-label={`${t("booking.edit")} - ${question.text}`}
                    className="bg-brand-50 text-brand-700 text-sm px-3 py-1.5 rounded-lg font-medium transition-colors hover:bg-brand-100 focus:outline-none focus:ring-2 focus:ring-brand-400"
                  >
                    <FiEdit2 className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
                    {t("booking.edit")}
                  </button>
                  <button
                    onClick={() => deleteQuestion(question.id)}
                    aria-label={t("booking.remove")}
                    className="text-white text-sm bg-red-600 px-3 py-1.5 rounded-lg font-medium transition-colors hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-400"
                  >
                    <FiTrash2 className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
                    {t("booking.remove")}
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
        {questions.length === 0 && (
          <p className="text-ink-soft text-sm">{t("booking.noIntakeQuestions")}</p>
        )}
      </ul>
    </section>
  );
}

