// applyBrandColor backs BRAND-01: an owner can pick any brand
// colour, but bg-brand-600-solid is used as a solid button
// background with white text across the app, so a light pick (pale
// yellow, etc.) must still be darkened enough to clear WCAG AA
// (4.5:1) for that white text. These tests check the actual
// contrast ratio the function produces, against the same formula
// WCAG defines, not against the implementation's own working.
import applyBrandColor from "./applyBrandColor.js";

function relativeLuminance([r, g, b]) {
  const chan = (c) => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b);
}

function contrastWithWhite(rgb) {
  return 1.05 / (relativeLuminance(rgb) + 0.05);
}

function readRgbVar(name) {
  return document.documentElement.style
    .getPropertyValue(name)
    .split(" ")
    .map(Number);
}

describe("applyBrandColor", () => {
  afterEach(() => {
    document.documentElement.style.removeProperty("--brand-rgb");
    document.documentElement.style.removeProperty("--brand-solid-rgb");
  });

  it("sets --brand-rgb to the exact, unclamped colour the owner picked", () => {
    applyBrandColor("#e11d48");
    expect(readRgbVar("--brand-rgb")).toEqual([225, 29, 72]);
  });

  it("darkens --brand-solid-rgb enough to clear WCAG AA when the picked colour is too light for white text", () => {
    applyBrandColor("#fef9c3"); // pale yellow, fails 4.5:1 as-is
    const solid = readRgbVar("--brand-solid-rgb");
    expect(contrastWithWhite(solid)).toBeGreaterThanOrEqual(4.5);
    // --brand-rgb itself must stay the owner's original choice.
    expect(readRgbVar("--brand-rgb")).toEqual([254, 249, 195]);
  });

  it("leaves --brand-solid-rgb unchanged when the picked colour already clears WCAG AA", () => {
    applyBrandColor("#1d4ed8"); // a strong blue, already accessible
    expect(readRgbVar("--brand-solid-rgb")).toEqual([29, 78, 216]);
  });

  it("preserves hue rather than just going to black when darkening", () => {
    applyBrandColor("#fef08a"); // yellow
    const [r, g, b] = readRgbVar("--brand-solid-rgb");
    // Still yellow-ish: red and green channels well above blue.
    expect(r).toBeGreaterThan(b);
    expect(g).toBeGreaterThan(b);
  });

  it("does nothing for a missing or malformed hex value", () => {
    applyBrandColor(undefined);
    applyBrandColor("not-a-color");
    applyBrandColor("#fff"); // shorthand form isn't supported
    expect(document.documentElement.style.getPropertyValue("--brand-rgb")).toBe("");
    expect(
      document.documentElement.style.getPropertyValue("--brand-solid-rgb"),
    ).toBe("");
  });
});
