// Converts a workspace's brand_color (e.g. "#e11d48") into the
// --brand-rgb CSS variable that index.css's @theme palette is
// built from, so every bg-brand-*/text-brand-*/border-brand-*
// class across the app re-tints to match, with no per-component
// changes needed.

function relativeLuminance([r, g, b]) {
  const chan = (c) => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b);
}

function contrastWithWhite(rgb) {
  return (1.05) / (relativeLuminance(rgb) + 0.05);
}

// bg-brand-600-solid is used as a solid button background with
// white text across the app (see landing/login CTAs). An owner-
// chosen brand_color (BRAND-01) is otherwise unconstrained, so a
// light pick like a pale yellow would make those buttons' text
// fail WCAG AA (4.5:1) - or be unreadable outright. Rather than
// reject the owner's color choice, darken it just enough to stay
// accessible, preserving hue/saturation so it still reads as
// "their" color.
function ensureAccessibleOnWhite([r, g, b]) {
  if (contrastWithWhite([r, g, b]) >= 4.5) return [r, g, b];

  // Binary-search the HSL lightness that hits ~4.5:1, rather than
  // stepping down by fixed increments - a few iterations converge
  // tightly regardless of how light the starting color is.
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d !== 0) {
    const rn = r / 255, gn = g / 255, bn = b / 255;
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }

  const hslToRgb = (lightness) => {
    const c = (1 - Math.abs(2 * lightness - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = lightness - c / 2;
    let rp, gp, bp;
    if (h < 60) [rp, gp, bp] = [c, x, 0];
    else if (h < 120) [rp, gp, bp] = [x, c, 0];
    else if (h < 180) [rp, gp, bp] = [0, c, x];
    else if (h < 240) [rp, gp, bp] = [0, x, c];
    else if (h < 300) [rp, gp, bp] = [x, 0, c];
    else [rp, gp, bp] = [c, 0, x];
    return [rp, gp, bp].map((v) => Math.round((v + m) * 255));
  };

  let lo = 0, hi = l;
  let best = [0, 0, 0]; // black always passes (contrast 21:1)
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    const candidate = hslToRgb(mid);
    if (contrastWithWhite(candidate) >= 4.5) {
      best = candidate;
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return best;
}

export default function applyBrandColor(hex) {
  if (!hex || !/^#[0-9A-Fa-f]{6}$/.test(hex)) return;
  const rgb = [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
  const style = document.documentElement.style;
  // Raw color: backs text-brand-600/border-brand-600, which sit on
  // the current theme's own canvas rather than under white text, so
  // it's left unclamped (see index.css's --brand-rgb comment).
  style.setProperty("--brand-rgb", rgb.join(" "));
  // Clamped darker just enough for white text on a bg-brand-600-
  // solid button to clear WCAG AA, whatever color the owner picked.
  style.setProperty("--brand-solid-rgb", ensureAccessibleOnWhite(rgb).join(" "));
}
