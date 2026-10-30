/**
 * The History tab and the Workout Summary on a Ukrainian device: the real
 * screens under the root layout's language sync, with the Workout Session
 * reads answering seeded sessions and the fake Library naming the Exercises.
 * The header is rendered as its title.
 */
import type { WorkoutSession, WorkoutSessionExercise } from "@fitme/core";
import { setDeviceConventions } from "@fitme/i18n";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react-native";
import type { ReactNode } from "react";
import HistoryScreen from "~/app/(tabs)/history/index";
import WorkoutSessionSummaryScreen from "~/app/workout-sessions/[workoutSessionId]/summary";
import { i18n } from "~/lib/i18n";
import {
  setDevice24HourClock,
  setDeviceLanguages,
} from "~/test-utils/device-locales";
import { libraryExercise, serveLibrary } from "~/test-utils/fake-library";
import { InAppLanguage } from "~/test-utils/in-app-language";
import { createTestQueryClient, settle } from "~/test-utils/query-client";

const mockSessions: { current: WorkoutSession[]; isError: boolean } = {
  current: [],
  isError: false,
};

jest.mock("expo-router", () => ({
  Link: ({ children }: { children: ReactNode }) => children,
  Stack: {
    Screen: ({ options }: { options: { title?: string } }) => {
      const { Text } =
        jest.requireActual<typeof import("react-native")>("react-native");
      return options.title ? <Text>{options.title}</Text> : null;
    },
  },
  useLocalSearchParams: () => ({ workoutSessionId: "session-1" }),
  useRouter: () => ({
    navigate: jest.fn(),
    push: jest.fn(),
    replace: jest.fn(),
  }),
}));

// LegendList lays its items out on measure, which Jest never does: render
// every item (or the empty component) in a plain view instead.
jest.mock("@legendapp/list/react-native", () => ({
  LegendList: <T,>({
    data,
    keyExtractor,
    ListEmptyComponent,
    renderItem,
  }: {
    data: T[];
    keyExtractor: (item: T) => string;
    ListEmptyComponent: ReactNode;
    renderItem: (info: { item: T }) => ReactNode;
  }) => {
    const { Fragment } = jest.requireActual<typeof import("react")>("react");
    return data.length === 0
      ? ListEmptyComponent
      : data.map((item) => (
          <Fragment key={keyExtractor(item)}>{renderItem({ item })}</Fragment>
        ));
  },
}));

jest.mock("~/hooks/queries/workout-sessions", () => ({
  useWorkoutSessionHistoryQuery: () => ({
    data: mockSessions.isError ? undefined : mockSessions.current,
    isError: mockSessions.isError,
    refetch: jest.fn(),
  }),
  useWorkoutSessionQuery: () => ({ data: mockSessions.current[0] }),
}));

jest.mock("~/hooks/queries/profiles", () => ({
  useProfileQuery: () => ({ data: { measurement_system: "metric" } }),
}));

jest.mock("~/hooks/queries/exercises", () => ({
  useExerciseHistoryQuery: () => ({ data: [] }),
}));

jest.mock("react-native-purchases", () => ({
  __esModule: true,
  default: { invalidateCustomerInfoCache: jest.fn() },
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
}));

jest.mock("~/components/exercises/exercise-image", () => () => null);
// The body diagram reads theme colors uniwind has no stylesheet for in Jest.
jest.mock("~/components/views/workout-session-summary-body", () => ({
  WorkoutSessionSummaryBodyBack: () => null,
  WorkoutSessionSummaryBodyFront: () => null,
}));
jest.mock("~/components/symbol-image", () => ({ SymbolImage: () => null }));
jest.mock("~/components/ui/button", () =>
  jest.requireActual("~/test-utils/button-stub")
);

// Wednesday 21 October 2026, 18:05 local time.
const startedAt = new Date(2026, 9, 21, 18, 5);

/** An Exercise with one logged set per `[reps, weight]`. */
const exercise = (
  slug: string,
  order: number,
  sets: [number, number][]
): WorkoutSessionExercise => ({
  created_at: startedAt.toISOString(),
  exercise_slug: slug,
  id: `wse-${slug}`,
  order,
  sets: sets.map(([reps, weight], index) => ({
    created_at: startedAt.toISOString(),
    id: `set-${slug}-${index}`,
    logged_at: startedAt.toISOString(),
    order: index + 1,
    reps_completed: reps,
    reps_recommended: reps,
    rest_recommended: 60,
    updated_at: startedAt.toISOString(),
    weight_completed: weight,
    weight_recommended: weight,
    workout_session_exercise_id: `wse-${slug}`,
  })),
  updated_at: startedAt.toISOString(),
  workout_session_id: "session-1",
});

