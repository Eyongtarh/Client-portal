// A real bug: a wrong-password attempt on the login page (a 401
// with no access token ever attached to the request, since the
// user isn't authenticated yet) hit the same branch as an actually
// expired session - no refresh token, so it cleared storage and
// did `window.location.href = "/login"`. Already being on /login,
// that's a full page reload, which wiped the in-progress React
// state before Login.jsx's own catch block ever got to show
// "Invalid email or password." These tests exercise the actual
// axios response interceptor (not a reimplementation of it) via
// the handler axios stores internally, so a regression here would
// fail this test, not just look fine until someone tries it by hand.
import axios from "axios";
import api, { setTokens, clearTokens, getTokens } from "./api.js";

jest.mock("axios", () => {
  const actual = jest.requireActual("axios");
  return {
    ...actual,
    post: jest.fn(),
  };
});

function getRejectedHandler() {
  return api.interceptors.response.handlers[0].rejected;
}

function unauthorizedError({ hadAccessToken }) {
  return {
    config: {
      headers: hadAccessToken ? { Authorization: "Bearer old-token" } : {},
    },
    response: { status: 401 },
  };
}

describe("api response interceptor", () => {
  const originalAdapter = api.defaults.adapter;

  beforeEach(() => {
    clearTokens();
    axios.post.mockReset();
  });

  afterEach(() => {
    api.defaults.adapter = originalAdapter;
  });

  it("passes the error straight through on a 401 with no access token, without touching stored tokens (e.g. wrong login password)", async () => {
    setTokens({ access: "unrelated", refresh: "unrelated" });
    const rejected = getRejectedHandler();
    const error = unauthorizedError({ hadAccessToken: false });

    // Before the fix, this branch cleared tokens and navigated to
    // /login unconditionally - here, rejecting with the exact same
    // error object (nothing swallowed or replaced) is what lets
    // Login.jsx's own catch block run and show its error message.
    await expect(rejected(error)).rejects.toBe(error);
    expect(getTokens()).toEqual({ access: "unrelated", refresh: "unrelated" });
  });

  it("still clears tokens on a 401 from an authenticated request with no refresh token", async () => {
    setTokens({ access: "expired-access-token", refresh: "" });
    const rejected = getRejectedHandler();
    const error = unauthorizedError({ hadAccessToken: true });

    await expect(rejected(error)).rejects.toBe(error);
    expect(getTokens()).toEqual({ access: null, refresh: null });
  });

  it("refreshes the access token and retries the original request on a 401 from an expired session", async () => {
    setTokens({ access: "expired-access", refresh: "valid-refresh" });
    axios.post.mockResolvedValueOnce({ data: { access: "fresh-access" } });
    api.defaults.adapter = jest.fn().mockResolvedValue({
      status: 200,
      data: { ok: true },
      config: {},
      headers: {},
    });

    const rejected = getRejectedHandler();
    const error = unauthorizedError({ hadAccessToken: true });

    const result = await rejected(error);

    expect(result.data).toEqual({ ok: true });
    expect(axios.post).toHaveBeenCalledWith(
      expect.stringContaining("/auth/refresh/"),
      { refresh: "valid-refresh" },
    );
    expect(getTokens().access).toBe("fresh-access");
    // The retried request must carry the newly issued token, not the
    // expired one that triggered the refresh in the first place.
    expect(error.config.headers.Authorization).toBe("Bearer fresh-access");
  });

  it("clears tokens and does not retry when the refresh token itself is rejected", async () => {
    setTokens({ access: "expired-access", refresh: "invalid-refresh" });
    axios.post.mockRejectedValueOnce({ response: { status: 401 } });

    const rejected = getRejectedHandler();
    const error = unauthorizedError({ hadAccessToken: true });

    await expect(rejected(error)).rejects.toBeTruthy();
    expect(getTokens()).toEqual({ access: null, refresh: null });
  });
});
