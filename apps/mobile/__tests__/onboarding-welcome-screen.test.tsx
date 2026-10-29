/**
 * The onboarding welcome screen in the App language, with Clerk for a
 * signed-in User and the SwiftUI-backed button for its stand-in.
 */
import { describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";
import type { ReactNode } from "react";
import WelcomeScreen from "~/app/onboarding";
import { useAppLanguageSync } from "~/lib/i18n";
import { storage } from "~/lib/mmkv";
import { setDeviceLanguages } from "~/test-utils/device-locales";

jest.mock("expo-router", () => ({
  Link: ({ children }: { children: ReactNode }) => children,
  router: { dismissTo: jest.fn() },
  Stack: { Screen: () => null },
}));

jest.mock("@clerk/expo", () => ({
  useUser: () => ({ isLoaded: true, user: { id: "user_welcome" } }),
}));

jest.mock("react-native-safe-area-context", () => {
  const { View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return { SafeAreaView: View };
});

jest.mock("~/components/ui/button", () =>
  jest.requireActual("~/test-utils/button-stub")
);

/** The screen under the root layout's language sync. */
function App() {
  useAppLanguageSync();
  return <WelcomeScreen />;
}

describe("Onboarding WelcomeScreen", () => {
  it("is in English on an English device", async () => {
    await render(<App />);

    expect(screen.getByText("Welcome to Fitme!")).toBeTruthy();
    expect(
      screen.getByText(
        "Your personal AI trainer is waiting for you. Let's get started!"
      )
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Get Started" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Skip" })).toBeTruthy();
  });

  it("is in Ukrainian on a Ukrainian device, and Skip still skips", async () => {
    setDeviceLanguages(["uk-UA"]);
    await render(<App />);

    expect(screen.getByText("Вітаємо у Fitme!")).toBeTruthy();
    expect(
      screen.getByText("Ваш особистий AI-тренер уже чекає на вас. Почнімо!")
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Почати" })).toBeTruthy();

    await fireEvent.press(screen.getByRole("button", { name: "Пропустити" }));

    expect(storage.getBoolean("onboarding.seen.user_welcome")).toBe(true);
  });
});
