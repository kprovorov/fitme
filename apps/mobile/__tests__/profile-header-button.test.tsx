/**
 * The first tab's header and Plan menu. Profile is reached from the header,
 * not a tab: the real Home screen's header button pushes the Profile route,
 * which is a stack screen over the tabs with a back button. The title is the
 * Fitme logo, and Manage Plans and Create Plan sit behind the sliders button
 * next to the Workouts heading, not in a header menu. The header is rendered
 * as plain buttons named by their spoken label (a custom item as its own
 * element), the menu as the dropdown stand-in, with the Public API and Clerk
 * swapped for their fakes. The Profile button shows the User's Profile photo,
 * and the `person.fill` symbol while Clerk loads or when the photo fails.
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { useLayoutEffect, useState } from "react";
import { AppState, Platform, Pressable, Text, View } from "react-native";

import HomeScreen from "~/app/(tabs)/(home)/index";
import ProfileScreen from "~/app/profile";
import { PROFILE_PHOTO_IMAGE } from "~/components/profile/profile-photo-button";
import { setDeviceLanguages } from "~/test-utils/device-locales";
import { DEFAULT_IMAGE_URL, fakeClerk } from "~/test-utils/fake-clerk";
import { backend, FAKE_USER_ID } from "~/test-utils/fake-public-api";
import { InAppLanguage } from "~/test-utils/in-app-language";
import { createTestQueryClient, settle } from "~/test-utils/query-client";

interface MockHeaderItem {
  accessibilityLabel?: string;
  element?: ReactNode;
  icon?: { name: string };
  label?: string;
  onPress?: () => void;
  type: string;
}

interface MockHeaderOptions {
  headerBackButtonDisplayMode?: string;
  headerRight?: () => ReactNode;
  headerShown?: boolean;
  headerTitle?: () => ReactNode;
  title?: string;
  unstable_headerRightItems?: () => MockHeaderItem[];
}

// The header's title, whether it's shown with a back button, and its plain
// buttons, each named by what VoiceOver reads. Top-level (and
// `mock`-prefixed, so the factory may use it) because the React Compiler
// rewrites components declared inside a `jest.mock` factory.
const MockHeader = ({ options }: { options: MockHeaderOptions }) => {
  // SceneView keeps its own hooks before invoking the header renderers.
  const [initialTitle] = useState(options.title);
  const title = options.title ?? initialTitle;

  return (
    <>
      {options.headerTitle ? (
        options.headerTitle()
      ) : title ? (
        <Text>{title}</Text>
      ) : null}
      {options.headerShown ? <Text>header shown</Text> : null}
      {options.headerBackButtonDisplayMode ? <Text>back button</Text> : null}
      {options.headerRight?.()}
      {(options.unstable_headerRightItems?.() ?? []).some(
        (item) => item.type === "menu"
      ) ? (
        <Text>header menu</Text>
      ) : null}
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
      <View>
        {
          (options.unstable_headerRightItems?.() ?? []).find(
            (item) => item.type === "custom"
          )?.element
        }
      </View>
    </>
  );
};

const MockHeaderScreen = ({ options }: { options: MockHeaderOptions }) => {
  // Native stack renders defaults before Stack.Screen installs its options.
  const [configured, setConfigured] = useState(false);

  useLayoutEffect(() => {
    queueMicrotask(() => setConfigured(true));
  }, []);

  return (
    <MockHeader options={configured ? options : { title: options.title }} />
  );
};

const mockPush = jest.fn();

jest.mock("expo-router", () => ({
  Link: ({ children }: { children: ReactNode }) => children,
  router: { replace: jest.fn() },
  Stack: {
    Screen: (props: { options: MockHeaderOptions }) => (
      <MockHeaderScreen {...props} />
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

jest.mock(
  "@clerk/expo",
  () =>
    jest.requireActual<typeof import("~/test-utils/fake-clerk")>(
      "~/test-utils/fake-clerk"
    ).clerkModule
);

jest.mock(
  "react-native-purchases",
  () =>
    jest.requireActual<typeof import("~/test-utils/fake-revenuecat")>(
      "~/test-utils/fake-revenuecat"
    ).purchasesModule
);

jest.mock("react-native-purchases-ui", () => ({
  __esModule: true,
  default: { presentPaywall: jest.fn() },
}));

jest.mock("~/components/exercises/exercise-image", () => () => null);

// A symbol as its name, so a test sees which one a button shows.
jest.mock("~/components/symbol-image", () => {
  const { View: MockView } =
    jest.requireActual<typeof import("react-native")>("react-native");

  return {
    SymbolImage: ({ name }: { name: string }) => (
      <MockView testID={`symbol-${name}`} />
    ),
  };
});

jest.mock("~/components/ui/button", () =>
  jest.requireActual("~/test-utils/button-stub")
);

jest.mock("~/components/ui/dropdown-menu", () =>
  jest.requireActual("~/test-utils/dropdown-menu-stub")
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

const PHOTO_URL = "https://img.clerk.com/tony.jpg";

/** The iOS Profile button: the photo's, or the native symbol item. */
const profileButton = () =>
  screen
    .getAllByRole("button", { name: "Profile" })
    .find(
      (button) =>
        button.props.testID === "profile-photo-button" ||
        button.props.testID === "header-person.fill"
    );

