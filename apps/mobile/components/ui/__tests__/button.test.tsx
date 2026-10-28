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
    background: modifier("background"),
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
  // Each stack lists its modifiers, for the tests that check them.
  const container = ({
    children,
    modifiers,
  }: {
    children?: React.ReactNode;
    modifiers?: Modifier[];
  }) => <View {...{ modifierRecords: modifiers ?? [] }}>{children}</View>;

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
          // The native style, shape and tint, for the tests that check them
          {...{
            buttonBorderShape: argOf(modifiers, "buttonBorderShape"),
            buttonStyle: argOf(modifiers, "buttonStyle"),
            controlSize: argOf(modifiers, "controlSize"),
            tint: argOf(modifiers, "tint"),
          }}
        >
          {children}
        </Pressable>
      );
    },
    Group: container,
    Host: container,
    HStack: container,
    Image: ({ color, systemName }: { color?: string; systemName: string }) => (
      <Text testID={`icon-${systemName}`} {...{ color }}>
        {`[${systemName}]`}
      </Text>
    ),
    ProgressView: () => <View testID="spinner" />,
    RNHostView: container,
    // The label's color, for the tests that check it
    Text: ({
      children,
      modifiers,
    }: {
      children?: React.ReactNode;
      modifiers?: Modifier[];
    }) => (
      <Text {...{ color: argOf(modifiers, "foregroundStyle") }}>
        {children}
      </Text>
    ),
    ZStack: container,
  };
});

// uniwind resolves no theme values under Jest. The size tokens get a stand-in
// diameter and the colors their class name, so the buttons that read them
// (ghost, painted circles) frame and fill themselves.
// Like uniwind on device, an empty class name answers the last color class
// resolved (FIT-251).
const mockColorClass = /^text-(primary|secondary|destructive|foreground)/;
let mockLastColorClass: string | undefined;

jest.mock("uniwind", () => {
  const actual = jest.requireActual<typeof import("uniwind")>("uniwind");
  return {
    ...actual,
    useResolveClassNames: (className: string) => {
      const resolved = actual.useResolveClassNames(className);
      if (className.startsWith("size-button-")) {
        return { height: 47, width: 47 };
      }
      if (mockColorClass.test(className)) {
        mockLastColorClass = className;
        return { color: className };
      }
      if (className === "" && mockLastColorClass !== undefined) {
        return { color: mockLastColorClass };
      }
      return resolved;
    },
  };
});

let mockGlassEnabled = true;
let mockNativeCircleEnabled = true;

