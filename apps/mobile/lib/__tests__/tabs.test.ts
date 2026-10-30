import { describe, expect, it } from "@jest/globals";
import { getTabTitle } from "../tabs";

describe("getTabTitle", () => {
  it("names the focused tab", () => {
    expect(getTabTitle("history")).toBe("History");
    expect(getTabTitle("(home)")).toBe("Home");
  });

  it("falls back to Home, the first tab, before any tab was focused", () => {
    expect(getTabTitle(undefined)).toBe("Home");
  });

  it("falls back to Home for a route that isn't a tab", () => {
    expect(getTabTitle("+not-found")).toBe("Home");
  });
});
