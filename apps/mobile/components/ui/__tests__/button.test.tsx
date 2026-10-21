import { describe, expect, it, jest } from "@jest/globals";
import { render, screen } from "@testing-library/react-native";
import type * as React from "react";
import type { ButtonVariant } from "~/components/ui/button";
import { Button } from "~/components/ui/button";

interface Modifier {
  args: unknown[];
  type: string;
}

// SwiftUI views can't mount under Jest, so `@expo/ui` is swapped for plain
// React Native views. Modifiers become `{ type, args }` records, and the
// button turns its accessibility modifiers into the props VoiceOver reads.
jest.mock("@expo/ui/swift-ui/modifiers", () => {
  const modifier =
    (type: string) =>
    (...args: unknown[]) => ({ args, type });
  return {
    accessibilityHint: modifier("accessibilityHint"),
    accessibilityLabel: modifier("accessibilityLabel"),
    buttonBorderShape: modifier("buttonBorderShape"),
    buttonStyle: modifier("buttonStyle"),
    contentShape: modifier("contentShape"),
    controlSize: modifier("controlSize"),
    disabled: modifier("disabled"),
    fixedSize: modifier("fixedSize"),
    font: modifier("font"),
    foregroundStyle: modifier("foregroundStyle"),
    frame: modifier("frame"),
    opacity: modifier("opacity"),
    shapes: { capsule: () => "capsule", circle: () => "circle" },
    tint: modifier("tint"),
  };
});

jest.mock("@expo/ui/swift-ui", () => {
  const { Pressable, Text, View } =
    jest.requireActual<typeof import("react-native")>("react-native");

  const argOf = (modifiers: Modifier[] | undefined, type: string) =>
    modifiers?.find((m) => m.type === type)?.args[0];

  // Lowercase, so React Refresh doesn't register it from inside the factory
  const container = ({ children }: { children?: React.ReactNode }) => (
    <View>{children}</View>
  );

  return {
    Button: ({
      children,
      modifiers,
      onPress,
      testID,
    }: {
      children?: React.ReactNode;
      modifiers?: Modifier[];
      onPress?: () => void;
      testID?: string;
    }) => {
      const disabled = argOf(modifiers, "disabled") === true;
      return (
        <Pressable
          accessibilityHint={argOf(modifiers, "accessibilityHint") as string}
          accessibilityLabel={argOf(modifiers, "accessibilityLabel") as string}
          accessibilityRole="button"
          accessibilityState={{ disabled }}
          disabled={disabled}
          onPress={onPress}
          testID={testID}
          // The native style and shape, for the tests that check them
          {...{
            buttonBorderShape: argOf(modifiers, "buttonBorderShape"),
            buttonStyle: argOf(modifiers, "buttonStyle"),
          }}
        >
          {children}
        </Pressable>
      );
    },
    Group: container,
    Host: container,
    HStack: container,
    Image: ({ systemName }: { systemName: string }) => (
      <Text testID={`icon-${systemName}`}>{`[${systemName}]`}</Text>
    ),
    ProgressView: () => <View testID="spinner" />,
    RNHostView: container,
    Text: ({ children }: { children?: React.ReactNode }) => (
      <Text>{children}</Text>
    ),
    ZStack: container,
  };
});

let mockGlassEnabled = true;

// Liquid Glass is on unless a test turns it off. A getter defined in place
// (a spread would copy the flag's value once, when the factory runs).
jest.mock("~/components/ui/swift-ui", () =>
  Object.defineProperty(
    {
      ...jest.requireActual<typeof import("~/components/ui/swift-ui")>(
        "~/components/ui/swift-ui"
      ),
    },
    "GLASS_ENABLED",
    { get: () => mockGlassEnabled }
  )
);

const VARIANTS: ButtonVariant[] = [
  "default",
  "secondary",
  "destructive",
  "ghost",
];

interface JsonNode {
  children: (JsonNode | string)[] | null;
}

const texts = (node: JsonNode | JsonNode[] | string | null): string[] => {
  if (node === null) {
    return [];
  }
  if (typeof node === "string") {
    return [node];
  }
  if (Array.isArray(node)) {
    return node.flatMap(texts);
  }
  return (node.children ?? []).flatMap(texts);
};

/** The button's text in reading order, icons as `[symbol]`. */
const readingOrder = () =>
  texts(screen.toJSON() as JsonNode | JsonNode[] | null).join(" ");

