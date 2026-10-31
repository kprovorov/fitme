import { setDeviceConventions } from "@fitme/i18n";
import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { render, screen } from "@testing-library/react-native";
import type { ReactNode } from "react";
import type { WorkoutSessionHistoryEntry } from "~/hooks/queries/workout-sessions";
import { i18n } from "~/lib/i18n";
import { setDeviceLanguages } from "~/test-utils/device-locales";
import { InAppLanguage } from "~/test-utils/in-app-language";
import WorkoutSessionHistoryRow from "../workout-session-history-row";

jest.mock("expo-router", () => ({
  Link: ({ children }: { children: ReactNode }) => children,
}));
jest.mock("~/components/symbol-image", () => ({ SymbolImage: () => null }));

// Wednesday 21 October 2026, 18:05 local time, for 42 minutes.
const startedAt = new Date(2026, 9, 21, 18, 5);
const finishedAt = new Date(2026, 9, 21, 18, 47);

const entry: WorkoutSessionHistoryEntry = {
  completed_rep_count: 10,
  exercise_count: 1,
  finished_at: finishedAt.toISOString(),
  id: "session-1",
  logged_set_count: 1,
  plan: null,
  set_count: 1,
  started_at: startedAt.toISOString(),
  status: "finished",
  volume: 12_505,
  workout: { id: "workout-1", name: "Lower A" },
};

// `12 505 кг`, with Ukrainian's no-break space between thousands.
const UKRAINIAN_DETAILS = /^42 хв · 1 підхід · 12\s505 кг$/;

// The language sync leaves the App language and region where a test put them.
afterEach(async () => {
  await i18n.changeLanguage("en");
  setDeviceConventions(i18n, { region: "US", uses24hourClock: false });
});

const renderRow = (shown = entry, weightUnit: "kg" | "lbs" = "kg") =>
  render(
    <InAppLanguage>
      <WorkoutSessionHistoryRow entry={shown} weightUnit={weightUnit} />
    </InAppLanguage>
  );

describe("WorkoutSessionHistoryRow", () => {
  it("shows the date tile, name, duration, logged sets and volume", async () => {
    await renderRow();

    expect(screen.getByText("Wed")).toBeTruthy();
    expect(screen.getByText("21")).toBeTruthy();
    expect(screen.getByText("Lower A")).toBeTruthy();
    expect(screen.getByText("42min · 1 set · 12,505 kg")).toBeTruthy();
    expect(
      screen.getByRole("button", {
        name: "Lower A, Wed, Oct 21, 42min, 1 set, 12,505 kilograms",
      })
    ).toBeTruthy();
  });

  it("names a gone Workout generically and shows a volume in pounds", async () => {
    await renderRow({ ...entry, volume: 0, workout: null }, "lbs");

    expect(screen.getByText("Workout")).toBeTruthy();
    expect(screen.getByText("42min · 1 set · 0 lbs")).toBeTruthy();
  });

  it("writes the date and numbers in the App language", async () => {
    setDeviceLanguages(["uk-UA"]);
    await renderRow();

    expect(screen.getByText("ср")).toBeTruthy();
    expect(screen.getByText(UKRAINIAN_DETAILS)).toBeTruthy();
  });
});
