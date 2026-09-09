// Workspace-wide search (owner/staff only): debounced query against
// /search/, results grouped by type in a dropdown. Every result
// links to the client-detail page (the only place in the app that
// shows a project's tasks/documents/messages/invoices together) -
// there's no dedicated project or booking detail route to deep-link
// into instead.
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import api from "../lib/api";

export default function SearchBar() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults(null);
      return;
    }
    const handle = setTimeout(() => {
      api.get("/search/", { params: { q: query.trim() } }).then((res) => {
        setResults(res.data);
        setOpen(true);
      });
    }, 300);
    return () => clearTimeout(handle);
  }, [query]);

  useEffect(() => {
    function onClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function goToClient(clientId) {
    setOpen(false);
    setQuery("");
    navigate(`/clients/${clientId}`);
  }

  const hasResults =
    results &&
    Object.values(results).some((group) => group.length > 0);

  return (
    <div ref={containerRef} className="relative w-full max-w-xs">
      <label htmlFor="workspace-search" className="sr-only">
        {t("search.placeholder")}
      </label>
      <input
        id="workspace-search"
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => results && setOpen(true)}
        placeholder={t("search.placeholder")}
        className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
      />
      {open && results && (
        <div className="absolute z-10 mt-1 w-full bg-white border border-brand-100 rounded-lg shadow-lg max-h-96 overflow-y-auto">
          {!hasResults && (
            <p className="text-sm text-gray-500 p-3">{t("search.noResults")}</p>
          )}
          {results.clients.length > 0 && (
            <ResultGroup title={t("search.clients")}>
              {results.clients.map((c) => (
                <ResultRow
                  key={`client-${c.id}`}
                  onClick={() => goToClient(c.id)}
                  primary={c.company_name}
                  secondary={c.contact_email}
                />
              ))}
            </ResultGroup>
          )}
          {results.projects.length > 0 && (
            <ResultGroup title={t("search.projects")}>
              {results.projects.map((p) => (
                <ResultRow
                  key={`project-${p.id}`}
                  onClick={() => goToClient(p.client_id)}
                  primary={p.name}
                  secondary={p.client_name}
                />
              ))}
            </ResultGroup>
          )}
          {results.bookings.length > 0 && (
            <ResultGroup title={t("search.bookings")}>
              {results.bookings.map((b) => (
                <ResultRow
                  key={`booking-${b.id}`}
                  onClick={() => goToClient(b.client_id)}
                  primary={b.label}
                  secondary={`${b.client_name} · ${new Date(b.start_time).toLocaleString()}`}
                />
              ))}
            </ResultGroup>
          )}
          {results.documents.length > 0 && (
            <ResultGroup title={t("search.documents")}>
              {results.documents.map((d) => (
                <ResultRow
                  key={`document-${d.id}`}
                  onClick={() => goToClient(d.client_id)}
                  primary={d.original_name}
                />
              ))}
            </ResultGroup>
          )}
          {results.invoices.length > 0 && (
            <ResultGroup title={t("search.invoices")}>
              {results.invoices.map((i) => (
                <ResultRow
                  key={`invoice-${i.id}`}
                  onClick={() => goToClient(i.client_id)}
                  primary={`#${i.number}`}
                  secondary={i.status}
                />
              ))}
            </ResultGroup>
          )}
          {results.messages.length > 0 && (
            <ResultGroup title={t("search.messages")}>
              {results.messages.map((m) => (
                <ResultRow
                  key={`message-${m.id}`}
                  onClick={() => goToClient(m.client_id)}
                  primary={m.body}
                />
              ))}
            </ResultGroup>
          )}
        </div>
      )}
    </div>
  );
}

function ResultGroup({ title, children }) {
  return (
    <div className="border-b border-gray-100 last:border-b-0">
      <p className="text-xs font-medium text-gray-400 px-3 pt-2">{title}</p>
      <ul>{children}</ul>
    </div>
  );
}

function ResultRow({ onClick, primary, secondary }) {
  return (
    <li>
      <button
        onClick={onClick}
        className="w-full text-left px-3 py-2 text-sm hover:bg-brand-50 transition-colors focus:outline-none focus:bg-brand-50"
      >
        <span className="block truncate">{primary}</span>
        {secondary && (
          <span className="block text-xs text-gray-400 truncate">
            {secondary}
          </span>
        )}
      </button>
    </li>
  );
}
