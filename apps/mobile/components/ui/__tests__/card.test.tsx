import { describe, expect, it } from "@jest/globals";
import { render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import { Card, CardContent, CardDescription, CardTitle } from "../card";
import { Text as UIText } from "../text";

describe("Card", () => {
  it("renders its children with no styling props", async () => {
    await render(
      <Card>
        <CardTitle>Strength Builder</CardTitle>
        <Text>Three full-body days</Text>
      </Card>
    );

    expect(
      screen.getByRole("heading", { name: "Strength Builder" })
    ).toBeTruthy();
    expect(screen.getByText("Three full-body days")).toBeTruthy();
  });

  it("renders its children as ghost", async () => {
    await render(
      <Card variant="ghost">
        <Text>Grouped content</Text>
      </Card>
    );

    expect(screen.getByText("Grouped content")).toBeTruthy();
  });

  it.each([
    ["default", ["border", "border-border", "bg-card"]],
    ["ghost", ["border", "border-border", "bg-transparent"]],
    ["primary", ["bg-primary"]],
  ] as const)("draws the %s surface", async (variant, expected) => {
    await render(
      <Card testID="card" variant={variant}>
        <Text>Day A</Text>
      </Card>
    );

    const classes = screen.getByTestId("card").props.className.split(" ");
    expect(classes).toEqual(expect.arrayContaining([...expected, "p-sm"]));
    if (variant === "primary") {
      expect(classes).not.toContain("border-border");
    }
  });

  it("drops its padding with padding none", async () => {
    await render(
      <Card padding="none" testID="card">
        <Text>Edge to edge</Text>
      </Card>
    );

    const classes = screen.getByTestId("card").props.className.split(" ");
    expect(classes).toContain("p-0");
    expect(classes).not.toContain("p-sm");
  });

  it("draws its background behind the content, clipped to its radius", async () => {
    await render(
      <Card
        background={<Text testID="cover">Cover</Text>}
        padding="none"
        testID="card"
      >
        <Text>Push Day</Text>
      </Card>
    );

    const card = screen.getByTestId("card");
    expect(card.props.className.split(" ")).toEqual(
      expect.arrayContaining(["overflow-hidden", "rounded-card"])
    );
    const [backgroundLayer, content] = card.children;
    // The background comes first, so the content draws over it, and it fills
    // the card out of VoiceOver's and touches' way.
    expect(backgroundLayer).toMatchObject({
      props: expect.objectContaining({
        className: "pointer-events-none absolute inset-0",
      }),
    });
    expect(screen.getByText("Push Day")).toBe(content);
    expect(
      screen.queryByTestId("cover", { includeHiddenElements: false })
    ).toBeNull();
  });

  it("sets every text in primary-foreground on primary", async () => {
    await render(
      <Card variant="primary">
        <CardTitle>Pro</CardTitle>
        <CardDescription>Every model</CardDescription>
        <CardContent>
          <UIText>Inside content</UIText>
        </CardContent>
        <UIText>Right inside</UIText>
      </Card>
    );

    for (const text of [
      screen.getByRole("heading", { name: "Pro" }),
      screen.getByText("Every model"),
      screen.getByText("Inside content"),
      screen.getByText("Right inside"),
    ]) {
      expect(text.props.className.split(" ")).toContain(
        "text-primary-foreground"
      );
    }
  });

  it("drops a caller's border on primary", async () => {
    await render(
      <Card
        className="border-2 border-destructive"
        testID="card"
        variant="primary"
      >
        <UIText>Pro</UIText>
      </Card>
    );

    const classes = screen.getByTestId("card").props.className.split(" ");
    expect(classes).toContain("border-0");
    expect(classes).not.toContain("border-2");
  });

  it.each(["default", "ghost", "primary"] as const)(
    "draws no glass or highlight layers over its children (%s)",
    async (variant) => {
      const { toJSON } = await render(
        <Card testID="card" variant={variant}>
          <Text>Only child</Text>
        </Card>
      );

      const card = toJSON();
      expect(card).toMatchObject({ type: "View" });
      expect(screen.getByTestId("card").children).toHaveLength(1);
      expect(screen.getByText("Only child")).toBeTruthy();
    }
  );

  it("keeps its own surface when a caller passes surface classes", async () => {
    await render(
      <Card
        className="gap-3 rounded-none border-0 bg-destructive p-0"
        testID="card"
      >
        <Text>Day A</Text>
      </Card>
    );

    const classes = screen.getByTestId("card").props.className.split(" ");
    // Layout classes apply; the caller's fill, border, radius and padding don't.
    expect(classes).toEqual(
      expect.arrayContaining([
        "gap-3",
        "bg-card",
        "border",
        "rounded-card",
        "p-sm",
      ])
    );
    for (const dropped of [
      "bg-destructive",
      "border-0",
      "rounded-none",
      "p-0",
    ]) {
      expect(classes).not.toContain(dropped);
    }
  });

  it("passes accessibility props through", async () => {
    await render(
      <Card accessibilityLabel="Next workout" accessible>
        <Text>Day A</Text>
      </Card>
    );

    expect(screen.getByLabelText("Next workout")).toBeTruthy();
  });

  it("takes only the default, ghost and primary variants", () => {
    // Type-level: `variant` is Card's only styling prop. These fail typecheck
    // if Card grows glass props back, accepts another variant or takes a style.
    // @ts-expect-error not a Card variant
    const glass = <Card variant="glass" />;
    // @ts-expect-error Card has no tint
    const tinted = <Card tintColor="#c0ff38" />;
    // @ts-expect-error Card takes no inline style
    const styled = <Card style={{ padding: 0 }} />;
    // @ts-expect-error not a Card padding
    const padded = <Card padding="lg" />;
    expect([glass, tinted, styled, padded]).toHaveLength(4);
  });
});
