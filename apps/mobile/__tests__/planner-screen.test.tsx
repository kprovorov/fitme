/**
 * The planner on the mounted-screen seam: the real screen and form, with the
 * router recorded and the native-backed primitives for stand-ins.
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { router } from "expo-router";
import PlannerScreen from "~/app/planner";
import { useAppLanguageSync } from "~/lib/i18n";
import { getTabTitle } from "~/lib/tabs";
import { setDeviceLanguages } from "~/test-utils/device-locales";

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

// The root layout's language sync, which follows the device's languages.
function Planner() {
  useAppLanguageSync();
  return <PlannerScreen />;
}

describe("PlannerScreen", () => {
  beforeEach(() => {
    jest.mocked(router.dismissTo).mockClear();
  });

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
    expect(getTabTitle(tab)).toBe("Arnold AI");
    expect(
      // Jest runs from apps/mobile.
      existsSync(resolve(`app/(tabs)/${tab}/index.tsx`))
    ).toBe(true);
  });

  it("walks every step in Ukrainian on a Ukrainian device", async () => {
    setDeviceLanguages(["uk-UA"]);
    await render(<Planner />);

    // Goal
    expect(screen.getByText("Ціль")).toBeTruthy();
    expect(screen.getByText("Яка ваша ціль?")).toBeTruthy();
    for (const goal of ["Скинути вагу", "Набрати м’язи", "Тримати форму"]) {
      expect(screen.getByText(goal)).toBeTruthy();
    }

    // Experience
    expect(screen.getByText("Досвід")).toBeTruthy();
    expect(screen.getByText("Який у вас досвід тренувань?")).toBeTruthy();
    for (const [level, description] of [
      ["Початківець", "0–6 міс. досвіду"],
      ["Середній рівень", "6 міс. – 3 роки досвіду"],
      ["Досвідчений", "3+ роки досвіду"],
    ]) {
      expect(screen.getByText(level)).toBeTruthy();
      expect(screen.getByText(description)).toBeTruthy();
    }

    // Workout duration, its default in Ukrainian's "many" form
    expect(screen.getByText("Тривалість тренування")).toBeTruthy();
    expect(screen.getByText("60 хвилин")).toBeTruthy();

    // Place
    expect(screen.getByText("Місце")).toBeTruthy();
    expect(screen.getByText("Спортзал")).toBeTruthy();
    expect(screen.getByText("Вдома")).toBeTruthy();
    expect(screen.getByText("Скоро")).toBeTruthy();

    // Frequency
    expect(screen.getByText("Частота")).toBeTruthy();
    expect(
      screen.getByText("Скільки разів на тиждень ви хочете тренуватися?")
    ).toBeTruthy();

    // Custom note
    expect(screen.getByText("Власна примітка")).toBeTruthy();
    expect(
      screen.getByPlaceholderText("Напр.: хочу приділяти більше уваги пресу")
    ).toBeTruthy();

    expect(screen.queryByText("Goal")).toBeNull();
    expect(screen.queryByText("Gain muscle")).toBeNull();
  });

  it("shows its own errors in Ukrainian", async () => {
    setDeviceLanguages(["uk-UA"]);
    await render(<Planner />);

    await fireEvent.press(screen.getByText("Отримати мій план!"));

    // Goal, experience and frequency have no default.
    expect(await screen.findAllByText("Обов’язково")).toHaveLength(3);
    expect(screen.queryByText("Required")).toBeNull();
    expect(router.dismissTo).not.toHaveBeenCalled();
  });

  it("asks Arnold in Ukrainian on a Ukrainian device", async () => {
    setDeviceLanguages(["uk-UA"]);
    await render(<Planner />);

    await fireEvent.press(screen.getByText("Набрати м’язи"));
    await fireEvent.press(screen.getByTestId("experience-beginner"));
    await fireEvent.press(screen.getByTestId("frequency-3"));
    await fireEvent.changeText(
      screen.getByPlaceholderText("Напр.: хочу приділяти більше уваги пресу"),
      "Більше пресу"
    );
    await fireEvent.press(screen.getByText("Отримати мій план!"));

    const [target] = jest.mocked(router.dismissTo).mock.calls[0] as [
      { params: { initialMessage: string }; pathname: string },
    ];
    expect(target.params.initialMessage).toBe(
      [
        "Будь ласка, створи для мене план тренувань із такими параметрами:",
        "- Ціль: Набір м’язової маси",
        "- Досвід: Початківець",
        "- Тривалість тренування: 60 хвилин",
        "- Місце: Спортзал",
        "- Частота: 3 дні на тиждень",
        "- Додаткові примітки: Більше пресу",
      ].join("\n")
    );
  });
});
