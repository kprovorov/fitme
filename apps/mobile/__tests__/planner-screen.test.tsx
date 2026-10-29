/**
 * The planner on the mounted-screen seam: the real screen and form, with the
 * router recorded and the native-backed primitives for stand-ins.
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { router } from "expo-router";
import PlannerScreen from "~/app/planner";
import { getTabTitle } from "~/lib/tabs";

jest.mock("expo-router", () => ({
  router: { dismissTo: jest.fn() },
  Stack: { Screen: () => null },
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
}));

jest.mock("react-native-keyboard-controller", () => ({
  KeyboardAwareScrollView:
    jest.requireActual<typeof import("react-native")>("react-native").View,
}));

jest.mock("~/components/ui/button", () =>
  jest.requireActual("~/test-utils/button-stub")
);

// The SwiftUI slider can't mount under Jest; the duration keeps its default.
jest.mock("~/components/ui/slider", () => ({ Slider: () => null }));

describe("PlannerScreen", () => {
  it("hands the plan request off to the Arnold tab", async () => {
    await render(<PlannerScreen />);

    await fireEvent.press(screen.getByText("Gain muscle"));
    await fireEvent.press(screen.getByTestId("experience-beginner"));
    await fireEvent.press(screen.getByTestId("frequency-3"));
    await fireEvent.press(screen.getByText("Get my plan!"));

    expect(router.dismissTo).toHaveBeenCalledTimes(1);
    const [target] = jest.mocked(router.dismissTo).mock.calls[0] as [
      { params: { initialMessage: string }; pathname: string },
    ];
    expect(target.pathname).toBe("/(tabs)/arnold");
    expect(target.params.initialMessage).toContain("- Frequency: 3 days");

    // The pathname is the Arnold tab: its route and its tab bar title.
    const tab = target.pathname.split("/").at(-1) ?? "";
    expect(getTabTitle(tab)).toBe("Arnold");
    expect(
      // Jest runs from apps/mobile.
      existsSync(resolve(`app/(tabs)/${tab}/index.tsx`))
    ).toBe(true);
  });
});
