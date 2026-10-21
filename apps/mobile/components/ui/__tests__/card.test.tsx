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
    // if Card grows glass props back or accepts another variant.
    // @ts-expect-error not a Card variant
    const glass = <Card variant="glass" />;
    // @ts-expect-error Card has no tint
    const tinted = <Card tintColor="#c0ff38" />;
    expect([glass, tinted]).toHaveLength(2);
  });
});
