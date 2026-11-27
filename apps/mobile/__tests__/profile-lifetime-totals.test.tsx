/**
 * The Lifetime totals and the New user state on Profile, on
 * the mounted-screen seam: the real screen and its reads (the totals, the
 * open Workout Session and the active Plan, through the fake Public API over
 * its in-memory rows), Start through it, in English and Ukrainian.
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { Alert } from "react-native";

import ProfileScreen from "~/app/profile";
import { setDeviceLanguages } from "~/test-utils/device-locales";
import { fakeClerk } from "~/test-utils/fake-clerk";
import {
  backend,
  FAKE_USER_ID,
  fakePublicApi,
} from "~/test-utils/fake-public-api";
import type { SeedPlan } from "~/test-utils/fake-public-api";
import { InAppLanguage } from "~/test-utils/in-app-language";
import { createTestQueryClient, settle } from "~/test-utils/query-client";

const mockPush = jest.fn();

jest.mock("expo-router", () => ({
  Link: ({ children }: { children: ReactNode }) => children,
  router: { push: jest.fn(), replace: jest.fn() },
  Stack: { Screen: () => null },
  useRouter: () => ({ push: mockPush, replace: jest.fn() }),
}));

jest.mock(
  "@clerk/expo",
  () =>
    jest.requireActual<typeof import("~/test-utils/fake-clerk")>(
      "~/test-utils/fake-clerk"
    ).clerkModule
);

jest.mock(
  "react-native-purchases",
  () =>
    jest.requireActual<typeof import("~/test-utils/fake-revenuecat")>(
      "~/test-utils/fake-revenuecat"
    ).purchasesModule
);

jest.mock("react-native-purchases-ui", () => ({
  __esModule: true,
  default: { presentPaywall: jest.fn() },
}));

jest.mock("~/components/ui/button", () =>
  jest.requireActual("~/test-utils/button-stub")
);

const TOTALS = "GET /v1/workout-sessions/totals";
const START = "POST /v1/workout-sessions";
const ACTIVE_PLAN = "GET /v1/plans/active";

const PLAN: SeedPlan = {
  id: "plan-1",
  is_active: true,
  name: "Hypertrophy Builder",
  workouts: [
    {
      exercises: [{ sets: 3, slug: "barbell-bench-press" }],
      id: "workout-1",
      name: "Upper A",
    },
    {
      exercises: [{ sets: 3, slug: "barbell-back-squat" }],
      id: "workout-2",
      name: "Lower A",
    },
  ],
};

/** An open Workout Session of `workoutId` (Upper A unless it says). */
const seedOpenSession = (workoutId = "workout-1", name = "Upper A") => {
  backend.sessions.push({
    finished_at: null,
    id: "open-session",
    plan_id: "plan-1",
    started_at: "2026-10-29T09:00:00.000Z",
    workout_id: workoutId,
    workoutName: name,
  });
};

/** Gives every set of the Workout Session `sessionId` this weight. */
const weigh = (sessionId: string, weight: number) => {
  for (const set of backend.sets) {
    if (set.workout_session_exercise_id.startsWith(`${sessionId}-`)) {
      set.weight_completed = weight;
    }
  }
};

/**
 * Two qualifying Workout Sessions (1 h and 1.5 h, 2100 in volume), and two
 * that don't count: one still open, one finished with no rep logged. Every
 * session the fake seeds finishes at 11:00.
 */
const seedTrainedUser = () => {
  backend.seed({
    exercises: [{ name: "Bench Press", sets: [10, 8] }],
    finished: true,
    id: "a",
    startedAt: "2026-10-08T10:00:00.000Z",
  });
  weigh("a", 100);
  backend.seed({
    exercises: [{ name: "Squat", sets: [5] }],
    finished: true,
    id: "b",
    startedAt: "2026-10-08T09:30:00.000Z",
  });
  weigh("b", 60);
  backend.seed({
    exercises: [{ name: "Squat", sets: [20] }],
    id: "open",
    startedAt: "2026-10-08T08:00:00.000Z",
  });
  weigh("open", 500);
  backend.seed({
    exercises: [{ name: "Squat", sets: [0, null] }],
    finished: true,
    id: "zero",
    startedAt: "2026-10-08T05:00:00.000Z",
  });
  weigh("zero", 500);
};

