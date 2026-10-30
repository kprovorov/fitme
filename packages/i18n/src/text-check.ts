import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

/**
 * The text check (FIT-409): every piece of text the mobile app shows comes
 * from the catalogs, so no English slips back in once a screen is translated.
 *
 * Each `.ts` / `.tsx` file is parsed with TypeScript, and these fail when they
 * hold a letter (any script):
 * - JSX text (`<Text>Save</Text>`);
 * - a string literal (or a template literal's static part) shown as a JSX
 *   child (`{"Save"}`, `{done ? "Done" : "Save"}`), as the value of a
 *   text-bearing prop (`title="Save"`, `accessibilityLabel={…}`,
 *   `confirmLabel`: `isTextProp`), of an object property of such a name
 *   (`options={{ title: "Save" }}`, an alert button's `text`) or a
 *   destructured default (`({ title = "Save" }) =>`), or as an alert's title
 *   or message (`Alert.alert("Oops", "Try again")`).
 *
 * A literal counts when it is the value itself or part of it: inside
 * parentheses, either branch of a `? :`, `+`, `&&`, `||`, `??`, a template
 * literal, `as` or `satisfies`. Anything else stops the climb, so a
 * catalog key (`t("home.title")`), a condition (`kind === "plan" ? …`), a
 * comparison and a function's argument never count.
 *
 * Ignored: comments, empty or whitespace-only text, text with no letter
 * (punctuation, symbols, numbers, HTML entities: `·`, `—`, `+`, `0`,
 * `&nbsp;`), and every other prop or property (`testID`, `nativeID`, `href`,
 * `className`, analytics event names, route names).
 *
 * Not seen: text that reaches the screen through a variable
 * (`const label = "Save"; <Text>{label}</Text>`), any other function
 * (`setError("…")`, a zod message), or `Alert` under another name. Review
 * catches those; the check guards the common shapes.
 */

/** One piece of hardcoded text. */
export interface Finding {
  column: number;
  /** Repo-relative path, `/`-separated. */
  file: string;
  line: number;
  /** The text as written, trimmed. */
  text: string;
}

/** A file that may keep its hardcoded text, and why. */
export interface AllowlistEntry {
  /** Repo-relative path, `/`-separated. */
  path: string;
  reason: string;
}

/**
 * Files that may keep their hardcoded text. Keep it short, with a reason each:
 * a new entry needs text that genuinely isn't the app's to translate (a brand
 * name in artwork, a developer-only screen). An entry whose file has no
 * hardcoded text left fails the check, so the list can't go stale.
 */
export const ALLOWLIST: readonly AllowlistEntry[] = [];

/** Where the checked files live. */
export const CHECKED_DIRECTORY = "apps/mobile";

/**
 * Props (and object properties) whose string value is shown or read out to
 * the User.
 */
export const TEXT_PROPS: ReadonlySet<string> = new Set([
  "accessibilityHint",
  "accessibilityLabel",
  "alt",
  "aria-description",
  "aria-label",
  "cancelButtonText",
  "confirmButtonText",
  "description",
  "headerBackTitle",
  "headerTitle",
  "hint",
  "label",
  "message",
  "placeholder",
  "subtitle",
  "tabBarLabel",
  "text",
  "title",
]);

/**
 * A custom component's text props follow these names (`confirmLabel`,
 * `emptyTitle`, `buttonText`, `errorMessage`), so they count too.
 */
const TEXT_PROP_SUFFIX = /(?:Hint|Label|Message|Placeholder|Text|Title)$/;

/** Whether a prop or property of this name holds shown text. */
export const isTextProp = (name: string | null) =>
  name !== null && (TEXT_PROPS.has(name) || TEXT_PROP_SUFFIX.test(name));

/** `Alert`'s methods whose first two arguments are its title and message. */
const ALERT_METHODS = new Set(["alert", "prompt"]);

