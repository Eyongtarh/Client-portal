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
import api, { setTokens, clearTokens, getTokens } from "./api.js";

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
  beforeEach(() => {
    clearTokens();
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
});
