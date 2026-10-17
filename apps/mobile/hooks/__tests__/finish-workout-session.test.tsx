import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import type * as React from "react";
import { Alert } from "react-native";
import { useFinishWorkoutSession } from "../finish-workout-session";

const mockReplace = jest.fn();
const mockDismiss = jest.fn();
const mockNavigationState: {
  index: number;
  routes: Array<{ params?: object }>;
} = { index: 0, routes: [{}] };
const mockFinishRpc =
  jest.fn<(variables: { sessionId: string }) => Promise<unknown>>();

jest.mock("expo-router", () => ({
  useNavigation: () => ({ getState: () => mockNavigationState }),
  useRouter: () => ({ dismiss: mockDismiss, replace: mockReplace }),
}));

jest.mock("@sentry/react-native", () => ({ captureException: jest.fn() }));

// Keeps the real mutation key and react-query wiring, swapping only the
// network call.
jest.mock("~/hooks/queries/workout-sessions", () => {
  const { createMutation, createQuery } =
    jest.requireActual<typeof import("react-query-kit")>("react-query-kit");
  const FINISH_WORKOUT_SESSION_MUTATION_KEY = ["finish-workout-session"];
  return {
    FINISH_WORKOUT_SESSION_MUTATION_KEY,
    useFinishWorkoutSessionMutation: createMutation({
      mutationFn: (variables: { sessionId: string }) =>
        mockFinishRpc(variables),
      mutationKey: FINISH_WORKOUT_SESSION_MUTATION_KEY,
    }),
    useWorkoutSessionQuery: createQuery({
      fetcher: () => Promise.resolve({}),
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
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: { gcTime: Number.POSITIVE_INFINITY, retry: false },
    },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
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

describe("useFinishWorkoutSession", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.assign(mockNavigationState, { index: 0, routes: [{}] });
    jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
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

    it("finish skips the question, for the finish suggestion", async () => {
      mockFinishRpc.mockResolvedValue({});
      const { result, settled } = await setupWith(partlyLogged);

      await act(() => result.current.session.finish());

      await waitFor(() => expect(mockReplace).toHaveBeenCalled());
      await settled();
      expect(Alert.alert).not.toHaveBeenCalled();
    });
  });
});
