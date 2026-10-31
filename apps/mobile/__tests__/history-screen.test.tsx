/**
 * The History tab over the fake Public API: this month's overview, every
 * finished Workout Session grouped by the month it started in, and the
 * loading, error and empty states. Sessions are seeded relative to today, so
 * "this month" is the real one.
 */
import { formatDate, setDeviceConventions } from "@fitme/i18n";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react-native";
import type { ReactNode } from "react";
import HistoryScreen from "~/app/(tabs)/history/index";
import { i18n } from "~/lib/i18n";
import { publicApi } from "~/lib/public-api";
import {
  setDevice24HourClock,
  setDeviceLanguages,
} from "~/test-utils/device-locales";
import { FAKE_USER_ID, fakePublicApi } from "~/test-utils/fake-public-api";
import { backend } from "~/test-utils/fake-workout-backend";
import { InAppLanguage } from "~/test-utils/in-app-language";
import { createTestQueryClient, settle } from "~/test-utils/query-client";

jest.mock("expo-router", () => ({
  Link: ({ children }: { children: ReactNode }) => children,
  Stack: {
    Screen: ({ options }: { options: { title?: string } }) => {
      const { Text } =
        jest.requireActual<typeof import("react-native")>("react-native");
      return options.title ? <Text>{options.title}</Text> : null;
    },
  },
  useRouter: () => ({ navigate: jest.fn() }),
}));

// LegendList lays its items out on measure, which Jest never does: render
// the header and every item (or the empty component) in a plain view instead.
jest.mock("@legendapp/list/react-native", () => ({
  LegendList: <T,>({
    data,
    keyExtractor,
    ListEmptyComponent,
    ListHeaderComponent,
    renderItem,
  }: {
    data: T[];
    keyExtractor: (item: T) => string;
    ListEmptyComponent: ReactNode;
    ListHeaderComponent: ReactNode;
    renderItem: (info: { item: T }) => ReactNode;
  }) => {
    const { Fragment } = jest.requireActual<typeof import("react")>("react");
    return (
      <>
        {ListHeaderComponent}
        {data.length === 0
          ? ListEmptyComponent
          : data.map((item) => (
              <Fragment key={keyExtractor(item)}>
                {renderItem({ item })}
              </Fragment>
            ))}
      </>
    );
  },
}));

// History reads through the Public API alone; the module still loads.
jest.mock("~/lib/supabase", () => ({
  supabase: jest.requireActual<
    typeof import("~/test-utils/fake-workout-backend")
  >("~/test-utils/fake-workout-backend").fakeSupabase,
}));
jest.mock("~/lib/segment", () => ({ segmentClient: { track: jest.fn() } }));

jest.mock("react-native-purchases", () => ({
  __esModule: true,
  default: { invalidateCustomerInfoCache: jest.fn() },
}));
jest.mock("~/components/symbol-image", () => ({ SymbolImage: () => null }));
jest.mock("~/components/ui/button", () =>
  jest.requireActual("~/test-utils/button-stub")
);

const MINUTE_MS = 60_000;
const ROW_NAMES = /^(Push Day|Workout|Pull Day)$/;
// The Personal record VoiceOver reads after the rest of the row.
const UKRAINIAN_RECORD =
  /\. Особистий рекорд: Bench press, 105 кілограмів × 3 повторення$/;
// `1 370 кг`, with Ukrainian's no-break space between thousands.
const UKRAINIAN_PUSH_DAY = /^1 год 5 хв · 5 підходів · 1\s370 кг$/;
const WEEKLY_GOAL = /Weekly goal/;
const WEEKS_HIT = /weeks? hit/;

interface Entry {
  id: string;
  minutes: number;
  /** Logged sets, as `[reps, weight]`; `null` weight for none. */
  sets: [number, number | null][];
  start: Date;
  /** The Workout's name, `null` once the Workout is gone. */
  workout: string | null;
}

