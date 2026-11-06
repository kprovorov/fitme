import { readFileSync } from "node:fs";

/** The kind of design value a token holds, from its CSS variable prefix. */
export type TokenKind =
  | "color"
  | "text"
  | "spacing"
  | "radius"
  | "size"
  | "font";

/** One custom property of the `@theme` block in `tokens.css`. */
export interface Token {
  /** Prefix of the variable: `--color-primary` is a `color`. */
  kind: TokenKind;
  /** Name without the prefix: `primary`, `body--line-height`, `card`. */
  name: string;
  /** The value as written: `#c0ff38`, `17px`, `0.5rem`. */
  value: string;
  /** Full CSS variable: `--color-primary`. */
  variable: string;
}

/** Absolute path of the token CSS. */
export const TOKENS_CSS_PATH = new URL("tokens.css", import.meta.url);

const stripComments = (css: string): string => {
  const parts: string[] = [];
  let position = 0;

  while (position < css.length) {
    const start = css.indexOf("/*", position);

    if (start === -1) {
      break;
    }

    const end = css.indexOf("*/", start + 2);

    if (end === -1) {
      break;
    }

    parts.push(css.slice(position, start));
    position = end + 2;
  }

  parts.push(css.slice(position));

  return parts.join("");
};

const THEME_START = /@theme\s*\{/uy;
const UTILITY_START = /@utility\s+(?<name>[a-z0-9-]+)\s*\{/uy;

const cssBlocks = (css: string, kind: "theme" | "utility") => {
  const marker = `@${kind}`;
  const pattern = kind === "theme" ? THEME_START : UTILITY_START;
  const blocks: { name: string; body: string }[] = [];
  let position = 0;

  while (position < css.length) {
    const start = css.indexOf(marker, position);

    if (start === -1) {
      break;
    }

    pattern.lastIndex = start;
    const header = pattern.exec(css);

    if (!header) {
      position = start + marker.length;
      continue;
    }

    const end = css.indexOf("}", pattern.lastIndex);

    if (end === -1) {
      break;
    }

    blocks.push({
      name: header.groups?.name ?? "",
      body: css.slice(pattern.lastIndex, end),
    });

    if (kind === "theme") {
      break;
    }

    position = end + 1;
  }

  return blocks;
};

// One `property: value` statement of the block, before its name is checked
const DECLARATION = /^(?<property>\S+?)\s*:\s*(?<value>\S[\s\S]*)$/u;

// `--<kind>-<name>`: lowercase kind, then lowercase words joined by `-` or
// `--` (`--text-body--line-height`, `--radius-2xl`)
const TOKEN_NAME = /^--(?<kind>[a-z]+)-(?<name>[a-z0-9]+(?:--?[a-z0-9]+)*)$/u;

const KINDS: readonly TokenKind[] = [
  "color",
  "text",
  "spacing",
  "radius",
  "size",
  "font",
];

const isTokenKind = (value: string): value is TokenKind =>
  KINDS.some((kind) => kind === value);

/**
 * Parses token CSS into its tokens, in file order. Only the `@theme` block
 * counts, and every statement in it must be a well-formed token: a malformed
 * declaration, a name that isn't `--<kind>-<name>` in lowercase, or an unknown
 * kind throws, so a broken token file can't parse as a shorter one.
 */
export const parseTokens = (css: string): Token[] => {
  const block = cssBlocks(stripComments(css), "theme")[0]?.body;

  if (block === undefined) {
    throw new Error("No @theme block found in the token CSS");
  }

  return block
    .split(";")
    .map((statement) => statement.trim())
    .filter((statement) => statement !== "")
    .map((statement) => {
      const [, variable, value] = DECLARATION.exec(statement) ?? [];

      if (variable === undefined || value === undefined) {
        throw new Error(`Malformed declaration in @theme: "${statement}"`);
      }

      const [, kind, name] = TOKEN_NAME.exec(variable) ?? [];

      if (kind === undefined || name === undefined) {
        throw new Error(
          `Malformed token name ${variable}: expected --<kind>-<name> in lowercase`
        );
      }

      if (!isTokenKind(kind)) {
        throw new Error(`Unknown token kind in ${variable}`);
      }

      return { kind, name, value: value.trim(), variable };
    });
};

/** One `@utility` of `tokens.css`, such as a text style. */
export interface Utility {
  /** Declarations in file order: `font-size` → `var(--text-body)`. */
  declarations: Record<string, string>;
  /** The class name: `text-body-emphasized`. */
  name: string;
}

/**
 * Parses the `@utility` blocks of token CSS, in file order. A declaration
 * without a `property: value` shape, or a repeated property, throws.
 */
export const parseUtilities = (css: string): Utility[] =>
  cssBlocks(stripComments(css), "utility").map(({ name, body }) => {
    const declarations: Record<string, string> = {};

    for (const statement of body.split(";")) {
      const trimmed = statement.trim();

      if (trimmed === "") {
        continue;
      }

      const [, property, value] = DECLARATION.exec(trimmed) ?? [];

      if (property === undefined || value === undefined) {
        throw new Error(`Malformed declaration in @utility ${name}`);
      }

      if (property in declarations) {
        throw new Error(`Repeated ${property} in @utility ${name}`);
      }

      declarations[property] = value.trim();
    }

    return { declarations, name };
  });

const readTokenCss = () => readFileSync(TOKENS_CSS_PATH, "utf-8");

/** Reads and parses the package's own `tokens.css`. */
export const readTokens = (): Token[] => parseTokens(readTokenCss());

/** Reads the `@utility` blocks of the package's own `tokens.css`. */
export const readUtilities = (): Utility[] => parseUtilities(readTokenCss());
