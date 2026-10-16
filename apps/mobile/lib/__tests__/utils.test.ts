import { describe, expect, it } from "@jest/globals";
import { cn } from "../utils";

describe("cn", () => {
  it("keeps a HIG font size next to a text color", () => {
    expect(cn("text-body text-foreground")).toBe("text-body text-foreground");
    expect(cn("text-large-title", "text-primary")).toBe(
      "text-large-title text-primary"
    );
  });

  it("lets a later HIG font size override an earlier one", () => {
    expect(cn("text-foreground text-subhead", "text-title-2")).toBe(
      "text-foreground text-title-2"
    );
  });

  it("lets a HIG font size override a stock one", () => {
    expect(cn("text-sm", "text-caption-1")).toBe("text-caption-1");
  });

  it("lets a later text color override an earlier one", () => {
    expect(cn("text-footnote text-foreground", "text-muted-foreground")).toBe(
      "text-footnote text-muted-foreground"
    );
  });
});
