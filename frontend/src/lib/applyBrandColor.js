// Converts a workspace's brand_color (e.g. "#e11d48") into the
// --brand-rgb CSS variable that index.css's @theme palette is
// built from, so every bg-brand-*/text-brand-*/border-brand-*
// class across the app re-tints to match, with no per-component
// changes needed.
export default function applyBrandColor(hex) {
  if (!hex || !/^#[0-9A-Fa-f]{6}$/.test(hex)) return;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  document.documentElement.style.setProperty("--brand-rgb", `${r}, ${g}, ${b}`);
}
