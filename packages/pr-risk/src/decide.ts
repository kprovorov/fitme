export const RISK_LABELS = [
  "risk:low",
  "risk:medium",
  "risk:high",
  "needs-human",
] as const;

export type RiskLabel = (typeof RISK_LABELS)[number];

export type VerdictSource =
  | "floor"
  | "title"
  | "pending"
  | "evaluator"
  | "error";

/** Hidden marker that identifies the sticky PR Risk comment. */
export const COMMENT_MARKER = "<!-- pr-risk -->";

/** Commit types the release workflow understands. */
export const CONVENTIONAL_TYPES = [
  "feat",
  "fix",
  "chore",
  "docs",
  "refactor",
  "test",
  "perf",
  "ci",
  "build",
  "style",
  "revert",
] as const;

const CONVENTIONAL_TITLE = new RegExp(
  `^(${CONVENTIONAL_TYPES.join("|")})(\\([^()\\s][^()]*\\))?!?: \\S`
);

const ENV_FILE = /(^|\/)\.env(\.[^/]*)?$/;
const MARKDOWN_FILE = /\.mdx?$/;
// "auth" also matches oauth, authenticated, authorization; "author" is a blog byline.
const AUTH_PATH = /auth(?!ors?\b)|clerk|revenue-?cat/;
/** Session, token and auth-guard code whose path doesn't say so. */
const AUTH_FILES = new Set([
  "apps/mcp/src/context.ts",
  "apps/mobile/app/_layout.tsx",
  "apps/mobile/lib/supabase.ts",
  "apps/web/app/(app)/layout.tsx",
  "apps/web/lib/supabase/proxy.ts",
  "apps/web/proxy.ts",
]);

interface FloorFamily {
  matches: (path: string) => boolean;
  name: string;
}

/** Paths that force `risk:high` no matter what the evaluator says. */
const FLOOR_FAMILIES: FloorFamily[] = [
  {
    matches: (p) => p.startsWith("packages/supabase/supabase/migrations/"),
    name: "Supabase migration",
  },
  {
    matches: (p) => p === "packages/supabase/supabase/config.toml",
    name: "Supabase config",
  },
  {
    matches: (p) => p.startsWith("packages/supabase/supabase/functions/"),
    name: "Edge Function",
  },
  {
    matches: (p) =>
      p.startsWith(".github/workflows/") || p.startsWith(".github/actions/"),
    name: "GitHub workflows",
  },
  {
    matches: (p) => p.startsWith("packages/pr-risk/"),
    name: "PR Risk classifier",
  },
  {
    matches: (p) =>
      p === "apps/mobile/app.json" || p.startsWith("apps/mobile/app.config."),
    name: "mobile app config",
  },
  {
    matches: (p) => p.startsWith("apps/mobile/plugins/"),
    name: "mobile config plugin",
  },
  {
    matches: (p) =>
      p === "apps/mobile/eas.json" || p.startsWith("apps/mobile/.eas/"),
    name: "EAS config",
  },
  {
    matches: (p) => p === "pnpm-lock.yaml",
    name: "pnpm lockfile",
  },
  {
    matches: (p) => ENV_FILE.test(p),
    name: "env file",
  },
  {
    matches: (p) =>
      AUTH_FILES.has(p) ||
      (!MARKDOWN_FILE.test(p) && AUTH_PATH.test(p.toLowerCase())),
    name: "auth / Clerk / RevenueCat code",
  },
];

export type EvaluatorResult =
  /** Raw contents of the verdict file the evaluator wrote. */
  | { verdict: string }
  /** Why the evaluator produced no verdict (API error, timeout, missing secret...). */
  | { error: string };

export interface DecisionInput {
  /** Absent before the evaluator has run. */
  evaluator?: EvaluatorResult;
  /** Changed file paths, relative to the repo root. */
  files: string[];
  title: string;
}

export interface Decision {
  /** Markdown body of the sticky comment, starting with {@link COMMENT_MARKER}. */
  comment: string;
  label: RiskLabel;
  reasons: string[];
  /** True when the floor and title rule passed and only the evaluator can decide. */
  runEvaluator: boolean;
  source: VerdictSource;
}

const EVALUATOR_LEVELS = ["low", "medium", "high"] as const;
type EvaluatorLevel = (typeof EVALUATOR_LEVELS)[number];

const SOURCE_NAMES: Record<VerdictSource, string> = {
  error: "evaluator error",
  evaluator: "evaluator",
  floor: "path floor",
  pending: "evaluator not run",
  title: "title rule",
};

export function decide({ files, title, evaluator }: DecisionInput): Decision {
  const floorReasons = files.flatMap((file) =>
    FLOOR_FAMILIES.filter((family) => family.matches(file)).map(
      (family) => `Touches ${family.name}: \`${file}\``
    )
  );
  if (floorReasons.length > 0) {
    return verdict("risk:high", "floor", floorReasons, false);
  }

  if (!CONVENTIONAL_TITLE.test(title.trim())) {
    return verdict(
      "needs-human",
      "title",
      [
        `Title ${codeSpan(title)} is not a conventional commit (\`type(scope)?: subject\` with type one of ${CONVENTIONAL_TYPES.join(", ")}).`,
      ],
      false
    );
  }

  if (!evaluator) {
    return verdict(
      "needs-human",
      "pending",
      ["Evaluator not configured yet."],
      true
    );
  }

  if ("error" in evaluator) {
    return verdict(
      "needs-human",
      "error",
      [`Evaluator failed: ${evaluator.error}`],
      false
    );
  }

  const parsed = parseVerdict(evaluator.verdict);
  if ("invalid" in parsed) {
    return verdict(
      "needs-human",
      "error",
      [`Evaluator verdict is invalid: ${parsed.invalid}`],
      false
    );
  }
  return verdict(`risk:${parsed.level}`, "evaluator", parsed.reasons, false);
}

function parseVerdict(
  raw: string
): { level: EvaluatorLevel; reasons: string[] } | { invalid: string } {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { invalid: "not valid JSON." };
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { invalid: "not a JSON object." };
  }
  const { level, reasons } = value as Record<string, unknown>;
  if (!EVALUATOR_LEVELS.includes(level as EvaluatorLevel)) {
    return { invalid: `level must be one of ${EVALUATOR_LEVELS.join(", ")}.` };
  }
  const isReasonList =
    Array.isArray(reasons) &&
    reasons.length > 0 &&
    reasons.every((reason) => typeof reason === "string" && reason.trim());
  if (!isReasonList) {
    return { invalid: "reasons must be a non-empty list of strings." };
  }
  return { level: level as EvaluatorLevel, reasons: reasons as string[] };
}

/** Inline code keeps a PR title from rendering markdown or @-mentions. */
function codeSpan(text: string): string {
  return `\`${text.replaceAll("`", "'")}\``;
}

function verdict(
  label: RiskLabel,
  source: VerdictSource,
  reasons: string[],
  runEvaluator: boolean
): Decision {
  const comment = [
    COMMENT_MARKER,
    `## PR Risk: \`${label}\``,
    "",
    `**Source:** ${SOURCE_NAMES[source]}`,
    "",
    ...reasons.map((reason) => `- ${reason}`),
    "",
  ].join("\n");
  return { comment, label, reasons, runEvaluator, source };
}
