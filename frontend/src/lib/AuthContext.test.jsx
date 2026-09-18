// Covers the three things every page's routing decision depends
// on: whether a stored token is trusted on load, what login/logout
// actually do to storage and state, and that a stored token which
// turns out to be invalid doesn't leave the app stuck loading
// forever or silently "logged in" with no real session.
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AuthProvider, useAuth } from "./AuthContext.jsx";
import api, { setTokens, clearTokens, getTokens } from "./api.js";
import applyBrandColor from "./applyBrandColor.js";

jest.mock("./applyBrandColor.js", () => jest.fn());

function Probe() {
  const { user, loading, login, logout } = useAuth();
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="user">{user ? user.email : "none"}</span>
      <button onClick={() => login("sarah@example.com", "testpass1234")}>
        login
      </button>
      <button onClick={logout}>logout</button>
    </div>
  );
}

function renderProvider() {
  return render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
}

describe("AuthProvider", () => {
  beforeEach(() => {
    clearTokens();
    applyBrandColor.mockClear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("finishes loading with no user and no /auth/me/ call when nothing is stored", async () => {
    const getSpy = jest.spyOn(api, "get");
    renderProvider();
    await waitFor(() =>
      expect(screen.getByTestId("loading")).toHaveTextContent("false"),
    );
    expect(screen.getByTestId("user")).toHaveTextContent("none");
    expect(getSpy).not.toHaveBeenCalled();
  });

  it("loads the current user and applies the workspace brand colour when a token is already stored", async () => {
    setTokens({ access: "existing-access", refresh: "existing-refresh" });
    jest.spyOn(api, "get").mockImplementation((url) => {
      if (url === "/auth/me/") {
        return Promise.resolve({ data: { email: "sarah@example.com" } });
      }
      if (url === "/workspace/") {
        return Promise.resolve({ data: { brand_color: "#111827" } });
      }
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });

    renderProvider();

    await waitFor(() =>
      expect(screen.getByTestId("user")).toHaveTextContent("sarah@example.com"),
    );
    expect(screen.getByTestId("loading")).toHaveTextContent("false");
    await waitFor(() =>
      expect(applyBrandColor).toHaveBeenCalledWith("#111827"),
    );
  });

  it("clears a stored token that /auth/me/ rejects, instead of leaving the app stuck loading", async () => {
    setTokens({ access: "stale-access", refresh: "stale-refresh" });
    jest.spyOn(api, "get").mockRejectedValue({ response: { status: 401 } });

    renderProvider();

    await waitFor(() =>
      expect(screen.getByTestId("loading")).toHaveTextContent("false"),
    );
    expect(screen.getByTestId("user")).toHaveTextContent("none");
    expect(getTokens()).toEqual({ access: null, refresh: null });
  });

  it("login stores the returned tokens and user; logout clears both", async () => {
    jest.spyOn(api, "get").mockImplementation((url) => {
      if (url === "/auth/me/") {
        return Promise.resolve({ data: { email: "sarah@example.com" } });
      }
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
    jest.spyOn(api, "post").mockResolvedValue({
      data: { access: "new-access", refresh: "new-refresh" },
    });

    renderProvider();
    await waitFor(() =>
      expect(screen.getByTestId("loading")).toHaveTextContent("false"),
    );

    fireEvent.click(screen.getByText("login"));
    await waitFor(() =>
      expect(screen.getByTestId("user")).toHaveTextContent("sarah@example.com"),
    );
    expect(getTokens()).toEqual({ access: "new-access", refresh: "new-refresh" });

    fireEvent.click(screen.getByText("logout"));
    expect(screen.getByTestId("user")).toHaveTextContent("none");
    expect(getTokens()).toEqual({ access: null, refresh: null });
  });
});
