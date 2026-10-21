import { describe, expect, it } from "vitest";
import {
  ALLOWLIST,
  checkFiles,
  checkSource,
  formatResult,
} from "../literal-check";

const PATH = "apps/mobile/components/example.tsx";

const literals = (source: string) =>
  checkSource(PATH, source).map((finding) => finding.literal);

describe("checkSource", () => {
  it("fails a hex color in a .tsx file, naming the file, line and literal", () => {
    const source = [
      "export function Logo() {",
      '  return <Path fill="#C0FF38" />;',
      "}",
    ].join("\n");

    expect(checkSource(PATH, source)).toEqual([
      {
        column: 22,
        file: PATH,
        hint: "hex color: use the --color-primary token",
        line: 2,
        literal: "#C0FF38",
      },
    ]);
  });

  it("fails rgba()", () => {
    const source =
      'const style = { boxShadow: "0px 0px 16px rgba(0, 0, 0, 0.15)" };';

    expect(literals(source)).toEqual(["rgba(0, 0, 0, 0.15)"]);
  });

  it("fails rgb() and hsl()", () => {
    expect(
      literals('const a = "rgb(1, 2, 3)"; const b = "hsl(0 0% 0%)";')
    ).toEqual(["rgb(1, 2, 3)", "hsl(0 0% 0%)"]);
  });

  it("fails text-[13px] and names the text style it should be", () => {
    const [finding] = checkSource(PATH, '<Text className="text-[13px]" />');

    expect(finding?.literal).toBe("text-[13px]");
    expect(finding?.hint).toContain("text-footnote");
  });

  it("fails arbitrary leading, radius and spacing, with variants", () => {
    const source =
      '<View className="leading-[20px] active:rounded-[10px] rounded-tl-[3px] px-[0.3rem] -mt-[2px] gap-x-[5px] space-y-[1px]" />';

    expect(literals(source)).toEqual([
      "leading-[20px]",
      "rounded-[10px]",
      "rounded-tl-[3px]",
      "px-[0.3rem]",
      "-mt-[2px]",
      "gap-x-[5px]",
      "space-y-[1px]",
    ]);
  });

  it("finds literals in template literals and cn() arguments", () => {
    const source =
      // biome-ignore lint/suspicious/noTemplateCurlyInString: the fixture is source code holding a template literal
      'const c = cn(`p-[3px] ${active ? "bg-[#fff]" : ""}`, "rounded-[4px]");';

    expect(literals(source)).toEqual(["p-[3px]", "#fff", "rounded-[4px]"]);
  });

  it("passes token classes and CSS-variable references", () => {
    const source = [
      '<View className="bg-background text-primary px-md gap-2 rounded-card text-footnote" />',
      '<View className="h-(--size-button-pill-default) p-[var(--spacing-md)] rounded-[--radius-card]" />',
      '<ActivityIndicator colorClassName="accent-foreground" />',
    ].join("\n");

    expect(checkSource(PATH, source)).toEqual([]);
  });

  it("leaves other arbitrary utilities alone", () => {
    const source =
      '<View className="max-w-[80%] h-[1px] w-[10px] min-h-[80px] grid-cols-[1fr_2fr] ring-[3px] top-[2px]" />';

    expect(checkSource(PATH, source)).toEqual([]);
  });

  it("fails hex colors in arbitrary properties and CSS declarations", () => {
    const source =
      '<View className="[color:#fff] hover:[background-color:#c0ff38]" style={{ color: "#fff" }} />; const css = "border-color:#ffffff1a";';

    expect(literals(source)).toEqual(["#fff", "#c0ff38", "#fff", "#ffffff1a"]);
  });

  it("passes URLs with a fragment", () => {
    const source = [
      'const a = "https://x.y/#a";',
      'const b = "https://fitmeproject.com/support#faq";',
      'const c = "/blog/post#add";',
      'const d = "https://x.y/page?tab=1#cafe";',
      '<Link href="/terms#bad">Terms</Link>',
    ].join("\n");

    expect(checkSource(PATH, source)).toEqual([]);
  });

  it("passes anchors wrapped in JSX expressions and templates", () => {
    const source = [
      "<a href={'#abc'} />",
      // biome-ignore lint/suspicious/noTemplateCurlyInString: the fixture is source code holding a template literal
      "<a href={`${path}#add`} />",
      '<a href={(active ? "#fed" : "#bad")} />',
      '<a href={base + "#cafe"} id={anchor ?? "#face"} />',
    ].join("\n");

    expect(checkSource(PATH, source)).toEqual([]);
  });

  it("skips every detector in anchor and id values", () => {
    const source = [
      '<a href="/colors/rgb(1,2,3)" />',
      '<View testID="rounded-[10px]" nativeID="text-[13px] #fff" />',
      // biome-ignore lint/suspicious/noTemplateCurlyInString: the fixture is source code holding a template literal
      "<a id={`swatch-${n}-hsl(0 0% 0%)`} />",
    ].join("\n");

    expect(checkSource(PATH, source)).toEqual([]);
  });

  it("still fails the same text outside anchor and id values", () => {
    const source = [
      '<View className="rounded-[10px]" />',
      '<View style={{ color: "rgb(1,2,3)" }} />',
    ].join("\n");

    expect(literals(source)).toEqual(["rounded-[10px]", "rgb(1,2,3)"]);
  });

  it("still fails a template in a non-anchor attribute", () => {
    // biome-ignore lint/suspicious/noTemplateCurlyInString: the fixture is source code holding a template literal
    const source = "<View className={`${x} [color:#fff]`} />";

    expect(literals(source)).toEqual(["#fff"]);
  });

  it("fails a CSS-variable fallback and passes a bare reference", () => {
    const source =
      '<View className="p-[var(--spacing-card,13px)] p-[var(--spacing-sm)] h-(--size-button-pill-sm) gap-[--spacing-xs]" />';

    expect(literals(source)).toEqual(["p-[var(--spacing-card,13px)]"]);
  });

  it("ignores comments, JSX text, URLs, anchors and ids", () => {
    const source = [
      "// Was #C0FF38 and rgba(0, 0, 0, 0.1), now a token",
      "/* text-[13px] */",
      "const a = 1;",
      '<Link href="https://example.com/page#abc">Order #123 at #fff</Link>',
      '<a href="#add" id="#bad" />',
      '<View testID="#face" />',
      'const url = "https://example.com/#cafe";',
    ].join("\n");

    expect(checkSource(PATH, source)).toEqual([]);
  });

  it("ignores hex-like text that isn't a whole color", () => {
    expect(
      literals('const a = "#12345"; const b = "#abcdefg"; const c = "x#fff";')
    ).toEqual([]);
  });
});

