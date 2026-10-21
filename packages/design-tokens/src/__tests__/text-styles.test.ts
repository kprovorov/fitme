import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import { compile } from "tailwindcss";
import { describe, expect, it } from "vitest";
import {
  parseUtilities,
  readTokens,
  readUtilities,
  TOKENS_CSS_PATH,
} from "../index";

type Weight = "regular" | "semibold" | "bold";

// Apple HIG text styles, iOS at the default Large size: Regular weight,
// size / line height in pt, Emphasized weight
const HIG: [style: string, Weight, number, number, Weight][] = [
  ["large-title", "regular", 34, 41, "bold"],
  ["title-1", "regular", 28, 34, "bold"],
  ["title-2", "regular", 22, 28, "bold"],
  ["title-3", "regular", 20, 25, "semibold"],
  ["headline", "semibold", 17, 22, "semibold"],
  ["body", "regular", 17, 22, "semibold"],
  ["callout", "regular", 16, 21, "semibold"],
  ["subhead", "regular", 15, 20, "semibold"],
  ["footnote", "regular", 13, 18, "semibold"],
  ["caption-1", "regular", 12, 16, "semibold"],
  ["caption-2", "regular", 11, 13, "semibold"],
];

const MONO_STYLES = ["footnote", "subhead", "body", "title-2", "caption-1"];

const WEIGHTS: Record<Weight, string> = {
  bold: "700",
  regular: "400",
  semibold: "600",
};

interface Expected {
  family: string;
  lineHeight: number;
  size: number;
  weight: string;
}

const sizeOf = (style: string) => {
  const row = HIG.find(([name]) => name === style);
  if (!row) {
    throw new Error(`No HIG style ${style}`);
  }
  return { lineHeight: row[3], size: row[2] };
};

const EXPECTED: Record<string, Expected> = Object.fromEntries([
  ...HIG.flatMap(([style, regular, size, lineHeight, emphasized]) => [
    [
      `text-${style}`,
      {
        family: `nunito-sans-${regular}`,
        lineHeight,
        size,
        weight: WEIGHTS[regular],
      },
    ],
    [
      `text-${style}-emphasized`,
      {
        family: `nunito-sans-${emphasized}`,
        lineHeight,
        size,
        weight: WEIGHTS[emphasized],
      },
    ],
  ]),
  ...MONO_STYLES.flatMap((style) => [
    [
      `text-mono-${style}`,
      { family: "ibm-plex-mono", ...sizeOf(style), weight: "400" },
    ],
    [
      `text-mono-${style}-semibold`,
      { family: "ibm-plex-mono-semibold", ...sizeOf(style), weight: "600" },
    ],
  ]),
]);

const tokens = readTokens();
const utilities = readUtilities();

const VAR = /^var\((--[a-z0-9-]+)\)$/;

// The token a `var(--…)` declaration points at, as written in @theme
const resolve = (value: string | undefined) => {
  const variable = value?.match(VAR)?.[1];
  return tokens.find((token) => token.variable === variable)?.value;
};

describe("text style utilities", () => {
  it("are the 22 HIG styles and the 10 Mono styles, nothing else", () => {
    expect(utilities.map((u) => u.name).sort()).toEqual(
      Object.keys(EXPECTED).sort()
    );
    expect(Object.keys(EXPECTED)).toHaveLength(32);
  });

  it.each(Object.entries(EXPECTED))(
    "%s has the table's font, weight, size and line height",
    (name, expected) => {
      const utility = utilities.find((u) => u.name === name);
      expect(utility?.declarations).toEqual({
        "font-family": `var(--font-${expected.family})`,
        "font-size": expect.stringMatching(VAR),
        "font-weight": expected.weight,
        "letter-spacing": "0",
        "line-height": expect.stringMatching(VAR),
      });
      expect(resolve(utility?.declarations["font-size"])).toBe(
        `${expected.size}px`
      );
      expect(resolve(utility?.declarations["line-height"])).toBe(
        `${expected.lineHeight}px`
      );
      expect(resolve(utility?.declarations["font-family"])).toBeDefined();
    }
  );
});

describe("parseUtilities", () => {
  it("reads each block's declarations and ignores comments", () => {
    const css = `
      @theme { --text-body: 17px; }
      /* @utility text-commented { font-size: 1px; } */
      @utility text-body {
        font-size: var(--text-body);
        letter-spacing: 0
      }
    `;
    expect(parseUtilities(css)).toEqual([
      {
        declarations: {
          "font-size": "var(--text-body)",
          "letter-spacing": "0",
        },
        name: "text-body",
      },
    ]);
  });

  it("rejects a malformed declaration", () => {
    expect(() => parseUtilities("@utility a { font-size 1px; }")).toThrow(
      "Malformed declaration in @utility a"
    );
  });

  it("rejects a repeated property", () => {
    expect(() =>
      parseUtilities("@utility a { font-size: 1px; font-size: 2px; }")
    ).toThrow("Repeated font-size in @utility a");
  });
});

const require = createRequire(import.meta.url);

const RULE_BODY = /\.text-body-emphasized \{([^}]*)\}/;
const ROUNDED_FULL_BODY = /\.rounded-full \{([^}]*)\}/;

// Builds the given classes the way an app's Tailwind does, with the app's own
// font roles mapped after the import
async function build(classes: string[]) {
  const compiler = await compile(
    `@import "tailwindcss";
     @import "./tokens.css";
     @theme { --font-nunito-sans-semibold: "App-SemiBold"; }`,
    {
      base: dirname(TOKENS_CSS_PATH.pathname),
      loadStylesheet: (id, base) => {
        const path =
          id === "./tokens.css"
            ? TOKENS_CSS_PATH.pathname
            : require.resolve(
                id === "tailwindcss" ? "tailwindcss/index.css" : id,
                {
                  paths: [base],
                }
              );
        return Promise.resolve({
          base: dirname(path),
          content: readFileSync(path, "utf8"),
          path,
        });
      },
    }
  );
  return compiler.build(classes);
}

describe("in Tailwind", () => {
  it("compiles every text style to a class", async () => {
    const css = await build(Object.keys(EXPECTED));
    for (const name of Object.keys(EXPECTED)) {
      expect(css).toContain(`.${name} {`);
    }
  });

  it("uses the app's font role and the token values", async () => {
    const css = await build(["text-body-emphasized"]);
    expect(css).toContain('--font-nunito-sans-semibold: "App-SemiBold";');
    expect(css).toContain("--text-body: 17px;");
    expect(css).toContain("--text-body--line-height: 22px;");
    const rule = css
      .match(RULE_BODY)?.[1]
      ?.split(";")
      .map((d) => d.trim());
    expect(rule?.filter(Boolean).sort()).toEqual([
      "font-family: var(--font-nunito-sans-semibold)",
      "font-size: var(--text-body)",
      "font-weight: 600",
      "letter-spacing: 0",
      "line-height: var(--text-body--line-height)",
    ]);
  });

  it("resolves rounded-full through the radius-full token", async () => {
    const css = await build(["rounded-full"]);
    expect(css).toContain("--radius-full: 9999px;");
    expect(css.match(ROUNDED_FULL_BODY)?.[1]?.trim()).toBe(
      "border-radius: var(--radius-full);"
    );
  });
});
