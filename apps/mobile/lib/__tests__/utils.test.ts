import { describe, expect, it } from "@jest/globals";
import { cn, TEXT_STYLES } from "../utils";

describe("cn", () => {
  it("knows the 22 HIG and 10 Mono text styles", () => {
    expect(TEXT_STYLES).toHaveLength(32);
    expect(new Set(TEXT_STYLES).size).toBe(32);
  });

  it.each(TEXT_STYLES)("keeps text-%s next to a text color", (style) => {
    expect(cn(`text-${style}`, "text-muted-foreground")).toBe(
      `text-${style} text-muted-foreground`
    );
    expect(cn("text-primary", `text-${style}`)).toBe(
      `text-primary text-${style}`
    );
  });

  it("lets a later text style override an earlier one", () => {
    expect(cn("text-foreground text-subhead", "text-title-2")).toBe(
      "text-foreground text-title-2"
    );
    expect(cn("text-body", "text-body-emphasized")).toBe(
      "text-body-emphasized"
    );
    expect(cn("text-body-emphasized", "text-mono-footnote-semibold")).toBe(
      "text-mono-footnote-semibold"
    );
  });

  it("lets a text style override a stock size, font, weight, leading or tracking", () => {
    expect(cn("text-sm", "text-caption-1")).toBe("text-caption-1");
    expect(
      cn(
        "font-nunito-sans-bold font-semibold leading-none tracking-tight",
        "text-body-emphasized"
      )
    ).toBe("text-body-emphasized");
  });

  it("lets a later stock size override a text style", () => {
    expect(cn("text-body-emphasized", "text-sm")).toBe("text-sm");
  });

  it("merges spacing and radius tokens next to a text style", () => {
    expect(
      cn("p-0 rounded-none text-body", "p-sm rounded-card text-body-emphasized")
    ).toBe("p-sm rounded-card text-body-emphasized");
  });

  it("lets a later text color override an earlier one", () => {
    expect(
      cn("text-footnote-emphasized text-foreground", "text-muted-foreground")
    ).toBe("text-footnote-emphasized text-muted-foreground");
  });
});
