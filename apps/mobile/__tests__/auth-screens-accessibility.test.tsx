import "~/test-utils/auth-ui";
import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { Keyboard, Pressable, Text, TextInput } from "react-native";
import { AuthScreen } from "~/components/auth/auth-screen";

afterEach(() => {
  jest.restoreAllMocks();
});
describe("auth screen accessibility", () => {
  const show = () =>
    render(
      <AuthScreen
        action={
          <Pressable accessibilityRole="button" testID="submit">
            <Text>Continue</Text>
          </Pressable>
        }
      >
        <Text testID="background">Check your email</Text>
        <TextInput accessibilityLabel="Code" testID="code" />
      </AuthScreen>
    );
  it("keeps fields and actions as separate accessibility elements", async () => {
    await show();
    for (const target of [
      screen.getByTestId("code"),
      screen.getByTestId("submit"),
    ]) {
      for (let node = target.parent; node; node = node.parent) {
        expect(node.props.accessible).not.toBe(true);
      }
    }
    expect(screen.getByRole("button", { name: "Continue" })).toBeTruthy();
    expect(screen.getByLabelText("Code")).toBeTruthy();
  });
  it("dismisses the keyboard on a background tap", async () => {
    const dismiss = jest.spyOn(Keyboard, "dismiss");
    await show();
    await fireEvent.press(screen.getByTestId("background"));
    expect(dismiss).toHaveBeenCalledTimes(1);
  });
});
