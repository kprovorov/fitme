import type { Workout } from "@fitme/core";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import { Alert } from "react-native";
import WorkoutCard from "../workout-card";

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockDismiss = jest.fn();
const mockFinishRpc =
  jest.fn<(variables: { sessionId: string }) => Promise<unknown>>();
const mockFetchSession = jest.fn<() => Promise<unknown>>();

// The card sits on Home, a tab: no session screen anywhere in its stack.
jest.mock("expo-router", () => ({
  Link: ({ children }: { children: unknown }) => children,
  useNavigation: () => ({}),
  useRouter: () => ({
    dismiss: mockDismiss,
    push: mockPush,
    replace: mockReplace,
  }),
}));

jest.mock("@sentry/react-native", () => ({ captureException: jest.fn() }));
jest.mock("~/components/exercises/exercise-image", () => () => null);
jest.mock("~/components/symbol-image", () => ({ SymbolImage: () => null }));

jest.mock("~/components/ui/button", () => {
  const { Pressable, Text } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    Button: ({
      isLoading,
      label,
      onPress,
    }: {
      isLoading?: boolean;
      label?: string;
      onPress?: () => void;
    }) => (
      <Pressable
        accessibilityLabel={label}
        accessibilityRole="button"
        accessibilityState={{ busy: !!isLoading }}
        onPress={onPress}
      >
        <Text>{label}</Text>
      </Pressable>
    ),
  };
});

// Keeps the real mutation key and react-query wiring, swapping only the
// network calls.
jest.mock("~/hooks/queries/workout-sessions", () => {
  const { createMutation, createQuery } =
    jest.requireActual<typeof import("react-query-kit")>("react-query-kit");
  const FINISH_WORKOUT_SESSION_MUTATION_KEY = ["finish-workout-session"];
  return {
    FINISH_WORKOUT_SESSION_MUTATION_KEY,
    useCreateWorkoutSessionMutation: createMutation({
      mutationFn: () => Promise.reject(new Error("not expected")),
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

const workout = {
  exercises: [],
  id: "workout-1",
  name: "Push Day",
  plan_id: "plan-1",
  sessions: [
    {
      finished_at: null,
      id: "session-1",
      started_at: "2026-10-21T10:00:00Z",
    },
  ],
} as unknown as Workout;

const renderCard = async (session: unknown) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: { gcTime: Number.POSITIVE_INFINITY, retry: false },
    },
  });
  mockFetchSession.mockResolvedValue(session);
  await render(
    <QueryClientProvider client={queryClient}>
      <WorkoutCard state="upcoming" workout={workout} />
    </QueryClientProvider>
  );
  return queryClient;
};

type AlertButtons = Parameters<typeof Alert.alert>[2];
const pressAlertButton = async (text: string) => {
  const buttons = jest.mocked(Alert.alert).mock.calls[0]?.[2] as
    | AlertButtons
    | undefined;
  const button = buttons?.find((candidate) => candidate.text === text);
  await act(() => button?.onPress?.());
};

const partlyLogged = {
  exercises: [{ sets: [{ reps_completed: 8 }, { reps_completed: null }] }],
  id: "session-1",
};

describe("WorkoutCard's Finish Workout", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
  });

  it("finishes the active session and opens its summary over Home", async () => {
    const finished = { finished_at: "2026-10-21T11:00:00Z", id: "session-1" };
    mockFinishRpc.mockResolvedValue(finished);
    const queryClient = await renderCard({
      exercises: [{ sets: [{ reps_completed: 8 }] }],
      id: "session-1",
    });

    await fireEvent.press(
      screen.getByRole("button", { name: "Finish Workout" })
    );

    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith(
        "/workout-sessions/session-1/summary"
      )
    );
    expect(mockFinishRpc).toHaveBeenCalledWith({ sessionId: "session-1" });
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockDismiss).not.toHaveBeenCalled();
    expect(
      queryClient.getQueryData(["workout-session", { sessionId: "session-1" }])
    ).toEqual(finished);
  });

  it("asks first when planned sets are unlogged, then opens the summary", async () => {
    mockFinishRpc.mockResolvedValue({});
    await renderCard(partlyLogged);

    await fireEvent.press(
      screen.getByRole("button", { name: "Finish Workout" })
    );

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith(
        "Finish workout?",
        "1 planned set isn't logged.",
        expect.any(Array),
        expect.any(Object)
      )
    );
    expect(mockFinishRpc).not.toHaveBeenCalled();

    await pressAlertButton("Finish");

    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith(
        "/workout-sessions/session-1/summary"
      )
    );
    expect(mockFinishRpc).toHaveBeenCalledTimes(1);
  });

  it("keeps the session going when the question is cancelled", async () => {
    await renderCard(partlyLogged);

    await fireEvent.press(
      screen.getByRole("button", { name: "Finish Workout" })
    );
    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
    await pressAlertButton("Cancel");

    expect(mockFinishRpc).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });
});
