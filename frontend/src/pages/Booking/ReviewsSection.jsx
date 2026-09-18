import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  FiCheck,
  FiMessageCircle,
  FiTrash2,
  FiX,
} from "react-icons/fi";
import api from "../../lib/api";

export default function ReviewsSection() {
  const { t } = useTranslation();
  const [reviews, setReviews] = useState([]);
  const [statusMsg, setStatusMsg] = useState(null);
  const [respondingId, setRespondingId] = useState(null);
  const [responseText, setResponseText] = useState("");

  async function load() {
    const res = await api.get("/reviews/");
    setReviews(res.data);
  }
  useEffect(() => {
    load();
  }, []);

  function startRespond(review) {
    setRespondingId(review.id);
    setResponseText(review.owner_response || "");
  }

  function cancelRespond() {
    setRespondingId(null);
  }

  async function submitResponse(reviewId) {
    await api.post(`/reviews/${reviewId}/respond/`, {
      owner_response: responseText,
    });
    setRespondingId(null);
    setStatusMsg({ key: "booking.responseSubmitted", type: "success" });
    load();
  }

  async function deleteReview(reviewId) {
    if (!window.confirm(t("booking.confirmDeleteReview"))) return;
    await api.delete(`/reviews/${reviewId}/`);
    setStatusMsg({ key: "booking.reviewDeleted", type: "error" });
    load();
  }

  const averageRating =
    reviews.length > 0
      ? (
          reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
        ).toFixed(1)
      : null;

  return (
    <section className="bg-surface border border-line rounded-2xl p-6">
      <div className="flex justify-between items-center mb-3">
        <h2 className="font-medium text-ink">{t("booking.reviewsTitle")}</h2>
        {averageRating && (
          <span className="text-sm text-ink-soft">
            {t("booking.averageRating")}: {averageRating} {"\u2605"} (
            {reviews.length})
          </span>
        )}
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
          {statusMsg.key ? t(statusMsg.key, statusMsg.params) : statusMsg.raw}
        </div>
      )}
      <ul className="divide-y divide-line">
        {reviews.map((review) => (
          <li key={review.id} className="py-3 text-sm">
            <p className="font-medium mb-1">
              {review.service_name} {"\u00b7"} {review.client_name}
            </p>
            <div className="flex text-yellow-500 mb-1">
              {"\u2605".repeat(review.rating)}
              <span className="text-ink-soft">
                {"\u2605".repeat(5 - review.rating)}
              </span>
            </div>
            {review.comment && (
              <p className="text-ink-soft mb-2">{review.comment}</p>
            )}
            {review.owner_response && respondingId !== review.id && (
              <p className="text-xs bg-brand-50 rounded p-2 mb-2">
                <span className="font-medium">
                  {t("booking.ownerResponse")}:
                </span>{" "}
                {review.owner_response}
              </p>
            )}
            {respondingId === review.id ? (
              <div className="border border-brand-200 rounded-lg p-3">
                <label htmlFor={`respond-${review.id}`} className="sr-only">
                  {t("booking.respondToReview")}
                </label>
                <textarea
                  id={`respond-${review.id}`}
                  value={responseText}
                  onChange={(e) => setResponseText(e.target.value)}
                  rows={2}
                  className="w-full mb-2 px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => submitResponse(review.id)}
                    aria-label={t("booking.save")}
                    className="bg-brand-600-solid text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400"
                  >
                    <FiCheck className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
                    {t("booking.save")}
                  </button>
                  <button
                    onClick={cancelRespond}
                    aria-label={t("booking.cancel")}
                    className="bg-surface-2 text-ink-soft px-3 py-1.5 rounded-lg text-sm font-medium transition-colors hover:bg-line focus:outline-none focus:ring-2 focus:ring-brand-400"
                  >
                    <FiX className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
                    {t("booking.cancel")}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={() => startRespond(review)}
                  aria-label={t("booking.respond")}
                  className="bg-brand-50 text-brand-700 text-xs px-2.5 py-1 rounded-lg font-medium transition-colors hover:bg-brand-100 focus:outline-none focus:ring-2 focus:ring-brand-400"
                >
                  <FiMessageCircle className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
                  {t("booking.respond")}
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
            )}
          </li>
        ))}
        {reviews.length === 0 && (
          <p className="text-ink-soft text-sm">{t("booking.noReviewsYet")}</p>
        )}
      </ul>
    </section>
  );
}

