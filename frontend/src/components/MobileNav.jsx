// Wraps a header's secondary controls (search, nav links, theme/
// language toggles, sign out) so they collapse behind a hamburger
// button below the md breakpoint instead of overflowing or getting
// squeezed by flexbox (see the LanguageToggle clipping bug this
// exact problem caused on desktop already). Renders the children
// ONCE - only the container's layout changes between a horizontal
// row (desktop) and a slide-down panel (mobile, toggled open/
// closed), so toggle components never end up duplicated with
// independent local state.
import { useState } from "react";

export default function MobileNav({ children }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="md:contents">
      <button
        onClick={() => setOpen(!open)}
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        className="md:hidden inline-flex items-center justify-center w-9 h-9 rounded-lg border border-line text-ink-soft transition-colors hover:bg-surface-2 focus:outline-none focus:ring-2 focus:ring-brand-400"
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
      <div
        className={
          (open ? "flex" : "hidden") +
          " md:flex flex-col md:flex-row items-stretch md:items-center gap-3 md:gap-4" +
          " absolute md:static top-full inset-x-0 md:inset-auto" +
          " bg-surface md:bg-transparent shadow-lg md:shadow-none" +
          " border-t border-line md:border-0" +
          " p-4 md:p-0 z-20"
        }
      >
        {children}
      </div>
    </div>
  );
}
