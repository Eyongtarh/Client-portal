// describeActivity is shared by ActivityFeed and NotificationBell
// so the two can never phrase the same event differently. These
// tests use a fake `t` that mimics i18next's real defaultValue
// behaviour (returning the key's defaultValue when the key itself
// isn't known) so the fallback template is exercised the same way
// a genuinely missing translation would exercise it in production.
import { describeActivity, formatActivityWhen } from "./activityText.js";

const KNOWN_KEYS = {
  "activity.systemActor": "the system",
  "activity.verbs.booking_created": "{{actor}} booked {{target}}",
  "activity.statuses.confirmed": "confirmed",
};

function fakeT(key, options = {}) {
  if (KNOWN_KEYS[key]) {
    return KNOWN_KEYS[key].replace(/\{\{(\w+)\}\}/g, (_, name) => options[name]);
  }
  return options.defaultValue ?? key;
}

describe("describeActivity", () => {
  it("uses the actor's name when one is present", () => {
    const entry = {
      actor_name: "Sarah",
      target_repr: "Haircut",
      verb: "booking_created",
      metadata: {},
    };
    expect(describeActivity(entry, fakeT)).toBe("Sarah booked Haircut");
  });

  it("falls back to the system actor when actor_name is missing", () => {
    const entry = {
      actor_name: null,
      target_repr: "Haircut",
      verb: "booking_created",
      metadata: {},
    };
    expect(describeActivity(entry, fakeT)).toBe("the system booked Haircut");
  });

  it("passes through a translated status when metadata.status is present", () => {
    const entry = {
      actor_name: "Sarah",
      target_repr: "Haircut",
      verb: "booking_status_changed",
      metadata: { status: "confirmed" },
    };
    expect(describeActivity(entry, fakeT)).toBe(
      "Sarah - booking_status_changed - Haircut",
    );
  });

  it("uses the generic actor/verb/target fallback for a verb with no translation", () => {
    const entry = {
      actor_name: "Sarah",
      target_repr: "Haircut",
      verb: "some_new_untranslated_verb",
      metadata: {},
    };
    expect(describeActivity(entry, fakeT)).toBe(
      "Sarah - some_new_untranslated_verb - Haircut",
    );
  });
});

describe("formatActivityWhen", () => {
  it("returns a formatted date, not the raw ISO string", () => {
    const formatted = formatActivityWhen("2026-01-15T10:30:00Z", "en");
    expect(formatted).not.toBe("2026-01-15T10:30:00Z");
    expect(formatted.length).toBeGreaterThan(0);
  });

  it("formats the same instant differently for different languages", () => {
    const en = formatActivityWhen("2026-01-15T10:30:00Z", "en");
    const fr = formatActivityWhen("2026-01-15T10:30:00Z", "fr");
    expect(en).not.toBe(fr);
  });
});