let queryClient = createTestQueryClient();

const mount = async () => {
  queryClient = createTestQueryClient();
  await render(
    <QueryClientProvider client={queryClient}>
      <InAppLanguage>
        <ProfileScreen />
      </InAppLanguage>
    </QueryClientProvider>
  );
  await settle(queryClient);
};

const COPY = {
  en: {
    createPlan: "Create a Plan",
    editProfile: "Edit Profile",
    lbs: { spoken: "Volume: 2.1 thousand pounds", value: "2.1K lbs" },
    resume: "Resume Workout",
    start: "Start a Workout",
    trained: {
      labels: ["Workouts: 2 workouts", "Time: 2 hours", "Volume: 2.1 tonnes"],
      values: ["2", "2h", "2.1 t"],
    },
    unavailable: [
      "Workouts: Not available",
      "Time: Not available",
      "Volume: Not available",
    ],
    zeros: {
      labels: ["Workouts: 0 workouts", "Time: 0 hours", "Volume: 0 kilograms"],
      values: ["0", "0h", "0 kg"],
    },
  },
  uk: {
    createPlan: "Створити план",
    editProfile: "Редагувати профіль",
    lbs: { spoken: "Обсяг: 2,1 тисячі фунтів", value: "2,1 тис. фунт" },
    resume: "Продовжити тренування",
    start: "Почати тренування",
    trained: {
      labels: ["Тренування: 2 тренування", "Час: 2 години", "Обсяг: 2,1 тонни"],
      values: ["2", "2 год", "2,1 т"],
    },
    unavailable: [
      "Тренування: Недоступно",
      "Час: Недоступно",
      "Обсяг: Недоступно",
    ],
    zeros: {
      labels: [
        "Тренування: 0 тренувань",
        "Час: 0 годин",
        "Обсяг: 0 кілограмів",
      ],
      values: ["0", "0 год", "0 кг"],
    },
  },
} as const;

/** Every button the New user state could offer, in either language. */
const NEW_USER_ACTION =
  /^(Start a Workout|Resume Workout|Create a Plan|Почати тренування|Продовжити тренування|Створити план)$/u;

const button = (name: string) => screen.getByRole("button", { name });

const expectFigures = (figures: {
  labels: readonly string[];
  values: readonly string[];
}) => {
  for (const label of figures.labels) {
    expect(screen.getByLabelText(label)).toBeTruthy();
  }

  for (const value of figures.values) {
    expect(screen.getByText(value)).toBeTruthy();
  }
};

