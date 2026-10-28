import { describe, expect, it, jest } from "@jest/globals";
import { render, screen } from "@testing-library/react-native";
import { Badge } from "../badge";
import { Text } from "../text";

const VARIANTS = [
  "default",
  "secondary",
  "destructive",
  "muted",
  "ghost",
] as const;

// uniwind resolves no theme values under Jest: each color token answers its
// own name, so an icon's color says which token it came from, and the
// Footnote styles answer their point size.
jest.mock("uniwind", () => {
  const actual = jest.requireActual<typeof import("uniwind")>("uniwind");
  const resolve = actual.useResolveClassNames;
  return {
    ...actual,
    useCSSVariable: (name: string) => name,
    useResolveClassNames: (className: string) => {
      const resolved = resolve(className);
      return className.startsWith("text-footnote")
        ? { fontSize: 13 }
        : resolved;
    },
  };
});

// The native symbol view, as a plain view carrying its props
jest.mock("expo-symbols", () => {
  const { View: MockView } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    SymbolView: (props: object) => <MockView {...props} testID="symbol" />,
  };
});

/** The icon, hidden from accessibility, so queries must ask for it. */
function symbol() {
  return screen.getByTestId("symbol", { includeHiddenElements: true });
}

/** The badge's children in order: "symbol" for the icon, else the text. */
function childOrder(): string[] {
  const badge = screen.getByTestId("badge");
  return badge.children.map((child) => {
    if (typeof child === "string") {
      return child;
    }
    return child.props.testID === "symbol"
      ? "symbol"
      : String(child.props.children);
  });
}

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

  it("draws ghost with no fill and a muted-foreground label", async () => {
    await render(
      <Badge testID="badge" variant="ghost">
        <Text>Optional</Text>
      </Badge>
    );

    const classes = screen.getByTestId("badge").props.className.split(" ");
    expect(classes.some((name: string) => name.startsWith("bg-"))).toBe(false);
    expect(screen.getByText("Optional").props.className.split(" ")).toContain(
      "text-muted-foreground"
    );
  });

  it("draws no icon without one", async () => {
    await render(
      <Badge testID="badge">
        <Text>New</Text>
      </Badge>
    );

    expect(
      screen.queryByTestId("symbol", { includeHiddenElements: true })
    ).toBeNull();
    expect(childOrder()).toEqual(["New"]);
  });

  it("puts the icon before the label by default", async () => {
    await render(
      <Badge icon="plus" testID="badge">
        <Text>Add</Text>
      </Badge>
    );

    expect(childOrder()).toEqual(["symbol", "Add"]);
  });

  it("puts the icon after the label when trailing", async () => {
    await render(
      <Badge icon="chevron.right" iconPosition="trailing" testID="badge">
        <Text>More</Text>
      </Badge>
    );

    expect(childOrder()).toEqual(["More", "symbol"]);
  });

  it("draws the icon at the label's size and weight", async () => {
    await render(
      <Badge icon="plus">
        <Text>Add</Text>
      </Badge>
    );

    expect(symbol().props).toEqual(
      expect.objectContaining({ name: "plus", size: 13, weight: "semibold" })
    );
  });

  it.each([
    ["default", "--color-primary-foreground"],
    ["secondary", "--color-secondary-foreground"],
    ["destructive", "--color-destructive"],
    ["muted", "--color-muted-foreground"],
    // The one variant whose icon differs from its label
    ["ghost", "--color-foreground"],
  ] as const)("draws %s's icon in %s", async (variant, token) => {
    await render(
      <Badge icon="plus" variant={variant}>
        <Text>Add</Text>
      </Badge>
    );

    expect(symbol().props.tintColor).toBe(token);
  });

  it("hides the icon from accessibility, so VoiceOver reads only the label", async () => {
    await render(
      <Badge icon="plus">
        <Text>Add</Text>
      </Badge>
    );

    expect(symbol().props).toEqual(
      expect.objectContaining({
        accessibilityElementsHidden: true,
        importantForAccessibility: "no-hide-descendants",
      })
    );
    // Not reachable by a query that respects accessibility
    expect(screen.queryByTestId("symbol")).toBeNull();
  });

  it("takes only the five token variants", () => {
    // Type-level: these fail typecheck if Badge grows its outline variant back
    // or takes another one.
    // @ts-expect-error outline was removed
    const outline = <Badge variant="outline" />;
    // @ts-expect-error not a Badge variant
    const primary = <Badge variant="primary" />;
    expect([outline, primary]).toHaveLength(2);
  });
});
