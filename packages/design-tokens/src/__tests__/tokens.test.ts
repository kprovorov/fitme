import { describe, expect, it } from "vitest";
import { parseTokens, readTokens, type TokenKind } from "../index";

const tokens = readTokens();

const tokenValue = (kind: TokenKind, name: string) =>
  tokens.find((token) => token.kind === kind && token.name === name)?.value;

const COLORS = [
  "background",
  "foreground",
  "card",
  "card-foreground",
  "popover",
  "popover-foreground",
  "primary",
  "primary-foreground",
  "secondary",
  "secondary-foreground",
  "muted",
  "muted-foreground",
  "accent",
  "accent-foreground",
  "destructive",
  "destructive-foreground",
  "border",
  "input",
  "ring",
];

const HEX = /^#([0-9a-f]{6}|[0-9a-f]{8})$/;

// Apple HIG text styles, iOS at the default Large size: [size, line height] in pt
const HIG_STYLES: Record<string, [number, number]> = {
  body: [17, 22],
  callout: [16, 21],
  "caption-1": [12, 16],
  "caption-2": [11, 13],
  footnote: [13, 18],
  headline: [17, 22],
  "large-title": [34, 41],
  subhead: [15, 20],
  "title-1": [28, 34],
  "title-2": [22, 28],
  "title-3": [20, 25],
};

describe("colors", () => {
  it("defines exactly the 19 color tokens", () => {
    const names = tokens.filter((t) => t.kind === "color").map((t) => t.name);
    expect(names.sort()).toEqual([...COLORS].sort());
  });

  it.each(COLORS)("%s is 6- or 8-digit lowercase hex", (name) => {
    expect(tokenValue("color", name)).toMatch(HEX);
  });

  it("keeps mobile's shipped brand colors", () => {
    expect(tokenValue("color", "primary")).toBe("#c0ff38");
    expect(tokenValue("color", "background")).toBe("#1f1d20");
  });
});

describe("type", () => {
  it.each(Object.entries(HIG_STYLES))(
    "%s has the HIG size and line height",
    (style, [size, lineHeight]) => {
      expect(tokenValue("text", style)).toBe(`${size}px`);
      expect(tokenValue("text", `${style}--line-height`)).toBe(
        `${lineHeight}px`
      );
    }
  );

  it("defines the font roles", () => {
    const fonts = tokens.filter((t) => t.kind === "font").map((t) => t.name);
    expect(fonts).toEqual([
      "nunito-sans-regular",
      "nunito-sans-semibold",
      "nunito-sans-bold",
      "ibm-plex-mono",
      "ibm-plex-mono-semibold",
    ]);
  });
});

describe("spacing and radius", () => {
  it.each([
    ["xs", "0.5rem"],
    ["sm", "1rem"],
    ["md", "1.5rem"],
    ["lg", "2rem"],
  ])("spacing %s is %s (8/16/24/32 pt)", (name, value) => {
    expect(tokenValue("spacing", name)).toBe(value);
  });

  it.each([
    ["xs", "0.125rem"],
    ["sm", "0.25rem"],
    ["md", "0.375rem"],
    ["lg", "0.5rem"],
    ["xl", "0.75rem"],
    ["2xl", "1rem"],
    ["3xl", "1.5rem"],
    ["4xl", "2rem"],
    ["card", "1rem"],
  ])("radius %s is %s", (name, value) => {
    expect(tokenValue("radius", name)).toBe(value);
  });
});

describe("parseTokens", () => {
  it("ignores comments and anything outside @theme", () => {
    const css = `
      :root { --color-stray: #000000; }
      @theme {
        /* --color-commented: #ffffff; */
        --color-primary: #c0ff38;
      }
    `;
    expect(parseTokens(css)).toEqual([
      {
        kind: "color",
        name: "primary",
        value: "#c0ff38",
        variable: "--color-primary",
      },
    ]);
  });

  it("rejects an unknown token kind", () => {
    expect(() => parseTokens("@theme { --colour-primary: #c0ff38; }")).toThrow(
      "Unknown token kind in --colour-primary"
    );
  });

  it.each([
    "--Color-primary",
    "--colorprimary",
    "--color-Primary",
    "--color-",
    "--color--primary",
    "--color-primary-",
    "--color_primary",
    "-color-primary",
    "color",
  ])("rejects the malformed token name %s", (variable) => {
    expect(() => parseTokens(`@theme { ${variable}: #c0ff38; }`)).toThrow(
      `Malformed token name ${variable}`
    );
  });

  it("rejects a malformed name among valid tokens", () => {
    const css = `@theme {
      --color-primary: #c0ff38;
      --Color-background: #1f1d20;
    }`;
    expect(() => parseTokens(css)).toThrow(
      "Malformed token name --Color-background"
    );
  });

  it.each(["--color-primary #c0ff38", "--color-primary:", "--color-primary: "])(
    "rejects the malformed declaration %j",
    (statement) => {
      expect(() => parseTokens(`@theme { ${statement}; }`)).toThrow(
        "Malformed declaration in @theme"
      );
    }
  );

  it("accepts a last declaration without a semicolon", () => {
    expect(parseTokens("@theme { --radius-2xl: 1rem }")).toEqual([
      { kind: "radius", name: "2xl", value: "1rem", variable: "--radius-2xl" },
    ]);
  });

  it("rejects CSS without a @theme block", () => {
    expect(() => parseTokens(":root { --color-primary: red; }")).toThrow(
      "No @theme block"
    );
  });
});
