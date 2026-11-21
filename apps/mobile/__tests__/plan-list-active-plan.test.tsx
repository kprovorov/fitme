/**
 * The Plan list read by VoiceOver: the active Plan's card says it's active,
 * which its lime name alone only shows (FIT-771). The real Plans screen over
 * the fake Public API (`test-utils/`), in English and Ukrainian.
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react-native";
import type { ReactNode } from "react";

import PlansScreen from "~/app/plans/index";
import { setDeviceLanguages } from "~/test-utils/device-locales";
import { backend, FAKE_USER_ID } from "~/test-utils/fake-public-api";
import { InAppLanguage } from "~/test-utils/in-app-language";
import { createTestQueryClient, settle } from "~/test-utils/query-client";
import { spokenLabel } from "~/test-utils/spoken-label";

jest.mock("expo-router", () => ({
  Link: ({ children }: { children: ReactNode }) => children,
  Stack: { Screen: () => null },
  useRouter: () => ({ push: jest.fn() }),
}));

// The real Clerk SDK opens a MessagePort at import that keeps Jest alive.
jest.mock("~/lib/clerk", () => ({
  getCurrentUserId: () =>
    jest.requireActual<typeof import("~/test-utils/fake-public-api")>(
      "~/test-utils/fake-public-api"
    ).FAKE_USER_ID,
}));

jest.mock("~/lib/segment", () => ({
  segmentClient: { track: jest.fn() },
}));

jest.mock("~/components/symbol-image", () => ({ SymbolImage: () => null }));

jest.mock("~/components/ui/button", () =>
  jest.requireActual("~/test-utils/button-stub")
);

const mount = async () => {
  const queryClient = createTestQueryClient();
  await render(
    <QueryClientProvider client={queryClient}>
      <InAppLanguage>
        <PlansScreen />
      </InAppLanguage>
    </QueryClientProvider>
  );
  await settle(queryClient);
};

/** What VoiceOver reads for the card whose name is `name`. */
const cardLabel = (name: string) => {
  // The card's press target, the first accessible element around its name.
  let card = screen.getByText(name);

  while (card.props.accessible !== true && card.parent) {
    card = card.parent;
  }

  return spokenLabel(card);
};

beforeEach(() => {
  backend.reset();
  backend.seedProfile(FAKE_USER_ID);
  backend.seedPlan({
    description: null,
    experience_level: null,
    goal: null,
    id: "plan-1",
    name: "Strength",
    place: null,
    workouts: [],
  });
  backend.seedPlan({
    description: null,
    experience_level: null,
    goal: null,
    id: "plan-2",
    is_active: true,
    name: "Hypertrophy",
    place: null,
    workouts: [],
  });
});

describe("the Plan list read by VoiceOver", () => {
  it("says which Plan is active, in English", async () => {
    await mount();

    expect(cardLabel("Hypertrophy")).toBe(
      "Hypertrophy, Active plan, 3× per week"
    );
    expect(cardLabel("Strength")).toBe("Strength, 3× per week");
  });

  it("says which Plan is active, in Ukrainian", async () => {
    setDeviceLanguages(["uk-UA"]);
    await mount();

    expect(cardLabel("Hypertrophy")).toBe(
      "Hypertrophy, Активний план, 3 рази на тиждень"
    );
    expect(cardLabel("Strength")).toBe("Strength, 3 рази на тиждень");
  });
});
