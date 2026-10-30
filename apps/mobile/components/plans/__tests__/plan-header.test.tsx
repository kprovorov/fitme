import type { Plan } from "@fitme/core";
import { describe, expect, it } from "@jest/globals";
import { render, screen } from "@testing-library/react-native";
import { setDeviceLanguages } from "~/test-utils/device-locales";
import { InAppLanguage } from "~/test-utils/in-app-language";
import PlanHeader from "../plan-header";

const plan = {
  description: "A 4-day upper/lower split focused on progressive overload.",
  experience_level: "intermediate",
  frequency: 4,
  goal: "muscle-gain",
  name: "Hypertrophy Builder",
  place: "gym",
} as Plan;

const renderHeader = () =>
  render(
    <InAppLanguage>
      <PlanHeader plan={plan} />
    </InAppLanguage>
  );

describe("PlanHeader", () => {
  it("shows the Plan's name, its frequency, goal and place badges, and its description", async () => {
    await renderHeader();

    expect(screen.getByText("Hypertrophy Builder")).toBeTruthy();
    expect(screen.getByText("4× per week")).toBeTruthy();
    expect(screen.getByText("Gain Muscle")).toBeTruthy();
    expect(screen.getByText("Gym")).toBeTruthy();
    expect(
      screen.getByText(
        "A 4-day upper/lower split focused on progressive overload."
      )
    ).toBeTruthy();
  });

  it("shows no experience level, and isn't a button", async () => {
    await renderHeader();

    expect(screen.queryByText("Intermediate")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("leaves out a blank description", async () => {
    await render(<PlanHeader plan={{ ...plan, description: "  " }} />);

    expect(screen.getByText("Hypertrophy Builder")).toBeTruthy();
    expect(screen.queryByText("  ", { normalizer: (text) => text })).toBeNull();
  });

  it("writes its badges in Ukrainian on a Ukrainian device", async () => {
    setDeviceLanguages(["uk-UA"]);
    await renderHeader();

    expect(screen.getByText("4 рази на тиждень")).toBeTruthy();
    expect(screen.getByText("Набір м’язової маси")).toBeTruthy();
    expect(screen.getByText("Спортзал")).toBeTruthy();
  });
});
