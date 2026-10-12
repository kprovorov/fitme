import { describe, expect, it } from "vitest";
import { COMMENT_MARKER, decide } from "../decide";

const GOOD_TITLE = "feat(mobile): add rest timer";
const APP_FILES = [
  "apps/mobile/components/rest-timer.tsx",
  "apps/mobile/__tests__/rest-timer.test.tsx",
];

describe("path floor", () => {
  it.each([
    [
      "Supabase migration",
      "packages/supabase/supabase/migrations/20261012000000_add_rest_timer.sql",
    ],
    ["Supabase config", "packages/supabase/supabase/config.toml"],
    ["Edge Function", "packages/supabase/supabase/functions/ai-agent/index.ts"],
    ["GitHub workflows", ".github/workflows/unit-tests.yml"],
    ["PR Risk classifier", "packages/pr-risk/src/decide.ts"],
    ["mobile app config", "apps/mobile/app.json"],
    ["mobile app config", "apps/mobile/app.config.ts"],
    [
      "mobile config plugin",
      "apps/mobile/plugins/with-ios-min-deployment-target.js",
    ],
    ["EAS config", "apps/mobile/eas.json"],
    ["EAS config", "apps/mobile/.eas/workflows/create-production-builds.yml"],
    ["pnpm lockfile", "pnpm-lock.yaml"],
    ["env file", ".env.example"],
    ["env file", "apps/web/.env.local"],
    ["auth / Clerk / RevenueCat code", "apps/mobile/hooks/mutations/auth.ts"],
    [
      "auth / Clerk / RevenueCat code",
      "apps/mobile/components/authenticated.tsx",
    ],
    ["auth / Clerk / RevenueCat code", "apps/web/app/oauth/consent/page.tsx"],
    ["auth / Clerk / RevenueCat code", "apps/mcp/src/auth.ts"],
    [
      "auth / Clerk / RevenueCat code",
      "packages/supabase/scripts/check-clerk-trust.ts",
    ],
    ["auth / Clerk / RevenueCat code", "apps/mobile/hooks/revenueCat.ts"],
    ["auth / Clerk / RevenueCat code", "apps/mcp/src/context.ts"],
    ["auth / Clerk / RevenueCat code", "apps/mobile/app/_layout.tsx"],
    ["auth / Clerk / RevenueCat code", "apps/mobile/lib/supabase.ts"],
    ["auth / Clerk / RevenueCat code", "apps/web/app/(app)/layout.tsx"],
    ["auth / Clerk / RevenueCat code", "apps/web/lib/supabase/proxy.ts"],
    ["auth / Clerk / RevenueCat code", "apps/web/proxy.ts"],
  ])("forces risk:high for a %s change (%s)", (family, path) => {
    const decision = decide({ files: [...APP_FILES, path], title: GOOD_TITLE });

    expect(decision.label).toBe("risk:high");
    expect(decision.source).toBe("floor");
    expect(decision.runEvaluator).toBe(false);
    expect(decision.comment).toContain(`Touches ${family}: \`${path}\``);
  });

  it("names every floor path the PR touches", () => {
    const decision = decide({
      files: ["pnpm-lock.yaml", ".github/workflows/pr-risk.yml"],
      title: GOOD_TITLE,
    });

    expect(decision.reasons).toEqual([
      "Touches pnpm lockfile: `pnpm-lock.yaml`",
      "Touches GitHub workflows: `.github/workflows/pr-risk.yml`",
    ]);
  });

  it("wins over a bad title", () => {
    const decision = decide({
      files: ["pnpm-lock.yaml"],
      title: "Update stuff",
    });

    expect(decision.label).toBe("risk:high");
  });

  it("wins over a low evaluator verdict", () => {
    const decision = decide({
      evaluator: {
        verdict: JSON.stringify({ level: "low", reasons: ["Tiny change."] }),
      },
      files: ["packages/supabase/supabase/migrations/1_init.sql"],
      title: GOOD_TITLE,
    });

    expect(decision.label).toBe("risk:high");
    expect(decision.source).toBe("floor");
    expect(decision.comment).not.toContain("Tiny change.");
  });

  it("leaves app code, docs and blog bylines alone", () => {
    const decision = decide({
      files: [
        ...APP_FILES,
        "apps/site/components/blog/author.tsx",
        "docs/adr/0001-clerk-user-id-as-identity-key.md",
        "apps/mobile/package.json",
      ],
      title: GOOD_TITLE,
    });

    expect(decision.source).not.toBe("floor");
  });
});

