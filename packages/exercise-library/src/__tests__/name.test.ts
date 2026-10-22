import { describe, expect, it } from "vitest";
import { exerciseNameFromSlug } from "..";

describe("exerciseNameFromSlug", () => {
  it.each([
    ["barbell-back-squat", "Barbell back squat"],
    ["pull-ups", "Pull ups"],
    ["squat", "Squat"],
    ["90-90-hip-switch", "90 90 hip switch"],
    ["--odd--slug-", "Odd slug"],
  ])("names %j %j", (slug, name) => {
    expect(exerciseNameFromSlug(slug)).toBe(name);
  });

  it("falls back to the slug itself when it has no words", () => {
    expect(exerciseNameFromSlug("---")).toBe("---");
  });
});
