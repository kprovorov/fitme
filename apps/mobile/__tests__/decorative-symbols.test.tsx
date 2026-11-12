/**
 * Decorative SF Symbols stay out of what VoiceOver reads (FIT-631): a row's
 * chevron, the rate-us heart and the free plan's figure. The real screens
 * render the real `SymbolImage`, and `spokenLabel` composes each row's label
 * the way React Native does on iOS, where a symbol image left in the
 * accessibility tree reads its symbol's name ("Edit Profile, Forward").
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react-native";
import type { ReactNode } from "react";

import LibraryScreen from "~/app/(tabs)/library/index";
import ProfileView from "~/components/views/profile-view";
import { storage } from "~/lib/mmkv";
import { libraryExercise, serveLibrary } from "~/test-utils/fake-library";
import { backend } from "~/test-utils/fake-public-api";
import { createTestQueryClient, settle } from "~/test-utils/query-client";
import { spokenLabel } from "~/test-utils/spoken-label";

jest.mock("expo-router", () => {
  const { Text: MockText } =
    jest.requireActual<typeof import("react-native")>("react-native");

  return {
    Link: ({ children }: { children: ReactNode }) => children,
    router: { push: jest.fn(), replace: jest.fn() },
    Stack: {
      Screen: ({ options }: { options?: { title?: string } }) =>
        options?.title ? <MockText>{options.title}</MockText> : null,
    },
    useRouter: () => ({ push: jest.fn() }),
  };
});

jest.mock("~/components/ui/button", () =>
  jest.requireActual("~/test-utils/button-stub")
);

// A thumbnail shows as nothing.
jest.mock("~/components/exercises/exercise-image", () => () => null);

const mockUser = {
  fullName: "Ada Lovelace",
  id: "user_test",
  primaryEmailAddress: { emailAddress: "ada@example.com" },
};

jest.mock("@clerk/expo", () => ({
  isClerkAPIResponseError: () => false,
  useUser: () => ({ isLoaded: true, user: mockUser }),
}));

jest.mock("~/lib/clerk", () => ({
  ...jest.requireActual<typeof import("~/lib/clerk")>("~/lib/clerk"),
  getClerk: () => ({ signOut: jest.fn(), user: mockUser }),
  getCurrentUserId: () =>
    jest.requireActual<typeof import("~/test-utils/fake-public-api")>(
      "~/test-utils/fake-public-api"
    ).FAKE_USER_ID,
}));

jest.mock("~/lib/segment", () => ({
  segmentClient: { reset: jest.fn(), track: jest.fn() },
}));

jest.mock("react-native-purchases-ui", () => ({
  __esModule: true,
  default: { presentPaywall: jest.fn() },
}));

jest.mock("~/hooks/revenueCat", () => ({
  useCustomerInfoQuery: () => ({ data: undefined }),
  useIsProQuery: () => ({ data: false }),
}));

const mount = async (element: ReactNode) => {
  const client = createTestQueryClient();

  const { container } = await render(
    <QueryClientProvider client={client}>{element}</QueryClientProvider>
  );

  await settle(client);

  return container;
};

// A symbol's name, as `spokenLabel` reads a symbol left in the tree.
const SYMBOL_NAME = /chevron|heart|figure/u;

/** The button whose text includes `text`, as VoiceOver reaches it. */
const buttonWith = (text: string) =>
  screen
    .getAllByRole("button")
    .find((button) => spokenLabel(button).includes(text));

beforeEach(() => {
  storage.clearAll();
  backend.reset();
});

describe("decorative symbols", () => {
  it("read a Library row as the Exercise and its Muscle groups only", async () => {
    serveLibrary([
      libraryExercise("barbell-curl", {
        muscle_groups: ["biceps", "forearms"],
      }),
    ]);
    await mount(<LibraryScreen />);

    expect(spokenLabel(buttonWith("Barbell Curl"))).toBe(
      "Barbell Curl, Biceps, Forearms"
    );
  });

  it("read the Profile's links and rate-us button without their symbols", async () => {
    const container = await mount(<ProfileView />);

    expect(spokenLabel(screen.getByTestId("edit-profile-link"))).toBe(
      "Edit Profile"
    );
    expect(spokenLabel(screen.getByTestId("settings-link"))).toBe("Settings");
    expect(spokenLabel(buttonWith("Like the app?"))).toBe(
      "Like the app?, Rate it in the App Store!"
    );
    // The free plan's figure is decoration too.
    expect(spokenLabel(container)).not.toMatch(SYMBOL_NAME);
  });
});
