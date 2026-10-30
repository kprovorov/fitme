/**
 * The tab bar in the App language: the real tab layout, with the native tabs
 * as plain views (their labels as text) and Clerk signed in, under the
 * root layout's language sync. The device language comes from the mocked
 * `expo-localization` (`test-utils/device-locales.ts`).
 */
import { describe, expect, it, jest } from "@jest/globals";
import { act, render, screen, within } from "@testing-library/react-native";
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

const TAB = /^tab:/;
const SYMBOL = /^sf:/;
const ANY_TEXT = /./;

/** Each tab in order: its route, its symbol (one for both states) and label. */
const shownTabs = () =>
  screen.getAllByTestId(TAB).map((tab) => ({
    label: within(tab).getByText(ANY_TEXT).props.children,
    route: tab.props.testID.replace(TAB, ""),
    symbol: within(tab).getByTestId(SYMBOL).props.testID.replace(SYMBOL, ""),
  }));

describe("tab bar", () => {
  it("has Figma's four tabs, in order, each with its one symbol", async () => {
    await render(<App />);

    expect(shownTabs()).toEqual([
      { label: "Workout", route: "(home)", symbol: "dumbbell.fill" },
      { label: "History", route: "history", symbol: "book.pages" },
      { label: "Arnold AI", route: "arnold", symbol: "sparkles.2" },
      { label: "Library", route: "library", symbol: "book" },
    ]);
  });

  it("has no Profile tab: Profile is the first tab's header button", async () => {
    await render(<App />);

    expect(screen.queryByText("Profile")).toBeNull();
  });

  it("is in Ukrainian on a Ukrainian device", async () => {
    setDeviceLanguages(["uk-UA"]);
    await render(<App />);

    expect(shownTabs().map(({ label }) => label)).toEqual([
      "Тренування",
      "Історія",
      "Arnold AI",
      "Бібліотека",
    ]);
  });

  it("is in English on a device in a language the app doesn't speak", async () => {
    setDeviceLanguages(["ru-RU"]);
    await render(<App />);

    expect(shownTabs().map(({ label }) => label)).toEqual([
      "Workout",
      "History",
      "Arnold AI",
      "Library",
    ]);
  });

  it("takes the first device language the app speaks", async () => {
    setDeviceLanguages(["ru-RU", "uk-UA", "en-US"]);
    await render(<App />);

    expect(screen.getByText("Тренування")).toBeTruthy();
  });

  it("switches language when the device's language changes", async () => {
    await render(<App />);
    expect(screen.getByText("Library")).toBeTruthy();

    await act(() => {
      setDeviceLanguages(["uk"]);
    });
    expect(screen.getByText("Бібліотека")).toBeTruthy();
    expect(screen.queryByText("Library")).toBeNull();

    await act(() => {
      setDeviceLanguages(["de-DE"]);
    });
    expect(screen.getByText("Library")).toBeTruthy();
  });
});
