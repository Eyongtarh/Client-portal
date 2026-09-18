import { getTheme, setTheme } from "./theme.js";

describe("theme", () => {
  afterEach(() => {
    document.documentElement.removeAttribute("data-theme");
    localStorage.clear();
  });

  it("reads light as the default when data-theme isn't set", () => {
    expect(getTheme()).toBe("light");
  });

  it("reads dark once data-theme is set to dark", () => {
    document.documentElement.setAttribute("data-theme", "dark");
    expect(getTheme()).toBe("dark");
  });

  it("treats any non-dark value as light", () => {
    document.documentElement.setAttribute("data-theme", "sepia");
    expect(getTheme()).toBe("light");
  });

  it("applies the attribute and persists the choice", () => {
    setTheme("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(localStorage.getItem("theme")).toBe("dark");
  });

  it("still applies the attribute for this page view when localStorage is unavailable", () => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error("storage disabled (private mode)");
    };
    try {
      expect(() => setTheme("dark")).not.toThrow();
      expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    } finally {
      Storage.prototype.setItem = original;
    }
  });
});
