import { setDeviceConventions } from "@fitme/i18n";
import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react-native";
import type { ReactNode } from "react";
import type { WorkoutSessionHistoryEntry } from "~/hooks/queries/workout-sessions";
import { i18n } from "~/lib/i18n";
import { setDeviceLanguages } from "~/test-utils/device-locales";
import { libraryExercise, serveLibrary } from "~/test-utils/fake-library";
import { InAppLanguage } from "~/test-utils/in-app-language";
import { createTestQueryClient } from "~/test-utils/query-client";
import WorkoutSessionHistoryRow from "../workout-session-history-row";

// The Link as a view naming where it goes, so a test can follow the row.
jest.mock("expo-router", () => ({
  Link: ({ children, href }: { children: ReactNode; href: string }) => {
    const { View } =
      jest.requireActual<typeof import("react-native")>("react-native");
    return <View testID={`link:${href}`}>{children}</View>;
  },
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
  personal_records: [],
  plan: null,
  set_count: 1,
  started_at: startedAt.toISOString(),
  status: "finished",
  volume: 12_505,
  workout: { id: "workout-1", name: "Lower A" },
};

// The Personal record VoiceOver reads after the rest of the row.
const UKRAINIAN_RECORD =
  /\. Особистий рекорд: Pull up, власна вага × 12 повторень$/;
// `12 505 кг`, with Ukrainian's no-break space between thousands.
const UKRAINIAN_DETAILS = /^42 хв · 1 підхід · 12\s505 кг$/;

// The language sync leaves the App language and region where a test put them.
afterEach(async () => {
  await i18n.changeLanguage("en");
  setDeviceConventions(i18n, { region: "US", uses24hourClock: false });
});

const renderRow = (shown = entry, weightUnit: "kg" | "lbs" = "kg") =>
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <InAppLanguage>
        <WorkoutSessionHistoryRow entry={shown} weightUnit={weightUnit} />
      </InAppLanguage>
    </QueryClientProvider>
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

  it("shows no PR badge without a Personal record", async () => {
    await renderRow();

    expect(screen.queryByText("PR")).toBeNull();
  });

  it("badges a Workout Session that earned Personal records, reading each Exercise and result", async () => {
    serveLibrary([libraryExercise("barbell-back-squat")]);
    await renderRow(
      {
        ...entry,
        personal_records: [
          {
            exercise_slug: "barbell-back-squat",
            kind: "weight",
            reps: 3,
            weight: 102.5,
          },
          { exercise_slug: "pull-up", kind: "reps", reps: 12, weight: 0 },
        ],
      },
      "kg"
    );

    // The badge is information only: the row still opens the Workout Summary.
    expect(
      within(
        screen.getByTestId("link:/workout-sessions/session-1/summary")
      ).getByText("PR")
    ).toBeTruthy();
    expect(
      await screen.findByRole("button", {
        name: "Lower A, Wed, Oct 21, 42min, 1 set, 12,505 kilograms. Personal records: Barbell Back Squat, 102.5 kilograms × 3 reps; Pull up, bodyweight × 12 reps",
      })
    ).toBeTruthy();
  });

  it("reads a Personal record in Ukrainian", async () => {
    setDeviceLanguages(["uk-UA"]);
    await renderRow({
      ...entry,
      personal_records: [
        { exercise_slug: "pull-up", kind: "reps", reps: 12, weight: 0 },
      ],
    });

    expect(screen.getByText("Рекорд")).toBeTruthy();
    expect(
      screen.getByRole("button", {
        name: UKRAINIAN_RECORD,
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
