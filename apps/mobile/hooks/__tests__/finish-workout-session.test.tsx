import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import * as Sentry from "@sentry/react-native";
import { QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react-native";
import type * as React from "react";
import { Alert } from "react-native";
import { PlanUpdateSheetHost } from "~/components/workout-sessions/plan-update-sheet";
import { closePlanUpdatePrompt } from "~/hooks/plan-update-prompt";
import { libraryExercise, serveLibrary } from "~/test-utils/fake-library";
import { createTestQueryClient } from "~/test-utils/query-client";
import { useFinishWorkoutSession } from "../finish-workout-session";

const mockReplace = jest.fn();
const mockDismiss = jest.fn();
const mockNavigationState: {
  index: number;
  routes: Array<{ params?: object }>;
} = { index: 0, routes: [{}] };
const mockFinishRpc =
  jest.fn<(variables: { sessionId: string }) => Promise<unknown>>();
const mockFetchSession = jest.fn<() => Promise<unknown>>();
const mockPlanUpdate =
  jest.fn<
    (sessionId: string, options: { apply: boolean }) => Promise<unknown>
  >();
const mockTrack = jest.fn();

jest.mock("expo-router", () => ({
  useNavigation: () => ({ getState: () => mockNavigationState }),
  useRouter: () => ({ dismiss: mockDismiss, replace: mockReplace }),
}));

jest.mock("@sentry/react-native", () => ({ captureException: jest.fn() }));
jest.mock("~/lib/segment", () => ({
  segmentClient: { track: (...args: unknown[]) => mockTrack(...args) },
}));
jest.mock("~/components/ui/dialog", () =>
  jest.requireActual("~/test-utils/dialog-stub")
);
jest.mock("~/components/ui/button", () =>
  jest.requireActual("~/test-utils/button-stub")
);
jest.mock("~/components/symbol-image", () => ({ SymbolImage: () => null }));
// Keeps the real mutation key and react-query wiring, swapping only the
// network call.
jest.mock("~/hooks/queries/workout-sessions", () => {
  const { createMutation, createQuery } =
    jest.requireActual<typeof import("react-query-kit")>("react-query-kit");
  const FINISH_WORKOUT_SESSION_MUTATION_KEY = ["finish-workout-session"];
  return {
    FINISH_WORKOUT_SESSION_MUTATION_KEY,
    fetchPlanUpdate: (sessionId: string) =>
      mockPlanUpdate(sessionId, { apply: false }),
    OPEN_WORKOUT_SESSION_QUERY_KEY: ["open-workout-session"],
    useApplyPlanUpdateMutation: createMutation({
      mutationFn: ({ sessionId }: { sessionId: string }) =>
        mockPlanUpdate(sessionId, { apply: true }),
    }),
    useFinishWorkoutSessionMutation: createMutation({
      mutationFn: (variables: { sessionId: string }) =>
        mockFinishRpc(variables),
      mutationKey: FINISH_WORKOUT_SESSION_MUTATION_KEY,
    }),
    useWorkoutSessionQuery: createQuery({
      fetcher: () => mockFetchSession(),
      queryKey: ["workout-session"],
    }),
  };
});

const deferred = () => {
  let resolve!: (value: unknown) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<unknown>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, reject, resolve };
};

const setup = async (screensAboveSession = 0) => {
  const queryClient = createTestQueryClient();
  // The sheet's host sits in the root layout, next to every screen.
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      {children}
      <PlanUpdateSheetHost />
    </QueryClientProvider>
  );
  // Two screens of the same session, e.g. the session and an exercise.
  const { result } = await renderHook(
    () => ({
      exercise: useFinishWorkoutSession("session-1", { screensAboveSession }),
      session: useFinishWorkoutSession("session-1"),
    }),
    { wrapper }
  );
  // Waits until no finish is running, then lets react-query's last
  // notification (a 0 ms timer) re-render the hooks inside act.
  const settled = async () => {
    await waitFor(() => expect(queryClient.isMutating()).toBe(0));
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
    expect([
      result.current.session.isFinishing,
      result.current.exercise.isFinishing,
    ]).toEqual([false, false]);
  };
  return { queryClient, result, settled };
};

