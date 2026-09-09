// The Clientflow icon mark (from src/assets/logo-mark.svg, derived
// from the provided brand lockup with the wordmark and background
// stripped out). Used as a standalone icon next to the live,
// theme-aware "Clientflow" text rather than baking the wordmark
// into the image - the source lockup's wordmark is white-on-dark
// only, which would be unreadable on a light-theme header.
import logoMark from "../assets/logo-mark.svg";

export default function LogoMark({ className = "w-8 h-8" }) {
  return <img src={logoMark} alt="" aria-hidden="true" className={className} />;
}
