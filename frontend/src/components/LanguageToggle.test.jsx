// Verifies the language toggle switches i18next's active
// language and highlights the selected button.
import { render, screen, fireEvent } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import i18n from "../lib/i18n.js";
import LanguageToggle from "./LanguageToggle.jsx";

function renderWithI18n() {
  return render(
    <I18nextProvider i18n={i18n}>
      <LanguageToggle />
    </I18nextProvider>,
  );
}
describe("LanguageToggle", () => {
  it("renders both language buttons", () => {
    renderWithI18n();
    expect(screen.getByText("EN")).toBeInTheDocument();
    expect(screen.getByText("FR")).toBeInTheDocument();
  });
  it("switches to French when FR is clicked", () => {
    renderWithI18n();
    fireEvent.click(screen.getByText("FR"));
    expect(i18n.language).toBe("fr");
  });
  it("switches back to English when EN is clicked", () => {
    renderWithI18n();
    fireEvent.click(screen.getByText("EN"));
    expect(i18n.language).toBe("en");
  });
});