const NO_CHANGES = {
  changes: [],
  plan: null,
  weight_unit: "kg",
  workout: null,
};

const CHANGES = {
  changes: [
    {
      exercise_slug: "dumbbell-press",
      kind: "replace_exercise",
      replaced_exercise_slug: "bench-press",
      sets: [
        { reps: 8, weight: 30 },
        { reps: 8, weight: 30 },
        { reps: 6, weight: 30 },
      ],
    },
    {
      exercise_slug: "squat",
      kind: "add_sets",
      sets: [{ reps: 5, weight: 100 }],
    },
    { exercise_slug: "dips", kind: "remove_exercise" },
    {
      exercise_slug: "cable-fly",
      kind: "add_exercise",
      sets: [
        { reps: 12, weight: 15 },
        { reps: 12, weight: 17.5 },
      ],
    },
  ],
  plan: { id: "plan-1", name: "PPL 4-week" },
  weight_unit: "kg",
  workout: { id: "workout-1", name: "Push Day" },
};

/** The Library's names for the changes' slugs; dips it doesn't know. */
const LIBRARY = [
  libraryExercise("dumbbell-press", { name: "Dumbbell Press" }),
  libraryExercise("bench-press", { name: "Bench Press" }),
  libraryExercise("squat", { name: "Back Squat" }),
  libraryExercise("cable-fly", { name: "Cable Fly" }),
];

const SUMMARY = "/workout-sessions/session-1/summary";
const UPDATE = { name: "Update plan" } as const;
const RETRY = { name: "Retry" } as const;
const KEEP = { name: "Keep plan as is" } as const;