// Build output, native projects and dependencies; tests are fixtures, not UI
const SKIPPED_DIRECTORIES = new Set([
  ".expo",
  ".turbo",
  "__tests__",
  "android",
  "build",
  "coverage",
  "dist",
  "e2e",
  "ios",
  "node_modules",
  "test-utils",
]);
const SOURCE_FILE = /\.tsx?$/;
const SKIPPED_FILE = /(?:\.(?:test|spec)\.tsx?|\.d\.ts)$/;

const LETTER = /\p{L}/u;
// `&nbsp;`, `&middot;`, `&#8212;`: JSX text keeps entities as written
const HTML_ENTITY = /&(?:#\d+|#x[\da-f]+|\w+);/gi;
const NON_SPACE = /\S/;
const WHITESPACE = /\s+/g;

const propertyName = (name: ts.Node) => {
  if (
    ts.isIdentifier(name) ||
    ts.isStringLiteral(name) ||
    ts.isNoSubstitutionTemplateLiteral(name)
  ) {
    return name.text;
  }
  if (ts.isJsxNamespacedName(name)) {
    return `${name.namespace.text}:${name.name.text}`;
  }
  return null;
};

const VALUE_OPERATORS = new Set([
  ts.SyntaxKind.PlusToken,
  ts.SyntaxKind.AmpersandAmpersandToken,
  ts.SyntaxKind.BarBarToken,
  ts.SyntaxKind.QuestionQuestionToken,
]);

/**
 * Whether `parent` passes `child` on as (part of) its own value: a condition
 * or a comparison doesn't.
 */
const passesValueOn = (parent: ts.Node, child: ts.Node) => {
  if (ts.isConditionalExpression(parent)) {
    return child === parent.whenTrue || child === parent.whenFalse;
  }
  if (ts.isBinaryExpression(parent)) {
    return VALUE_OPERATORS.has(parent.operatorToken.kind);
  }
  return (
    ts.isParenthesizedExpression(parent) ||
    ts.isTemplateExpression(parent) ||
    ts.isTemplateSpan(parent) ||
    ts.isAsExpression(parent) ||
    ts.isSatisfiesExpression(parent) ||
    ts.isNonNullExpression(parent)
  );
};

/** Whether `call` is `Alert.alert(…)` or `Alert.prompt(…)`. */
const isAlertCall = (call: ts.CallExpression) => {
  const callee = call.expression;
  return (
    ts.isPropertyAccessExpression(callee) &&
    ts.isIdentifier(callee.expression) &&
    callee.expression.text === "Alert" &&
    ALERT_METHODS.has(callee.name.text)
  );
};

/** Whether the value `node` ends up in is shown to the User. */
const isShown = (node: ts.Node) => {
  let child = node;
  let { parent } = node;
  while (passesValueOn(parent, child)) {
    child = parent;
    ({ parent } = parent);
  }
  // A JSX child: `<Text>{"Save"}</Text>`
  if (
    ts.isJsxExpression(parent) &&
    (ts.isJsxElement(parent.parent) || ts.isJsxFragment(parent.parent))
  ) {
    return true;
  }
  // `title="Save"`, `title={"Save"}`: the expression's parent is the attribute
  const attribute = ts.isJsxExpression(parent) ? parent.parent : parent;
  if (ts.isJsxAttribute(attribute)) {
    return isTextProp(propertyName(attribute.name));
  }
  // `{ title: "Save" }`, and a default: `({ title = "Save" }) =>`
  if (
    (ts.isPropertyAssignment(parent) ||
      ts.isBindingElement(parent) ||
      ts.isParameter(parent)) &&
    child === parent.initializer
  ) {
    const name =
      ts.isBindingElement(parent) && parent.propertyName
        ? parent.propertyName
        : parent.name;
    return isTextProp(propertyName(name));
  }
  if (ts.isCallExpression(parent) && isAlertCall(parent)) {
    const index = parent.arguments.indexOf(child as ts.Expression);
    return index === 0 || index === 1;
  }
  return false;
};

/** The text a string-like node holds, without quotes or `${…}`. */
const textOf = (node: ts.Node) => {
  if (
    ts.isStringLiteral(node) ||
    ts.isNoSubstitutionTemplateLiteral(node) ||
    ts.isTemplateHead(node) ||
    ts.isTemplateMiddle(node) ||
    ts.isTemplateTail(node)
  ) {
    return node.text;
  }
  return null;
};

/**
 * Finds the hardcoded text in one source. `path` names the file in each
 * finding and decides whether it's parsed as TSX.
 */
export function checkSource(path: string, source: string): Finding[] {
  const file = ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    true,
    path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
  const findings: Finding[] = [];

  const report = (position: number, text: string) => {
    const { line, character } = file.getLineAndCharacterOfPosition(position);
    findings.push({
      column: character + 1,
      file: path,
      line: line + 1,
      text: text.trim().replace(WHITESPACE, " "),
    });
  };

  const visit = (node: ts.Node) => {
    if (ts.isJsxText(node)) {
      if (LETTER.test(node.text.replace(HTML_ENTITY, ""))) {
        // Point at the text itself, not the whitespace before it
        report(node.pos + node.text.search(NON_SPACE), node.text);
      }
      return;
    }
    const text = textOf(node);
    if (text !== null) {
      // A template's static parts sit in its head and spans: the climb
      // starts from the template expression itself
      const value =
        ts.isTemplateHead(node) ||
        ts.isTemplateMiddle(node) ||
        ts.isTemplateTail(node)
          ? node.parent
          : node;
      if (LETTER.test(text) && isShown(value)) {
        report(node.getStart(file), text);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);

  return findings.sort((a, b) => a.line - b.line || a.column - b.column);
}

/** Every checked file under `directory`, absolute, sorted. */
export function collectFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRECTORIES.has(entry.name)) {
        files.push(...collectFiles(path));
      }
    } else if (SOURCE_FILE.test(entry.name) && !SKIPPED_FILE.test(entry.name)) {
      files.push(path);
    }
  }
  return files.sort();
}

