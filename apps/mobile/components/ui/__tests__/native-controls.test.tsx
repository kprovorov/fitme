import { describe, expect, it, jest } from "@jest/globals";
import { render, screen } from "@testing-library/react-native";
import type * as React from "react";
import { Text } from "react-native";
import { AlertDialog } from "~/components/ui/alert-dialog";
import { ContextMenu } from "~/components/ui/context-menu";
import { Dialog } from "~/components/ui/dialog";
import { DropdownMenu } from "~/components/ui/dropdown-menu";
import { Picker } from "~/components/ui/picker";
import { RadioGroup } from "~/components/ui/radio-group";
import { Select } from "~/components/ui/select";
import { Slider } from "~/components/ui/slider";
import { Switch } from "~/components/ui/switch";
import { Tabs } from "~/components/ui/tabs";
import { WheelSelect } from "~/components/ui/wheel-select";

interface Modifier {
  args: unknown[];
  type: string;
}

// SwiftUI views can't mount under Jest, so every `@expo/ui` view becomes a
// plain View named after it (`native-Toggle`) that keeps its modifiers as
// `{ type, args }` records and its `color`, and renders its node props (a
// Section's header and footer, a Menu's label view) as children, a string
// child (a Text's) inside a React Native Text.
jest.mock("@expo/ui/swift-ui/modifiers", () => {
  const modifier =
    (type: string) =>
    (...args: unknown[]) => ({ args, type });
  return {
    accessibilityLabel: modifier("accessibilityLabel"),
    contentShape: modifier("contentShape"),
    disabled: modifier("disabled"),
    foregroundStyle: modifier("foregroundStyle"),
    frame: modifier("frame"),
    interactiveDismissDisabled: modifier("interactiveDismissDisabled"),
    labelsHidden: modifier("labelsHidden"),
    listRowBackground: modifier("listRowBackground"),
    listRowSeparatorTint: modifier("listRowSeparatorTint"),
    pickerStyle: modifier("pickerStyle"),
    scrollContentBackground: modifier("scrollContentBackground"),
    shapes: { rectangle: () => "rectangle" },
    tag: modifier("tag"),
    tint: modifier("tint"),
  };
});