/** A finished Workout Session, with one Exercise holding its logged sets. */
const seedEntry = ({ id, minutes, sets, start, workout }: Entry) => {
  backend.sessions.push({
    finished_at: new Date(start.getTime() + minutes * MINUTE_MS).toISOString(),
    id,
    plan_id: null,
    started_at: start.toISOString(),
    workout_id: workout === null ? null : `workout-${id}`,
    workoutName: workout ?? "",
  });
  backend.exercises.push({
    exercise_slug: "bench-press",
    id: `${id}-e1`,
    order: 1,
    workout_session_id: id,
  });
  sets.forEach(([reps, weight], index) => {
    backend.sets.push({
      id: `${id}-e1-s${index + 1}`,
      logged_at: start.toISOString(),
      order: index + 1,
      reps_completed: reps,
      reps_recommended: reps,
      rest_recommended: null,
      weight_completed: weight,
      weight_recommended: weight,
      workout_session_exercise_id: `${id}-e1`,
    });
  });
};

const now = new Date();
/** 09:00 on a day of this month. */
const thisMonth = (day: number) =>
  new Date(now.getFullYear(), now.getMonth(), day, 9, 0);
/** 23:30 on the last day of last month: it finishes in this one. */
const lastMonthsLastNight = new Date(
  now.getFullYear(),
  now.getMonth(),
  0,
  23,
  30
);

// 5 sets and 1,370 kg, for 1 h 5 min.
const pushDay: Entry = {
  id: "session-push",
  minutes: 65,
  sets: [
    [10, 50],
    [10, 50],
    [8, 20],
    [8, 20],
    [5, 10],
  ],
  start: thisMonth(3),
  workout: "Push Day",
};
// 500 kg for 25 min, its Workout gone; one more set without a weight.
const goneWorkout: Entry = {
  id: "session-gone",
  minutes: 25,
  sets: [
    [5, 100],
    [12, null],
  ],
  start: thisMonth(2),
  workout: null,
};
// An empty completion: listed, but no progress.
const emptyCompletion: Entry = {
  id: "session-empty",
  minutes: 5,
  sets: [[0, 40]],
  start: thisMonth(1),
  workout: "Pull Day",
};
// Starts on last month's last night and finishes in this month: last month's.
const acrossMonths: Entry = {
  id: "session-across",
  minutes: 90,
  sets: [[5, 60]],
  start: lastMonthsLastNight,
  workout: "Legs",
};

/**
 * Push Day, opened after the gone Workout's 100 kg × 5 bench and finished
 * through the Public API with 105 kg × 3: a weight record.
 */
const finishHeavierPushDay = async () => {
  seedEntry(goneWorkout);
  seedEntry({ ...pushDay, sets: [[3, 105]] });
  const session = backend.session(pushDay.id);
  if (!session) {
    throw new Error("Push Day wasn't seeded");
  }
  const finishedAt = session.finished_at;
  session.finished_at = null;
  await publicApi().POST("/v1/workout-sessions/{id}/finish", {
    params: { path: { id: pushDay.id } },
  });
  // Its seeded 1 h 5 min, not the fake's finishing time
  session.finished_at = finishedAt;
};

const monthTitle = (date: Date) => formatDate(i18n, date, "monthYear");
const dayTitle = (date: Date) => formatDate(i18n, date, "weekdayDayMonth");

let queryClient = createTestQueryClient();

const mount = async () => {
  queryClient = createTestQueryClient();
  await render(
    <QueryClientProvider client={queryClient}>
      <InAppLanguage>
        <HistoryScreen />
      </InAppLanguage>
    </QueryClientProvider>
  );
  await settle(queryClient);
};

/** The overview's stat, as VoiceOver reads it. */
const stat = (label: string) => screen.getByLabelText(label);

beforeEach(() => {
  backend.reset();
});

// The language sync leaves the App language and region where a test put them.
afterEach(async () => {
  await i18n.changeLanguage("en");
  setDeviceConventions(i18n, { region: "US", uses24hourClock: false });
});