/** The photo failing to load, as expo-image reports it. */
const failPhoto = async () => {
  await fireEvent(screen.getByTestId(PROFILE_PHOTO_IMAGE), "error", {
    nativeEvent: { error: "Couldn't load the image" },
  });
};

describe("the Profile button's photo", () => {
  it("shows the User's Profile photo and pushes Profile", async () => {
    fakeClerk.setUser({ imageUrl: PHOTO_URL });
    await mount(<HomeScreen />);

    const button = profileButton();
    expect(button?.props.testID).toBe("profile-photo-button");
    expect(screen.getByTestId(PROFILE_PHOTO_IMAGE).props.source).toEqual([
      expect.objectContaining({ uri: PHOTO_URL }),
    ]);
    expect(screen.queryByTestId("header-person.fill")).toBeNull();

    await fireEvent.press(button as NonNullable<typeof button>);

    expect(mockPush).toHaveBeenCalledWith("/profile");
  });

  it("shows Clerk's default picture for a User without a photo", async () => {
    await mount(<HomeScreen />);

    expect(profileButton()?.props.testID).toBe("profile-photo-button");
    expect(screen.getByTestId(PROFILE_PHOTO_IMAGE).props.source).toEqual([
      expect.objectContaining({ uri: DEFAULT_IMAGE_URL }),
    ]);
  });

  it("shows person.fill while Clerk is loading, then the photo", async () => {
    fakeClerk.setUser({ imageUrl: PHOTO_URL });
    fakeClerk.setLoaded(false);
    await mount(<HomeScreen />);

    const button = profileButton();
    expect(button?.props.testID).toBe("header-person.fill");
    expect(screen.queryByTestId(PROFILE_PHOTO_IMAGE)).toBeNull();

    await fireEvent.press(button as NonNullable<typeof button>);
    expect(mockPush).toHaveBeenCalledWith("/profile");

    await act(() => {
      fakeClerk.setLoaded(true);
    });
    expect(profileButton()?.props.testID).toBe("profile-photo-button");
  });

  it("falls back to person.fill when the photo fails to load", async () => {
    fakeClerk.setUser({ imageUrl: PHOTO_URL });
    await mount(<HomeScreen />);

    await failPhoto();

    const button = profileButton();
    expect(button?.props.testID).toBe("header-person.fill");
    expect(screen.queryByTestId(PROFILE_PHOTO_IMAGE)).toBeNull();

    await fireEvent.press(button as NonNullable<typeof button>);
    expect(mockPush).toHaveBeenCalledWith("/profile");
  });

  it("asks for a failed photo again when the app returns to the foreground", async () => {
    const addListener = jest.spyOn(AppState, "addEventListener");
    fakeClerk.setUser({ imageUrl: PHOTO_URL });
    await mount(<HomeScreen />);
    await failPhoto();
    expect(screen.queryByTestId(PROFILE_PHOTO_IMAGE)).toBeNull();

    await act(() => {
      for (const [type, listener] of addListener.mock.calls) {
        if (type === "change") {
          listener("background");
          listener("active");
        }
      }
    });

    expect(screen.getByTestId(PROFILE_PHOTO_IMAGE).props.source).toEqual([
      expect.objectContaining({ uri: PHOTO_URL }),
    ]);
  });

  it("tries a new photo again after one failed", async () => {
    fakeClerk.setUser({ imageUrl: PHOTO_URL });
    await mount(<HomeScreen />);
    await failPhoto();

    await act(() => {
      fakeClerk.setUser({ imageUrl: "https://img.clerk.com/tony-2.jpg" });
    });

    expect(screen.getByTestId(PROFILE_PHOTO_IMAGE).props.source).toEqual([
      expect.objectContaining({ uri: "https://img.clerk.com/tony-2.jpg" }),
    ]);
  });
});