jest.mock("@expo/ui/swift-ui", () => {
  const { Text: RNText, View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  const { isValidElement } =
    jest.requireActual<typeof import("react")>("react");

  // Lowercase, so React Refresh doesn't register it from inside the factory
  const view =
    (name: string) =>
    ({
      children,
      color,
      footer,
      header,
      label,
      modifiers,
    }: {
      children?: React.ReactNode;
      color?: string;
      footer?: React.ReactNode;
      header?: React.ReactNode;
      label?: React.ReactNode;
      modifiers?: Modifier[];
    }) => {
      const content =
        typeof children === "string" ? <RNText>{children}</RNText> : children;
      return (
        <View
          testID={`native-${name}`}
          {...{ color, modifierRecords: modifiers ?? [] }}
        >
          {header}
          {isValidElement(label) ? label : null}
          {content}
          {footer}
        </View>
      );
    };

  return {
    Alert: Object.assign(view("Alert"), {
      Actions: view("Alert.Actions"),
      Message: view("Alert.Message"),
      Trigger: view("Alert.Trigger"),
    }),
    BottomSheet: view("BottomSheet"),
    Button: view("Button"),
    ContextMenu: Object.assign(view("ContextMenu"), {
      Items: view("ContextMenu.Items"),
      Trigger: view("ContextMenu.Trigger"),
    }),
    Divider: view("Divider"),
    Form: view("Form"),
    Group: view("Group"),
    Host: view("Host"),
    Image: view("Image"),
    Label: view("Label"),
    Menu: view("Menu"),
    Picker: view("Picker"),
    RNHostView: view("RNHostView"),
    Section: view("Section"),
    Slider: view("Slider"),
    Spacer: view("Spacer"),
    Text: view("Text"),
    Toggle: view("Toggle"),
  };
});

// Reanimated's worklets need a native module; WheelSelect's drawer only needs
// a View.
jest.mock("react-native-reanimated", () => {
  const { View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    __esModule: true,
    default: { View },
    useAnimatedStyle: () => ({}),
    useSharedValue: (value: number) => ({ value }),
    withTiming: (value: number) => value,
  };
});

// uniwind resolves no theme values under Jest, so each color class resolves to
// its own name: a tint of "text-primary" is the `--color-primary` token.
const mockColorClass = /^text-[a-z-]+$/;

jest.mock("uniwind", () => {
  const actual = jest.requireActual<typeof import("uniwind")>("uniwind");
  return {
    ...actual,
    useResolveClassNames: (className: string) => {
      const resolved = actual.useResolveClassNames(className);
      return mockColorClass.test(className) ? { color: className } : resolved;
    },
  };
});

const argsOf = (name: string, type: string) =>
  screen
    .getAllByTestId(`native-${name}`)
    .flatMap((node) =>
      (node.props.modifierRecords as Modifier[]).filter((m) => m.type === type)
    )
    .map((m) => m.args[0]);

const options = [
  { label: "Metric", value: "metric" },
  { label: "US", value: "us" },
];

describe("native controls", () => {
  it.each([
    ["Switch", "Toggle", <Switch key="switch" value />],
    ["Slider", "Slider", <Slider key="slider" value={1} />],
    ["Picker", "Picker", <Picker key="picker" options={options} />],
    ["Select", "Picker", <Select key="select" options={options} />],
    ["Tabs", "Picker", <Tabs key="tabs" options={options} />],
    ["RadioGroup", "Form", <RadioGroup key="radio" options={options} />],
    [
      "WheelSelect",
      "Picker",
      <WheelSelect
        key="wheel"
        label="Height"
        value="180"
        wheels={[{ options }]}
      />,
    ],
    [
      "AlertDialog",
      "Alert",
      <AlertDialog
        actions={[{ label: "Delete", role: "destructive" }]}
        key="alert"
        title="Delete?"
      />,
    ],
    [
      "Dialog",
      "Group",
      <Dialog isPresented key="dialog" onIsPresentedChange={jest.fn()} />,
    ],
  ])("%s is tinted with the primary token", async (_name, view, element) => {
    await render(element);

    expect(argsOf(view, "tint")).toEqual(["text-primary"]);
  });

  it("sets a radio group's header and footer in muted-foreground", async () => {
    await render(
      <RadioGroup footer="Applies everywhere" label="Units" options={options} />
    );

    expect(screen.getByText("Units")).toBeTruthy();
    expect(screen.getByText("Applies everywhere")).toBeTruthy();
    expect(argsOf("Text", "foregroundStyle")).toEqual([
      "text-muted-foreground",
      "text-muted-foreground",
    ]);
  });

  it("puts a radio group's rows on the card and border tokens", async () => {
    await render(<RadioGroup options={options} />);

    expect(argsOf("Picker", "listRowBackground")).toEqual(["text-card"]);
    expect(argsOf("Picker", "listRowSeparatorTint")).toEqual(["text-border"]);
  });

  it("sets a wheel's selected row in primary, the others untouched", async () => {
    await render(<Picker options={options} value="us" variant="wheel" />);

    expect(argsOf("Text", "foregroundStyle")).toEqual(["text-primary"]);
  });

  it("leaves a menu picker's options untouched", async () => {
    await render(<Picker options={options} value="us" />);

    expect(argsOf("Text", "foregroundStyle")).toEqual([]);
  });

  // A tint on a menu also repaints its items' icons, a destructive item's
  // included, so only a dropdown's own button takes a token.
  it("leaves menu items to the system", async () => {
    await render(
      <ContextMenu items={[{ destructive: true, label: "Delete" }]}>
        <Text>Row</Text>
      </ContextMenu>
    );

    expect(argsOf("ContextMenu", "tint")).toEqual([]);
  });

  it("draws a dropdown's text button in primary", async () => {
    await render(
      <DropdownMenu
        items={[{ destructive: true, label: "Delete" }]}
        label="More"
      />
    );

    expect(argsOf("Menu", "tint")).toEqual([]);
    expect(argsOf("Label", "foregroundStyle")).toEqual(["text-primary"]);
  });

  it("draws an icon-only dropdown button in foreground", async () => {
    await render(
      <DropdownMenu
        accessibilityLabel="More"
        items={[{ label: "Delete" }]}
        systemImage="ellipsis"
      />
    );

    expect(screen.getByTestId("native-Image").props.color).toBe(
      "text-foreground"
    );
    expect(argsOf("Menu", "accessibilityLabel")).toEqual(["More"]);
  });

  it("draws an icon-only dropdown button in the color class it's given", async () => {
    await render(
      <DropdownMenu
        accessibilityLabel="Plan options"
        iconColorClassName="text-primary"
        items={[{ label: "Manage Plans" }]}
        systemImage="slider.horizontal.3"
      />
    );

    expect(screen.getByTestId("native-Image").props.color).toBe("text-primary");
    expect(argsOf("Menu", "tint")).toEqual([]);
  });
});
