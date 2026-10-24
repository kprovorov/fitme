/**
 * The measurement system screen on the mounted-screen seam: the real screen,
 * hooks and Public API client, with Supabase swapped for the in-memory backend
 * and the client's `fetch` for the fake Public API over the same rows (both
 * from `test-utils/`), and the SwiftUI-backed primitives for stand-ins.
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import * as Sentry from "@sentry/react-native";
import { QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { useCallback } from "react";
import { Alert, Pressable, Text } from "react-native";
import MeasurementSystemScreen from "~/app/settings/measurement-system";
import {
  FAKE_SESSION_TOKEN,
  FAKE_USER_ID,
  fakePublicApi,
} from "~/test-utils/fake-public-api";
import { backend } from "~/test-utils/fake-workout-backend";
import {
  createTestQueryClient,
  settle,
  until,
} from "~/test-utils/query-client";

jest.mock("expo-router", () => ({ Stack: { Screen: () => null } }));

jest.mock("@sentry/react-native", () => ({ captureException: jest.fn() }));

jest.mock("~/lib/supabase", () => ({
  supabase: jest.requireActual<
    typeof import("~/test-utils/fake-workout-backend")
  >("~/test-utils/fake-workout-backend").fakeSupabase,
}));

jest.mock("~/lib/clerk", () => ({
  getCurrentUserId: () =>
    jest.requireActual<typeof import("~/test-utils/fake-public-api")>(
      "~/test-utils/fake-public-api"
    ).FAKE_USER_ID,
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

const PROFILE_PATCH = "PATCH /v1/profile";

const alerts = () =>
  (Alert.alert as jest.Mock).mock.calls as [string, string][];

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
    jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
  });

  it("switches through the Public API, converting every height and weight", async () => {
    await mount();
    expect(shown()).toHaveTextContent("metric");

    await switchTo("us");

    expect(fakePublicApi.requests).toEqual([
      {
        authorization: `Bearer ${FAKE_SESSION_TOKEN}`,
        body: { measurement_system: "us" },
        path: "/v1/profile",
        route: PROFILE_PATCH,
      },
    ]);
    expect(backend.count("convert_measurement_system", "rpc")).toBe(0);
    expect(backend.profile(FAKE_USER_ID)).toMatchObject({
      height: 70.87,
      measurement_system: "us",
      weight: 176.37,
    });
    expect(backend.sets[0]?.weight_completed).toBe(220.46);
    // The Profile is read again, and the picker shows what it says.
    expect(backend.count("profiles", "select")).toBe(2);
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
    expect(fakePublicApi.requests).toEqual([]);
  });

  it("does nothing when the saved system is picked", async () => {
    await mount();

    await fireEvent.press(screen.getByTestId("option-metric"));

    expect(screen.queryByTestId("confirm-dialog")).toBeNull();
    expect(shown()).toHaveTextContent("metric");
    expect(fakePublicApi.requests).toEqual([]);
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
      expect(shown()).toHaveTextContent("metric");
      expect(screen.getByTestId("picker")).not.toBeDisabled();
      expect(backend.count("convert_measurement_system", "rpc")).toBe(0);

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

  it("fails with the error state, never through Supabase, when the API URL is unset", async () => {
    await mount();
    fakePublicApi.baseUrl = "";

    await switchTo("us");

    expect(alerts().map(([title]) => title)).toEqual(["Couldn't Change Units"]);
    expect(fakePublicApi.requests).toEqual([]);
    expect(backend.count("convert_measurement_system", "rpc")).toBe(0);
    expect(backend.profile(FAKE_USER_ID)?.measurement_system).toBe("metric");
    expect(shown()).toHaveTextContent("metric");
  });

  it("shows no error when the answer is lost but the switch went through", async () => {
    await mount();
    fakePublicApi.failNext(PROFILE_PATCH, "lost");

    await switchTo("us");

    expect(backend.profile(FAKE_USER_ID)?.measurement_system).toBe("us");
    expect(shown()).toHaveTextContent("us");
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it("says it couldn't check when the switch succeeds but the Profile can't be read", async () => {
    await mount();
    // Offline: the read after the switch fails, and so does the one the
    // dropped Profile starts.
    backend.failNext("profiles", "select");
    backend.failNext("profiles", "select");

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
    const resume = backend.pause("profiles", "select");
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
    backend.failNext("profiles", "select");
    await mount();

    await fireEvent.press(screen.getByText("Try Again"));
    await settle(queryClient);

    expect(shown()).toHaveTextContent("metric");
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

    expect(backend.count("profiles", "select")).toBe(2);
    expect(Alert.alert).not.toHaveBeenCalled();
  });
});
