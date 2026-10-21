import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { readTokens, type Token } from "./index.ts";

/**
 * The literal check (FIT-202): no `.tsx` file in mobile, web or site
 * hardcodes a color or an off-scale size; they use the tokens instead.
 *
 * Only string literals are read (quoted strings, JSX attribute values and the
 * static parts of template literals), parsed with TypeScript, so comments, JSX
 * text, numbers and identifiers never count. In them it finds:
 * - a hex color (`#c0ff38`, `#fff`, `#ffffff1a`) not glued to a word, `/`,
 *   `?`, `=`, `.` or `%` (URL fragments like `page#faq` and `/#top` are
 *   skipped), and not the value of `href`, `id`, `testID` or `nativeID`
 *   (anchors). After a `:` it counts, so CSS (`color:#fff`) and arbitrary
 *   properties (`[color:#fff]`) fail;
 * - `rgb(`, `rgba(`, `hsl(`, `hsla(`;
 * - an arbitrary `text-[…]`, `leading-[…]`, `rounded-[…]` (any corner) or
 *   spacing value (`p*-[…]`, `m*-[…]`, `gap-[…]`, `space-x/y-[…]`), with any
 *   variant prefix (`active:rounded-[10px]`). A bracket holding a CSS
 *   variable (`[var(--x)]`, `[--x]`) and the variable shorthand
 *   (`h-(--size-button-pill-default)`) are token references, not values.
 */

/** One literal the check rejects. */
export interface Finding {
  column: number;
  /** Repo-relative path, `/`-separated. */
  file: string;
  /** What it is, and the token it matches when there is one. */
  hint: string;
  line: number;
  literal: string;
}

/** A file that may keep its literals, and why. */
export interface AllowlistEntry {
  /** Repo-relative path, `/`-separated. */
  path: string;
  reason: string;
}

/**
 * Files that may keep their literals. Keep it short, with a reason each: a new
 * entry needs a color or size that genuinely can't be a token (third-party
 * artwork, a syntax theme). An entry whose file has no literal left fails the
 * check, so the list can't go stale.
 */
export const ALLOWLIST: readonly AllowlistEntry[] = [];

/** The apps whose `.tsx` files are checked. */
export const CHECKED_APPS = ["apps/mobile", "apps/web", "apps/site"] as const;

// Build output, native projects and dependencies; tests are fixtures, not UI
const SKIPPED_DIRECTORIES = new Set([
  ".expo",
  ".next",
  ".output",
  ".turbo",
  "__tests__",
  "android",
  "build",
  "coverage",
  "dist",
  "ios",
  "node_modules",
]);
const TEST_FILE = /\.(?:test|spec)\.tsx$/;

const HEX =
  /(?<![\w&#/?=.%-])#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})(?![\w-])/gi;
const COLOR_FUNCTION = /(?<![\w-])(?:rgba?|hsla?)\([^)]*\)?/gi;
const ARBITRARY_CLASS =
  /(?<![\w-])-?(text|leading|rounded(?:-(?:[trblse]|tl|tr|br|bl|ss|se|es|ee))?|[pm][xytrblse]?|gap(?:-[xy])?|space-[xy])-\[([^\]\s]*)\]/g;