describe("The History tab", () => {
  it("totals this month's qualifying workouts above every listed entry", async () => {
    for (const entry of [pushDay, goneWorkout, emptyCompletion, acrossMonths]) {
      seedEntry(entry);
    }
    await mount();

    expect(screen.getByText("This month")).toBeTruthy();
    // The empty completion and last month's session don't count: 2 workouts,
    // 1 h 30 min, 1,870 kg.
    expect(stat("Workouts: 2 workouts")).toBeTruthy();
    expect(stat("Time: 1h 30min")).toBeTruthy();
    expect(stat("Volume: 1.9 tonnes")).toBeTruthy();
    expect(screen.getByText("1.9 t")).toBeTruthy();

    // Every finished entry is listed, under the month it started in.
    expect(screen.getByText(monthTitle(thisMonth(1)))).toBeTruthy();
    expect(screen.getByText("3 entries")).toBeTruthy();
    expect(screen.getByText(monthTitle(lastMonthsLastNight))).toBeTruthy();
    expect(screen.getByText("1 entry")).toBeTruthy();

    expect(screen.getByText("Push Day")).toBeTruthy();
    expect(screen.getByText("1h 5min · 5 sets · 1,370 kg")).toBeTruthy();
    expect(screen.getByText("Workout")).toBeTruthy();
    expect(screen.getByText("25min · 2 sets · 500 kg")).toBeTruthy();
    expect(screen.getByText("5min · 1 set · 0 kg")).toBeTruthy();
    // Its whole 1 h 30 min, though it finished in the next month.
    expect(screen.getByText("1h 30min · 1 set · 300 kg")).toBeTruthy();
  });

  it("reads each row to VoiceOver with its date and spoken volume", async () => {
    seedEntry(pushDay);
    await mount();

    const row = screen.getByRole("button", {
      name: `Push Day, ${dayTitle(pushDay.start)}, 1h 5min, 5 sets, 1,370 kilograms`,
    });
    expect(within(row).getByText(String(pushDay.start.getDate()))).toBeTruthy();
  });

  it("badges the Workout Session that earned a Personal record, reading its Exercise and result", async () => {
    await finishHeavierPushDay();
    await mount();

    // Only Push Day beat an earlier result; the gone Workout set the baseline.
    expect(screen.getAllByText("PR")).toHaveLength(1);
    const row = screen.getByRole("button", {
      name: `Push Day, ${dayTitle(pushDay.start)}, 1h 5min, 1 set, 315 kilograms. Personal record: Bench press, 105 kilograms × 3 reps`,
    });
    expect(within(row).getByText("PR")).toBeTruthy();
    expect(
      screen.getByRole("button", {
        name: `Workout, ${dayTitle(goneWorkout.start)}, 25min, 2 sets, 500 kilograms`,
      })
    ).toBeTruthy();
  });

  it("lists newest start first within a month", async () => {
    for (const entry of [emptyCompletion, pushDay, goneWorkout]) {
      seedEntry(entry);
    }
    await mount();

    const names = screen
      .getAllByText(ROW_NAMES)
      .map((text) => text.props.children);
    expect(names).toEqual(["Push Day", "Workout", "Pull Day"]);
  });

  it("shows zero totals over older History", async () => {
    seedEntry(acrossMonths);
    await mount();

    expect(stat("Workouts: 0 workouts")).toBeTruthy();
    expect(stat("Time: 0min")).toBeTruthy();
    expect(stat("Volume: 0 kilograms")).toBeTruthy();
    expect(screen.getByText("Legs")).toBeTruthy();
    expect(screen.queryByText("No workouts yet")).toBeNull();
  });

  it("reads every page, so neither month counts nor totals are cut short", async () => {
    for (let index = 0; index < 55; index += 1) {
      seedEntry({
        id: `session-${index}`,
        minutes: 1,
        sets: [[1, 10]],
        start: new Date(thisMonth(1).getTime() + index * MINUTE_MS),
        workout: `Workout ${index}`,
      });
    }
    await mount();

    expect(fakePublicApi.count("GET /v1/workout-sessions")).toBe(2);
    expect(screen.getByText("55 entries")).toBeTruthy();
    expect(stat("Workouts: 55 workouts")).toBeTruthy();
    expect(stat("Time: 55min")).toBeTruthy();
    expect(stat("Volume: 550 kilograms")).toBeTruthy();
  });

  it("reads every page again when a session goes between two of them", async () => {
    for (let index = 0; index < 55; index += 1) {
      seedEntry({
        id: `session-${index}`,
        minutes: 1,
        sets: [[1, 10]],
        start: new Date(thisMonth(1).getTime() + index * MINUTE_MS),
        workout: `Workout ${index}`,
      });
    }
    const route = "GET /v1/workout-sessions";
    const resumeFirstPage = fakePublicApi.pause(route);
    const resumeSecondPage = fakePublicApi.pause(route);
    queryClient = createTestQueryClient();
    await render(
      <QueryClientProvider client={queryClient}>
        <HistoryScreen />
      </QueryClientProvider>
    );
    await waitFor(() => expect(fakePublicApi.count(route)).toBe(1));
    // A macrotask, so the first request is waiting on the first pause (in
    // act: the Weekly goal's answer renders meanwhile).
    await act(() => new Promise((resolve) => setTimeout(resolve, 10)));
    resumeFirstPage();
    await waitFor(() => expect(fakePublicApi.count(route)).toBe(2));
    // The newest session goes after the first page: the second would skip one.
    backend.sessions = backend.sessions.filter(
      (session) => session.id !== "session-54"
    );
    resumeSecondPage();
    await settle(queryClient);

    expect(fakePublicApi.count(route)).toBe(4);
    expect(screen.getByText("54 entries")).toBeTruthy();
    expect(screen.queryByText("Workout 54")).toBeNull();
    expect(screen.getByText("Workout 4")).toBeTruthy();
  });

  it("shows imperial volumes in pounds, compact in the overview", async () => {
    backend.seedProfile(FAKE_USER_ID, { measurement_system: "us" });
    seedEntry({
      ...pushDay,
      sets: Array.from({ length: 10 }, () => [10, 302.5] as [number, number]),
    });
    await mount();

    expect(screen.getByText("30.3K lbs")).toBeTruthy();
    expect(stat("Volume: 30.3 thousand pounds")).toBeTruthy();
    expect(screen.getByText("1h 5min · 10 sets · 30,250 lbs")).toBeTruthy();
  });

  it("shows a load failure with a retry, then the History", async () => {
    seedEntry(pushDay);
    fakePublicApi.failNext("GET /v1/workout-sessions", { status: 500 });
    await mount();

    expect(
      screen.getByText(
        "Couldn't load your workouts. Check your connection and try again."
      )
    ).toBeTruthy();
    expect(screen.queryByText("No workouts yet")).toBeNull();

    await fireEvent.press(screen.getByText("Try Again"));
    await settle(queryClient);

    expect(screen.getByText("Push Day")).toBeTruthy();
    expect(stat("Workouts: 1 workout")).toBeTruthy();
  });

  it("shows the loading state, never an empty History, while it loads", async () => {
    const resume = fakePublicApi.pause("GET /v1/workout-sessions");
    queryClient = createTestQueryClient();
    await render(
      <QueryClientProvider client={queryClient}>
        <HistoryScreen />
      </QueryClientProvider>
    );

    expect(screen.queryByText("No workouts yet")).toBeNull();
    expect(screen.queryByText("This month")).toBeNull();

    resume();
    await settle(queryClient);
    expect(screen.getByText("No workouts yet")).toBeTruthy();
  });

  it("shows the empty state without the overview", async () => {
    await mount();

    expect(screen.getByText("No workouts yet")).toBeTruthy();
    expect(screen.queryByText("This month")).toBeNull();
  });
});

