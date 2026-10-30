import { describe, expect, it } from "@jest/globals";
import { getTabSymbol, getTabTitle } from "../tabs";

describe("getTabTitle", () => {
  it("names the focused tab", () => {
    expect(getTabTitle("history")).toBe("History");
    expect(getTabTitle("(home)")).toBe("Workout");
  });

  it("falls back to Workout, the first tab, before any tab was focused", () => {
    expect(getTabTitle(undefined)).toBe("Workout");
  });

  it("falls back to Workout for a route that isn't a tab", () => {
    expect(getTabTitle("+not-found")).toBe("Workout");
  });
});

describe("getTabSymbol", () => {
  it("is Figma's symbol on an iOS that has every one", () => {
    expect(getTabSymbol("(home)", 26)).toBe("dumbbell.fill");
    expect(getTabSymbol("history", 26)).toBe("book.pages");
    expect(getTabSymbol("arnold", 26)).toBe("sparkles.2");
    expect(getTabSymbol("library", 26)).toBe("book");
  });

  it("stands in an older symbol for Arnold AI below iOS 26, which has no sparkles.2", () => {
    expect(getTabSymbol("arnold", 25)).toBe("sparkles");
    expect(getTabSymbol("history", 25)).toBe("book.pages");
  });

  it("stands in an older symbol for History below iOS 17, which has no book.pages", () => {
    expect(getTabSymbol("history", 16)).toBe("book.closed");
    expect(getTabSymbol("arnold", 16)).toBe("sparkles");
    expect(getTabSymbol("(home)", 16)).toBe("dumbbell.fill");
    expect(getTabSymbol("library", 16)).toBe("book");
  });
});
