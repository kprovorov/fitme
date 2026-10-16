/**
 * The emailed-code, forgot-password and reset-password screens dismiss the
 * keyboard on a tap outside the form, without merging the form into a single
 * accessibility element (FIT-164): VoiceOver and Maestro must still reach the
 * input and each button on their own.
 */
import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";
import type { ComponentType } from "react";
import { Keyboard } from "react-native";
import ForgotPasswordScreen from "~/app/auth/forgot-password";
import ResetPasswordScreen from "~/app/auth/reset-password";
import VerifyCodeScreen from "~/app/auth/verify-code";

type TestNode = ReturnType<typeof screen.getByTestId>;

jest.mock("expo-router", () => ({
  Redirect: () => null,
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ purpose: "sign-up" }),
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
}));

/**
 * Each screen's view, reduced to an input, a button and some text. A function
 * declaration, so it is hoisted above the `jest.mock` factories that use it.
 */
function mockFormView() {
  const { Pressable, Text, TextInput, View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return (
    <View>
      <Text testID="form-text">Check your email</Text>
      <TextInput testID="form-input" />
      <Pressable accessibilityRole="button" testID="form-button">
        <Text>Continue</Text>
      </Pressable>
    </View>
  );
}

jest.mock("~/components/views/verify-code-view", () => ({
  __esModule: true,
  default: mockFormView,
  isCodePurpose: () => true,
}));
jest.mock("~/components/views/forgot-password-view", () => mockFormView);
jest.mock("~/components/views/reset-password-view", () => mockFormView);

/** True when an ancestor groups the element into one accessibility element. */
const isMergedIntoAncestor = (element: TestNode) => {
  for (let node = element.parent; node; node = node.parent) {
    if (node.props.accessible === true) {
      return true;
    }
  }
  return false;
};

const screens: [string, ComponentType][] = [
  ["verify-code", VerifyCodeScreen],
  ["forgot-password", ForgotPasswordScreen],
  ["reset-password", ResetPasswordScreen],
];

afterEach(() => {
  jest.restoreAllMocks();
});

describe.each(screens)("%s screen", (_name, Screen) => {
  it("keeps the input and the button their own accessibility elements", async () => {
    await render(<Screen />);

    expect(isMergedIntoAncestor(screen.getByTestId("form-input"))).toBe(false);
    expect(isMergedIntoAncestor(screen.getByTestId("form-button"))).toBe(false);
  });

  it("dismisses the keyboard on a tap outside the form", async () => {
    const dismiss = jest.spyOn(Keyboard, "dismiss");
    await render(<Screen />);

    await fireEvent.press(screen.getByTestId("form-text"));

    expect(dismiss).toHaveBeenCalledTimes(1);
  });
});
