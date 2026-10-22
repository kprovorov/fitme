import { describe, expect, it } from "@jest/globals";
import { render, screen } from "@testing-library/react-native";
import { Badge } from "../badge";
import { Text } from "../text";

const VARIANTS = ["default", "secondary", "destructive", "muted"] as const;

describe("Badge", () => {
  it("renders its label with the default variant", async () => {
    await render(
      <Badge>
        <Text>New</Text>
      </Badge>
    );

    expect(screen.getByText("New")).toBeTruthy();
  });

  it.each(VARIANTS)("renders its label as %s", async (variant) => {
    await render(
      <Badge variant={variant}>
        <Text>{`3 ${variant}`}</Text>
      </Badge>
    );

    expect(screen.getByText(`3 ${variant}`)).toBeTruthy();
  });

  it.each(VARIANTS)(
    "sets its label in one text style, whatever the variant (%s)",
    async (variant) => {
      await render(
        <Badge variant={variant}>
          <Text>Label</Text>
        </Badge>
      );

      const classes = screen.getByText("Label").props.className.split(" ");
      // The label is Footnote Emphasized, never Text's default Body as well
      expect(classes).toContain("text-footnote-emphasized");
      expect(classes).not.toContain("text-body");
    }
  );

  // Like the destructive Button: red text on a neutral fill
  it("draws destructive as destructive text on a secondary fill", async () => {
    await render(
      <Badge testID="badge" variant="destructive">
        <Text>Failed</Text>
      </Badge>
    );

    expect(screen.getByTestId("badge").props.className.split(" ")).toContain(
      "bg-secondary"
    );
    expect(screen.getByText("Failed").props.className.split(" ")).toContain(
      "text-destructive"
    );
  });

  it("keeps its own fill and shape when a caller passes surface classes", async () => {
    await render(
      <Badge
        className="mt-2 rounded-none bg-primary px-4"
        testID="badge"
        variant="secondary"
      >
        <Text>Gym</Text>
      </Badge>
    );

    const classes = screen.getByTestId("badge").props.className.split(" ");
    // Placement applies; the caller's fill, radius and padding don't
    expect(classes).toEqual(
      expect.arrayContaining(["mt-2", "bg-secondary", "rounded-full", "px-2"])
    );
    for (const dropped of ["bg-primary", "rounded-none", "px-4"]) {
      expect(classes).not.toContain(dropped);
    }
  });

  it("passes accessibility props through", async () => {
    await render(
      <Badge accessibilityLabel="4 exercises" accessible>
        <Text>4</Text>
      </Badge>
    );

    expect(screen.getByLabelText("4 exercises")).toBeTruthy();
  });

  it("takes only the four token variants", () => {
    // Type-level: these fail typecheck if Badge grows its outline variant back
    // or takes another one.
    // @ts-expect-error outline was removed
    const outline = <Badge variant="outline" />;
    // @ts-expect-error not a Badge variant
    const primary = <Badge variant="primary" />;
    expect([outline, primary]).toHaveLength(2);
  });
});
