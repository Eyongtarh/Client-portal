// Wraps a header's secondary controls (search, nav links, theme/
// language toggles, sign out) so they collapse behind a hamburger
// button below the md breakpoint instead of overflowing or getting
// squeezed by flexbox (see the LanguageToggle clipping bug this
// exact problem caused on desktop already). Renders the children
// ONCE - only the container's layout changes between a horizontal
// row (desktop) and a slide-down panel (mobile, toggled open/
// closed), so toggle components never end up duplicated with
// independent local state.
import { useEffect, useRef, useState } from "react";

export default function MobileNav({ children }) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef(null);

  // Closing via Escape is expected keyboard behavior for any
  // dismissible overlay (WAI-ARIA disclosure pattern), and returning
  // focus to the trigger afterwards keeps keyboard users oriented
  // instead of dropping them at the top of the document.
  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  return (
    <div className="md:contents">
      <button
        ref={buttonRef}
        onClick={() => setOpen(!open)}
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        className="md:hidden relative z-20 inline-flex items-center justify-center w-9 h-9 rounded-lg border border-line text-ink-soft transition-colors hover:bg-surface-2 focus:outline-none focus:ring-2 focus:ring-brand-400"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {open ? (
            <path d="M6 6l12 12M18 6L6 18" />
          ) : (
            <path d="M4 7h16M4 12h16M4 17h16" />
          )}
        </svg>
      </button>

      {/* Dims and separates the page behind the open panel - also
          the main way to close it besides the buttons themselves,
          since a stray tap outside a mobile menu should dismiss it. */}
      {open && (
        <div
          aria-hidden="true"
          onClick={() => setOpen(false)}
          className="md:hidden fixed inset-0 bg-black/40 z-10"
        />
      )}

      <div
        className={
          (open ? "flex" : "hidden") +
          " md:flex flex-col md:flex-row items-center gap-4" +
          " absolute md:static top-full inset-x-0 md:inset-auto" +
          " bg-surface md:bg-transparent shadow-xl md:shadow-none" +
          " border-t border-line md:border-0" +
          " py-5 px-6 md:p-0 z-20"
        }
      >
        {children}
      </div>
    </div>
  );
}
