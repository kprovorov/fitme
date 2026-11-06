/**
 * The measurement system screen on the mounted-screen seam: the real screen,
 * hooks and Public API client, with the client's `fetch` swapped for the fake
 * Public API (`test-utils/`), and the SwiftUI-backed primitives for stand-ins.
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
import { fireEvent, render, screen } from "@testing-library/react-native";
import { useCallback } from "react";
import { Alert, Pressable, Text } from "react-native";

import MeasurementSystemScreen from "~/app/settings/measurement-system";
import { useProfileQuery } from "~/hooks/queries/profiles";
import { i18n } from "~/lib/i18n";
import { setDeviceLanguages } from "~/test-utils/device-locales";
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
  Stack: { Screen: () => null },
}));

jest.mock("@sentry/react-native", () => ({ captureException: jest.fn() }));

// Reached through the queries the switch reads again; its real client's
// `uuid` is ESM, which Jest can't require.
jest.mock("~/lib/segment", () => ({
  segmentClient: { track: jest.fn() },
}));

jest.mock("~/lib/clerk", () => ({
  getCurrentUserId: jest.requireActual<
    typeof import("~/test-utils/signed-in-user")
  >("~/test-utils/signed-in-user").getCurrentUserId,
}));

// Buttons of the stand-ins below. Top-level (and `mock`-prefixed, so the
// factories may use them) because the React Compiler rewrites components
// declared inside a `jest.mock` factory into code the factory can't reach.
const MockOption = ({
  label,
  onValueChange,
  value,
}: {
  label: string;
  onValueChange: (value: string) => void;
  value: string;
}) => {
  const handlePress = useCallback(
    () => onValueChange(value),
    [onValueChange, value]
  );

  return (
    <Pressable onPress={handlePress} testID={`option-${value}`}>
      <Text>{label}</Text>
    </Pressable>
  );
};

// Like the native alert: any button runs its action, then closes.
const MockAction = ({
  label,
  onIsPresentedChange,
  onPress,
}: {
  label: string;
  onIsPresentedChange: (isPresented: boolean) => void;
  onPress?: () => void;
}) => {
  const handlePress = useCallback(() => {
    onPress?.();
    onIsPresentedChange(false);
  }, [onIsPresentedChange, onPress]);

  return (
    <Pressable onPress={handlePress}>
      <Text>{label}</Text>
    </Pressable>
  );
};

// Like a native button.
const MockButton = ({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) => (
  <Pressable accessibilityRole="button" onPress={onPress}>
    <Text>{label}</Text>
  </Pressable>
);

// The real primitives render native SwiftUI views that can't mount under
// Jest, so they're swapped for plain React Native stand-ins. The picker
// stand-in exposes the `value` it's given, which is what the native picker
// shows, and fires `onValueChange` like a tap on an option does.
jest.mock("~/components/ui/radio-group", () => {
  const { Text: MockText, View: MockView } =
    jest.requireActual<typeof import("react-native")>("react-native");

  return {
    RadioGroup: ({
      disabled,
      footer,
      onValueChange,
      options,
      value,
    }: {
      disabled?: boolean;
      footer?: string;
      onValueChange: (value: string) => void;
      options: { label: string; value: string }[];
      value: string;
    }) => (
      <MockView accessibilityState={{ disabled: !!disabled }} testID="picker">
        <MockText testID="picker-value">{value}</MockText>
        {options.map((option) => (
          <MockOption
            key={option.value}
            label={option.label}
            onValueChange={onValueChange}
            value={option.value}
          />
        ))}
        <MockText>{footer}</MockText>
      </MockView>
    ),
  };
});

jest.mock("~/components/ui/button", () => ({
  Button: (props: { label: string; onPress: () => void }) => (
    <MockButton {...props} />
  ),
}));

jest.mock("~/components/ui/alert-dialog", () => {
  const { Text: MockText, View: MockView } =
    jest.requireActual<typeof import("react-native")>("react-native");

  return {
    AlertDialog: ({
      actions,
      isPresented,
      onIsPresentedChange,
      title,
    }: {
      actions: { label: string; onPress?: () => void }[];
      isPresented: boolean;
      onIsPresentedChange: (isPresented: boolean) => void;
      title: string;
    }) =>
      isPresented ? (
        <MockView testID="confirm-dialog">
          <MockText>{title}</MockText>
          {actions.map((action) => (
            <MockAction
              key={action.label}
              label={action.label}
              onIsPresentedChange={onIsPresentedChange}
              onPress={action.onPress}
            />
          ))}
        </MockView>
      ) : null,
  };
});

const PROFILE_GET = "GET /v1/profile";
const PROFILE_PATCH = "PATCH /v1/profile";

/** Every request but the Profile's reads. */
const writes = () =>
  fakePublicApi.requests.filter(({ route }) => route !== PROFILE_GET);