describe("The History tab in Ukrainian", () => {
  beforeEach(() => {
    setDeviceLanguages(["uk-UA"]);
    setDevice24HourClock(true);
  });

  it("writes the overview, month counts and rows in Ukrainian", async () => {
    for (const entry of [pushDay, goneWorkout, emptyCompletion]) {
      seedEntry(entry);
    }
    await mount();

    expect(screen.getByText("Цей місяць")).toBeTruthy();
    expect(stat("Тренування: 2 тренування")).toBeTruthy();
    expect(stat("Час: 1 год 30 хв")).toBeTruthy();
    expect(stat("Обсяг: 1,9 тонни")).toBeTruthy();
    expect(screen.getByText("1,9 т")).toBeTruthy();
    // Three entries: the `few` form.
    expect(screen.getByText("3 записи")).toBeTruthy();
    // `1 370 кг`, with Ukrainian's no-break space between thousands.
    expect(screen.getByText(UKRAINIAN_PUSH_DAY)).toBeTruthy();
    // The Workouts stat's caption and the gone Workout's name.
    expect(screen.getAllByText("Тренування")).toHaveLength(2);
  });

  it("badges and reads a Personal record in Ukrainian", async () => {
    await finishHeavierPushDay();
    await mount();

    expect(screen.getAllByText("Рекорд")).toHaveLength(1);
    expect(
      screen.getByRole("button", {
        name: UKRAINIAN_RECORD,
      })
    ).toBeTruthy();
  });
});

