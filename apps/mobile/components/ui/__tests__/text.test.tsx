import { describe, expect, it } from "@jest/globals";
import { render, screen } from "@testing-library/react-native";
import type * as React from "react";
import { Text, TextClassContext, type TextVariant } from "../text";
import {
  BlockQuote,
  Code,
  H1,
  H2,
  H3,
  H4,
  Large,
  Lead,
  Muted,
  P,
  Small,
} from "../typography";

const COMPONENTS: Record<
  TextVariant,
  React.ComponentType<{ children: string }>
> = {
  blockquote: BlockQuote,
  code: Code,
  default: P,
  h1: H1,
  h2: H2,
  h3: H3,
  h4: H4,
  large: Large,
  lead: Lead,
  muted: Muted,
  p: P,
  small: Small,
};

const VARIANTS = Object.keys(COMPONENTS) as TextVariant[];

const HEADINGS = [
  ["h1", H1, 1],
  ["h2", H2, 2],
  ["h3", H3, 3],
  ["h4", H4, 4],
] as const;

describe("Text", () => {
  it.each(VARIANTS)("renders its children as %s", async (variant) => {
    await render(<Text variant={variant}>{`Copy ${variant}`}</Text>);

    expect(screen.getByText(`Copy ${variant}`)).toBeTruthy();
  });

  it.each(HEADINGS)(
    "exposes %s as a heading of level %i",
    async (variant, _component, level) => {
      await render(<Text variant={variant}>Section</Text>);

      const heading = screen.getByRole("heading", { name: "Section" });
      expect(heading.props["aria-level"]).toBe(String(level));
    }
  );

  it("isn't a heading by default", async () => {
    await render(<Text>Body copy</Text>);

    expect(screen.queryByRole("heading")).toBeNull();
  });

  it("takes the text style a Primitive hands it, and className over that", async () => {
    await render(
      <TextClassContext.Provider value="text-footnote-emphasized">
        <Text>From context</Text>
        <Text className="text-caption-1">Overridden</Text>
      </TextClassContext.Provider>
    );

    const fromContext = screen.getByText("From context").props.className;
    expect(fromContext.split(" ")).toContain("text-footnote-emphasized");
    expect(fromContext.split(" ")).not.toContain("text-body");
    const overridden = screen.getByText("Overridden").props.className;
    expect(overridden.split(" ")).toContain("text-caption-1");
    expect(overridden.split(" ")).not.toContain("text-footnote-emphasized");
  });
});

describe("Typography", () => {
  it.each(HEADINGS)(
    "renders %s's component as a heading of level %i",
    async (_variant, Heading, level) => {
      await render(<Heading>Your plan</Heading>);

      const heading = screen.getByRole("heading", { name: "Your plan" });
      expect(heading.props["aria-level"]).toBe(String(level));
    }
  );

  it.each([
    ["P", P],
    ["Muted", Muted],
    ["Lead", Lead],
    ["Large", Large],
    ["Small", Small],
    ["Code", Code],
    ["BlockQuote", BlockQuote],
  ] as const)("renders %s as text, not a heading", async (_name, Component) => {
    await render(<Component>Plain line</Component>);

    expect(screen.getByText("Plain line")).toBeTruthy();
    expect(screen.queryByRole("heading")).toBeNull();
  });

  it.each(VARIANTS)(
    "styles %s exactly like Text's variant of the same name",
    async (variant) => {
      const Component = COMPONENTS[variant];
      await render(
        <>
          <Component>Component</Component>
          <Text variant={variant}>Variant</Text>
        </>
      );

      expect(screen.getByText("Component").props.className).toBe(
        screen.getByText("Variant").props.className
      );
    }
  );

  it("keeps its own color inside a Primitive's text context", async () => {
    await render(
      <TextClassContext.Provider value="text-card-foreground">
        <H3>Card title</H3>
      </TextClassContext.Provider>
    );

    expect(screen.getByText("Card title").props.className).not.toContain(
      "text-card-foreground"
    );
  });
});
