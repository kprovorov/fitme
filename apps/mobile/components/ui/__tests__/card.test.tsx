import { describe, expect, it } from "@jest/globals";
import { render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import { Card, CardTitle } from "../card";

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

  it.each(["default", "ghost"] as const)(
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
      <Card className="gap-3 rounded-none bg-destructive p-0" testID="card">
        <Text>Day A</Text>
      </Card>
    );

    const { className } = screen.getByTestId("card").props;
    // Layout classes apply; the caller's fill, radius and padding don't.
    expect(className.split(" ")).toEqual(
      expect.arrayContaining(["gap-3", "bg-card", "rounded-card", "p-sm"])
    );
    expect(className).not.toMatch(/bg-destructive|rounded-none|p-0/);
  });

  it("passes accessibility props through", async () => {
    await render(
      <Card accessibilityLabel="Next workout" accessible>
        <Text>Day A</Text>
      </Card>
    );

    expect(screen.getByLabelText("Next workout")).toBeTruthy();
  });

  it("takes only the default and ghost variants", () => {
    // Type-level: `variant` is Card's only styling prop. These fail typecheck
    // if Card grows glass props back, accepts another variant or takes a style.
    // @ts-expect-error not a Card variant
    const glass = <Card variant="glass" />;
    // @ts-expect-error Card has no tint
    const tinted = <Card tintColor="#c0ff38" />;
    // @ts-expect-error Card takes no inline style
    const styled = <Card style={{ padding: 0 }} />;
    expect([glass, tinted, styled]).toHaveLength(3);
  });
});
