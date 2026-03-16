import React from "react";
import { render } from "@testing-library/react-native";
import PlanCard from "../plan-card";
import { mockPlan } from "~/lib/test-fixtures";
import { getGoalLabel, getPlaceLabel } from "~/lib/labels";

jest.mock("~/lib/icons/Zap", () => ({ Zap: () => null }));
jest.mock("~/lib/icons/Dumbbell", () => ({ Dumbbell: () => null }));
jest.mock("~/lib/icons/House", () => ({ House: () => null }));
jest.mock("~/lib/icons/BicepsFlexed", () => ({ BicepsFlexed: () => null }));
jest.mock("~/lib/icons/Flame", () => ({ Flame: () => null }));
jest.mock("~/lib/icons/HeartPulse", () => ({ HeartPulse: () => null }));

describe("PlanCard", () => {
  it("renders plan name", () => {
    const { getByText } = render(<PlanCard plan={mockPlan} />);
    expect(getByText(mockPlan.name)).toBeTruthy();
  });

  it("renders goal label", () => {
    const { getByText } = render(<PlanCard plan={mockPlan} />);
    expect(getByText(getGoalLabel(mockPlan.goal))).toBeTruthy();
  });

  it("renders place label", () => {
    const { getByText } = render(<PlanCard plan={mockPlan} />);
    expect(getByText(getPlaceLabel(mockPlan.place))).toBeTruthy();
  });

  it("renders plan description", () => {
    const { getByText } = render(<PlanCard plan={mockPlan} />);
    expect(getByText(mockPlan.description)).toBeTruthy();
  });

  it("matches snapshot", () => {
    const { toJSON } = render(<PlanCard plan={mockPlan} />);
    expect(toJSON()).toMatchSnapshot();
  });
});