describe.each([
  ["en", ["en-US"]],
  ["uk", ["uk-UA"]],
] as const)("Lifetime totals in %s", (language, deviceLanguages) => {
  const copy = COPY[language];

  beforeEach(() => {
    setDeviceLanguages([...deviceLanguages]);
    jest.clearAllMocks();
    jest.spyOn(Alert, "alert").mockReturnValue(undefined);
    backend.reset();
    backend.seedProfile(FAKE_USER_ID);
    fakeClerk.setUser({
      createdAt: new Date("2025-03-14T12:00:00.000Z"),
      emailAddresses: ["kirill@example.com"],
      firstName: "Kirill",
      lastName: null,
    });
  });

  it("adds up the qualifying Workout Sessions, leaving out open and zero-rep ones", async () => {
    seedTrainedUser();
    await mount();

    expectFigures(copy.trained);
    expect(fakePublicApi.count(TOTALS)).toBe(1);
    expect(screen.queryByRole("button", { name: NEW_USER_ACTION })).toBeNull();
  });

  it("shows the volume in lbs for a US Profile", async () => {
    backend.reset();
    backend.seedProfile(FAKE_USER_ID, { measurement_system: "us" });
    seedTrainedUser();
    await mount();

    expect(screen.getByText(copy.lbs.value)).toBeTruthy();
    expect(screen.getByLabelText(copy.lbs.spoken)).toBeTruthy();
  });

  it.each([
    ["fails", { status: 500 }],
    ["is rate limited", { retryAfterSeconds: 12, status: 429 }],
  ] as const)(
    "shows — for each value, with no banner, when the read %s",
    async (_, failure) => {
      seedTrainedUser();
      fakePublicApi.failNext(TOTALS, failure);
      await mount();

      expect(screen.getAllByText("—")).toHaveLength(3);

      for (const label of copy.unavailable) {
        expect(screen.getByLabelText(label)).toBeTruthy();
      }

      // Not retried, and the rest of Profile works.
      expect(fakePublicApi.count(TOTALS)).toBe(1);
      expect(screen.getByLabelText(copy.editProfile)).toBeTruthy();
      expect(screen.queryByText(/12/u)).toBeNull();
      expect(
        screen.queryByRole("button", { name: NEW_USER_ACTION })
      ).toBeNull();
    }
  );

  it("recovers a failed read when Profile is pulled to refresh", async () => {
    seedTrainedUser();
    fakePublicApi.failNext(TOTALS, { retryAfterSeconds: 12, status: 429 });
    await mount();
    expect(screen.getAllByText("—")).toHaveLength(3);

    const { refreshControl } = screen.getByTestId("profile-scroll").props;
    await act(() => refreshControl.props.onRefresh());
    await settle(queryClient);

    expectFigures(copy.trained);
    expect(fakePublicApi.count(TOTALS)).toBe(2);
  });

  it("shows — while the totals load", async () => {
    seedTrainedUser();
    const resume = fakePublicApi.pause(TOTALS);
    queryClient = createTestQueryClient();
    await render(
      <QueryClientProvider client={queryClient}>
        <InAppLanguage>
          <ProfileScreen />
        </InAppLanguage>
      </QueryClientProvider>
    );
    await act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 10);
      });
    });

    expect(screen.getAllByText("—")).toHaveLength(3);

    resume();
    await settle(queryClient);
    expectFigures(copy.trained);
  });

  it("isn't fooled by an unfinished or zero-rep Workout Session: the User is still new", async () => {
    backend.seed({
      exercises: [{ name: "Squat", sets: [0] }],
      finished: true,
      id: "zero",
    });
    await mount();

    expectFigures(copy.zeros);
    expect(button(copy.createPlan)).toBeTruthy();
  });

  describe("the New user state", () => {
    it("starts the active Plan's next Workout", async () => {
      backend.seedPlan(structuredClone(PLAN));
      await mount();

      expectFigures(copy.zeros);
      await fireEvent.press(button(copy.start));
      await settle(queryClient);

      const started = backend.sessions.find(
        (session) => session.finished_at === null
      );

      expect(started?.workout_id).toBe("workout-1");
      expect(fakePublicApi.count(START)).toBe(1);
      expect(mockPush).toHaveBeenCalledWith(
        `/plans/plan-1/workouts/workout-1/sessions/${started?.id}`
      );
      expect(Alert.alert).not.toHaveBeenCalled();
    });

    it("resumes the open Workout Session first, starting nothing", async () => {
      backend.seedPlan(structuredClone(PLAN));
      seedOpenSession();
      await mount();

      expect(screen.queryByRole("button", { name: copy.start })).toBeNull();
      await fireEvent.press(button(copy.resume));

      expect(mockPush).toHaveBeenCalledWith(
        "/plans/plan-1/workouts/workout-1/sessions/open-session"
      );
      expect(fakePublicApi.count(START)).toBe(0);
    });

    it("offers Create a Plan without an active Plan", async () => {
      backend.seedPlan({ ...structuredClone(PLAN), is_active: false });
      await mount();

      await fireEvent.press(button(copy.createPlan));

      expect(mockPush).toHaveBeenCalledWith("/plans/create");
    });

    it("turns into Resume when a Workout was started elsewhere meanwhile", async () => {
      backend.seedPlan(structuredClone(PLAN));
      await mount();
      // Another Workout, started elsewhere (MCP, another device) after
      // Profile was read: Start answers 409.
      seedOpenSession("workout-2", "Lower A");

      await fireEvent.press(button(copy.start));
      await settle(queryClient);

      expect(Alert.alert).not.toHaveBeenCalled();
      expect(mockPush).not.toHaveBeenCalled();
      expect(button(copy.resume)).toBeTruthy();
    });

    it("offers no action while the active Plan's read has failed, and the zeros stay", async () => {
      backend.seedPlan(structuredClone(PLAN));
      fakePublicApi.failNext(ACTIVE_PLAN, { status: 500 });
      await mount();

      expectFigures(copy.zeros);
      expect(
        screen.queryByRole("button", { name: NEW_USER_ACTION })
      ).toBeNull();
    });
  });
});