// Liquid Glass and the native circle shape (iOS 17+) are on unless a test
// turns them off. Getters defined in place (a spread would copy the flags'
// values once, when the factory runs).
jest.mock("~/components/ui/swift-ui", () =>
  Object.defineProperties(
    {
      ...jest.requireActual<typeof import("~/components/ui/swift-ui")>(
        "~/components/ui/swift-ui"
      ),
    },
    {
      GLASS_ENABLED: { get: () => mockGlassEnabled },
      NATIVE_CIRCLE_ENABLED: { get: () => mockNativeCircleEnabled },
    }
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

interface JsonHost {
  children: (JsonHost | string)[] | null;
  props: { modifierRecords?: Modifier[] };
}

/** Every stack's modifiers, outermost first. */
const stackModifiers = (): Modifier[][] => {
  const lists: Modifier[][] = [];
  const walk = (node: JsonHost | JsonHost[] | string | null) => {
    if (node === null || typeof node === "string") {
      return;
    }
    if (Array.isArray(node)) {
      for (const child of node) {
        walk(child);
      }
      return;
    }
    if (node.props.modifierRecords) {
      lists.push(node.props.modifierRecords);
    }
    for (const child of node.children ?? []) {
      walk(child);
    }
  };
  walk(screen.toJSON() as JsonHost | JsonHost[] | null);
  return lists;
};

/** Every stack's modifier types, outermost first. */
const modifierLists = (): string[][] =>
  stackModifiers().map((modifiers) => modifiers.map((m) => m.type));

/** The arguments of every modifier of one type, on any stack. */
const modifierArgs = (type: string): unknown[][] =>
  stackModifiers()
    .flat()
    .filter((m) => m.type === type)
    .map((m) => m.args);

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

  // The iOS kit's Small, Medium and Large (FIT-366), with or without glass
  it.each([
    ["sm", "small", true],
    ["default", "regular", true],
    ["lg", "large", true],
    ["sm", "small", false],
    ["default", "regular", false],
    ["lg", "large", false],
  ] as const)(
    "draws size %s at the native %s control size (glass: %s)",
    async (size, controlSize, glass) => {
      mockGlassEnabled = glass;
      try {
        await render(<Button label="Save" size={size} />);

        expect(screen.getByRole("button").props.controlSize).toBe(controlSize);
      } finally {
        mockGlassEnabled = true;
      }
    }
  );

  // Red text on a neutral fill, never text on a red one: the prominent style
  // fills with its tint, so the fill is `secondary` itself
  it.each([true, false])(
    "draws destructive as a destructive label and icon on a neutral fill (glass: %s)",
    async (glass) => {
      mockGlassEnabled = glass;
      try {
        await render(
          <Button icon="trash" label="Delete" variant="destructive" />
        );

        expect(screen.getByRole("button").props.tint).toBe("text-secondary");
        expect(screen.getByText("Delete").props.color).toBe("text-destructive");
        expect(screen.getByTestId("icon-trash").props.color).toBe(
          "text-destructive"
        );
      } finally {
        mockGlassEnabled = true;
      }
    }
  );

  it("drops a recolor once the class is gone, as a set row's pencil turns into its ✓", async () => {
    const { rerender } = await render(
      <Button accessibilityLabel="Log set" icon="checkmark" shape="circle" />
    );
    const defaultColor = screen.getByTestId("icon-checkmark").props.color;

    await rerender(
      <Button
        accessibilityLabel="Edit set"
        contentColorClassName="text-foreground"
        icon="checkmark"
        shape="circle"
        variant="ghost"
      />
    );
    expect(screen.getByTestId("icon-checkmark").props.color).toBe(
      "text-foreground"
    );

    await rerender(
      <Button accessibilityLabel="Log set" icon="checkmark" shape="circle" />
    );
    expect(screen.getByTestId("icon-checkmark").props.color).toBe(defaultColor);
  });

  it("paints a destructive circle secondary below iOS 17", async () => {
    mockNativeCircleEnabled = false;
    try {
      await render(
        <Button
          accessibilityLabel="Delete"
          icon="trash"
          shape="circle"
          variant="destructive"
        />
      );

      expect(modifierArgs("background")).toEqual([
        ["text-secondary", "circle"],
      ]);
      expect(screen.getByTestId("icon-trash").props.color).toBe(
        "text-destructive"
      );
    } finally {
      mockNativeCircleEnabled = true;
    }
  });

  it("paints its own circle below iOS 17, where the native shape is missing", async () => {
    mockNativeCircleEnabled = false;
    try {
      await render(
        <Button
          accessibilityLabel="Log set"
          icon="checkmark"
          shape="circle"
          variant="secondary"
        />
      );

      const button = screen.getByRole("button", { name: "Log set" });
      expect(button.props.buttonStyle).toBe("plain");
      expect(button.props.buttonBorderShape).toBeUndefined();
      const painted = modifierLists().filter((types) =>
        types.includes("background")
      );
      expect(painted).toEqual([["frame", "background", "contentShape"]]);
    } finally {
      mockNativeCircleEnabled = true;
    }
  });

  it("keeps a pill native below iOS 17", async () => {
    mockNativeCircleEnabled = false;
    try {
      await render(<Button label="Save" variant="secondary" />);

      expect(screen.getByRole("button").props.buttonStyle).toBe("glass");
      expect(screen.getByRole("button").props.buttonBorderShape).toBe(
        "capsule"
      );
    } finally {
      mockNativeCircleEnabled = true;
    }
  });

  // The size token stands in at 47; the native padding is 10 / 14 / 30.
  const NATIVE_CONTENT = [
    ["sm", 37],
    ["default", 33],
    ["lg", 17],
  ] as const;

  it.each(
    NATIVE_CONTENT.flatMap(([size, content]) =>
      (["default", "secondary", "destructive"] as const).map(
        (variant) => [variant, size, content] as const
      )
    )
  )(
    "frames a native %s %s pill's content at the token minus the native padding",
    async (variant, size, content) => {
      await render(<Button label="Save" size={size} variant={variant} />);

      expect(modifierArgs("frame")).toContainEqual([{ height: content }]);
    }
  );

  it.each(NATIVE_CONTENT)(
    "frames a native %s circle's icon in a square at the token minus the native padding",
    async (size, content) => {
      await render(
        <Button
          accessibilityLabel="Add"
          icon="plus"
          shape="circle"
          size={size}
          variant="secondary"
        />
      );

      expect(modifierArgs("frame")).toEqual([
        [{ height: content, width: content }],
      ]);
    }
  );

  it("keeps a loading pill at its framed height", async () => {
    await render(<Button isLoading label="Save" />);

    expect(modifierArgs("frame")).toContainEqual([{ height: 33 }]);
  });

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
      // @ts-expect-error empty children aren't a label
      <Button key="empty-children">{undefined}</Button>,
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

    expect(elements).toHaveLength(14);
  });
});