describe("profile from the first tab's header", () => {
  it("offers a Profile text button on Android, which has no header items", async () => {
    const os = Platform.OS;
    Platform.OS = "android";

    try {
      await mount(<HomeScreen />);

      const buttons = screen.getAllByRole("button", { name: "Profile" });

      // The text button, beside the iOS-only item the stand-in also draws.
      const textButton = buttons.find(
        (button) =>
          button.props.testID !== "header-person.fill" &&
          button.props.testID !== "profile-photo-button"
      );

      expect(textButton).toBeDefined();
      void fireEvent.press(textButton as NonNullable<typeof textButton>);
      expect(mockPush).toHaveBeenCalledWith("/profile");
    } finally {
      Platform.OS = os;
    }
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
    // Its contents are the Profile view's.
    expect(screen.getByText("Tony Stark")).toBeTruthy();
    expect(screen.getByTestId("edit-profile-link")).toBeTruthy();
  });
});

describe("the first tab's header and Plan menu", () => {
  it("installs the custom title after the default header without changing hooks", async () => {
    await mount(<HomeScreen />);

    expect(screen.getByRole("image", { name: "Fitme" })).toBeTruthy();
  });

  it("has no menu in the header", async () => {
    await mount(<HomeScreen />);

    expect(screen.queryByText("header menu")).toBeNull();
  });

  it("opens Manage Plans and Create Plan from the sliders button by the Workouts heading", async () => {
    await mount(<HomeScreen />);

    expect(screen.getByRole("heading", { name: "Workouts" })).toBeTruthy();
    expect(screen.queryByRole("menuitem")).toBeNull();

    const sliders = screen.getByRole("button", { name: "Plan options" });
    expect(sliders.props.testID).toBe("menu-slider.horizontal.3");

    await fireEvent.press(sliders);
    await fireEvent.press(
      screen.getByRole("menuitem", { name: "Manage Plans" })
    );
    expect(mockPush).toHaveBeenLastCalledWith("/plans");

    await fireEvent.press(sliders);
    await fireEvent.press(
      screen.getByRole("menuitem", { name: "Create Plan" })
    );
    expect(mockPush).toHaveBeenLastCalledWith("/plans/create");
  });

  it("offers Manage Plans in the empty state when the User has Plans but none active", async () => {
    backend.reset();
    backend.seedProfile(FAKE_USER_ID);
    backend.seedPlan({
      id: "plan-1",
      is_active: false,
      name: "Strength",
      workouts: [],
    });
    await mount(<HomeScreen />);

    expect(
      screen.getByText("Activate one of your plans, or create a new one.")
    ).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Manage Plans" }));
    expect(mockPush).toHaveBeenCalledWith("/plans");
  });
});
