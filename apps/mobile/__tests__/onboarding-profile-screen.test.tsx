/**
 * The onboarding Profile screen on the mounted-screen seam: the real screen,
 * form, hooks and Public API client, with Supabase swapped for the in-memory
 * backend and the client's `fetch` for the fake Public API over the same rows
 * (both from `test-utils/`), Clerk for a signed-in User, and the
 * SwiftUI-backed primitives for stand-ins.
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import * as Sentry from "@sentry/react-native";
import { QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { router } from "expo-router";
import { useCallback } from "react";
import { Pressable, Text } from "react-native";
import ProfileScreen from "~/app/onboarding/profile";
import { segmentClient } from "~/lib/segment";
import {
  FAKE_SESSION_TOKEN,
  FAKE_USER_ID,
  fakePublicApi,
} from "~/test-utils/fake-public-api";
import { backend } from "~/test-utils/fake-workout-backend";
import { createTestQueryClient, settle } from "~/test-utils/query-client";

jest.mock("expo-router", () => ({
  router: { dismissTo: jest.fn() },
  Stack: { Screen: () => null },
}));

jest.mock("@sentry/react-native", () => ({ captureException: jest.fn() }));

jest.mock("~/lib/segment", () => ({ segmentClient: { track: jest.fn() } }));

jest.mock("expo-localization", () => ({
  useLocales: () => [{ measurementSystem: "metric" }],
}));

jest.mock("~/lib/supabase", () => ({
  supabase: jest.requireActual<
    typeof import("~/test-utils/fake-workout-backend")
  >("~/test-utils/fake-workout-backend").fakeSupabase,
}));

jest.mock("@clerk/expo", () => ({
  useUser: () => ({ isLoaded: true, user: { id: "user_test" } }),
}));

jest.mock("~/lib/clerk", () => ({
  getCurrentUserId: () =>
    jest.requireActual<typeof import("~/test-utils/fake-public-api")>(
      "~/test-utils/fake-public-api"
    ).FAKE_USER_ID,
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
}));

// Reanimated's worklets need a native module; the drawer only needs a View.
jest.mock("react-native-reanimated", () => {
  const { View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    __esModule: true,
    default: { View },
    useAnimatedStyle: () => ({}),
    useSharedValue: (value: number) => ({ value }),
    withTiming: (value: number) => value,
  };
});

jest.mock("~/components/ui/button", () =>
  jest.requireActual("~/test-utils/button-stub")
);

// One option of the wheel stand-in. Top-level (and `mock`-prefixed, so the
// factory may use it) because the React Compiler rewrites components declared
// inside a `jest.mock` factory into code the factory can't reach.
const MockWheelOption = ({
  onValueChange,
  value,
}: {
  onValueChange: (value: number) => void;
  value: number;
}) => {
  const handlePress = useCallback(
    () => onValueChange(value),
    [onValueChange, value]
  );
  return (
    <Pressable onPress={handlePress} testID={`wheel-${value}`}>
      <Text>{value}</Text>
    </Pressable>
  );
};

// The SwiftUI wheel can't mount under Jest. Like the native one, the stand-in
// reports a value only when one of its options is tapped.
jest.mock("~/components/ui/picker", () => {
  const { View: MockView } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    Picker: ({
      onValueChange,
      options,
    }: {
      onValueChange: (value: number) => void;
      options: { value: number }[];
    }) => (
      <MockView>
        {options.map((option) => (
          <MockWheelOption
            key={option.value}
            onValueChange={onValueChange}
            value={option.value}
          />
        ))}
      </MockView>
    ),
  };
});

// The stand-in `jest.mock("~/lib/segment")` installs.
const track = segmentClient.track as unknown as jest.Mock;

const PROFILE_PATCH = "PATCH /v1/profile";
const PROFILE_PUT = "PUT /v1/profile";
const SAVE_ERROR =
  "Couldn't save your profile. Please check your connection and try again.";

let queryClient = createTestQueryClient();

const mount = async () => {
  queryClient = createTestQueryClient();
  await render(
    <QueryClientProvider client={queryClient}>
      <ProfileScreen />
    </QueryClientProvider>
  );
  await settle(queryClient);
};

/** Opens a row's wheel and taps `value` on it. */
const pick = async (row: string, value: number) => {
  await fireEvent.press(screen.getByText(row));
  await fireEvent.press(screen.getByTestId(`wheel-${value}`));
};

