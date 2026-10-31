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
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react-native";
import type { ReactNode } from "react";
import HistoryScreen from "~/app/(tabs)/history/index";
import { i18n } from "~/lib/i18n";
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
// `1 370 кг`, with Ukrainian's no-break space between thousands.
const UKRAINIAN_PUSH_DAY = /^1 год 5 хв · 5 підходів · 1\s370 кг$/;

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
});
