import type { WorkoutSession } from "@fitme/core";
import { setDeviceConventions } from "@fitme/i18n";
import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { act, render, screen } from "@testing-library/react-native";
import { i18n } from "~/lib/i18n";
import {
  setDevice24HourClock,
  setDeviceLanguages,
} from "~/test-utils/device-locales";
import { InAppLanguage } from "~/test-utils/in-app-language";
import WorkoutSessionHistoryRow from "../workout-session-history-row";

jest.mock("~/hooks/queries/profiles", () => ({
  useProfileQuery: () => ({ data: { measurement_system: "metric" } }),
}));

// Wednesday 21 October 2026, 18:05 local time, for 42 minutes.
const startedAt = new Date(2026, 9, 21, 18, 5);
const finishedAt = new Date(2026, 9, 21, 18, 47);

const session: WorkoutSession = {
  created_at: startedAt.toISOString(),
  exercises: [
    {
      created_at: startedAt.toISOString(),
      exercise_slug: "bench-press",
      id: "wse-1",
      order: 1,
      sets: [
        {
          created_at: startedAt.toISOString(),
          id: "set-1",
          logged_at: startedAt.toISOString(),
          order: 1,
          reps_completed: 10,
          reps_recommended: 10,
          rest_recommended: 60,
          updated_at: startedAt.toISOString(),
          weight_completed: 1250.5,
          weight_recommended: 1250.5,
          workout_session_exercise_id: "wse-1",
        },
      ],
      updated_at: startedAt.toISOString(),
      workout_session_id: "session-1",
    },
  ],
  finished_at: finishedAt.toISOString(),
  id: "session-1",
  plan_id: null,
  started_at: startedAt.toISOString(),
  updated_at: finishedAt.toISOString(),
  user_id: "user_1",
  workout: null,
  workout_id: null,
};

// ICU may put a narrow no-break space before `PM`.
const TWELVE_HOUR = /^Wed, Oct 21 · 6:05\sPM$/;
const ENGLISH_VOLUME = /12,505 kg/;
// `12 505 kg`, with Ukrainian's no-break space between thousands.
const UKRAINIAN_VOLUME = /12\s505 kg/;

// The language sync leaves the App language and region where a test put them.
afterEach(async () => {
  await i18n.changeLanguage("en");
  setDeviceConventions(i18n, { region: "US", uses24hourClock: false });
});

const renderRow = () =>
  render(
    <InAppLanguage>
      <WorkoutSessionHistoryRow workoutSession={session} />
    </InAppLanguage>
  );

describe("WorkoutSessionHistoryRow", () => {
  it("writes when it started on the device's clock", async () => {
    await renderRow();
    expect(screen.getByText(TWELVE_HOUR)).toBeTruthy();
    expect(screen.getByText(ENGLISH_VOLUME)).toBeTruthy();

    await act(() => {
      setDevice24HourClock(true);
    });
    expect(screen.getByText("Wed, Oct 21 · 18:05")).toBeTruthy();
  });

  it("writes the date and numbers in the App language", async () => {
    setDeviceLanguages(["uk-UA"]);
    setDevice24HourClock(true);
    await renderRow();
    expect(screen.getByText("ср, 21 жовт. · 18:05")).toBeTruthy();
    expect(screen.getByText(UKRAINIAN_VOLUME)).toBeTruthy();
  });
});
