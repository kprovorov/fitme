/**
 * The edit-profile screen on the mounted-screen seam: the real screen, form,
 * hooks and Public API client, with Supabase swapped for the in-memory backend
 * and the client's `fetch` for the fake Public API over the same rows (both
 * from `test-utils/`), Clerk for a signed-in User, and the SwiftUI-backed
 * primitives for stand-ins.
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import * as Sentry from "@sentry/react-native";
import { QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { router } from "expo-router";
import { useCallback } from "react";
import { Pressable, Text } from "react-native";
import EditProfileScreen from "~/app/settings/edit-profile";
import {
  FAKE_SESSION_TOKEN,
  FAKE_USER_ID,
  fakePublicApi,
} from "~/test-utils/fake-public-api";
import { backend } from "~/test-utils/fake-workout-backend";
import { createTestQueryClient, settle } from "~/test-utils/query-client";

jest.mock("expo-router", () => ({
  router: { back: jest.fn() },
  Stack: { Screen: () => null },
}));

jest.mock("@sentry/react-native", () => ({ captureException: jest.fn() }));

jest.mock("expo-localization", () => ({
  useLocales: () => [{ measurementSystem: "metric" }],
}));

jest.mock("~/lib/supabase", () => ({
  supabase: jest.requireActual<
    typeof import("~/test-utils/fake-workout-backend")
  >("~/test-utils/fake-workout-backend").fakeSupabase,
}));

// The signed-in Clerk User, shared by `useUser` and `getClerk`.
const mockUser = {
  fullName: "Tony Stark" as string | null,
  id: "user_test",
  update: jest.fn(async (_name: { firstName: string; lastName: string }) => {
    // Clerk's answer isn't read.
  }),
};

jest.mock("@clerk/expo", () => ({
  useUser: () => ({ isLoaded: true, user: mockUser }),
}));

jest.mock("~/lib/clerk", () => ({
  getClerk: () => ({ user: mockUser }),
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

const PROFILE_PATCH = "PATCH /v1/profile";
const SAVE_ERROR =
  "Couldn't save your profile. Please check your connection and try again.";

let queryClient = createTestQueryClient();

const mount = async () => {
  queryClient = createTestQueryClient();
  await render(
    <QueryClientProvider client={queryClient}>
      <EditProfileScreen />
    </QueryClientProvider>
  );
  await settle(queryClient);
};

const save = async () => {
  await fireEvent.press(screen.getByTestId("edit-profile-save-button"));
  await settle(queryClient);
};

/** Opens a row's wheel and taps `value` on it. */
const pick = async (row: string, value: number) => {
  await fireEvent.press(screen.getByText(row));
  await fireEvent.press(screen.getByTestId(`wheel-${value}`));
};

