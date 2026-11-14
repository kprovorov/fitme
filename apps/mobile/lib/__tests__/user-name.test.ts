import { describe, expect, it } from "@jest/globals";

import { getProfileHeader } from "../user-name";

describe("getProfileHeader", () => {
  it("shows the name with the email beneath it", () => {
    expect(
      getProfileHeader({
        email: "pepper@stark.com",
        fullName: "Pepper Potts",
      })
    ).toEqual({
      initial: "P",
      subtitle: "pepper@stark.com",
      title: "Pepper Potts",
    });
  });

  it("falls back to the email when the User has no name", () => {
    expect(
      getProfileHeader({ email: "pepper@stark.com", fullName: null })
    ).toEqual({ initial: "P", title: "pepper@stark.com" });
  });

  it("treats a blank name as no name", () => {
    expect(
      getProfileHeader({ email: "pepper@stark.com", fullName: "  " })
    ).toEqual({ initial: "P", title: "pepper@stark.com" });
  });
});
