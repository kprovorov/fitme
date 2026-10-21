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
export const TOKENS_CSS_PATH = new URL("./tokens.css", import.meta.url);

const COMMENT = /\/\*[\s\S]*?\*\//g;
const THEME_BLOCK = /@theme\s*\{([^}]*)\}/;
// One `property: value` statement of the block, before its name is checked
const DECLARATION = /^(\S+?)\s*:\s*(\S[\s\S]*)$/;
// `--<kind>-<name>`: lowercase kind, then lowercase words joined by `-` or
// `--` (`--text-body--line-height`, `--radius-2xl`)
const TOKEN_NAME = /^--([a-z]+)-([a-z0-9]+(?:--?[a-z0-9]+)*)$/;
const KINDS: readonly TokenKind[] = [
  "color",
  "text",
  "spacing",
  "radius",
  "size",
  "font",
];

const isTokenKind = (value: string): value is TokenKind =>
  (KINDS as readonly string[]).includes(value);

/**
 * Parses token CSS into its tokens, in file order. Only the `@theme` block
 * counts, and every statement in it must be a well-formed token: a malformed
 * declaration, a name that isn't `--<kind>-<name>` in lowercase, or an unknown
 * kind throws, so a broken token file can't parse as a shorter one.
 */
export function parseTokens(css: string): Token[] {
  const block = css.replace(COMMENT, "").match(THEME_BLOCK)?.[1];
  if (block === undefined) {
    throw new Error("No @theme block found in the token CSS");
  }

  return block
    .split(";")
    .map((statement) => statement.trim())
    .filter((statement) => statement !== "")
    .map((statement) => {
      const [, variable, value] = statement.match(DECLARATION) ?? [];
      if (variable === undefined || value === undefined) {
        throw new Error(`Malformed declaration in @theme: "${statement}"`);
      }
      const [, kind, name] = variable.match(TOKEN_NAME) ?? [];
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
}

/** One `@utility` of `tokens.css`, such as a text style. */
export interface Utility {
  /** Declarations in file order: `font-size` → `var(--text-body)`. */
  declarations: Record<string, string>;
  /** The class name: `text-body-emphasized`. */
  name: string;
}

const UTILITY_BLOCK = /@utility\s+([a-z0-9-]+)\s*\{([^}]*)\}/g;

/**
 * Parses the `@utility` blocks of token CSS, in file order. A declaration
 * without a `property: value` shape, or a repeated property, throws.
 */
export function parseUtilities(css: string): Utility[] {
  return [...css.replace(COMMENT, "").matchAll(UTILITY_BLOCK)].map(
    ([, name = "", body = ""]) => {
      const declarations: Record<string, string> = {};
      for (const statement of body.split(";")) {
        const trimmed = statement.trim();
        if (trimmed === "") {
          continue;
        }
        const [, property, value] = trimmed.match(DECLARATION) ?? [];
        if (property === undefined || value === undefined) {
          throw new Error(`Malformed declaration in @utility ${name}`);
        }
        if (property in declarations) {
          throw new Error(`Repeated ${property} in @utility ${name}`);
        }
        declarations[property] = value.trim();
      }
      return { declarations, name };
    }
  );
}

const readTokenCss = () => readFileSync(TOKENS_CSS_PATH, "utf8");

/** Reads and parses the package's own `tokens.css`. */
export const readTokens = (): Token[] => parseTokens(readTokenCss());

/** Reads the `@utility` blocks of the package's own `tokens.css`. */
export const readUtilities = (): Utility[] => parseUtilities(readTokenCss());
