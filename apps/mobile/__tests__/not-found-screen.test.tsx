/**
 * The not-found screen, in English and on a Ukrainian device, under the root
 * layout's language sync.
 */
import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { render, screen } from "@testing-library/react-native";
import type { ReactNode } from "react";
import NotFoundScreen from "~/app/+not-found";
import { i18n } from "~/lib/i18n";
import { setDeviceLanguages } from "~/test-utils/device-locales";
import { InAppLanguage } from "~/test-utils/in-app-language";

jest.mock("expo-router", () => ({
  Link: ({ children }: { children: ReactNode }) => children,
}));

jest.mock("~/components/ui/button", () =>
  jest.requireActual("~/test-utils/button-stub")
);

const renderScreen = () =>
  render(
    <InAppLanguage>
      <NotFoundScreen />
    </InAppLanguage>
  );

describe("NotFoundScreen", () => {
  afterEach(async () => {
    // The next English test renders without the sync.
    await i18n.changeLanguage("en");
  });

  it("says the screen doesn't exist and offers the way home", async () => {
    await renderScreen();

    expect(screen.getByText("Oops!")).toBeTruthy();
    expect(screen.getByText("This screen doesn't exist.")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Go to home screen!" })
    ).toBeTruthy();
  });

  it("reads in Ukrainian on a Ukrainian device", async () => {
    setDeviceLanguages(["uk-UA"]);

    await renderScreen();

    expect(screen.getByText("Отакої!")).toBeTruthy();
    expect(screen.getByText("Такого екрана не існує.")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "На головний екран" })
    ).toBeTruthy();
    expect(screen.queryByText("Oops!")).toBeNull();
  });
});