describe("The History tab's Weekly goal", () => {
  // Wednesday 28 October 2026, noon in Kyiv, where the clocks went back on
  // Sunday 25 October: the week of 19 October is 169 hours long.
  const NOW = new Date("2026-10-28T12:00:00+02:00");
  const originalTimeZone = process.env.TZ;

  /** A local Kyiv time (EEST until 25 October, then EET). */
  const kyiv = (local: string) =>
    new Date(`${local}${local < "2026-10-25T04" ? "+03:00" : "+02:00"}`);

  let seeded = 0;
  /** A qualifying Workout Session started at a local Kyiv time. */
  const workoutAt = (
    local: string,
    sets: [number, number | null][] = [[8, 40]]
  ) => {
    seeded += 1;
    seedEntry({
      id: `session-goal-${seeded}`,
      minutes: 45,
      sets,
      start: kyiv(local),
      workout: "Full Body",
    });
  };

  const goalChange = (local: string, target: number | null) => {
    backend.weeklyGoalChanges.push({
      recorded_at: kyiv(local).toISOString(),
      target,
    });
  };

  const week = (label: string) => screen.getByLabelText(label);

  beforeEach(() => {
    process.env.TZ = "Europe/Kyiv";
    // Only the clock: settle() needs real timers.
    jest.useFakeTimers({
      doNotFake: [
        "hrtime",
        "nextTick",
        "performance",
        "queueMicrotask",
        "requestAnimationFrame",
        "cancelAnimationFrame",
        "requestIdleCallback",
        "cancelIdleCallback",
        "setImmediate",
        "clearImmediate",
        "setInterval",
        "clearInterval",
        "setTimeout",
        "clearTimeout",
      ],
      now: NOW,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    if (originalTimeZone === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = originalTimeZone;
    }
  });

  it("charts eight weeks against each week's own goal", async () => {
    goalChange("2026-08-03T10:00", 3);
    // Wednesday of the week of 12 October: 4 a week from 19 October on
    goalChange("2026-10-14T10:00", 4);
    // 12 October: 1 of 3, missed
    workoutAt("2026-10-13T19:00");
    // 19 October: 5 of 4, one of them on the 25th's extra hour; an empty
    // completion earns nothing
    workoutAt("2026-10-19T07:00");
    workoutAt("2026-10-20T19:00");
    workoutAt("2026-10-22T19:00");
    workoutAt("2026-10-24T10:00");
    workoutAt("2026-10-25T23:30");
    workoutAt("2026-10-21T19:00", [[0, 40]]);
    // This week: 1 of 4 so far
    workoutAt("2026-10-27T19:00");
    await mount();

    expect(screen.getByText("Weekly goal · 4 workouts")).toBeTruthy();
    // 7 September to 19 October, all tracked; only 19 October hit
    expect(screen.getByText("1 of 7 weeks hit")).toBeTruthy();
    expect(
      week("Week of October 12: 1 of 3 workouts, goal missed")
    ).toBeTruthy();
    expect(
      week("Week of October 19: 4 of 4 workouts, 1 over the goal, goal met")
    ).toBeTruthy();
    expect(week("This week: 1 of 4 workouts, in progress")).toBeTruthy();
    expect(screen.getByText("+1")).toBeTruthy();
    expect(screen.getByText("Now")).toBeTruthy();
    expect(screen.getByText("Oct 19")).toBeTruthy();
    expect(screen.getByText("Sep 7")).toBeTruthy();
  });

  it("judges no week before tracking and spares the first partial week", async () => {
    workoutAt("2026-09-08T19:00");
    workoutAt("2026-09-09T19:00");
    // Tracking starts on Wednesday 14 October
    goalChange("2026-10-14T10:00", 3);
    workoutAt("2026-10-20T19:00");
    workoutAt("2026-10-21T19:00");
    workoutAt("2026-10-22T19:00");
    await mount();

    expect(
      week("Week of September 7: 2 workouts, no goal recorded")
    ).toBeTruthy();
    expect(
      week("Week of October 12: 0 of 3 workouts, first tracked week")
    ).toBeTruthy();
    expect(week("Week of October 19: 3 of 3 workouts, goal met")).toBeTruthy();
    // Only 19 October counts toward the weeks hit
    expect(screen.getByText("1 of 1 week hit")).toBeTruthy();
  });

  it("hides the weeks hit until a full week was tracked", async () => {
    goalChange("2026-10-26T08:00", 2);
    workoutAt("2026-10-27T19:00");
    await mount();

    expect(screen.getByText("Weekly goal · 2 workouts")).toBeTruthy();
    expect(week("This week: 1 of 2 workouts, in progress")).toBeTruthy();
    expect(screen.queryByText(WEEKS_HIT)).toBeNull();
  });

  it("hides the Weekly goal without an active Plan, keeping the month and list", async () => {
    goalChange("2026-08-03T10:00", 3);
    goalChange("2026-10-20T10:00", null);
    workoutAt("2026-10-27T19:00");
    await mount();

    expect(screen.getByText("This month")).toBeTruthy();
    expect(screen.getByText("Full Body")).toBeTruthy();
    expect(screen.queryByText(WEEKLY_GOAL)).toBeNull();
  });

  it("hides the Weekly goal before tracking ever started", async () => {
    workoutAt("2026-10-27T19:00");
    await mount();

    expect(screen.getByText("Full Body")).toBeTruthy();
    expect(screen.queryByText(WEEKLY_GOAL)).toBeNull();
  });

  it("keeps History when the Weekly goal can't be read, and shows it on refresh", async () => {
    goalChange("2026-08-03T10:00", 3);
    workoutAt("2026-10-27T19:00");
    fakePublicApi.failNext("GET /v1/weekly-goals", { status: 500 });
    await mount();

    expect(screen.getByText("Full Body")).toBeTruthy();
    expect(screen.queryByText(WEEKLY_GOAL)).toBeNull();

    await queryClient.refetchQueries();
    await settle(queryClient);

    expect(screen.getByText("Weekly goal · 3 workouts")).toBeTruthy();
  });

  it("reads the Weekly goal in Ukrainian", async () => {
    setDeviceLanguages(["uk-UA"]);
    goalChange("2026-08-03T10:00", 4);
    workoutAt("2026-10-19T19:00");
    workoutAt("2026-10-27T19:00");
    await mount();

    expect(screen.getByText("Ціль на тиждень · 4 тренування")).toBeTruthy();
    // Seven weeks: the `many` form, after "з"
    expect(screen.getByText("Виконано 0 з 7 тижнів")).toBeTruthy();
    expect(
      week("Тиждень з 19 жовтня: 1 з 4 тренувань, ціль не досягнуто")
    ).toBeTruthy();
    expect(week("Цей тиждень: 1 з 4 тренувань, триває")).toBeTruthy();
    expect(screen.getByText("Зараз")).toBeTruthy();
    expect(screen.getByText("19 жовт.")).toBeTruthy();
  });
});
