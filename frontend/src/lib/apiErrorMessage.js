// Turns a failed API request into one readable sentence. DRF returns
// errors as {detail}, {field: [msgs]}, a bare list, or a plain string;
// anything else falls back to a generic message by status.
export function apiErrorMessage(error, t) {
  const status = error?.response?.status;
  const data = error?.response?.data;

  const first = (value) => {
    if (!value) return null;
    if (typeof value === "string") return value;
    if (Array.isArray(value)) return first(value[0]);
    if (typeof value === "object") {
      if (value.detail) return first(value.detail);
      for (const key of Object.keys(value)) {
        const found = first(value[key]);
        if (found) return found;
      }
    }
    return null;
  };

  if (status === 429) return t("errors.tooManyRequests");
  if (!error?.response) return t("errors.network");
  if (status >= 500) return t("errors.server");
  if (status === 403) return first(data) || t("errors.forbidden");
  return first(data) || t("errors.generic");
}
