import React from "react";
import { render } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import HomeView from "../home-view";
import { useIsProQuery } from "~/hooks/revenueCat";
import { mockPlan } from "~/lib/test-fixtures";

jest.mock("~/hooks/revenueCat", () => ({
  useIsProQuery: jest.fn(),
}));

jest.mock("~/hooks/queries/plans", () => ({
  usePlansQuery: jest.fn(() => ({ data: [] })),
}));

jest.mock("~/hooks/queries/workout-sessions", () => ({
  useCreateWorkoutSessionMutation: jest.fn(() => ({
    mutateAsync: jest.fn(),
    isPending: false,
  })),
  useFinishWorkoutSessionMutation: jest.fn(() => ({
    mutateAsync: jest.fn(),
    isPending: false,
  })),
}));

jest.mock("react-native-purchases-ui", () => ({
  default: { presentPaywall: jest.fn() },
}));

jest.mock("expo-router", () => ({
  Link: ({ children }: any) => children,
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));

jest.mock("~/lib/icons/ArrowRight", () => ({ ArrowRight: () => null }));
jest.mock("~/lib/icons/Zap", () => ({ Zap: () => null }));
jest.mock("~/lib/icons/ChevronRight", () => ({ ChevronRight: () => null }));
jest.mock("~/lib/icons/Timer", () => ({ Timer: () => null }));
jest.mock("~/lib/icons/Dumbbell", () => ({ Dumbbell: () => null }));
jest.mock("~/lib/icons/House", () => ({ House: () => null }));
jest.mock("~/lib/icons/BicepsFlexed", () => ({ BicepsFlexed: () => null }));
jest.mock("~/lib/icons/Flame", () => ({ Flame: () => null }));
jest.mock("~/lib/icons/HeartPulse", () => ({ HeartPulse: () => null }));
jest.mock("~/components/exercises/exercise-image", () => ({
  __esModule: true,
  default: () => null,
}));

const mockUseIsProQuery = useIsProQuery as jest.MockedFunction<
  typeof useIsProQuery
>;

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("HomeView", () => {
  it("renders next workout card for pro user", () => {
    mockUseIsProQuery.mockReturnValue({
      data: true,
      refetch: jest.fn(),
    } as any);

    const { getByText } = render(<HomeView plan={mockPlan} />, { wrapper });

    expect(getByText("Workout 1")).toBeTruthy();
  });

  it("shows paywall CTA for free users when no next workout would show non-pro message", () => {
    mockUseIsProQuery.mockReturnValue({
      data: false,
      refetch: jest.fn(),
    } as any);

    const planWithNoWorkouts = { ...mockPlan, workouts: [] };
    const { getByText } = render(<HomeView plan={planWithNoWorkouts} />, {
      wrapper,
    });

    expect(getByText("Upgrade to Pro")).toBeTruthy();
  });

  it("renders multiple upcoming workouts", () => {
    mockUseIsProQuery.mockReturnValue({
      data: true,
      refetch: jest.fn(),
    } as any);

    const { getByText } = render(<HomeView plan={mockPlan} />, { wrapper });

    expect(getByText("Workout 2")).toBeTruthy();
    expect(getByText("Workout 3")).toBeTruthy();
  });
});
