/**
 * The edit-profile screen on the mounted-screen seam: the real screen, form,
 * hooks and Public API client, with the client's `fetch` swapped for the fake
 * Public API (`test-utils/`), Clerk for the fake Clerk User, and the
 * SwiftUI-backed primitives for stand-ins.
 */
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import * as Sentry from "@sentry/react-native";
import { QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { router } from "expo-router";
import { useCallback } from "react";
import { Pressable, Text } from "react-native";

import EditProfileScreen from "~/app/edit-profile";
import { rememberProfileWrite, seedProfile } from "~/hooks/mutations/profiles";
import { useProfileQuery } from "~/hooks/queries/profiles";
import { useUpdateMeasurementSystemMutation } from "~/hooks/queries/settings";
import { i18n } from "~/lib/i18n";
import { setDeviceLanguages } from "~/test-utils/device-locales";
import { DEFAULT_IMAGE_URL, fakeClerk } from "~/test-utils/fake-clerk";
import {
  backend,
  FAKE_SESSION_TOKEN,
  FAKE_USER_ID,
  fakePublicApi,
} from "~/test-utils/fake-public-api";
import { InAppLanguage } from "~/test-utils/in-app-language";
import {
  createTestQueryClient,
  settle,
  until,
} from "~/test-utils/query-client";
import { signInAs } from "~/test-utils/signed-in-user";

jest.mock("expo-router", () => ({
  router: { back: jest.fn() },
  Stack: { Screen: () => null },
}));

jest.mock("@sentry/react-native", () => ({ captureException: jest.fn() }));

jest.mock(
  "@clerk/expo",
  () =>
    jest.requireActual<typeof import("~/test-utils/fake-clerk")>(
      "~/test-utils/fake-clerk"
    ).clerkModule
);

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

const PROFILE_GET = "GET /v1/profile";
const PROFILE_PATCH = "PATCH /v1/profile";
const PROFILE_PUT = "PUT /v1/profile";

const LOAD_ERROR =
  "Couldn't load your profile. Please check your connection and try again.";

/** Every name the screen wrote to Clerk, in order. */
const nameUpdates = () =>
  fakeClerk.calls
    .filter(({ method }) => method === "update")
    .map(({ params }) => params);

/** Every request but the Profile's reads. */
const writes = () =>
  fakePublicApi.requests.filter(({ route }) => route !== PROFILE_GET);

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

/** Opens a field's wheel and taps `value` on it. */
const pick = async (field: string, value: number) => {
  await fireEvent.press(screen.getByRole("button", { name: field }));
  await fireEvent.press(screen.getByTestId(`wheel-${value}`));
};

const FIRST_NAME = "edit-profile-first-name-input";
const LAST_NAME = "edit-profile-last-name-input";
const SAVE = "edit-profile-save-button";

describe("EditProfileScreen", () => {
  beforeEach(() => {
    // A metric device, so the form suggests centimeters and kilograms.
    setDeviceLanguages(["en-GB"]);
    jest.clearAllMocks();
    fakeClerk.setUser({ firstName: "Tony", lastName: "Stark" });
    backend.reset();
  });

  it("shows the saved Profile, read through the Public API", async () => {
    backend.seedProfile(FAKE_USER_ID, {
      age: 32,
      gender: "male",
      height: 180.5,
      weight: 82.5,
    });
    await mount();

    expect(fakePublicApi.requests).toEqual([
      {
        authorization: `Bearer ${FAKE_SESSION_TOKEN}`,
        body: undefined,
        path: "/v1/profile",
        query: {},
        route: PROFILE_GET,
      },
    ]);

    for (const text of ["32 y.o.", "82.5 kg", "180.5 cm"]) {
      expect(screen.getByText(text)).toBeTruthy();
    }

    expect(screen.getByLabelText("Male")).toBeChecked();
    expect(screen.getByLabelText("Female")).not.toBeChecked();
    expect(screen.getByTestId(FIRST_NAME)).toHaveDisplayValue("Tony");
    expect(screen.getByTestId(LAST_NAME)).toHaveDisplayValue("Stark");
    // Nothing changed yet.
    expect(screen.getByTestId(SAVE)).toBeDisabled();
  });

  it("shows the User's Profile photo from Clerk", async () => {
    fakeClerk.setUser({ imageUrl: "https://img.clerk.com/tony.jpg" });
    backend.seedProfile(FAKE_USER_ID);
    await mount();

    expect(screen.getByLabelText("Profile Photo")).toBeTruthy();
    expect(screen.getByTestId("edit-profile-photo").props.source).toEqual({
      uri: "https://img.clerk.com/tony.jpg",
    });
  });

  it("shows Clerk's default picture for a User without a photo", async () => {
    backend.seedProfile(FAKE_USER_ID);
    await mount();

    expect(screen.getByTestId("edit-profile-photo").props.source).toEqual({
      uri: DEFAULT_IMAGE_URL,
    });
  });

  it("shows a Profile with a system the app doesn't know in metric units, as the API answers it", async () => {
    backend.seedProfile(FAKE_USER_ID, {
      height: 180.5,
      measurement_system: "imperial",
      weight: 82.5,
    });
    await mount();

    expect(queryClient.getQueryData(["profile"])).toMatchObject({
      measurement_system: "imperial",
      units: { height: "cm", weight: "kg" },
    });

    for (const text of ["82.5 kg", "180.5 cm"]) {
      expect(screen.getByText(text)).toBeTruthy();
    }
  });

  it("shows its error state when the Profile can't be read, and reads it again on Try Again", async () => {
    backend.seedProfile(FAKE_USER_ID, { age: 32 });
    fakePublicApi.failNext(PROFILE_GET, { status: 503 });
    await mount();

    expect(screen.getByText(LOAD_ERROR)).toBeTruthy();
    expect(screen.queryByTestId("edit-profile-save-button")).toBeNull();

    await fireEvent.press(screen.getByText("Try Again"));
    await settle(queryClient);

    expect(screen.queryByText(LOAD_ERROR)).toBeNull();
    expect(screen.getByText("32 y.o.")).toBeTruthy();
    expect(fakePublicApi.count(PROFILE_GET)).toBe(2);
  });

  it("says how long to wait when reading the Profile was rate limited", async () => {
    backend.seedProfile(FAKE_USER_ID);
    fakePublicApi.failNext(PROFILE_GET, { retryAfterSeconds: 42, status: 429 });
    await mount();

    expect(
      screen.getByText("Too many requests: please try again in 42 s.")
    ).toBeTruthy();
    expect(screen.getByText("Try Again")).toBeTruthy();
    expect(screen.queryByTestId("edit-profile-save-button")).toBeNull();
  });

  it("keeps the cached Profile on screen when reading it again fails", async () => {
    backend.seedProfile(FAKE_USER_ID, { age: 32 });
    await mount();
    fakePublicApi.failNext(PROFILE_GET, "network");

    await queryClient.refetchQueries({ queryKey: ["profile"] });
    await settle(queryClient);

    expect(fakePublicApi.count(PROFILE_GET)).toBe(2);
    expect(screen.queryByText(LOAD_ERROR)).toBeNull();
    expect(screen.getByText("32 y.o.")).toBeTruthy();
    expect(screen.getByTestId("edit-profile-save-button")).toBeTruthy();
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

    expect(writes()).toEqual([
      {
        authorization: `Bearer ${FAKE_SESSION_TOKEN}`,
        body: { age: 31, gender: "male" },
        path: "/v1/profile",
        query: {},
        route: PROFILE_PATCH,
      },
    ]);
    expect(backend.profile(FAKE_USER_ID)).toMatchObject({
      age: 31,
      gender: "male",
      height: 170,
      weight: 60,
    });
    // The answer shows as the Profile, with no second read.
    expect(fakePublicApi.count(PROFILE_GET)).toBe(1);
    expect(queryClient.getQueryData(["profile"])).toEqual({
      age: 31,
      gender: "male",
      height: 170,
      measurement_system: "metric",
      units: { height: "cm", weight: "kg" },
      weight: 60,
    });
    expect(nameUpdates()).toEqual([]);
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it("never shows a save's late answer to the next User who signs in", async () => {
    backend.seedProfile(FAKE_USER_ID, { age: 30, gender: "female" });
    await mount();
    const resumeSave = fakePublicApi.pause(PROFILE_PATCH);
    await pick("Age", 31);
    await fireEvent.press(screen.getByTestId("edit-profile-save-button"));
    await until(() => fakePublicApi.count(PROFILE_PATCH) === 1);
    // Clearing the cache drops the save from it, not its callbacks.
    const [saving] = queryClient.getMutationCache().getAll();

    // Signed out before the answer (AuthSync clears the cache), and another
    // User signs in, whose Profile read is on its way.
    await screen.unmount();
    queryClient.clear();
    signInAs("user_next");
    const resumeRead = fakePublicApi.pause(PROFILE_GET);

    const nextUsersRead = queryClient.fetchQuery(
      useProfileQuery.getFetchOptions()
    );

    await until(() => fakePublicApi.count(PROFILE_GET) === 2);

    resumeSave();
    await until(() => saving?.state.status === "success");
    // The previous User's answer isn't shown to the next one.
    expect(queryClient.getQueryData(useProfileQuery.getKey())).toBeUndefined();

    // The one fake account stands for the next User's here.
    backend.profiles = [];
    backend.seedProfile(FAKE_USER_ID, { age: 45, gender: "male" });
    resumeRead();
    // Their read isn't cancelled: it answers their own Profile.
    await expect(nextUsersRead).resolves.toMatchObject({
      age: 45,
      gender: "male",
    });
    expect(queryClient.getQueryData(useProfileQuery.getKey())).toMatchObject({
      age: 45,
    });
  });

  /**
   * Saves an Age and a new name with Clerk holding the name, so the Profile's
   * answer waits; the clock stands still from then on, so whatever lands
   * meanwhile lands in the same millisecond as the save started.
   */
  const saveWithNameHeld = async () => {
    backend.seedProfile(FAKE_USER_ID, { age: 30, height: 170, weight: 60 });
    await mount();
    const clock = jest.spyOn(Date, "now").mockReturnValue(Date.now());
    const releaseName = fakeClerk.holdNext("update");

    await fireEvent.changeText(screen.getByTestId(LAST_NAME), "Edward Stark");
    await pick("Age", 31);
    await fireEvent.press(screen.getByTestId(SAVE));
    await until(() => nameUpdates().length === 1);
    const [saving] = queryClient.getMutationCache().getAll();

    return {
      finish: async () => {
        releaseName();
        await until(() => saving?.state.status === "success");
        await settle(queryClient);
        clock.mockRestore();
      },
    };
  };

  it("reads the Profile again when a read landed while the name was still saving", async () => {
    const { finish } = await saveWithNameHeld();
    // Another device changes the weight, and a refresh reads it.
    const saved = backend.profile(FAKE_USER_ID);

    if (saved) {
      saved.weight = 65;
    }

    await act(() =>
      queryClient.refetchQueries({ queryKey: useProfileQuery.getKey() })
    );
    const reads = fakePublicApi.count(PROFILE_GET);

    await finish();

    // The edit's answer (weight 60) is older than what landed: read again.
    expect(fakePublicApi.count(PROFILE_GET)).toBe(reads + 1);
    expect(queryClient.getQueryData(useProfileQuery.getKey())).toMatchObject({
      age: 31,
      weight: 65,
    });
  });

  it("reads the Profile again when a read of the original Profile landed while the name was still saving", async () => {
    const { finish } = await saveWithNameHeld();
    const before = queryClient.getQueryData(useProfileQuery.getKey());
    // Another device puts the age back to 30, and a refresh reads it: the
    // Profile it reads is deep-equal to the one shown before the save, so
    // react-query keeps that very object.
    const saved = backend.profile(FAKE_USER_ID);

    if (saved) {
      saved.age = 30;
    }

    await act(() =>
      queryClient.refetchQueries({ queryKey: useProfileQuery.getKey() })
    );
    expect(queryClient.getQueryData(useProfileQuery.getKey())).toBe(before);
    const reads = fakePublicApi.count(PROFILE_GET);

    await finish();

    // The edit's answer (age 31) is older than the read: read again.
    expect(fakePublicApi.count(PROFILE_GET)).toBe(reads + 1);
    expect(queryClient.getQueryData(useProfileQuery.getKey())).toMatchObject({
      age: 30,
    });
  });

  it("keeps a unit switch that finished while the name was still saving", async () => {
    const { finish } = await saveWithNameHeld();
    // Meanwhile the measurement system screen switches to US units, and shows
    // the converted Profile from its answer.
    await act(async () => {
      const switchStarter = rememberProfileWrite(undefined, {
        client: queryClient,
      });

      const converted =
        await useUpdateMeasurementSystemMutation.mutationFn("us");

      await seedProfile(queryClient, converted, switchStarter);
    });
    const reads = fakePublicApi.count(PROFILE_GET);

    await finish();

    // The edit's older answer doesn't replace the converted Profile: it's
    // read again instead.
    expect(fakePublicApi.count(PROFILE_GET)).toBe(reads + 1);
    expect(queryClient.getQueryData(useProfileQuery.getKey())).toEqual({
      age: 31,
      gender: "female",
      height: 66.93,
      measurement_system: "us",
      units: { height: "in", weight: "lbs" },
      weight: 132.28,
    });
  });

  it("never writes the form's name onto the next User who signs in", async () => {
    backend.seedProfile(FAKE_USER_ID);
    await mount();
    const resumeSave = fakePublicApi.pause(PROFILE_PATCH);
    await fireEvent.changeText(screen.getByTestId(LAST_NAME), "Edward Stark");
    await pick("Age", 31);
    await fireEvent.press(screen.getByTestId(SAVE));
    await until(() => fakePublicApi.count(PROFILE_PATCH) === 1);
    const [saving] = queryClient.getMutationCache().getAll();

    // Signed out while the Profile saves, and another User signs in.
    await screen.unmount();
    queryClient.clear();
    signInAs("user_next");

    resumeSave();
    await until(() => saving?.state.status === "success");

    // Neither the User who submitted the form nor the next one gets it.
    expect(nameUpdates()).toEqual([]);
  });

  it("keeps an unchanged stored value out of the request", async () => {
    // A converted weight with decimals stays as stored.
    backend.seedProfile(FAKE_USER_ID, { height: 70.87, weight: 176.37 });
    await mount();

    await pick("Age", 40);
    await save();

    expect(writes().map(({ body }) => body)).toEqual([{ age: 40 }]);
    expect(backend.profile(FAKE_USER_ID)).toMatchObject({
      age: 40,
      height: 70.87,
      weight: 176.37,
    });
  });

  it("saves the first and last name to Clerk as they are, with no Profile request", async () => {
    backend.seedProfile(FAKE_USER_ID);
    await mount();

    await fireEvent.changeText(screen.getByTestId(FIRST_NAME), " Mary Jane ");
    await fireEvent.changeText(screen.getByTestId(LAST_NAME), "Watson Parker");
    await save();

    expect(writes()).toEqual([]);
    // No splitting: each field is Clerk's own, trimmed.
    expect(nameUpdates()).toEqual([
      { firstName: "Mary Jane", lastName: "Watson Parker" },
    ]);
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it("keeps Save disabled until something changes", async () => {
    backend.seedProfile(FAKE_USER_ID, { gender: "female" });
    await mount();

    expect(screen.getByTestId(SAVE)).toBeDisabled();

    await fireEvent.changeText(screen.getByTestId(FIRST_NAME), "Pepper");
    expect(screen.getByTestId(SAVE)).toBeEnabled();

    // Back to what was saved: nothing to save again.
    await fireEvent.changeText(screen.getByTestId(FIRST_NAME), "Tony");
    expect(screen.getByTestId(SAVE)).toBeDisabled();

    await fireEvent.press(screen.getByLabelText("Male"));
    expect(screen.getByTestId(SAVE)).toBeEnabled();

    await save();
    expect(writes().map(({ body }) => body)).toEqual([{ gender: "male" }]);
    expect(nameUpdates()).toEqual([]);
  });

  it("refuses to clear a name the User has", async () => {
    backend.seedProfile(FAKE_USER_ID);
    await mount();

    await fireEvent.changeText(screen.getByTestId(FIRST_NAME), "  ");
    await fireEvent.changeText(screen.getByTestId(LAST_NAME), "");
    await save();

    expect(screen.getByText("First name is required")).toBeTruthy();
    expect(screen.getByText("Last name is required")).toBeTruthy();
    expect(writes()).toEqual([]);
    expect(nameUpdates()).toEqual([]);
    expect(router.back).not.toHaveBeenCalled();
  });

  it("lets a User whose name Clerk never had save the rest", async () => {
    // Registration keeps a one-word name as the first name alone.
    fakeClerk.setUser({ firstName: "Pepper", lastName: null });
    backend.seedProfile(FAKE_USER_ID, { age: 30 });
    await mount();

    expect(screen.getByTestId(LAST_NAME)).toHaveDisplayValue("");

    await pick("Age", 31);
    await save();

    expect(writes().map(({ body }) => body)).toEqual([{ age: 31 }]);
    expect(nameUpdates()).toEqual([]);
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it("keeps the edits and shows the error when Clerk refuses the name", async () => {
    backend.seedProfile(FAKE_USER_ID);
    await mount();
    fakeClerk.failNext("update", "network");

    await fireEvent.changeText(screen.getByTestId(FIRST_NAME), "Pepper");
    await save();

    expect(screen.getByText(SAVE_ERROR)).toBeTruthy();
    expect(screen.getByTestId(FIRST_NAME)).toHaveDisplayValue("Pepper");
    expect(router.back).not.toHaveBeenCalled();
  });

  it("creates the Profile through the Public API without a saved one", async () => {
    await mount();
    // `GET /v1/profile` answered `{ data: null }`: an empty form.
    expect(screen.getAllByText("Not Set")).toHaveLength(3);

    await fireEvent.press(screen.getByLabelText("Female"));
    await pick("Age", 28);
    await pick("Weight", 62);
    await pick("Height", 168);
    await save();

    expect(writes()).toEqual([
      {
        authorization: `Bearer ${FAKE_SESSION_TOKEN}`,
        body: {
          age: 28,
          gender: "female",
          height: 168,
          measurement_system: "metric",
          weight: 62,
        },
        path: "/v1/profile",
        query: {},
        route: PROFILE_PUT,
      },
    ]);
    expect(backend.profile(FAKE_USER_ID)).toEqual({
      age: 28,
      gender: "female",
      height: 168,
      measurement_system: "metric",
      user_id: FAKE_USER_ID,
      weight: 62,
    });
    // The created Profile shows from the answer, with no second read.
    expect(fakePublicApi.count(PROFILE_GET)).toBe(1);
    expect(queryClient.getQueryData(["profile"])).toMatchObject({
      age: 28,
      measurement_system: "metric",
    });
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["a 5xx", { status: 503 }],
    ["a network failure", "network"],
  ] as const)("shows the error state on %s", async (_name, failure) => {
    backend.seedProfile(FAKE_USER_ID, { age: 30 });
    await mount();
    fakePublicApi.failNext(PROFILE_PATCH, failure);

    await pick("Age", 31);
    await save();

    expect(screen.getByText(SAVE_ERROR)).toBeTruthy();
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    expect(backend.profile(FAKE_USER_ID)?.age).toBe(30);
    // The save may have landed without an answer, so the Profile is read
    // again.
    expect(fakePublicApi.count(PROFILE_GET)).toBe(2);
    expect(router.back).not.toHaveBeenCalled();
  });

  it("shows the error state when creating the Profile fails", async () => {
    await mount();
    fakePublicApi.failNext(PROFILE_PUT, { status: 503 });

    await fireEvent.press(screen.getByLabelText("Female"));
    await pick("Age", 28);
    await pick("Weight", 62);
    await pick("Height", 168);
    await save();

    expect(screen.getByText(SAVE_ERROR)).toBeTruthy();
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    expect(backend.profile(FAKE_USER_ID)).toBeUndefined();
    expect(router.back).not.toHaveBeenCalled();
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

    expect(writes().map(({ body }) => body)).toEqual([{ gender: "male" }]);
    expect(backend.profile(FAKE_USER_ID)).toMatchObject({
      age: 4,
      gender: "male",
    });
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it("only offers values inside the shared bounds", async () => {
    backend.seedProfile(FAKE_USER_ID);
    await mount();

    await fireEvent.press(screen.getByRole("button", { name: "Age" }));

    expect(screen.queryByTestId("wheel-9")).toBeNull();
    expect(screen.getByTestId("wheel-10")).toBeTruthy();
    expect(screen.getByTestId("wheel-120")).toBeTruthy();
    expect(screen.queryByTestId("wheel-121")).toBeNull();
  });
});

describe("editProfileScreen on a Ukrainian device", () => {
  beforeEach(() => {
    setDeviceLanguages(["uk-UA"]);
    jest.clearAllMocks();
    fakeClerk.setUser({ firstName: "Тарас", lastName: "Шевченко" });
    backend.reset();
  });

  afterEach(async () => {
    // The next English test renders without the sync.
    await i18n.changeLanguage("en");
  });

  const mountInUkrainian = async () => {
    queryClient = createTestQueryClient();
    await render(
      <QueryClientProvider client={queryClient}>
        <InAppLanguage>
          <EditProfileScreen />
        </InAppLanguage>
      </QueryClientProvider>
    );
    await settle(queryClient);
  };

  it("shows the Profile's values with their units", async () => {
    backend.seedProfile(FAKE_USER_ID, {
      age: 32,
      gender: "female",
      height: 170.5,
      measurement_system: "metric",
      weight: 62.5,
    });
    await mountInUkrainian();

    for (const text of [
      "Стать",
      "32 роки",
      "62,5 кг",
      "170,5 см",
      "Зберегти",
    ]) {
      expect(screen.getByText(text)).toBeTruthy();
    }

    // Each field carries its own name for VoiceOver; the label above it is
    // only seen.
    expect(screen.getByLabelText("Ім’я")).toHaveDisplayValue("Тарас");
    expect(screen.getByLabelText("Прізвище")).toHaveDisplayValue("Шевченко");

    for (const name of ["Вік", "Вага", "Зріст"]) {
      expect(screen.getByRole("button", { name })).toBeTruthy();
      expect(
        screen.getByText(name, { includeHiddenElements: true })
      ).toBeTruthy();
    }

    expect(screen.getByLabelText("Жінка")).toBeTruthy();
    expect(screen.getByLabelText("Фото профілю")).toBeTruthy();
    expect(screen.getByTestId(FIRST_NAME)).toHaveDisplayValue("Тарас");
    expect(screen.getByTestId(LAST_NAME)).toHaveDisplayValue("Шевченко");
    expect(screen.getByTestId(SAVE)).toBeDisabled();
  });

  it("saves both names to Clerk", async () => {
    backend.seedProfile(FAKE_USER_ID);
    await mountInUkrainian();

    await fireEvent.changeText(screen.getByTestId(FIRST_NAME), "Леся");
    await fireEvent.changeText(screen.getByTestId(LAST_NAME), "Українка");
    await save();

    expect(nameUpdates()).toEqual([
      { firstName: "Леся", lastName: "Українка" },
    ]);
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it("names a cleared name in Ukrainian and writes nothing", async () => {
    backend.seedProfile(FAKE_USER_ID);
    await mountInUkrainian();

    await fireEvent.changeText(screen.getByTestId(FIRST_NAME), "");
    await fireEvent.changeText(screen.getByTestId(LAST_NAME), "");
    await save();

    expect(screen.getByText("Вкажіть ім’я")).toBeTruthy();
    expect(screen.getByText("Вкажіть прізвище")).toBeTruthy();
    expect(nameUpdates()).toEqual([]);
  });

  it("names a missing value in Ukrainian and writes nothing", async () => {
    await mountInUkrainian();

    expect(screen.getAllByText("Не вказано")).toHaveLength(3);
    // Save stays off until something changes.
    expect(screen.getByTestId(SAVE)).toBeDisabled();
    await fireEvent.changeText(screen.getByTestId(FIRST_NAME), "Тарас Г.");
    await save();

    for (const text of [
      "Вкажіть стать",
      "Вкажіть вік",
      "Вкажіть вагу",
      "Вкажіть зріст",
    ]) {
      expect(screen.getByText(text)).toBeTruthy();
    }

    expect(writes()).toEqual([]);
  });

  it("says in Ukrainian how long to wait when there were too many requests", async () => {
    backend.seedProfile(FAKE_USER_ID);
    await mountInUkrainian();
    fakePublicApi.failNext(PROFILE_PATCH, {
      retryAfterSeconds: 42,
      status: 429,
    });

    await pick("Вік", 31);
    await save();

    expect(
      screen.getByText(
        "Не вдалося зберегти профіль. Забагато запитів: спробуйте ще раз через 42 с."
      )
    ).toBeTruthy();
    expect(router.back).not.toHaveBeenCalled();
  });
});
