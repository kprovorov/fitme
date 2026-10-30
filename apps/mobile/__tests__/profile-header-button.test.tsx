/**
 * Profile is reached from the first tab's header, not a tab: the real Home
 * screen's header button pushes the Profile route, which is a stack screen
 * over the tabs with a back button. The header is rendered as plain buttons
 * named by their spoken label, with Supabase swapped for the in-memory backend.
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { Pressable, Text } from "react-native";
import HomeScreen from "~/app/(tabs)/(home)/index";
import ProfileScreen from "~/app/profile";
import { setDeviceLanguages } from "~/test-utils/device-locales";
import { FAKE_USER_ID } from "~/test-utils/fake-public-api";
import { backend } from "~/test-utils/fake-workout-backend";
import { InAppLanguage } from "~/test-utils/in-app-language";
import { createTestQueryClient, settle } from "~/test-utils/query-client";

interface MockHeaderItem {
  accessibilityLabel?: string;
  icon?: { name: string };
  label: string;
  onPress?: () => void;
  type: string;
}

interface MockHeaderOptions {
  headerBackButtonDisplayMode?: string;
  headerShown?: boolean;
  title?: string;
  unstable_headerRightItems?: () => MockHeaderItem[];
}

// The header's title, whether it's shown with a back button, and its plain
// buttons, each named by what VoiceOver reads. Top-level (and
// `mock`-prefixed, so the factory may use it) because the React Compiler
// rewrites components declared inside a `jest.mock` factory.
const MockHeader = ({ options }: { options: MockHeaderOptions }) => (
  <>
    {options.title ? <Text>{options.title}</Text> : null}
    {options.headerShown ? <Text>header shown</Text> : null}
    {options.headerBackButtonDisplayMode ? <Text>back button</Text> : null}
    {(options.unstable_headerRightItems?.() ?? [])
      .filter((item) => item.type === "button")
      .map((item) => (
        <Pressable
          accessibilityLabel={item.accessibilityLabel ?? item.label}
          accessibilityRole="button"
          key={item.label}
          onPress={item.onPress}
          testID={`header-${item.icon?.name}`}
        />
      ))}
  </>
);

const mockPush = jest.fn();

jest.mock("expo-router", () => ({
  Link: ({ children }: { children: ReactNode }) => children,
  router: { replace: jest.fn() },
  Stack: {
    Screen: (props: { options: MockHeaderOptions }) => (
      <MockHeader {...props} />
    ),
  },
  useNavigation: () => ({}),
  useRouter: () => ({
    back: jest.fn(),
    canGoBack: () => true,
    dismiss: jest.fn(),
    push: mockPush,
    replace: jest.fn(),
  }),
}));

const mockUser = {
  fullName: "Tony Stark",
  id: "user-1",
  primaryEmailAddress: { emailAddress: "tony@example.com" },
  reload: () => Promise.resolve(),
};

jest.mock("@clerk/expo", () => ({
  useUser: () => ({ isLoaded: true, user: mockUser }),
}));

jest.mock("react-native-purchases", () => ({
  __esModule: true,
  default: { invalidateCustomerInfoCache: () => Promise.resolve() },
}));

jest.mock("react-native-purchases-ui", () => ({
  __esModule: true,
  default: { presentPaywall: jest.fn() },
}));

jest.mock("~/lib/supabase", () => ({
  supabase: jest.requireActual<
    typeof import("~/test-utils/fake-workout-backend")
  >("~/test-utils/fake-workout-backend").fakeSupabase,
}));

// The real Clerk SDK opens a MessagePort at import that keeps Jest alive.
jest.mock("~/lib/clerk", () => ({
  getClerk: () => ({ signOut: jest.fn(), user: mockUser }),
  getCurrentUserId: () =>
    jest.requireActual<typeof import("~/test-utils/fake-public-api")>(
      "~/test-utils/fake-public-api"
    ).FAKE_USER_ID,
}));

jest.mock("~/lib/segment", () => ({
  segmentClient: { reset: jest.fn(), track: jest.fn() },
}));
jest.mock("~/hooks/revenueCat", () => ({
  useCustomerInfoQuery: () => ({ data: undefined }),
  useIsProQuery: () => ({ data: false }),
}));
jest.mock("~/components/exercises/exercise-image", () => () => null);
jest.mock("~/components/symbol-image", () => ({ SymbolImage: () => null }));
jest.mock("~/components/ui/button", () =>
  jest.requireActual("~/test-utils/button-stub")
);

const mount = async (element: ReactNode) => {
  const client = createTestQueryClient();
  await render(
    <QueryClientProvider client={client}>
      <InAppLanguage>{element}</InAppLanguage>
    </QueryClientProvider>
  );
  await settle(client);
};

beforeEach(() => {
  mockPush.mockClear();
  backend.reset();
  backend.seedProfile(FAKE_USER_ID);
  backend.seedPlan({
    id: "plan-1",
    is_active: true,
    name: "Strength",
    workouts: [],
  });
});

describe("Profile from the first tab's header", () => {
  it("pushes Profile from a person button in the header", async () => {
    await mount(<HomeScreen />);

    const button = screen.getByRole("button", { name: "Profile" });
    expect(button.props.testID).toBe("header-person.fill");

    fireEvent.press(button);

    expect(mockPush).toHaveBeenCalledWith("/profile");
  });

  it("names the button in Ukrainian on a Ukrainian device", async () => {
    setDeviceLanguages(["uk-UA"]);
    await mount(<HomeScreen />);

    expect(screen.getByRole("button", { name: "Профіль" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Profile" })).toBeNull();
  });

  it("opens Profile as a stack screen with a header and a back button", async () => {
    await mount(<ProfileScreen />);

    expect(screen.getByText("Profile")).toBeTruthy();
    expect(screen.getByText("header shown")).toBeTruthy();
    expect(screen.getByText("back button")).toBeTruthy();
    // Its contents are the Profile view's, unchanged.
    expect(screen.getByText("Tony Stark")).toBeTruthy();
    expect(screen.getByTestId("edit-profile-link")).toBeTruthy();
  });
});