const fillAndSubmit = async () => {
  await fireEvent.press(screen.getByLabelText("Male"));
  await pick("Age", 28);
  await pick("Weight", 80);
  await pick("Height", 182);
  await fireEvent.press(screen.getByText("Next"));
  await settle(queryClient);
};

describe("Onboarding ProfileScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    backend.reset();
  });

  it("creates the Profile through the Public API, then moves on to the planner", async () => {
    await mount();

    await fillAndSubmit();

    expect(fakePublicApi.requests).toEqual([
      {
        authorization: `Bearer ${FAKE_SESSION_TOKEN}`,
        body: {
          age: 28,
          gender: "male",
          height: 182,
          measurement_system: "metric",
          weight: 80,
        },
        path: "/v1/profile",
        route: PROFILE_PUT,
      },
    ]);
    expect(backend.profile(FAKE_USER_ID)).toEqual({
      age: 28,
      gender: "male",
      height: 182,
      measurement_system: "metric",
      user_id: FAKE_USER_ID,
      weight: 80,
    });
    // The Profile is read again, so Edit Profile starts from the saved one.
    expect(backend.count("profiles", "select")).toBe(2);
    expect(track).toHaveBeenCalledWith("Profile Filled", {
      age: 28,
      gender: "male",
      weight_unit: "metric",
    });
    expect(router.dismissTo).toHaveBeenCalledWith("/planner");
  });

  it("sends only the changed fields when onboarding runs again, never making a second Profile", async () => {
    backend.seedProfile(FAKE_USER_ID, {
      age: 40,
      gender: "female",
      height: 182,
      weight: 60,
    });
    await mount();

    await fillAndSubmit();

    expect(fakePublicApi.requests).toEqual([
      {
        authorization: `Bearer ${FAKE_SESSION_TOKEN}`,
        body: { age: 28, gender: "male", weight: 80 },
        path: "/v1/profile",
        route: PROFILE_PATCH,
      },
    ]);
    expect(backend.profiles).toEqual([
      {
        age: 28,
        gender: "male",
        height: 182,
        measurement_system: "metric",
        user_id: FAKE_USER_ID,
        weight: 80,
      },
    ]);
    expect(router.dismissTo).toHaveBeenCalledWith("/planner");
  });

  it("lets a value saved before today's bounds through a re-run", async () => {
    backend.seedProfile(FAKE_USER_ID, { age: 4, gender: "female" });
    await mount();

    await fireEvent.press(screen.getByLabelText("Male"));
    await fireEvent.press(screen.getByText("Next"));
    await settle(queryClient);

    expect(fakePublicApi.requests.map(({ body }) => body)).toEqual([
      { gender: "male" },
    ]);
    expect(backend.profile(FAKE_USER_ID)).toMatchObject({
      age: 4,
      gender: "male",
    });
    expect(router.dismissTo).toHaveBeenCalledWith("/planner");
  });

  it("says how long to wait when there were too many requests", async () => {
    await mount();
    fakePublicApi.failNext(PROFILE_PUT, {
      retryAfterSeconds: 42,
      status: 429,
    });

    await fillAndSubmit();

    expect(
      screen.getByText(
        "Couldn't save your profile. Too many requests: please try again in 42 s."
      )
    ).toBeTruthy();
    expect(Sentry.captureException).not.toHaveBeenCalled();
    expect(backend.profile(FAKE_USER_ID)).toBeUndefined();
    expect(router.dismissTo).not.toHaveBeenCalled();
  });

  it.each([
    ["a 5xx", { status: 503 }],
    ["a network failure", "network"],
  ] as const)(
    "shows the error state on %s, writing nothing through Supabase",
    async (_name, failure) => {
      await mount();
      fakePublicApi.failNext(PROFILE_PUT, failure);

      await fillAndSubmit();

      expect(screen.getByText(SAVE_ERROR)).toBeTruthy();
      expect(Sentry.captureException).toHaveBeenCalledTimes(1);
      expect(backend.count("profiles", "insert")).toBe(0);
      expect(backend.count("profiles", "upsert")).toBe(0);
      expect(backend.profile(FAKE_USER_ID)).toBeUndefined();
      expect(track).not.toHaveBeenCalled();
      expect(router.dismissTo).not.toHaveBeenCalled();
    }
  );
});
