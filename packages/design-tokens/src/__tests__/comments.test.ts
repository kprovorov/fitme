import { describe, expect, it } from "vitest";

import { parseTokens, parseUtilities } from "../index";

const tokens = "@theme { --color-primary: #c0ff38; }";
const utilities = "@utility text-body { font-size: 17px; }";

describe.each([
  {
    css: tokens,
    expected: [
      {
        kind: "color",
        name: "primary",
        value: "#c0ff38",
        variable: "--color-primary",
      },
    ],
    name: "tokens",
    parse: parseTokens,
  },
  {
    css: utilities,
    expected: [{ declarations: { "font-size": "17px" }, name: "text-body" }],
    name: "utilities",
    parse: parseUtilities,
  },
])("$name with CSS comments", ({ css, expected, parse }) => {
  it("removes adjacent and multiline comments at their first closing delimiter", () => {
    const commented = `/* outer /* ${tokens}\n${utilities} */ /**/${css}/**/`;

    expect(parse(commented)).toStrictEqual(expected);
  });

  it("handles many opening delimiters in a closed comment", () => {
    expect(parse(`/*${"a/*".repeat(100_000)}*/${css}`)).toStrictEqual(expected);
  });

  it("handles many opening delimiters without a closing delimiter", () => {
    expect(parse(`${css}/*${"a/*".repeat(100_000)}`)).toStrictEqual(expected);
  });

  it("does not treat an overlapping delimiter as a closed comment", () => {
    expect(parse(`/*/${css}`)).toStrictEqual(expected);
  });
});

describe("unterminated CSS comments", () => {
  it("keeps an unterminated comment's text in a declaration", () => {
    expect(
      parseTokens("@theme { --font-test: prefix/*unterminated; }")
    ).toStrictEqual([
      {
        kind: "font",
        name: "test",
        value: "prefix/*unterminated",
        variable: "--font-test",
      },
    ]);
  });
});

describe("unterminated CSS blocks", () => {
  it("rejects many theme headers without rescanning the remaining input", () => {
    expect(() => parseTokens("@theme{{|".repeat(100_000))).toThrow(
      "No @theme block"
    );
  });

  it("finds no utilities among many headers without a closing brace", () => {
    expect(parseUtilities("@utility -{{|".repeat(100_000))).toStrictEqual([]);
  });

  it("skips invalid headers before valid blocks", () => {
    expect(parseTokens(`@themex {}${tokens}`)).toStrictEqual(
      parseTokens(tokens)
    );
    expect(parseUtilities(`@utility ! {}${utilities}`)).toStrictEqual(
      parseUtilities(utilities)
    );
  });
});
