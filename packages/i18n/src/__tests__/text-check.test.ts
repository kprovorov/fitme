import { describe, expect, it } from "vitest";
import {
  ALLOWLIST,
  checkFiles,
  checkSource,
  formatResult,
} from "../text-check";

const PATH = "apps/mobile/components/example.tsx";

const texts = (source: string, path = PATH) =>
  checkSource(path, source).map((finding) => finding.text);

describe("checkSource", () => {
  it("fails JSX text, naming the file, line, column and text", () => {
    const source = [
      "export function Empty() {",
      "  return (",
      "    <Text>",
      "      No workouts yet",
      "    </Text>",
      "  );",
      "}",
    ].join("\n");

    expect(checkSource(PATH, source)).toEqual([
      { column: 7, file: PATH, line: 4, text: "No workouts yet" },
    ]);
  });

  it("fails text in another script", () => {
    expect(texts("<Text>Зберегти</Text>")).toEqual(["Зберегти"]);
  });

  it("fails a string literal as a JSX child, in either branch of a condition", () => {
    const source = [
      '<Text>{"Save"}</Text>',
      '<Text>{saving ? "Saving" : "Save"}</Text>',
      '<>{error && "Something went wrong"}</>',
    ].join("\n");

    expect(texts(source)).toEqual([
      "Save",
      "Saving",
      "Save",
      "Something went wrong",
    ]);
  });

  it("fails a text prop, quoted, in braces or built from a template", () => {
    const source = [
      '<Button title="Start workout" />',
      '<Input placeholder={"Email"} />',
      // biome-ignore lint/suspicious/noTemplateCurlyInString: the fixture is source code holding a template literal
      "<Button accessibilityLabel={`Delete ${name}`} />",
      '<Field label={required ? "Name *" : "Name"} accessibilityHint={hint ?? "Opens the plan"} />',
    ].join("\n");

    expect(texts(source)).toEqual([
      "Start workout",
      "Email",
      "Delete",
      "Name *",
      "Name",
      "Opens the plan",
    ]);
  });

  it("fails a text property in an options object", () => {
    const source = [
      '<Stack.Screen options={{ title: "Settings", headerBackTitle: "Back" }} />',
      'navigation.setOptions({ headerTitle: "Plan" });',
    ].join("\n");

    expect(texts(source)).toEqual(["Settings", "Back", "Plan"]);
  });

  it("fails an alert's title, message and button text, in .ts files too", () => {
    const source = [
      'Alert.alert("Couldn\'t start workout", "Try again in a moment.", [',
      '  { style: "cancel", text: "OK" },',
      "]);",
      // biome-ignore lint/suspicious/noTemplateCurlyInString: the fixture is source code holding a template literal
      'Alert.prompt("Rename", `Name the ${kind}`);',
    ].join("\n");

    expect(texts(source, "apps/mobile/hooks/start-workout.ts")).toEqual([
      "Couldn't start workout",
      "Try again in a moment.",
      "OK",
      "Rename",
      "Name the",
    ]);
  });

  it("passes text taken from the catalogs", () => {
    const source = [
      "const { t } = useTranslation();",
      '<Text>{t("home.empty")}</Text>',
      '<Button title={t("workout.start")} accessibilityLabel={t("workout.startHint", { name })} />',
      '<Stack.Screen options={{ title: t("settings.title") }} />',
      'Alert.alert(t("errors.title"), t("errors.message"), [{ text: t("common.ok") }]);',
      '<Text>{saving ? t("save.saving") : t("save.idle")}</Text>',
    ].join("\n");

    expect(checkSource(PATH, source)).toEqual([]);
  });

  it("ignores comments, whitespace and text without a letter", () => {
    const source = [
      "// Shows Save until the User saves",
      "/* Empty state: No workouts yet */",
      "<View>",
      "  {/* Header */}",
      "  <Text>{count} · {total}</Text>",
      "  <Text> — </Text>",
      '  <Text>{"+"}</Text>',
      '  <Text>{" "}</Text>',
      '  <Button title="" label="  " accessibilityLabel="…" />',
      "  <Text>100%</Text>",
      "</View>",
    ].join("\n");

    expect(checkSource(PATH, source)).toEqual([]);
  });

  it("ignores props and properties that aren't shown", () => {
    const source = [
      '<View testID="start-workout" nativeID="Start" />',
      '<Link href="/plans/new">{t("plans.new")}</Link>',
      '<Text className="text-footnote text-muted-foreground" />',
      '<Stack.Screen name="settings" options={{ presentation: "formSheet" }} />',
      'track("Plan Saved", { source: "Arnold" });',
      'const variants = { primary: { labelClass: "text-primary-foreground" } };',
      'useQuery({ queryKey: ["open-workout-session"] });',
      'Alert.alert(t("errors.title"), t("errors.message"), [{ style: "destructive", text: t("common.ok") }]);',
    ].join("\n");

    expect(checkSource(PATH, source)).toEqual([]);
  });

  it("ignores catalog keys, conditions and comparisons", () => {
    const source = [
      '<Text>{t(done ? "workout.done" : "workout.open")}</Text>',
      '<Button title={kind === "plan" ? t("plan.save") : t("workout.save")} />',
      '<Text>{status === "finished" && t("history.finished")}</Text>',
      '<Field label={format(value, "dayMonth")} />',
    ].join("\n");

    expect(checkSource(PATH, source)).toEqual([]);
  });
});

describe("checkFiles", () => {
  const files = new Map([
    ["apps/mobile/app/empty.tsx", "<Text>Nothing here</Text>"],
    ["apps/mobile/app/home.tsx", '<Text>{t("home.title")}</Text>'],
  ]);

  it("fails a file outside the allowlist", () => {
    const result = checkFiles(files, []);

    expect(result.findings.map((finding) => finding.file)).toEqual([
      "apps/mobile/app/empty.tsx",
    ]);
    expect(formatResult(result)).toBe(
      "apps/mobile/app/empty.tsx:1:7  Nothing here"
    );
  });

  it("passes an allowlisted file", () => {
    const result = checkFiles(files, [
      { path: "apps/mobile/app/empty.tsx", reason: "developer-only screen" },
    ]);

    expect(result).toEqual({ findings: [], staleEntries: [] });
  });

  it("reports an allowlist entry whose file has no hardcoded text left", () => {
    const stale = { path: "apps/mobile/app/home.tsx", reason: "translated" };
    const result = checkFiles(files, [stale]);

    expect(result.staleEntries).toEqual([stale]);
    expect(formatResult(result)).toContain(
      "allowlist entry has no hardcoded text left"
    );
  });

  it("gives every allowlist entry a reason", () => {
    for (const entry of ALLOWLIST) {
      expect(entry.reason.trim()).not.toBe("");
    }
  });
});
