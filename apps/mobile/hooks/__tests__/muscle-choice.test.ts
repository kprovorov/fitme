import { describe, expect, it } from "@jest/globals";

import { legacyChoiceFor } from "~/hooks/muscle-choice";

describe("legacyChoiceFor", () => {
  it("opens a group both lists share on itself", () => {
    expect(legacyChoiceFor("quadriceps")).toBe("quadriceps");
    expect(legacyChoiceFor("lower-back")).toBe("lower-back");
  });

  it("opens core on abs", () => {
    expect(legacyChoiceFor("core")).toBe("abs");
  });

  it("opens a group only the new list has on nothing", () => {
    expect(legacyChoiceFor("adductors")).toBeUndefined();
    expect(legacyChoiceFor("neck")).toBeUndefined();
  });
});
