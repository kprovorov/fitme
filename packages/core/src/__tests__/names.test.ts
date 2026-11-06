import { describe, expect, it } from "vitest";

import { splitName } from "../names";

describe("name splitting", () => {
  it("splits a full name on the first space", () => {
    expect(splitName("Mary Jane Watson")).toStrictEqual({
      firstName: "Mary",
      lastName: "Jane Watson",
    });
  });

  it("makes a single word the first name", () => {
    expect(splitName("Zendaya")).toStrictEqual({
      firstName: "Zendaya",
      lastName: "",
    });
  });

  it("ignores spaces around and between the names", () => {
    expect(splitName("  Peter   Parker ")).toStrictEqual({
      firstName: "Peter",
      lastName: "Parker",
    });
    expect(splitName(" Zendaya ")).toStrictEqual({
      firstName: "Zendaya",
      lastName: "",
    });
  });
});
