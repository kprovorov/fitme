import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { render, screen } from "@testing-library/react-native";
import type { BlurViewProps } from "expo-blur";
import { isLiquidGlassAvailable } from "expo-glass-effect";
import type { GlassViewProps } from "expo-glass-effect";
import { Text } from "react-native";

import { PromptInputBody } from "../prompt-input";

jest.mock("react-native-reanimated", () => {
  const { View } =
    jest.requireActual<typeof import("react-native")>("react-native");

  return {
    __esModule: true,
    createAnimatedComponent: <T,>(component: T) => component,
    default: { View },
  };
});

jest.mock("expo-glass-effect", () => {
  const { View } =
    jest.requireActual<typeof import("react-native")>("react-native");

  return {
    GlassContainer: View,
    GlassView: (props: GlassViewProps) => (
      <View {...props} testID="glass-surface" />
    ),
    isLiquidGlassAvailable: jest.fn(() => true),
  };
});

jest.mock("expo-blur", () => {
  const { View } =
    jest.requireActual<typeof import("react-native")>("react-native");

  return {
    BlurView: (props: BlurViewProps) => (
      <View {...props} testID="blur-surface" />
    ),
  };
});

jest.mock("~/components/chat/conversation", () => ({}));

jest.mock("~/components/touchable-glass", () => ({
  TouchableGlass: () => null,
}));

jest.mock("~/components/tw", () => ({ Image: () => null }));

jest.mock("~/components/symbol-image", () => ({ SymbolImage: () => null }));

jest.mock("~/components/ui/button", () => ({ Button: () => null }));

beforeEach(() => {
  jest.mocked(isLiquidGlassAvailable).mockReturnValue(true);
});

describe("the composer's native material", () => {
  it("passes Expo's material enum unchanged through the real Uniwind wrapper", async () => {
    await render(
      <PromptInputBody>
        <Text>Composer body</Text>
      </PromptInputBody>
    );

    const surface = screen.getByTestId("glass-surface");

    expect(surface.props.glassEffectStyle).toBe("regular");
    expect(surface.props.isInteractive).toBe(true);
    expect(screen.getByText("Composer body")).toBeTruthy();
  });

  it("keeps the blur fallback where native glass is unavailable", async () => {
    jest.mocked(isLiquidGlassAvailable).mockReturnValue(false);
    await render(
      <PromptInputBody>
        <Text>Composer body</Text>
      </PromptInputBody>
    );

    expect(screen.queryByTestId("glass-surface")).toBeNull();
    expect(screen.getByTestId("blur-surface").props.tint).toBe(
      "systemChromeMaterial"
    );
    expect(screen.getByText("Composer body")).toBeTruthy();
  });
});