/** The outcome of checking a set of files against the allowlist. */
export interface CheckResult {
  findings: Finding[];
  /** Allowlist entries whose file has no hardcoded text (or doesn't exist). */
  staleEntries: AllowlistEntry[];
}

/**
 * Checks `files` (repo-relative path → source). Findings in an allowlisted
 * file are dropped; an entry that drops nothing is stale.
 */
export function checkFiles(
  files: ReadonlyMap<string, string>,
  allowlist: readonly AllowlistEntry[] = ALLOWLIST
): CheckResult {
  const allowed = new Set(allowlist.map((entry) => entry.path));
  const used = new Set<string>();
  const findings: Finding[] = [];
  for (const [path, source] of files) {
    const fileFindings = checkSource(path, source);
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
  for (const path of collectFiles(join(root, CHECKED_DIRECTORY))) {
    files.set(toPosix(relative(root, path)), readFileSync(path, "utf8"));
  }
  return files;
}

/** Formats a result for the terminal: one line per piece of text. */
export function formatResult({ findings, staleEntries }: CheckResult): string {
  const lines = findings.map(
    ({ column, file, line, text }) => `${file}:${line}:${column}  ${text}`
  );
  for (const entry of staleEntries) {
    lines.push(
      `${entry.path}  allowlist entry has no hardcoded text left: remove it from ALLOWLIST in packages/i18n/src/text-check.ts`
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
      `\n${result.findings.length} hardcoded text(s) found. Take the text from the catalogs in @fitme/i18n through t() (AGENTS.md, App language (mobile)).`
    );
    process.exit(1);
  }
  console.log(
    `No hardcoded text in ${files.size} files (${CHECKED_DIRECTORY}).`
  );
}