describe("useFinishWorkoutSession", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.assign(mockNavigationState, { index: 0, routes: [{}] });
    serveLibrary(LIBRARY);
    mockPlanUpdate.mockResolvedValue(NO_CHANGES);
    jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
  });

  // A question left open would show in the next test's sheet.
  afterEach(async () => {
    await act(() => closePlanUpdatePrompt("session-1"));
  });

  it("finishes the session and opens its summary", async () => {
    mockFinishRpc.mockResolvedValue({});
    const { result, settled } = await setup();

    await act(() => result.current.session.finish());

    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith(
        "/workout-sessions/session-1/summary"
      )
    );
    await settled();
    expect(mockFinishRpc).toHaveBeenCalledWith({ sessionId: "session-1" });
  });

  it("shows the finished session everywhere at once", async () => {
    const finished = { finished_at: "2026-10-08T10:00:00Z", id: "session-1" };
    mockFinishRpc.mockResolvedValue(finished);
    const { queryClient, result, settled } = await setup();

    await act(() => result.current.session.finish());

    await waitFor(() => expect(mockReplace).toHaveBeenCalled());
    await settled();
    expect(
      queryClient.getQueryData(["workout-session", { sessionId: "session-1" }])
    ).toEqual(finished);
  });

  it("closes the screens above the session screen before the summary", async () => {
    mockFinishRpc.mockResolvedValue({});
    Object.assign(mockNavigationState, {
      index: 2,
      routes: [{}, { params: { sessionId: "session-1" } }, {}],
    });
    const { result, settled } = await setup(1);

    await act(() => result.current.exercise.finish());

    await waitFor(() => expect(mockReplace).toHaveBeenCalled());
    await settled();
    expect(mockDismiss).toHaveBeenCalledWith(1);
    expect(mockDismiss.mock.invocationCallOrder[0]).toBeLessThan(
      mockReplace.mock.invocationCallOrder[0] ?? 0
    );
  });

  it("closes nothing when the session screen is not below", async () => {
    mockFinishRpc.mockResolvedValue({});
    Object.assign(mockNavigationState, {
      index: 1,
      routes: [{ params: {} }, {}],
    });
    const { result, settled } = await setup(1);

    await act(() => result.current.exercise.finish());

    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith(
        "/workout-sessions/session-1/summary"
      )
    );
    await settled();
    expect(mockDismiss).not.toHaveBeenCalled();
  });

  it("never finishes twice while a finish is pending, from any screen", async () => {
    const pending = deferred();
    mockFinishRpc.mockReturnValue(pending.promise);
    const { result, settled } = await setup();

    await act(() => {
      result.current.session.finish();
      result.current.session.finish();
    });
    await waitFor(() => expect(result.current.exercise.isFinishing).toBe(true));
    await act(() => result.current.exercise.finish());

    expect(mockFinishRpc).toHaveBeenCalledTimes(1);
    expect(result.current.session.isFinishing).toBe(true);

    await act(async () => {
      pending.resolve({});
      await pending.promise;
    });
    await settled();
  });

  it("alerts on failure and allows another try", async () => {
    mockFinishRpc.mockRejectedValueOnce(new Error("offline"));
    const { result, settled } = await setup();

    await act(() => result.current.session.finish());

    await waitFor(() => expect(Alert.alert).toHaveBeenCalledTimes(1));
    await settled();
    expect(result.current.session.isFinishing).toBe(false);
    expect(mockReplace).not.toHaveBeenCalled();

    mockFinishRpc.mockResolvedValueOnce({});
    await act(() => result.current.session.finish());

    await waitFor(() => expect(mockReplace).toHaveBeenCalledTimes(1));
    await settled();
    expect(mockFinishRpc).toHaveBeenCalledTimes(2);
  });

  describe("confirmFinish", () => {
    const partlyLogged = {
      exercises: [
        { sets: [{ reps_completed: 8 }, { reps_completed: null }] },
        { sets: [{ reps_completed: null }, { reps_completed: null }] },
      ],
      id: "session-1",
    };
    type AlertButtons = Parameters<typeof Alert.alert>[2];
    const pressAlertButton = async (text: string, call = 0) => {
      const buttons = jest.mocked(Alert.alert).mock.calls[call]?.[2] as
        | AlertButtons
        | undefined;
      const button = buttons?.find((candidate) => candidate.text === text);
      await act(() => button?.onPress?.());
    };
    const setupWith = async (session: unknown) => {
      const setupResult = await setup();
      setupResult.queryClient.setQueryData(
        ["workout-session", { sessionId: "session-1" }],
        session
      );
      return setupResult;
    };

    it("asks before finishing when planned sets are unlogged, and finishes once confirmed", async () => {
      mockFinishRpc.mockResolvedValue({});
      const { result, settled } = await setupWith(partlyLogged);

      await act(() => result.current.session.confirmFinish());

      await waitFor(() =>
        expect(Alert.alert).toHaveBeenCalledWith(
          "Finish workout?",
          "3 planned sets aren't logged.",
          expect.any(Array),
          expect.any(Object)
        )
      );
      expect(mockFinishRpc).not.toHaveBeenCalled();

      await pressAlertButton("Finish");

      await waitFor(() =>
        expect(mockReplace).toHaveBeenCalledWith(
          "/workout-sessions/session-1/summary"
        )
      );
      await settled();
      expect(mockFinishRpc).toHaveBeenCalledTimes(1);
    });

    it("keeps the session going when cancelled", async () => {
      const { result } = await setupWith(partlyLogged);

      await act(() => result.current.session.confirmFinish());
      await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
      await pressAlertButton("Cancel");

      expect(mockFinishRpc).not.toHaveBeenCalled();
      expect(mockReplace).not.toHaveBeenCalled();
    });

    it("says set, not sets, for a single unlogged set", async () => {
      const { result } = await setupWith({
        exercises: [{ sets: [{ reps_completed: null }] }],
        id: "session-1",
      });

      await act(() => result.current.session.confirmFinish());

      await waitFor(() =>
        expect(Alert.alert).toHaveBeenCalledWith(
          "Finish workout?",
          "1 planned set isn't logged.",
          expect.any(Array),
          expect.any(Object)
        )
      );
      await pressAlertButton("Cancel");
    });

    it("finishes without asking when every set is logged", async () => {
      mockFinishRpc.mockResolvedValue({});
      const { result, settled } = await setupWith({
        exercises: [{ sets: [{ reps_completed: 0 }] }],
        id: "session-1",
      });

      await act(() => result.current.session.confirmFinish());

      await waitFor(() => expect(mockReplace).toHaveBeenCalled());
      await settled();
      expect(Alert.alert).not.toHaveBeenCalled();
    });

    it("asks only once while the question is open", async () => {
      mockFinishRpc.mockResolvedValue({});
      const { result, settled } = await setupWith(partlyLogged);

      await act(() => {
        result.current.session.confirmFinish();
        result.current.exercise.confirmFinish();
      });
      await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
      await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
      expect(Alert.alert).toHaveBeenCalledTimes(1);

      await pressAlertButton("Finish");
      await waitFor(() => expect(mockReplace).toHaveBeenCalled());
      await settled();
      expect(mockFinishRpc).toHaveBeenCalledTimes(1);
    });

    it("doesn't finish when the session can't be read", async () => {
      mockFetchSession.mockRejectedValueOnce(new Error("offline"));
      const { result } = await setup();

      await act(() => result.current.session.confirmFinish());

      await waitFor(() =>
        expect(Alert.alert).toHaveBeenCalledWith(
          "Couldn't finish workout",
          "Check your connection and try again."
        )
      );
      expect(mockFinishRpc).not.toHaveBeenCalled();
    });

    it("finish skips the question, for the finish suggestion", async () => {
      mockFinishRpc.mockResolvedValue({});
      const { result, settled } = await setupWith(partlyLogged);

      await act(() => result.current.session.finish());

      await waitFor(() => expect(mockReplace).toHaveBeenCalled());
      await settled();
      expect(Alert.alert).not.toHaveBeenCalled();
    });
  });

  describe("Update your plan?", () => {
    const finishWithChanges = async (
      how: "confirmFinish" | "finish" = "finish"
    ) => {
      mockFinishRpc.mockResolvedValue({});
      mockPlanUpdate.mockResolvedValueOnce(CHANGES);
      const setupResult = await setup();
      setupResult.queryClient.setQueryData(
        ["workout-session", { sessionId: "session-1" }],
        { exercises: [{ sets: [{ reps_completed: 8 }] }], id: "session-1" }
      );
      await act(() => setupResult.result.current.session[how]());
      await screen.findByText("Update your plan?");
      return setupResult;
    };

    it("goes straight to the summary when nothing changed", async () => {
      mockFinishRpc.mockResolvedValue({});
      const { result, settled } = await setup();

      await act(() => result.current.session.finish());

      await waitFor(() => expect(mockReplace).toHaveBeenCalledWith(SUMMARY));
      await settled();
      expect(mockPlanUpdate).toHaveBeenCalledWith("session-1", {
        apply: false,
      });
      expect(screen.queryByText("Update your plan?")).toBeNull();
      expect(mockTrack).not.toHaveBeenCalled();
    });

    it("asks after the finish has committed, with one line per change, Exercises by their Library names", async () => {
      const { settled } = await finishWithChanges();
      await settled();

      expect(
        mockFinishRpc.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY
      ).toBeLessThan(mockPlanUpdate.mock.invocationCallOrder[0] ?? 0);
      expect(
        screen.getByText("Save today's changes to Push Day in PPL 4-week.")
      ).toBeTruthy();
      // The names resolve in one Library lookup.
      await screen.findByText("Add 1 set to Back Squat · 5×100 kg");
      for (const line of [
        "Replace Bench Press with Dumbbell Press · 8×30, 8×30, 6×30 kg",
        "Add 1 set to Back Squat · 5×100 kg",
        // Unknown to the Library: the slug's name.
        "Remove Dips",
        "Add Cable Fly · 12×15, 12×17.5 kg",
      ]) {
        expect(screen.getByText(line)).toBeTruthy();
      }
      expect(screen.getByRole("button", UPDATE)).toBeTruthy();
      expect(screen.getByRole("button", KEEP)).toBeTruthy();
      expect(mockReplace).not.toHaveBeenCalled();
      expect(screen.getByTestId("native-sheet")).toHaveProp(
        "dismissDisabled",
        true
      );
    });

    it("shows weights in the Plan Update's unit", async () => {
      mockFinishRpc.mockResolvedValue({});
      mockPlanUpdate.mockResolvedValueOnce({
        ...CHANGES,
        weight_unit: "lbs",
      });
      const { result } = await setup();

      await act(() => result.current.session.finish());

      expect(
        await screen.findByText("Add 1 set to Back Squat · 5×100 lbs")
      ).toBeTruthy();
    });

    it("reports how many changes of each kind it suggested", async () => {
      await finishWithChanges();

      expect(mockTrack).toHaveBeenCalledWith("Plan Update Suggested", {
        add_exercise: 1,
        add_sets: 1,
        plan_id: "plan-1",
        remove_exercise: 1,
        replace_exercise: 1,
        workout_id: "workout-1",
        workout_session_id: "session-1",
      });
    });

    it("labels the sheet, each line and both buttons for VoiceOver", async () => {
      await finishWithChanges();

      expect(
        screen.getByRole("heading", { name: "Update your plan?" })
      ).toBeTruthy();
      expect(
        await screen.findByLabelText(
          "Replace Bench Press with Dumbbell Press: 8 reps at 30 kilograms, 8 reps at 30 kilograms, 6 reps at 30 kilograms"
        )
      ).toBeTruthy();
      expect(
        await screen.findByLabelText(
          "Add 1 set to Back Squat: 5 reps at 100 kilograms"
        )
      ).toBeTruthy();
      expect(screen.getByLabelText("Remove Dips")).toBeTruthy();
      expect(screen.getByTestId("plan-update-accept")).toHaveProp(
        "accessibilityHint",
        "Saves these changes to your plan, then shows the workout summary"
      );
      expect(screen.getByTestId("plan-update-decline")).toHaveProp(
        "accessibilityHint",
        "Leaves your plan unchanged and shows the workout summary"
      );
    });

    it("applies the changes once, refetches the Plan and opens the summary on Update plan", async () => {
      const { queryClient } = await finishWithChanges();
      queryClient.setQueryData(["plans"], []);
      queryClient.setQueryData(["plan", { planId: "plan-1" }], {});
      mockPlanUpdate.mockResolvedValueOnce(CHANGES);

      const update = screen.getByRole("button", UPDATE);
      await fireEvent.press(update);
      await fireEvent.press(update);

      await waitFor(() => expect(mockReplace).toHaveBeenCalledWith(SUMMARY));
      expect(mockPlanUpdate).toHaveBeenCalledTimes(2);
      expect(mockPlanUpdate).toHaveBeenLastCalledWith("session-1", {
        apply: true,
      });
      expect(queryClient.getQueryState(["plans"])?.isInvalidated).toBe(true);
      expect(
        queryClient.getQueryState(["plan", { planId: "plan-1" }])?.isInvalidated
      ).toBe(true);
      expect(mockTrack).toHaveBeenCalledWith("Plan Update Accepted", {
        plan_id: "plan-1",
        workout_id: "workout-1",
        workout_session_id: "session-1",
      });
      expect(screen.getByTestId("native-sheet")).toHaveProp(
        "isPresented",
        false
      );
    });

    it("opens the summary without applying on Keep plan as is", async () => {
      await finishWithChanges();

      await fireEvent.press(screen.getByRole("button", KEEP));

      expect(mockReplace).toHaveBeenCalledWith(SUMMARY);
      expect(mockPlanUpdate).toHaveBeenCalledTimes(1);
      expect(mockTrack).toHaveBeenCalledWith("Plan Update Declined", {
        plan_id: "plan-1",
        workout_id: "workout-1",
        workout_session_id: "session-1",
      });
      expect(screen.getByTestId("native-sheet")).toHaveProp(
        "isPresented",
        false
      );
    });

    it("shows an error with Retry when the apply fails, and Retry works", async () => {
      await finishWithChanges();
      mockPlanUpdate.mockRejectedValueOnce(new Error("offline"));

      await fireEvent.press(screen.getByRole("button", UPDATE));

      expect(
        await screen.findByText(
          "Couldn't update your plan. Check your connection and try again."
        )
      ).toBeTruthy();
      expect(Sentry.captureException).toHaveBeenCalled();
      expect(mockReplace).not.toHaveBeenCalled();
      expect(mockTrack).not.toHaveBeenCalledWith(
        "Plan Update Accepted",
        expect.anything()
      );

      mockPlanUpdate.mockResolvedValueOnce(NO_CHANGES);
      await fireEvent.press(screen.getByRole("button", RETRY));

      await waitFor(() => expect(mockReplace).toHaveBeenCalledWith(SUMMARY));
      expect(mockPlanUpdate).toHaveBeenCalledTimes(3);
    });

    it("still reaches the summary with Keep plan as is after a failed apply", async () => {
      await finishWithChanges();
      mockPlanUpdate.mockRejectedValueOnce(new Error("offline"));

      await fireEvent.press(screen.getByRole("button", UPDATE));
      await screen.findByRole("button", RETRY);
      await fireEvent.press(screen.getByRole("button", KEEP));

      expect(mockReplace).toHaveBeenCalledWith(SUMMARY);
    });

    it("opens the summary without asking when the changes can't be read", async () => {
      mockFinishRpc.mockResolvedValue({});
      const failure = new Error("offline");
      mockPlanUpdate.mockRejectedValueOnce(failure);
      const { result, settled } = await setup();

      await act(() => result.current.session.finish());

      await waitFor(() => expect(mockReplace).toHaveBeenCalledWith(SUMMARY));
      await settled();
      expect(Sentry.captureException).toHaveBeenCalledWith(failure);
      expect(screen.queryByText("Update your plan?")).toBeNull();
      expect(Alert.alert).not.toHaveBeenCalled();
    });

    it("asks after the unlogged-sets confirmation, from the header's Finish", async () => {
      mockFinishRpc.mockResolvedValue({});
      mockPlanUpdate.mockResolvedValueOnce(CHANGES);
      const { queryClient, result } = await setup();
      queryClient.setQueryData(
        ["workout-session", { sessionId: "session-1" }],
        { exercises: [{ sets: [{ reps_completed: null }] }], id: "session-1" }
      );

      await act(() => result.current.session.confirmFinish());
      await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
      expect(mockPlanUpdate).not.toHaveBeenCalled();
      expect(screen.queryByText("Update your plan?")).toBeNull();

      const buttons = jest.mocked(Alert.alert).mock.calls[0]?.[2];
      await act(() =>
        buttons?.find((button) => button.text === "Finish")?.onPress?.()
      );

      expect(await screen.findByText("Update your plan?")).toBeTruthy();
      await fireEvent.press(screen.getByRole("button", KEEP));
      expect(mockReplace).toHaveBeenCalledWith(SUMMARY);
    });

    it("asks when finishing from a screen above the session, then closes it", async () => {
      Object.assign(mockNavigationState, {
        index: 1,
        routes: [{ params: { sessionId: "session-1" } }, {}],
      });
      mockFinishRpc.mockResolvedValue({});
      mockPlanUpdate.mockResolvedValueOnce(CHANGES);
      const { result } = await setup(1);

      await act(() => result.current.exercise.finish());
      await screen.findByText("Update your plan?");
      expect(mockDismiss).not.toHaveBeenCalled();

      await fireEvent.press(screen.getByRole("button", KEEP));
      expect(mockDismiss).toHaveBeenCalledWith(1);
      expect(mockReplace).toHaveBeenCalledWith(SUMMARY);
    });
  });
});
