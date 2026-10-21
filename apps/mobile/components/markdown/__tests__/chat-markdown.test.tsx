import { describe, expect, it, jest } from "@jest/globals";
import { render, screen } from "@testing-library/react-native";
import { StyleSheet, type TextStyle } from "react-native";
import { ChatMarkdown } from "../chat-markdown";

// Each text style resolves to a type that names it, so the test can tell
// which style a piece of text ends up in
const SIZES: Record<string, number> = {
  "text-body": 17,
  "text-callout": 16,
  "text-callout-emphasized": 16,
  "text-footnote-emphasized": 13,
  "text-headline": 17,
  "text-mono-footnote": 13,
  "text-mono-subhead": 15,
  "text-subhead": 15,
  "text-subhead-emphasized": 15,
  "text-title-2-emphasized": 22,
  "text-title-3-emphasized": 20,
};

jest.mock("uniwind", () => ({
  useCSSVariable: (names: string[]) => names.map(() => "#000000"),
  useResolveClassNames: (className: string) => ({
    fontFamily: className,
    fontSize: SIZES[className],
    fontWeight: className.endsWith("-emphasized") ? 600 : 400,
  }),
}));
jest.mock("expo-web-browser", () => ({}));
// Syntax highlighting pulls in an ESM-only tree and isn't under test here
jest.mock("../code-block", () => ({ CodeBlock: () => null }));

type TypeKey = "fontFamily" | "fontSize" | "fontWeight";

interface Node {
  parent: Node | null;
  props: { style?: unknown };
  type: unknown;
}

/**
 * What React Native draws for a piece of text: each type property comes from
 * the nearest enclosing Text that sets it.
 */
function effectiveType(text: string): Pick<TextStyle, TypeKey> {
  const type: Pick<TextStyle, TypeKey> = {};
  let node: Node | null = screen.getByText(text) as unknown as Node;
  while (node) {
    const style = StyleSheet.flatten(node.props.style as TextStyle) ?? {};
    for (const key of ["fontFamily", "fontSize", "fontWeight"] as const) {
      if (type[key] === undefined && style[key] !== undefined) {
        Object.assign(type, { [key]: style[key] });
      }
    }
    node = node.parent;
  }
  return type;
}

/** The role of the table cell a piece of text sits in. */
function cellRole(text: string): unknown {
  let node: (Node & { props: { role?: string } }) | null = screen.getByText(
    text
  ) as unknown as Node & { props: { role?: string } };
  while (node) {
    if (node.props.role === "cell" || node.props.role === "columnheader") {
      return node.props.role;
    }
    node = node.parent as typeof node;
  }
  return undefined;
}

describe("ChatMarkdown", () => {
  it("sets paragraph text in Callout", async () => {
    await render(<ChatMarkdown>Plain words</ChatMarkdown>);
    expect(effectiveType("Plain words")).toEqual({
      fontFamily: "text-callout",
      fontSize: 16,
      fontWeight: 400,
    });
  });

  it("keeps a link inside bold text emphasized", async () => {
    await render(
      <ChatMarkdown>{"**[bold link](https://fitme.app)**"}</ChatMarkdown>
    );
    expect(effectiveType("bold link")).toEqual({
      fontFamily: "text-callout-emphasized",
      fontSize: 16,
      fontWeight: 600,
    });
  });

  it("sets a link inside a heading in the heading's style", async () => {
    await render(
      <ChatMarkdown>
        {"# Heading with [a link](https://fitme.app)"}
      </ChatMarkdown>
    );
    expect(effectiveType("a link")).toEqual({
      fontFamily: "text-title-2-emphasized",
      fontSize: 22,
      fontWeight: 600,
    });
  });

  it("renders a table as the Table Primitive, header row first", async () => {
    await render(
      <ChatMarkdown>
        {"| Exercise | Sets |\n| --- | --- |\n| Squat | 3 |\n| Bench | 4 |"}
      </ChatMarkdown>
    );

    // Table views aren't accessibility elements, so find each text's cell
    expect(cellRole("Exercise")).toBe("columnheader");
    expect(cellRole("Sets")).toBe("columnheader");
    for (const text of ["Squat", "3", "Bench", "4"]) {
      expect(cellRole(text)).toBe("cell");
    }
    expect(screen.getByText("Squat")).toBeTruthy();
  });
});