describe("Button", () => {
  it.each(VARIANTS)(
    "renders the %s variant with its label",
    async (variant) => {
      await render(<Button label="Save" variant={variant} />);

      expect(screen.getByRole("button")).toBeTruthy();
      expect(screen.getByText("Save")).toBeTruthy();
    }
  );

  it.each([
    ["default", "glassProminent"],
    ["destructive", "glassProminent"],
    ["secondary", "glass"],
    ["ghost", "plain"],
  ] as const)("draws %s as the native %s style", async (variant, style) => {
    await render(<Button label="Save" variant={variant} />);

    expect(screen.getByRole("button").props.buttonStyle).toBe(style);
  });

  it.each([
    ["default", "borderedProminent"],
    ["destructive", "borderedProminent"],
    ["secondary", "bordered"],
    ["ghost", "plain"],
  ] as const)(
    "draws %s as the solid %s style without Liquid Glass",
    async (variant, style) => {
      mockGlassEnabled = false;
      try {
        await render(<Button label="Save" variant={variant} />);

        expect(screen.getByRole("button").props.buttonStyle).toBe(style);
      } finally {
        mockGlassEnabled = true;
      }
    }
  );

  it("draws a pill as a capsule", async () => {
    await render(<Button label="Save" />);

    expect(screen.getByRole("button").props.buttonBorderShape).toBe("capsule");
  });

  it("gives a circle its accessibility label and no visible label", async () => {
    await render(
      <Button
        accessibilityLabel="Close"
        icon="xmark"
        shape="circle"
        variant="ghost"
      />
    );

    const button = screen.getByRole("button", { name: "Close" });
    expect(button.props.buttonBorderShape).toBe("circle");
    expect(readingOrder()).toBe("[xmark]");
  });

  it("puts a leading icon before the label", async () => {
    await render(<Button icon="plus" iconPosition="leading" label="Add Set" />);

    expect(readingOrder()).toBe("[plus] Add Set");
  });

  it("puts a trailing icon after the label", async () => {
    await render(
      <Button icon="arrow.right" iconPosition="trailing" label="Continue" />
    );

    expect(readingOrder()).toBe("Continue [arrow.right]");
  });

  it("leads with the icon by default", async () => {
    await render(<Button icon="plus" label="Add Exercise" />);

    expect(readingOrder()).toBe("[plus] Add Exercise");
  });

  it("shows a spinner and is disabled while loading", async () => {
    await render(<Button isLoading label="Save" />);

    expect(screen.getByTestId("spinner")).toBeTruthy();
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("accepts only the documented API", () => {
    const CIRCLE = {
      accessibilityLabel: "Add",
      icon: "plus",
      shape: "circle",
    } as const;
    // Never rendered: the checks are the `@ts-expect-error`s, which fail
    // `pnpm typecheck` once the line they mark type-checks.
    const elements = [
      // @ts-expect-error `outline` was removed
      <Button key="outline" label="Save" variant="outline" />,
      // @ts-expect-error `link` was removed; use `ghost`
      <Button key="link" label="Save" variant="link" />,
      // @ts-expect-error the icon sizes were removed; use `shape="circle"`
      <Button icon="plus" key="icon-sm" size="icon-sm" />,
      // @ts-expect-error the non-pill shape was removed
      <Button key="default-shape" label="Save" shape="default" />,
      // @ts-expect-error `systemImage` is now `icon`
      <Button key="system-image" label="Save" systemImage="plus" />,
      // @ts-expect-error a pill needs a label
      <Button icon="plus" key="icon-only-pill" />,
      // @ts-expect-error a pill needs a label
      <Button key="empty" />,
      // @ts-expect-error a circle needs an icon
      <Button accessibilityLabel="Add" key="no-icon" shape="circle" />,
      // @ts-expect-error a circle needs an accessibility label
      <Button icon="plus" key="no-a11y" shape="circle" />,
      // @ts-expect-error a circle has no visible label
      <Button {...CIRCLE} key="circle-label" label="Add" />,
      // @ts-expect-error a circle's icon has no position
      <Button {...CIRCLE} iconPosition="trailing" key="circle-position" />,
      <Button
        accessibilityLabel="Add"
        icon="plus"
        key="circle"
        shape="circle"
        size="sm"
        variant="secondary"
      />,
      <Button
        icon="arrow.right"
        iconPosition="trailing"
        key="pill"
        label="Continue"
        size="lg"
        variant="destructive"
      />,
    ];

    expect(elements).toHaveLength(13);
  });
});