const alerts = () => jest.mocked(Alert.alert).mock.calls as [string, string][];

let queryClient = createTestQueryClient();

const mount = async () => {
  queryClient = createTestQueryClient();

  const rendered = await render(
    <QueryClientProvider client={queryClient}>
      <MeasurementSystemScreen />
    </QueryClientProvider>
  );

  await settle(queryClient);

  return rendered;
};

const shown = () => screen.getByTestId("picker-value");

/** Picks `system` and confirms it, then waits for the switch to settle. */
const switchTo = async (system: string) => {
  await fireEvent.press(screen.getByTestId(`option-${system}`));
  await fireEvent.press(screen.getByText("Confirm"));
  await settle(queryClient);
};

describe("MeasurementSystemScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    backend.reset();
    backend.seedProfile(FAKE_USER_ID, { height: 180, weight: 80 });
    backend.seed({ exercises: [{ name: "Squat", sets: [5] }], id: "session" });

    for (const set of backend.sets) {
      set.weight_completed = 100;
    }

    jest.spyOn(Alert, "alert").mockReturnValue(undefined);
  });

  it("switches through the Public API, converting every height and weight", async () => {
    await mount();
    expect(shown()).toHaveTextContent("metric");

    await switchTo("us");

    expect(writes()).toEqual([
      {
        authorization: `Bearer ${FAKE_SESSION_TOKEN}`,
        body: { measurement_system: "us" },
        path: "/v1/profile",
        query: {},
        route: PROFILE_PATCH,
      },
    ]);
    expect(backend.profile(FAKE_USER_ID)).toMatchObject({
      height: 70.87,
      measurement_system: "us",
      weight: 176.37,
    });
    expect(backend.sets[0]?.weight_completed).toBe(220.46);
    // The answer shows as the Profile, with no second read.
    expect(fakePublicApi.count(PROFILE_GET)).toBe(1);
    expect(shown()).toHaveTextContent("us");
    expect(screen.getByTestId("picker")).not.toBeDisabled();
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it("keeps the new system shown and the picker disabled while switching", async () => {
    await mount();
    const resume = fakePublicApi.pause(PROFILE_PATCH);

    await fireEvent.press(screen.getByTestId("option-us"));
    await fireEvent.press(screen.getByText("Confirm"));
    await until(() => fakePublicApi.count(PROFILE_PATCH) === 1);

    expect(shown()).toHaveTextContent("us");
    expect(screen.getByTestId("picker")).toBeDisabled();
    // Picks are ignored until it's done.
    await fireEvent.press(screen.getByTestId("option-uk"));
    expect(screen.queryByTestId("confirm-dialog")).toBeNull();
    expect(shown()).toHaveTextContent("us");

    resume();
    await settle(queryClient);
    expect(shown()).toHaveTextContent("us");
    expect(screen.getByTestId("picker")).not.toBeDisabled();
  });

  it("goes back to the saved system after Cancel, and the option can be picked again", async () => {
    await mount();

    await fireEvent.press(screen.getByTestId("option-us"));
    expect(shown()).toHaveTextContent("us");
    expect(screen.getByTestId("confirm-dialog")).toBeTruthy();

    await fireEvent.press(screen.getByText("Cancel"));
    expect(shown()).toHaveTextContent("metric");
    expect(screen.queryByTestId("confirm-dialog")).toBeNull();

    await fireEvent.press(screen.getByTestId("option-us"));
    expect(screen.getByTestId("confirm-dialog")).toBeTruthy();
    expect(writes()).toEqual([]);
  });

  it("does nothing when the saved system is picked", async () => {
    await mount();

    await fireEvent.press(screen.getByTestId("option-metric"));

    expect(screen.queryByTestId("confirm-dialog")).toBeNull();
    expect(shown()).toHaveTextContent("metric");
    expect(writes()).toEqual([]);
  });

  it.each([
    ["a 5xx", { status: 503 }],
    ["a network failure", "network"],
  ] as const)(
    "shows an error and the saved system on %s",
    async (_name, failure) => {
      await mount();
      fakePublicApi.failNext(PROFILE_PATCH, failure);

      await switchTo("us");

      expect(alerts()).toEqual([
        [
          "Couldn't Change Units",
          "Your measurements weren't changed. Please try again.",
        ],
      ]);
      expect(Sentry.captureException).toHaveBeenCalledTimes(1);
      expect(backend.profile(FAKE_USER_ID)).toMatchObject({
        height: 180,
        measurement_system: "metric",
      });
      // No answer: the Profile is read again to learn what was saved.
      expect(fakePublicApi.count(PROFILE_GET)).toBe(2);
      expect(shown()).toHaveTextContent("metric");
      expect(screen.getByTestId("picker")).not.toBeDisabled();

      await fireEvent.press(screen.getByTestId("option-us"));
      expect(screen.getByTestId("confirm-dialog")).toBeTruthy();
    }
  );

  it("says how long to wait when there were too many requests", async () => {
    await mount();
    fakePublicApi.failNext(PROFILE_PATCH, {
      retryAfterSeconds: 42,
      status: 429,
    });

    await switchTo("us");

    expect(alerts()).toEqual([
      [
        "Couldn't Change Units",
        "Your measurements weren't changed. Too many requests: please try again in 42 s.",
      ],
    ]);
    expect(Sentry.captureException).not.toHaveBeenCalled();
    expect(shown()).toHaveTextContent("metric");
  });

  it("fails with the error state when the API URL is unset", async () => {
    await mount();
    fakePublicApi.baseUrl = "";

    await switchTo("us");

    // Neither the switch nor the Profile's read back can be sent.
    expect(alerts().map(([title]) => title)).toEqual([
      "Couldn't Check Your Units",
    ]);
    expect(writes()).toEqual([]);
    expect(fakePublicApi.count(PROFILE_GET)).toBe(1);
    expect(backend.profile(FAKE_USER_ID)?.measurement_system).toBe("metric");
    expect(screen.getByText("Try Again")).toBeTruthy();
  });

  it("shows no error when the answer is lost but the switch went through", async () => {
    await mount();
    fakePublicApi.failNext(PROFILE_PATCH, "lost");

    await switchTo("us");

    expect(backend.profile(FAKE_USER_ID)?.measurement_system).toBe("us");
    expect(shown()).toHaveTextContent("us");
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it("says it couldn't check when the answer is lost and the Profile can't be read", async () => {
    await mount();
    fakePublicApi.failNext(PROFILE_PATCH, "lost");
    // Offline: the read after the switch fails, and so does the one the
    // dropped Profile starts.
    fakePublicApi.failNext(PROFILE_GET, "network");
    fakePublicApi.failNext(PROFILE_GET, "network");

    await switchTo("us");

    expect(alerts().map(([title]) => title)).toEqual([
      "Couldn't Check Your Units",
    ]);
    // The cached Profile may be in the old units, so it's dropped.
    expect(screen.getByText("Try Again")).toBeTruthy();
    expect(screen.queryByTestId("picker")).toBeNull();
  });

  it("shows a loading state until the saved system has loaded", async () => {
    backend.profiles = [];
    backend.seedProfile(FAKE_USER_ID, { measurement_system: "us" });
    const resume = fakePublicApi.pause(PROFILE_GET);
    queryClient = createTestQueryClient();
    await render(
      <QueryClientProvider client={queryClient}>
        <MeasurementSystemScreen />
      </QueryClientProvider>
    );

    expect(screen.getByTestId("measurement-system-loading")).toBeTruthy();
    expect(screen.queryByTestId("picker")).toBeNull();

    resume();
    await settle(queryClient);
    expect(shown()).toHaveTextContent("us");

    await fireEvent.press(screen.getByTestId("option-metric"));
    expect(screen.getByTestId("confirm-dialog")).toBeTruthy();
  });

  it("offers a retry when the saved system can't be loaded", async () => {
    fakePublicApi.failNext(PROFILE_GET, { status: 503 });
    await mount();

    expect(
      screen.getByText(
        "Couldn't load your measurement system. Please check your connection and try again."
      )
    ).toBeTruthy();
    expect(screen.queryByTestId("picker")).toBeNull();

    await fireEvent.press(screen.getByText("Try Again"));
    await settle(queryClient);

    expect(shown()).toHaveTextContent("metric");
  });

  it("says how long to wait when loading the saved system was rate limited", async () => {
    fakePublicApi.failNext(PROFILE_GET, { retryAfterSeconds: 42, status: 429 });
    await mount();

    expect(
      screen.getByText("Too many requests: please try again in 42 s.")
    ).toBeTruthy();
    expect(screen.getByText("Try Again")).toBeTruthy();
    expect(screen.queryByTestId("picker")).toBeNull();
  });

  it("keeps the saved system shown when reading it again fails", async () => {
    await mount();
    fakePublicApi.failNext(PROFILE_GET, { status: 503 });

    await queryClient.refetchQueries({ queryKey: ["profile"] });
    await settle(queryClient);

    expect(fakePublicApi.count(PROFILE_GET)).toBe(2);
    expect(shown()).toHaveTextContent("metric");
    expect(screen.queryByText("Try Again")).toBeNull();
  });

  it("never shows a switch's late answer to the next User who signs in", async () => {
    const { unmount } = await mount();
    const resumeSwitch = fakePublicApi.pause(PROFILE_PATCH);
    await fireEvent.press(screen.getByTestId("option-us"));
    await fireEvent.press(screen.getByText("Confirm"));
    await until(() => fakePublicApi.count(PROFILE_PATCH) === 1);
    // Clearing the cache drops the switch from it, not its callbacks.
    const [switching] = queryClient.getMutationCache().getAll();

    // Signed out before the answer (AuthSync clears the cache), and another
    // User signs in, whose Profile read is on its way.
    await unmount();
    queryClient.clear();
    signInAs("user_next");
    const resumeRead = fakePublicApi.pause(PROFILE_GET);

    const nextUsersRead = queryClient.fetchQuery(
      useProfileQuery.getFetchOptions()
    );

    await until(() => fakePublicApi.count(PROFILE_GET) === 2);

    resumeSwitch();
    await until(() => switching?.state.status === "success");

    // Neither shown nor read again for the next User.
    expect(queryClient.getQueryData(useProfileQuery.getKey())).toBeUndefined();
    expect(fakePublicApi.count(PROFILE_GET)).toBe(2);
    expect(fakePublicApi.count("GET /v1/workout-sessions")).toBe(0);
    // The one fake account stands for the next User's here.
    backend.profiles = [];
    backend.seedProfile(FAKE_USER_ID, { measurement_system: "uk" });
    resumeRead();
    // Their read isn't cancelled.
    await expect(nextUsersRead).resolves.toMatchObject({
      measurement_system: "uk",
    });
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it("leaves the next User's Profile read alone when signing out ends the read back", async () => {
    const { unmount } = await mount();
    // No answer, so the Profile is read back, and that read is held.
    fakePublicApi.failNext(PROFILE_PATCH, "lost");
    const resumeReads = fakePublicApi.pause(PROFILE_GET);
    await fireEvent.press(screen.getByTestId("option-us"));
    await fireEvent.press(screen.getByText("Confirm"));
    await until(() => fakePublicApi.count(PROFILE_GET) === 2);
    const [switching] = queryClient.getMutationCache().getAll();

    // Signing out clears the cache, which ends the read back, and another
    // User signs in, whose Profile read is on its way.
    await unmount();
    queryClient.clear();
    signInAs("user_next");

    const nextUsersRead = queryClient.fetchQuery(
      useProfileQuery.getFetchOptions()
    );

    await until(() => fakePublicApi.count(PROFILE_GET) === 3);
    await until(() => switching?.state.status === "error");

    // The one fake account stands for the next User's here.
    backend.profiles = [];
    backend.seedProfile(FAKE_USER_ID, { measurement_system: "uk" });
    resumeReads();
    // Their read isn't cancelled (no reset of their Profile).
    await expect(nextUsersRead).resolves.toMatchObject({
      measurement_system: "uk",
    });
    expect(queryClient.getQueryData(useProfileQuery.getKey())).toMatchObject({
      measurement_system: "uk",
    });
    expect(fakePublicApi.count("GET /v1/workout-sessions")).toBe(0);
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it("shows no alert when the switch finishes after the Screen is gone", async () => {
    const { unmount } = await mount();
    const resume = fakePublicApi.pause(PROFILE_PATCH);
    fakePublicApi.failNext(PROFILE_PATCH, { status: 500 });

    await fireEvent.press(screen.getByTestId("option-us"));
    await fireEvent.press(screen.getByText("Confirm"));
    await until(() => fakePublicApi.count(PROFILE_PATCH) === 1);
    await unmount();
    resume();
    await settle(queryClient);

    expect(fakePublicApi.count(PROFILE_GET)).toBe(2);
    expect(Alert.alert).not.toHaveBeenCalled();
  });
});

describe("measurementSystemScreen on a Ukrainian device", () => {
  beforeEach(() => {
    setDeviceLanguages(["uk-UA"]);
    jest.clearAllMocks();
    backend.reset();
    backend.seedProfile(FAKE_USER_ID, { height: 180, weight: 80 });
    jest.spyOn(Alert, "alert").mockReturnValue(undefined);
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
          <MeasurementSystemScreen />
        </InAppLanguage>
      </QueryClientProvider>
    );
    await settle(queryClient);
  };

  it("offers the measurement systems in Ukrainian and confirms in Ukrainian", async () => {
    await mountInUkrainian();

    expect(screen.getByText("Метрична")).toBeTruthy();
    expect(screen.getByText("США")).toBeTruthy();
    expect(screen.getByText("Велика Британія")).toBeTruthy();
    expect(screen.getByText("Сантиметри та кілограми")).toBeTruthy();

    await fireEvent.press(screen.getByTestId("option-us"));

    expect(screen.getByText("Ви впевнені?")).toBeTruthy();
    expect(screen.getByText("Скасувати")).toBeTruthy();
    await fireEvent.press(screen.getByText("Підтвердити"));
    await settle(queryClient);

    // The system is the User's choice, apart from the App language.
    expect(backend.profile(FAKE_USER_ID)).toMatchObject({
      measurement_system: "us",
    });
    expect(screen.getByText("Фути, дюйми та фунти")).toBeTruthy();
  });

  it("says in Ukrainian how long to wait when there were too many requests", async () => {
    await mountInUkrainian();
    fakePublicApi.failNext(PROFILE_PATCH, {
      retryAfterSeconds: 42,
      status: 429,
    });

    await fireEvent.press(screen.getByTestId("option-us"));
    await fireEvent.press(screen.getByText("Підтвердити"));
    await settle(queryClient);

    expect(alerts()).toEqual([
      [
        "Не вдалося змінити одиниці",
        "Ваші вимірювання не змінено. Забагато запитів: спробуйте ще раз через 42 с.",
      ],
    ]);
  });
});
