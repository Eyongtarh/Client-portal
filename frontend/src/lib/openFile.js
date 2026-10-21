// Opens a file fetched as a blob. Uploaded files are untrusted: a blob
// URL runs in this app's own origin, so an uploaded HTML or SVG file
// opened in a tab could read the stored login tokens. Only types that
// cannot run script are shown inline, and the blob is re-typed to the
// safe type so the server's claim is never trusted. Everything else is
// saved as a download instead.
const INLINE_SAFE_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "text/plain",
];

export function openFileBlob(blob, filename = "download") {
  const type = (blob.type || "").split(";")[0].trim().toLowerCase();
  const url = URL.createObjectURL(
    INLINE_SAFE_TYPES.includes(type) ? new Blob([blob], { type }) : blob,
  );
  if (INLINE_SAFE_TYPES.includes(type)) {
    window.open(url, "_blank", "noopener");
  } else {
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
