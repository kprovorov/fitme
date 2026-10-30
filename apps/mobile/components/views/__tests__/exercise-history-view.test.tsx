import type {
  WorkoutSessionExercise,
  WorkoutSessionExerciseSet,
} from "@fitme/core";
import { setDeviceConventions } from "@fitme/i18n";
import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { i18n } from "~/lib/i18n";
import {
  setDevice24HourClock,
  setDeviceLanguages,
} from "~/test-utils/device-locales";
import { InAppLanguage } from "~/test-utils/in-app-language";
import ExerciseHistoryView from "../exercise-history-view";

// A row's set number cell, and a session's date.
const SET_NUMBER = /^#\d$/;
// A date shows its year once it is not this one. An American device puts the
// month first.
const SESSION_DATE = /^October \d+(, \d{4})?$/;

const mockHistory: { current: WorkoutSessionExercise[] } = { current: [] };

jest.mock("~/hooks/queries/exercises", () => ({
  useExerciseHistoryQuery: () => ({ data: mockHistory.current }),
}));
jest.mock("~/hooks/queries/profiles", () => ({
  useProfileQuery: () => ({ data: { measurement_system: "metric" } }),
}));
jest.mock("~/components/ui/button", () =>
  jest.requireActual("~/test-utils/button-stub")
);

const set = (
  order: number,
  values: Partial<WorkoutSessionExerciseSet>
): WorkoutSessionExerciseSet => ({
  created_at: "2026-10-21T10:00:00Z",
  id: `set-${order}`,
  logged_at: "2026-10-21T10:00:00Z",
  order,
  reps_completed: 12,
  reps_recommended: 12,
  rest_recommended: 60,
  updated_at: "2026-10-21T10:00:00Z",
  weight_completed: 45,
  weight_recommended: 45,
  workout_session_exercise_id: "wse",
  ...values,
});

const entry = (
  id: string,
  createdAt: string,
  sets: WorkoutSessionExerciseSet[]
): WorkoutSessionExercise => ({
  created_at: createdAt,
  exercise_slug: "shoulder-press",
  id,
  order: 1,
  sets,
  updated_at: "2026-10-21T10:00:00Z",
  workout_session_id: `session-${id}`,
});

// The language sync leaves the App language and region where a test put them.
afterEach(async () => {
  await i18n.changeLanguage("en");
  setDeviceConventions(i18n, { region: "US", uses24hourClock: false });
});

describe("ExerciseHistoryView", () => {
  it("shows each past session as a table of its sets under Progress", async () => {
    mockHistory.current = [
      entry("e1", "2026-10-21T10:00:00Z", [
        set(2, { reps_completed: 10, weight_completed: 50 }),
        set(1, {}),
      ]),
    ];
    await render(<ExerciseHistoryView exerciseSlug="shoulder-press" />);

    expect(screen.getByRole("heading", { name: "Progress" })).toBeTruthy();
    expect(screen.queryByText("History")).toBeNull();
    expect(screen.getByText(SESSION_DATE)).toBeTruthy();
    for (const header of ["#", "target", "reps", "kg"]) {
      // VoiceOver skips the header: each row reads as one sentence.
      expect(
        screen.getByText(header, { includeHiddenElements: true })
      ).toBeTruthy();
    }
    // Rows in set order: number, target, then what was logged.
    expect(
      screen.getAllByText(SET_NUMBER).map((cell) => cell.props.children)
    ).toEqual(["#1", "#2"]);
    expect(screen.getAllByText("12×45kg")).toHaveLength(2);
    expect(screen.getByText("10")).toBeTruthy();
    expect(screen.getByText("50")).toBeTruthy();
    expect(
      screen.getByLabelText("Set 2: 10 reps, 50 kg. Target 12×45kg")
    ).toBeTruthy();
  });

  it("names the year of a session from an earlier year", async () => {
    mockHistory.current = [entry("old", "2020-03-02T10:00:00Z", [set(1, {})])];
    await render(<ExerciseHistoryView exerciseSlug="shoulder-press" />);

    expect(screen.getByText("March 2, 2020")).toBeTruthy();
  });

  it("writes the date in the App language and the device region's order", async () => {
    mockHistory.current = [entry("old", "2020-03-02T10:00:00Z", [set(1, {})])];
    setDeviceLanguages(["uk-UA"]);
    await render(
      <InAppLanguage>
        <ExerciseHistoryView exerciseSlug="shoulder-press" />
      </InAppLanguage>
    );

    expect(screen.getByText("2 березня 2020 р.")).toBeTruthy();
  });

  it("switches the date when the device's language changes", async () => {
    mockHistory.current = [entry("old", "2020-03-02T10:00:00Z", [set(1, {})])];
    await render(
      <InAppLanguage>
        <ExerciseHistoryView exerciseSlug="shoulder-press" />
      </InAppLanguage>
    );
    expect(screen.getByText("March 2, 2020")).toBeTruthy();

    await act(() => {
      setDeviceLanguages(["uk-UA"]);
    });
    expect(screen.getByText("2 березня 2020 р.")).toBeTruthy();

    // Only the region changes: the words stay English, the order is British.
    await act(() => {
      setDeviceLanguages(["en-GB"]);
    });
    expect(screen.getByText("2 March 2020")).toBeTruthy();
    // A clock change re-renders too, with nothing else changed.
    await act(() => {
      setDevice24HourClock(true);
    });
    expect(screen.getByText("2 March 2020")).toBeTruthy();
  });

  it("writes an English date day first on a British device", async () => {
    mockHistory.current = [entry("old", "2020-03-02T10:00:00Z", [set(1, {})])];
    setDeviceLanguages(["en-GB"]);
    await render(
      <InAppLanguage>
        <ExerciseHistoryView exerciseSlug="shoulder-press" />
      </InAppLanguage>
    );

    expect(screen.getByText("2 March 2020")).toBeTruthy();
  });

  it("leaves out the session being logged and sessions with no logged set", async () => {
    mockHistory.current = [
      entry("current", "2026-10-27T10:00:00Z", [set(1, {})]),
      entry("skipped", "2026-10-25T10:00:00Z", [
        set(1, { reps_completed: null, weight_completed: null }),
      ]),
    ];
    await render(
      <ExerciseHistoryView excludeId="current" exerciseSlug="shoulder-press" />
    );

    expect(screen.queryByText("Progress")).toBeNull();
  });

  it("shows three sessions, then three more on each Load more", async () => {
    mockHistory.current = Array.from({ length: 7 }, (_, index) =>
      entry(`e${index}`, `2026-10-${String(20 - index)}T10:00:00Z`, [
        set(1, {}),
      ])
    );
    await render(<ExerciseHistoryView exerciseSlug="shoulder-press" />);

    expect(screen.getAllByText(SESSION_DATE)).toHaveLength(3);
    await fireEvent.press(screen.getByRole("button", { name: "Load more" }));
    expect(screen.getAllByText(SESSION_DATE)).toHaveLength(6);
    await fireEvent.press(screen.getByRole("button", { name: "Load more" }));
    expect(screen.getAllByText(SESSION_DATE)).toHaveLength(7);
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  });
});
