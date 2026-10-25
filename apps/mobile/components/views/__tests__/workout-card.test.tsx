import type { Workout } from "@fitme/core";
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
} from "@testing-library/react-native";
import { Alert } from "react-native";
import { PlanUpdateSheetHost } from "~/components/workout-sessions/plan-update-sheet";
import { closePlanUpdatePrompt } from "~/hooks/plan-update-prompt";
import { createTestQueryClient } from "~/test-utils/query-client";
import WorkoutCard from "../workout-card";

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockDismiss = jest.fn();
const mockFinishRpc =
  jest.fn<(variables: { sessionId: string }) => Promise<unknown>>();
const mockFetchSession = jest.fn<() => Promise<unknown>>();
const mockPlanUpdate =
  jest.fn<
    (sessionId: string, options: { apply: boolean }) => Promise<unknown>
  >();

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
jest.mock("~/components/ui/dialog", () =>
  jest.requireActual("~/test-utils/dialog-stub")
);
jest.mock("~/lib/segment", () => ({ segmentClient: { track: jest.fn() } }));

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
    fetchPlanUpdate: (sessionId: string) =>
      mockPlanUpdate(sessionId, { apply: false }),
    useApplyPlanUpdateMutation: createMutation({
      mutationFn: ({ sessionId }: { sessionId: string }) =>
        mockPlanUpdate(sessionId, { apply: true }),
    }),
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
  const queryClient = createTestQueryClient();
  mockFetchSession.mockResolvedValue(session);
  // The sheet's host sits in the root layout, next to Home.
  const screenWith = (card: boolean) => (
    <QueryClientProvider client={queryClient}>
      {card ? <WorkoutCard state="upcoming" workout={workout} /> : null}
      <PlanUpdateSheetHost />
    </QueryClientProvider>
  );
  const { rerender } = await render(screenWith(true));
  return Object.assign(queryClient, {
    /** The card leaves Home once its Plan refetches with the session finished. */
    removeCard: () => rerender(screenWith(false)),
  });
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
    mockPlanUpdate.mockResolvedValue({
      changes: [],
      plan: null,
      weight_unit: "kg",
      workout: null,
    });
    jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
  });

  afterEach(async () => {
    await act(() => closePlanUpdatePrompt("session-1"));
  });

  it("asks to update the Plan, even once the card is gone, then opens the summary", async () => {
    mockFinishRpc.mockResolvedValue({});
    mockPlanUpdate.mockResolvedValueOnce({
      changes: [{ exercise_slug: "dips", kind: "remove_exercise" }],
      plan: { id: "plan-1", name: "PPL" },
      weight_unit: "kg",
      workout: { id: "workout-1", name: "Push Day" },
    });
    const { removeCard } = await renderCard({
      exercises: [{ sets: [{ reps_completed: 8 }] }],
      id: "session-1",
    });

    await fireEvent.press(
      screen.getByRole("button", { name: "Finish Workout" })
    );

    expect(await screen.findByText("Remove Dips")).toBeTruthy();
    expect(mockPush).not.toHaveBeenCalled();

    await removeCard();
    mockPlanUpdate.mockResolvedValueOnce({
      changes: [],
      plan: null,
      weight_unit: "kg",
      workout: null,
    });
    await fireEvent.press(screen.getByRole("button", { name: "Update plan" }));

    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith(
        "/workout-sessions/session-1/summary"
      )
    );
    expect(mockPlanUpdate).toHaveBeenLastCalledWith("session-1", {
      apply: true,
    });
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
