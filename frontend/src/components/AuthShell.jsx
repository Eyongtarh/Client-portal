// Shared shell for every auth page (login, register, forgot/reset
// password): centered card over an ambient gradient, with the
// theme/language toggles and a link back home. Login/Register/
// ForgotPassword/ResetPassword only ever differed in their form
// content, not this surrounding chrome, so keeping it here means
// the four pages can never visually drift apart.
import { Link } from "react-router-dom";
import LanguageToggle from "./LanguageToggle.jsx";
import ThemeToggle from "./ThemeToggle.jsx";

export default function AuthShell({ children }) {
  return (
    <div className="relative isolate min-h-screen flex flex-col items-center justify-center overflow-hidden bg-canvas text-ink px-4 py-12">
      <div
        aria-hidden="true"
        className="aurora-bg pointer-events-none absolute inset-0 -z-10"
      />
      <div className="absolute top-4 right-4 flex items-center gap-3">
        <ThemeToggle />
        <LanguageToggle />
      </div>
      <Link
        to="/"
        aria-label="Clientflow home"
        className="animate-rise mb-8 text-lg font-semibold tracking-tight text-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400 rounded"
      >
        Clientflow
      </Link>
      <div
        className="animate-rise w-full max-w-sm"
        style={{ animationDelay: "0.06s" }}
      >
        {children}
      </div>
    </div>
  );
}