describe("checkFiles", () => {
  const files = new Map([
    ["apps/mobile/components/sign.tsx", '<Path fill="#C0FF38" />'],
    ["apps/web/app/page.tsx", '<div className="text-primary" />'],
  ]);

  it("fails a file outside the allowlist", () => {
    const result = checkFiles(files, []);

    expect(result.findings.map((finding) => finding.file)).toEqual([
      "apps/mobile/components/sign.tsx",
    ]);
    expect(formatResult(result)).toBe(
      "apps/mobile/components/sign.tsx:1:13  #C0FF38  hex color: use the --color-primary token"
    );
  });

  it("passes an allowlisted file", () => {
    const result = checkFiles(files, [
      { path: "apps/mobile/components/sign.tsx", reason: "brand artwork" },
    ]);

    expect(result).toEqual({ findings: [], staleEntries: [] });
  });

  it("reports an allowlist entry whose file has no literal left", () => {
    const stale = { path: "apps/web/app/page.tsx", reason: "no longer needed" };
    const result = checkFiles(new Map([["apps/web/app/page.tsx", "<div />"]]), [
      stale,
    ]);

    expect(result.staleEntries).toEqual([stale]);
    expect(formatResult(result)).toContain(
      "allowlist entry has no literal left"
    );
  });

  it("gives every allowlist entry a reason", () => {
    for (const entry of ALLOWLIST) {
      expect(entry.reason.trim()).not.toBe("");
    }
  });
});
