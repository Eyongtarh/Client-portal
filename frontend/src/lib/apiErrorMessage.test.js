import { apiErrorMessage } from "./apiErrorMessage";

const t = (key) => key;
const fail = (status, data) => ({ response: { status, data } });

describe("apiErrorMessage", () => {
  test("uses the server's own message when there is one", () => {
    expect(apiErrorMessage(fail(400, { detail: "Plan limit reached." }), t)).toBe(
      "Plan limit reached.",
    );
    expect(apiErrorMessage(fail(400, { name: ["This field is required."] }), t)).toBe(
      "This field is required.",
    );
    expect(apiErrorMessage(fail(400, ["Bad input"]), t)).toBe("Bad input");
  });

  test("falls back by status", () => {
    expect(apiErrorMessage(fail(429, {}), t)).toBe("errors.tooManyRequests");
    expect(apiErrorMessage(fail(500, "<html>"), t)).toBe("errors.server");
    expect(apiErrorMessage(fail(404, {}), t)).toBe("errors.generic");
    expect(apiErrorMessage(fail(403, {}), t)).toBe("errors.forbidden");
    expect(apiErrorMessage({ message: "Network Error" }, t)).toBe("errors.network");
  });
});