const session = (
  id: string,
  start: Date,
  minutes: number,
  exercises: WorkoutSessionExercise[]
): WorkoutSession => {
  const finishedAt = new Date(start.getTime() + minutes * 60_000);
  return {
    created_at: start.toISOString(),
    exercises,
    finished_at: finishedAt.toISOString(),
    id,
    plan_id: null,
    started_at: start.toISOString(),
    updated_at: finishedAt.toISOString(),
    user_id: "user_1",
    workout: null,
    workout_id: null,
  };
};

// 3 Exercises, 5 sets and 1,370 kg, for 1 h 5 min.
const longSession = session("session-1", startedAt, 65, [
  exercise("bench-press", 1, [
    [10, 50],
    [10, 50],
  ]),
  exercise("push-up", 2, [
    [8, 20],
    [8, 20],
  ]),
  exercise("dip", 3, [[5, 10]]),
]);

// The same month, two days earlier: 1 Exercise and 1 set, for 42 min.
const shortSession = session("session-2", new Date(2026, 9, 19, 9, 0), 42, [
  exercise("squat", 1, [[5, 100]]),
]);

// `1 370 кг` (spoken `1 370 кілограмів`), with Ukrainian's no-break space between thousands.
const LONG_SESSION_TOTALS = /^3 вправи · 5 підходів · 1\s370 кг$/;
const LONG_SESSION_VOLUME = /^Обсяг: 1\s370 кілограмів$/;

let queryClient = createTestQueryClient();

const mount = async (children: ReactNode) => {
  queryClient = createTestQueryClient();
  await render(
    <QueryClientProvider client={queryClient}>
      <InAppLanguage>{children}</InAppLanguage>
    </QueryClientProvider>
  );
  await settle(queryClient);
};

beforeEach(() => {
  mockSessions.current = [longSession, shortSession];
  mockSessions.isError = false;
  serveLibrary([
    libraryExercise("bench-press", {
      translations: { uk: { name: "Жим лежачи" } },
    }),
  ]);
  setDeviceLanguages(["uk-UA"]);
  setDevice24HourClock(true);
});

// The language sync leaves the App language and region where a test put them.
afterEach(async () => {
  await i18n.changeLanguage("en");
  setDeviceConventions(i18n, { region: "US", uses24hourClock: false });
});

describe("The History tab in Ukrainian", () => {
  it("shows each row's date, counts and volume, and each month's count", async () => {
    await mount(<HistoryScreen />);

    expect(screen.getByText("Історія")).toBeTruthy();
    // Two sessions in October: the `few` form.
    expect(screen.getByText("2 тренування")).toBeTruthy();
    expect(screen.getByText("ср, 21 жовт. · 18:05")).toBeTruthy();
    // 3 Exercises (`few`), 5 sets (`many`), the volume in кг.
    expect(screen.getByText(LONG_SESSION_TOTALS)).toBeTruthy();
    // 1 Exercise and 1 set (`one`).
    expect(screen.getByText("1 вправа · 1 підхід · 500 кг")).toBeTruthy();
    expect(screen.getAllByText("Тренування")).toHaveLength(2);
    expect(screen.getByLabelText("Тривалість 1 год 5 хв")).toBeTruthy();
  });

  it("shows the empty state", async () => {
    mockSessions.current = [];
    await mount(<HistoryScreen />);

    expect(screen.getByText("Ще немає тренувань")).toBeTruthy();
    expect(screen.getByText("Почати тренування")).toBeTruthy();
  });

  it("shows the load error", async () => {
    mockSessions.isError = true;
    await mount(<HistoryScreen />);

    expect(
      screen.getByText(
        "Не вдалося завантажити тренування. Перевірте з’єднання і спробуйте ще раз."
      )
    ).toBeTruthy();
    expect(screen.getByText("Спробувати ще раз")).toBeTruthy();
  });
});

describe("The Workout Summary in Ukrainian", () => {
  it("shows its stats with their units and plural forms", async () => {
    await mount(<WorkoutSessionSummaryScreen />);

    expect(screen.getByText("ср, 21 жовт. 2026 р.")).toBeTruthy();
    expect(screen.getByText("Тренування завершено!")).toBeTruthy();
    expect(screen.getByLabelText("Тривалість: 1 год 5 хв")).toBeTruthy();
    expect(screen.getByLabelText(LONG_SESSION_VOLUME)).toBeTruthy();
    expect(screen.getByLabelText("Вправи: 3 вправи")).toBeTruthy();
    expect(screen.getByLabelText("Підходи: 5 підходів")).toBeTruthy();
    // The Exercise rows name their Exercises in the App language.
    expect(screen.getByText("Жим лежачи")).toBeTruthy();
    expect(screen.getByLabelText("Жим лежачи, 2 підходи")).toBeTruthy();
    expect(screen.getByText("Продовжити")).toBeTruthy();
  });
});
