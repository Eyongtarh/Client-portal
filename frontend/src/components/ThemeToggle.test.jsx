// Same interaction pattern as LanguageToggle.test.jsx: click the
// control, check it actually persisted the change through
// lib/theme.js rather than just updating its own local state.
import { render, screen, fireEvent } from "@testing-library/react";
import ThemeToggle from "./ThemeToggle.jsx";

describe("ThemeToggle", () => {
  afterEach(() => {
    document.documentElement.removeAttribute("data-theme");
    localStorage.clear();
  });

  it("starts in light mode and offers to switch to dark", () => {
    render(<ThemeToggle />);
    expect(
      screen.getByRole("button", { name: "Switch to dark mode" }),
    ).toBeInTheDocument();
  });

  it("switches to dark mode when clicked, and applies it to the document", () => {
    render(<ThemeToggle />);
    fireEvent.click(screen.getByRole("button", { name: "Switch to dark mode" }));
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(
      screen.getByRole("button", { name: "Switch to light mode" }),
    ).toBeInTheDocument();
  });

  it("switches back to light mode on a second click", () => {
    render(<ThemeToggle />);
    fireEvent.click(screen.getByRole("button", { name: "Switch to dark mode" }));
    fireEvent.click(screen.getByRole("button", { name: "Switch to light mode" }));
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });
});