const TOKEN_REFERENCE = /^(?:var\()?--/;
// Attributes whose value is an anchor or an id, never a color
const ID_ATTRIBUTES = new Set(["href", "id", "nativeID", "testID"]);

const expandHex = (hex: string) => {
  const digits = hex.slice(1).toLowerCase();
  return digits.length <= 4
    ? `#${[...digits].map((digit) => digit + digit).join("")}`
    : `#${digits}`;
};

/** Normalizes a color token value to 8-digit hex, so `#fff` meets `#ffffffff`. */
const opaqueHex = (hex: string) => {
  const expanded = expandHex(hex);
  return expanded.length === 7 ? `${expanded}ff` : expanded;
};

const hexHint = (literal: string, tokens: readonly Token[]) => {
  const match = tokens.find(
    (token) =>
      token.kind === "color" && opaqueHex(token.value) === opaqueHex(literal)
  );
  return match
    ? `hex color: use the ${match.variable} token`
    : "hex color: use a color token";
};

const classHint = (
  utility: string,
  value: string,
  tokens: readonly Token[]
) => {
  if (utility === "text") {
    const size = tokens.find(
      (token) =>
        token.kind === "text" &&
        !token.name.includes("--") &&
        token.value === value
    );
    if (size) {
      return `arbitrary size: use the text-${size.name} text style`;
    }
    return "arbitrary text value: use a text style or a color token";
  }
  if (utility === "leading") {
    return "arbitrary line height: the text style sets it";
  }
  if (utility.startsWith("rounded")) {
    return "arbitrary radius: use a radius token (rounded-lg, rounded-card, …)";
  }
  return "arbitrary spacing: use a spacing token or a numeric step (px-md, gap-2)";
};

const isIdAttributeValue = (node: ts.Node) =>
  ts.isJsxAttribute(node.parent) &&
  ID_ATTRIBUTES.has(node.parent.name.getText());

const isStringLike = (node: ts.Node) =>
  ts.isStringLiteral(node) ||
  ts.isNoSubstitutionTemplateLiteral(node) ||
  ts.isTemplateHead(node) ||
  ts.isTemplateMiddle(node) ||
  ts.isTemplateTail(node);

/**
 * Finds the literals in one `.tsx` source. `path` is only used to name the
 * file in each finding.
 */
export function checkSource(
  path: string,
  source: string,
  tokens: readonly Token[] = readTokens()
): Finding[] {
  const file = ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );
  const findings: Finding[] = [];

  const report = (position: number, literal: string, hint: string) => {
    const { line, character } = file.getLineAndCharacterOfPosition(position);
    findings.push({
      column: character + 1,
      file: path,
      hint,
      line: line + 1,
      literal,
    });
  };

  const checkLiteral = (node: ts.Node) => {
    if (
      ts.isImportDeclaration(node.parent) ||
      ts.isExportDeclaration(node.parent)
    ) {
      return;
    }
    const start = node.getStart(file);
    // The literal as written, quotes and `${` included, so offsets map back
    // to the file
    const text = source.slice(start, node.getEnd());

    if (!isIdAttributeValue(node)) {
      for (const match of text.matchAll(HEX)) {
        report(start + match.index, match[0], hexHint(match[0], tokens));
      }
    }
    for (const match of text.matchAll(COLOR_FUNCTION)) {
      report(
        start + match.index,
        match[0],
        "color function: use a color token"
      );
    }
    for (const match of text.matchAll(ARBITRARY_CLASS)) {
      const [literal, utility = "", value = ""] = match;
      if (!TOKEN_REFERENCE.test(value)) {
        report(start + match.index, literal, classHint(utility, value, tokens));
      }
    }
  };

  const visit = (node: ts.Node) => {
    if (isStringLike(node)) {
      checkLiteral(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);

  return findings.sort((a, b) => a.line - b.line || a.column - b.column);
}

/** Every checked `.tsx` file under `directory`, absolute, sorted. */
export function collectFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRECTORIES.has(entry.name)) {
        files.push(...collectFiles(path));
      }
    } else if (entry.name.endsWith(".tsx") && !TEST_FILE.test(entry.name)) {
      files.push(path);
    }
  }
  return files.sort();
}

/** The outcome of checking a set of files against the allowlist. */
export interface CheckResult {
  findings: Finding[];
  /** Allowlist entries whose file has no literal (or doesn't exist). */
  staleEntries: AllowlistEntry[];
}

/**
 * Checks `files` (repo-relative path → source). Findings in an allowlisted
 * file are dropped; an entry that drops nothing is stale.
 */
export function checkFiles(
  files: ReadonlyMap<string, string>,
  allowlist: readonly AllowlistEntry[] = ALLOWLIST,
  tokens: readonly Token[] = readTokens()
): CheckResult {
  const allowed = new Set(allowlist.map((entry) => entry.path));
  const used = new Set<string>();
  const findings: Finding[] = [];
  for (const [path, source] of files) {
    const fileFindings = checkSource(path, source, tokens);
    if (allowed.has(path)) {
      if (fileFindings.length > 0) {
        used.add(path);
      }
    } else {
      findings.push(...fileFindings);
    }
  }
  return {
    findings,
    staleEntries: allowlist.filter((entry) => !used.has(entry.path)),
  };
}

const toPosix = (path: string) => path.split(sep).join("/");

/** Reads every checked file of the repo at `root`. */
export function readCheckedFiles(root: string): Map<string, string> {
  const files = new Map<string, string>();
  for (const app of CHECKED_APPS) {
    for (const path of collectFiles(join(root, app))) {
      files.set(toPosix(relative(root, path)), readFileSync(path, "utf8"));
    }
  }
  return files;
}

/** Formats a result for the terminal: one line per literal. */
export function formatResult({ findings, staleEntries }: CheckResult): string {
  const lines = findings.map(
    ({ column, file, hint, line, literal }) =>
      `${file}:${line}:${column}  ${literal}  ${hint}`
  );
  for (const entry of staleEntries) {
    lines.push(
      `${entry.path}  allowlist entry has no literal left: remove it from ALLOWLIST in packages/design-tokens/src/literal-check.ts`
    );
  }
  return lines.join("\n");
}

if (import.meta.main) {
  const root = fileURLToPath(new URL("../../..", import.meta.url));
  const files = readCheckedFiles(root);
  const result = checkFiles(files);
  if (result.findings.length > 0 || result.staleEntries.length > 0) {
    console.error(formatResult(result));
    console.error(
      `\n${result.findings.length} literal(s) found. Use the tokens in @fitme/design-tokens (docs/agents/ui.md).`
    );
    process.exit(1);
  }
  console.log(
    `No color literals or arbitrary sizes in ${files.size} .tsx files (${CHECKED_APPS.join(", ")}).`
  );
}
