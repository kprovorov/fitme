import { describe, expect, it } from "@jest/globals";
import { getProfileIdentity, splitFullName } from "../user-name";

describe("splitFullName", () => {
  it("makes a single word the first name", () => {
    expect(splitFullName("Pepper")).toEqual({
      firstName: "Pepper",
      lastName: "",
    });
  });

  it("splits on the first space, keeping the rest as the last name", () => {
    expect(splitFullName("  Mary  Jane Watson ")).toEqual({
      firstName: "Mary",
      lastName: "Jane Watson",
    });
  });
});

describe("getProfileIdentity", () => {
  it("shows the name with the email beneath it", () => {
    expect(
      getProfileIdentity({
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
      getProfileIdentity({ email: "pepper@stark.com", fullName: null })
    ).toEqual({ initial: "P", title: "pepper@stark.com" });
  });

  it("treats a blank name as no name", () => {
    expect(
      getProfileIdentity({ email: "pepper@stark.com", fullName: "  " })
    ).toEqual({ initial: "P", title: "pepper@stark.com" });
  });
});
