import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render } from "@testing-library/react-native";
import {
  useCreateWorkoutSessionMutation,
  useFinishWorkoutSessionMutation,
} from "~/hooks/queries/workout-sessions";
import { mockWorkout } from "~/lib/test-fixtures";
import WorkoutCard from "../workout-card";

jest.mock("~/hooks/queries/workout-sessions", () => ({
  useCreateWorkoutSessionMutation: jest.fn(),
  useFinishWorkoutSessionMutation: jest.fn(),
}));

jest.mock("expo-router", () => ({
  Link: ({ children }: any) => children,
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));

jest.mock("@tanstack/react-query", () => ({
  ...jest.requireActual("@tanstack/react-query"),
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

jest.mock("~/lib/icons/ArrowRight", () => ({ ArrowRight: () => null }));
jest.mock("~/lib/icons/Zap", () => ({ Zap: () => null }));
jest.mock("~/lib/icons/ChevronRight", () => ({ ChevronRight: () => null }));
jest.mock("~/lib/icons/Timer", () => ({ Timer: () => null }));
jest.mock("~/components/exercises/exercise-image", () => ({
  __esModule: true,
  default: () => null,
}));

const mockUseCreateWorkoutSessionMutation =
  useCreateWorkoutSessionMutation as jest.MockedFunction<
    typeof useCreateWorkoutSessionMutation
  >;
const mockUseFinishWorkoutSessionMutation =
  useFinishWorkoutSessionMutation as jest.MockedFunction<
    typeof useFinishWorkoutSessionMutation
  >;

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("WorkoutCard", () => {
  const mockMutateAsync = jest.fn();

  beforeEach(() => {
    mockUseCreateWorkoutSessionMutation.mockReturnValue({
      mutateAsync: mockMutateAsync,
      isPending: false,
    } as any);
    mockUseFinishWorkoutSessionMutation.mockReturnValue({
      mutateAsync: jest.fn(),
      isPending: false,
    } as any);
  });

  it("renders workout name", () => {
    const { getByText } = render(
      <WorkoutCard workout={mockWorkout} state="upcoming" />,
      { wrapper },
    );

    expect(getByText(mockWorkout.name)).toBeTruthy();
  });

  it("renders start button when no active session", () => {
    const { getByTestId } = render(
      <WorkoutCard workout={mockWorkout} state="upcoming" />,
      { wrapper },
    );

    expect(getByTestId("start-workout-button")).toBeTruthy();
  });

  it("calls createSession mutation on start press", () => {
    const { getByTestId } = render(
      <WorkoutCard workout={mockWorkout} state="upcoming" />,
      { wrapper },
    );

    fireEvent.press(getByTestId("start-workout-button"));

    expect(mockMutateAsync).toHaveBeenCalledWith({ workoutId: mockWorkout.id });
  });
});