describe("title rule", () => {
  it.each([
    "Update stuff",
    "feature: add rest timer",
    "feat add rest timer",
    "feat:add rest timer",
    "feat(): add rest timer",
    "",
  ])("gives needs-human for %j", (title) => {
    const decision = decide({ files: APP_FILES, title });

    expect(decision.label).toBe("needs-human");
    expect(decision.source).toBe("title");
    expect(decision.runEvaluator).toBe(false);
    expect(decision.comment).toContain("is not a conventional commit");
  });

  it("quotes the title as inline code", () => {
    const decision = decide({ files: APP_FILES, title: "Ping @someone `now`" });

    expect(decision.comment).toContain("Title `Ping @someone 'now'` is not");
  });

  it.each([
    "feat: add rest timer",
    "fix(mobile): stop timer drift",
    "refactor(supabase)!: drop legacy RPC",
    "docs: document main as the default branch (FIT-78)",
    "revert: feat(mobile): add rest timer",
  ])("accepts %j", (title) => {
    const decision = decide({ files: APP_FILES, title });

    expect(decision.source).not.toBe("title");
  });
});

describe("evaluator", () => {
  it("is not configured yet when a PR passes the floor and title rule", () => {
    const decision = decide({ files: APP_FILES, title: GOOD_TITLE });

    expect(decision.label).toBe("needs-human");
    expect(decision.source).toBe("pending");
    expect(decision.runEvaluator).toBe(true);
    expect(decision.comment).toContain("Evaluator not configured yet.");
  });

  it.each(["low", "medium", "high"] as const)(
    "maps a valid %s verdict to its label with the reasons",
    (level) => {
      const decision = decide({
        evaluator: {
          verdict: JSON.stringify({
            level,
            reasons: ["Covered by tests.", "Small diff."],
          }),
        },
        files: APP_FILES,
        title: GOOD_TITLE,
      });

      expect(decision.label).toBe(`risk:${level}`);
      expect(decision.source).toBe("evaluator");
      expect(decision.runEvaluator).toBe(false);
      expect(decision.comment).toContain("- Covered by tests.\n- Small diff.");
    }
  );

  it.each([
    ["malformed JSON", "{ level: low"],
    ["a non-object", '"low"'],
    ["an unknown level", JSON.stringify({ level: "trivial", reasons: ["x"] })],
    ["missing reasons", JSON.stringify({ level: "low" })],
    ["empty reasons", JSON.stringify({ level: "low", reasons: [] })],
    ["non-string reasons", JSON.stringify({ level: "low", reasons: [1] })],
  ])("gives needs-human for %s", (_case, verdict) => {
    const decision = decide({
      evaluator: { verdict },
      files: APP_FILES,
      title: GOOD_TITLE,
    });

    expect(decision.label).toBe("needs-human");
    expect(decision.source).toBe("error");
    expect(decision.comment).toContain("Evaluator verdict is invalid");
  });

  it("gives needs-human with the reason when the evaluator failed", () => {
    const decision = decide({
      evaluator: { error: "API timeout." },
      files: APP_FILES,
      title: GOOD_TITLE,
    });

    expect(decision.label).toBe("needs-human");
    expect(decision.source).toBe("error");
    expect(decision.comment).toContain("Evaluator failed: API timeout.");
  });
});

describe("sticky comment", () => {
  it.each([
    { files: ["pnpm-lock.yaml"], title: GOOD_TITLE },
    { files: APP_FILES, title: "Update stuff" },
    { files: APP_FILES, title: GOOD_TITLE },
  ])("starts with the marker and names the label", (input) => {
    const decision = decide(input);

    expect(decision.comment.startsWith(`${COMMENT_MARKER}\n`)).toBe(true);
    expect(decision.comment).toContain(`PR Risk: \`${decision.label}\``);
  });
});