describe("EditProfileScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUser.fullName = "Tony Stark";
    backend.reset();
  });

  it("sends only the changed fields through the Public API", async () => {
    backend.seedProfile(FAKE_USER_ID, {
      age: 30,
      gender: "female",
      height: 170,
      weight: 60,
    });
    await mount();

    await fireEvent.press(screen.getByLabelText("Male"));
    await pick("Age", 31);
    await save();

    expect(fakePublicApi.requests).toEqual([
      {
        authorization: `Bearer ${FAKE_SESSION_TOKEN}`,
        body: { age: 31, gender: "male" },
        path: "/v1/profile",
        route: PROFILE_PATCH,
      },
    ]);
    expect(backend.profile(FAKE_USER_ID)).toMatchObject({
      age: 31,
      gender: "male",
      height: 170,
      weight: 60,
    });
    // The Profile is read again, so the Profile screens show the result.
    expect(backend.count("profiles", "select")).toBe(2);
    expect(mockUser.update).not.toHaveBeenCalled();
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it("keeps an unchanged stored value out of the request", async () => {
    // A converted weight with decimals stays as stored.
    backend.seedProfile(FAKE_USER_ID, { height: 70.87, weight: 176.37 });
    await mount();

    await pick("Age", 40);
    await save();

    expect(fakePublicApi.requests.map(({ body }) => body)).toEqual([
      { age: 40 },
    ]);
    expect(backend.profile(FAKE_USER_ID)).toMatchObject({
      age: 40,
      height: 70.87,
      weight: 176.37,
    });
  });

  it("sends no Profile request when nothing changed, but still saves a new name", async () => {
    backend.seedProfile(FAKE_USER_ID);
    await mount();

    await fireEvent.changeText(
      screen.getByTestId("edit-profile-name-input"),
      "Pepper Potts"
    );
    await save();

    expect(fakePublicApi.requests).toEqual([]);
    expect(mockUser.update).toHaveBeenCalledWith({
      firstName: "Pepper",
      lastName: "Potts",
    });
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it("sends nothing at all when nothing changed", async () => {
    backend.seedProfile(FAKE_USER_ID);
    await mount();

    await save();

    expect(fakePublicApi.requests).toEqual([]);
    expect(mockUser.update).not.toHaveBeenCalled();
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it("creates the Profile through Supabase when the API has none", async () => {
    await mount();

    await fireEvent.press(screen.getByLabelText("Female"));
    await pick("Age", 28);
    await pick("Weight", 62);
    await pick("Height", 168);
    await save();

    expect(fakePublicApi.requests.map(({ body }) => body)).toEqual([
      { age: 28, gender: "female", height: 168, weight: 62 },
    ]);
    expect(backend.count("profiles", "insert")).toBe(1);
    expect(backend.profile(FAKE_USER_ID)).toEqual({
      age: 28,
      gender: "female",
      height: 168,
      measurement_system: "metric",
      user_id: FAKE_USER_ID,
      weight: 62,
    });
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["a 5xx", { status: 503 }],
    ["a network failure", "network"],
  ] as const)(
    "shows the error state on %s and never falls back to Supabase",
    async (_name, failure) => {
      backend.seedProfile(FAKE_USER_ID, { age: 30 });
      await mount();
      fakePublicApi.failNext(PROFILE_PATCH, failure);

      await pick("Age", 31);
      await save();

      expect(screen.getByText(SAVE_ERROR)).toBeTruthy();
      expect(Sentry.captureException).toHaveBeenCalledTimes(1);
      expect(backend.count("profiles", "insert")).toBe(0);
      expect(backend.count("profiles", "update")).toBe(0);
      expect(backend.profile(FAKE_USER_ID)?.age).toBe(30);
      expect(router.back).not.toHaveBeenCalled();
    }
  );

  it("never creates a Profile on a failure other than profile_not_found", async () => {
    await mount();
    fakePublicApi.failNext(PROFILE_PATCH, { code: "not_found", status: 404 });

    await fireEvent.press(screen.getByLabelText("Female"));
    await pick("Age", 28);
    await pick("Weight", 62);
    await pick("Height", 168);
    await save();

    expect(screen.getByText(SAVE_ERROR)).toBeTruthy();
    expect(backend.count("profiles", "insert")).toBe(0);
    expect(backend.profile(FAKE_USER_ID)).toBeUndefined();
  });

  it("says how long to wait when there were too many requests", async () => {
    backend.seedProfile(FAKE_USER_ID);
    await mount();
    fakePublicApi.failNext(PROFILE_PATCH, {
      retryAfterSeconds: 42,
      status: 429,
    });

    await pick("Age", 31);
    await save();

    expect(
      screen.getByText(
        "Couldn't save your profile. Too many requests: please try again in 42 s."
      )
    ).toBeTruthy();
    expect(Sentry.captureException).not.toHaveBeenCalled();
    expect(router.back).not.toHaveBeenCalled();
  });

  it("lets a value saved before today's bounds through an unrelated edit", async () => {
    backend.seedProfile(FAKE_USER_ID, { age: 4, gender: "female" });
    await mount();

    await fireEvent.press(screen.getByLabelText("Male"));
    await save();

    expect(fakePublicApi.requests.map(({ body }) => body)).toEqual([
      { gender: "male" },
    ]);
    expect(backend.profile(FAKE_USER_ID)).toMatchObject({
      age: 4,
      gender: "male",
    });
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it("only offers values inside the shared bounds", async () => {
    backend.seedProfile(FAKE_USER_ID);
    await mount();

    await fireEvent.press(screen.getByText("Age"));

    expect(screen.queryByTestId("wheel-9")).toBeNull();
    expect(screen.getByTestId("wheel-10")).toBeTruthy();
    expect(screen.getByTestId("wheel-120")).toBeTruthy();
    expect(screen.queryByTestId("wheel-121")).toBeNull();
  });
});
