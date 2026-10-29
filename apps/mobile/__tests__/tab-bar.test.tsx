/**
 * The tab bar in the App language: the real tab layout, with the native tabs
 * as plain views (their labels as text) and Clerk signed in, under the
 * root layout's language sync. The device language comes from the mocked
 * `expo-localization` (`test-utils/device-locales.ts`).
 */
import { describe, expect, it, jest } from "@jest/globals";
import { act, render, screen } from "@testing-library/react-native";
import TabLayout from "~/app/(tabs)/_layout";
import { useAppLanguageSync } from "~/lib/i18n";
import { setDeviceLanguages } from "~/test-utils/device-locales";

jest.mock("@clerk/expo", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true }),
}));

jest.mock("expo-router", () => ({ Redirect: () => null }));

jest.mock("expo-router/native-tabs", () =>
  jest.requireActual("~/test-utils/native-tabs-stub")
);

function App() {
  useAppLanguageSync();
  return <TabLayout />;
}

describe("tab bar", () => {
  it("is in English on an English device", async () => {
    await render(<App />);

    for (const label of ["Home", "History", "Arnold", "Library", "Profile"]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  it("is in Ukrainian on a Ukrainian device", async () => {
    setDeviceLanguages(["uk-UA"]);
    await render(<App />);

    for (const label of [
      "Головна",
      "Історія",
      "Arnold",
      "Бібліотека",
      "Профіль",
    ]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    expect(screen.queryByText("Home")).toBeNull();
  });

  it("is in English on a device in a language the app doesn't speak", async () => {
    setDeviceLanguages(["ru-RU"]);
    await render(<App />);

    expect(screen.getByText("Home")).toBeTruthy();
    expect(screen.getByText("Library")).toBeTruthy();
  });

  it("takes the first device language the app speaks", async () => {
    setDeviceLanguages(["ru-RU", "uk-UA", "en-US"]);
    await render(<App />);

    expect(screen.getByText("Головна")).toBeTruthy();
  });

  it("switches language when the device's language changes", async () => {
    await render(<App />);
    expect(screen.getByText("Profile")).toBeTruthy();

    await act(() => {
      setDeviceLanguages(["uk"]);
    });
    expect(screen.getByText("Профіль")).toBeTruthy();
    expect(screen.queryByText("Profile")).toBeNull();

    await act(() => {
      setDeviceLanguages(["de-DE"]);
    });
    expect(screen.getByText("Profile")).toBeTruthy();
  });
});
