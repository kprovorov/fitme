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
  return { queryClient, result };
};

describe("useFinishWorkoutSession", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.assign(mockNavigationState, { index: 0, routes: [{}] });
    jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
  });

  it("finishes the session and opens its summary", async () => {
    mockFinishRpc.mockResolvedValue({});
    const { result } = await setup();

    await act(() => result.current.session.finish());

    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith(
        "/workout-sessions/session-1/summary"
      )
    );
    expect(mockFinishRpc).toHaveBeenCalledWith({ sessionId: "session-1" });
  });

  it("shows the finished session everywhere at once", async () => {
    const finished = { finished_at: "2026-10-08T10:00:00Z", id: "session-1" };
    mockFinishRpc.mockResolvedValue(finished);
    const { queryClient, result } = await setup();

    await act(() => result.current.session.finish());

    await waitFor(() => expect(mockReplace).toHaveBeenCalled());
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
    const { result } = await setup(1);

    await act(() => result.current.exercise.finish());

    await waitFor(() => expect(mockReplace).toHaveBeenCalled());
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
    const { result } = await setup(1);

    await act(() => result.current.exercise.finish());

    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith(
        "/workout-sessions/session-1/summary"
      )
    );
    expect(mockDismiss).not.toHaveBeenCalled();
  });

  it("never finishes twice while a finish is pending, from any screen", async () => {
    const pending = deferred();
    mockFinishRpc.mockReturnValue(pending.promise);
    const { result } = await setup();

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
    await waitFor(() => expect(result.current.session.isFinishing).toBe(false));
  });

  it("alerts on failure and allows another try", async () => {
    mockFinishRpc.mockRejectedValueOnce(new Error("offline"));
    const { result } = await setup();

    await act(() => result.current.session.finish());

    await waitFor(() => expect(Alert.alert).toHaveBeenCalledTimes(1));
    expect(result.current.session.isFinishing).toBe(false);
    expect(mockReplace).not.toHaveBeenCalled();

    mockFinishRpc.mockResolvedValueOnce({});
    await act(() => result.current.session.finish());

    await waitFor(() => expect(mockReplace).toHaveBeenCalledTimes(1));
    expect(mockFinishRpc).toHaveBeenCalledTimes(2);
  });
});
