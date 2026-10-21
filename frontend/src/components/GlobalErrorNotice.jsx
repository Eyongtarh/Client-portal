// A save, delete or send handler that has no try/catch of its own used
// to fail silently: the request was rejected (a validation error, a plan
// limit, a rate limit) and nothing on screen changed. Those rejections
// surface here as "unhandledrejection", so every one of them gets a
// readable message. A handler that does catch its own error never
// reaches this, so nothing is shown twice.
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiErrorMessage } from "../lib/apiErrorMessage";

export default function GlobalErrorNotice() {
  const { t } = useTranslation();
  const [message, setMessage] = useState("");
  const timer = useRef(null);

  useEffect(() => {
    function onRejection(event) {
      const error = event.reason;
      if (!error?.isAxiosError) return;
      event.preventDefault();
      setMessage(apiErrorMessage(error, t));
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setMessage(""), 7000);
    }
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("unhandledrejection", onRejection);
      clearTimeout(timer.current);
    };
  }, [t]);

  if (!message) return null;
  return (
    <div
      role="alert"
      className="fixed bottom-4 left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 shadow-lg dark:border-red-800 dark:bg-red-950 dark:text-red-200"
    >
      <div className="flex items-start justify-between gap-3">
        <span>{message}</span>
        <button
          type="button"
          onClick={() => setMessage("")}
          className="shrink-0 font-medium underline focus:outline-none focus:ring-2 focus:ring-red-400 rounded"
        >
          {t("errors.dismiss")}
        </button>
      </div>
    </div>
  );
}
