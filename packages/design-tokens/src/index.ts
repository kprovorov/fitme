import { readFileSync } from "node:fs";

/** The kind of design value a token holds, from its CSS variable prefix. */
export type TokenKind = "color" | "text" | "spacing" | "radius" | "font";

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
const DECLARATION = /(--([a-z]+)-([\w-]+))\s*:\s*([^;]+);/g;
const KINDS: readonly TokenKind[] = [
  "color",
  "text",
  "spacing",
  "radius",
  "font",
];

const isTokenKind = (value: string): value is TokenKind =>
  (KINDS as readonly string[]).includes(value);

/**
 * Parses token CSS into its tokens, in file order. Only the `@theme` block
 * counts; a variable outside the known kinds throws, so a typo in a prefix
 * can't slip through as an unknown token.
 */
export function parseTokens(css: string): Token[] {
  const block = css.replace(COMMENT, "").match(THEME_BLOCK)?.[1];
  if (block === undefined) {
    throw new Error("No @theme block found in the token CSS");
  }

  return Array.from(block.matchAll(DECLARATION), (match) => {
    const [, variable, kind, name, value] = match;
    if (!isTokenKind(kind)) {
      throw new Error(`Unknown token kind in ${variable}`);
    }
    return { kind, name, value: value.trim(), variable };
  });
}

/** Reads and parses the package's own `tokens.css`. */
export const readTokens = (): Token[] =>
  parseTokens(readFileSync(TOKENS_CSS_PATH, "utf8"));
