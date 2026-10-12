import { describe, expect, it } from "vitest";
import { splitName } from "../names";

describe("splitName", () => {
  it("splits a full name on the first space", () => {
    expect(splitName("Mary Jane Watson")).toEqual({
      firstName: "Mary",
      lastName: "Jane Watson",
    });
  });

  it("makes a single word the first name", () => {
    expect(splitName("Zendaya")).toEqual({
      firstName: "Zendaya",
      lastName: "",
    });
  });

  it("ignores spaces around and between the names", () => {
    expect(splitName("  Peter   Parker ")).toEqual({
      firstName: "Peter",
      lastName: "Parker",
    });
    expect(splitName(" Zendaya ")).toEqual({
      firstName: "Zendaya",
      lastName: "",
    });
  });
});
