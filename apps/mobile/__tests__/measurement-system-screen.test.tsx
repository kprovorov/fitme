import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import { useCallback } from "react";
import { Alert, Pressable, Text } from "react-native";
import MeasurementSystemScreen from "~/app/settings/measurement-system";

const mockConvert = jest.fn<(system: string) => Promise<void>>();
const mockFetchProfile = jest.fn<() => Promise<unknown>>();

jest.mock("expo-router", () => ({ Stack: { Screen: () => null } }));

jest.mock("@sentry/react-native", () => ({ captureException: jest.fn() }));

// Keeps the real react-query wiring, swapping only the network calls.
jest.mock("~/hooks/queries/profiles", () => {
  const { createQuery } =
    jest.requireActual<typeof import("react-query-kit")>("react-query-kit");
  return {
    useProfileQuery: createQuery({
      fetcher: () => mockFetchProfile(),
      queryKey: ["profile"],
    }),
  };
});

jest.mock("~/hooks/queries/settings", () => {
  const { createMutation } =
    jest.requireActual<typeof import("react-query-kit")>("react-query-kit");
  return {
    useUpdateMeasurementSystemMutation: createMutation({
      mutationFn: (system: string) => mockConvert(system),
    }),
  };
});

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

const profile = (measurementSystem: string) => ({
  measurement_system: measurementSystem,
});

const deferred = () => {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, reject, resolve };
};

const setup = async () => {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  await render(
    <QueryClientProvider client={queryClient}>
      <MeasurementSystemScreen />
    </QueryClientProvider>
  );
  await waitFor(() =>
    expect(screen.getByTestId("picker-value")).toHaveTextContent("metric")
  );
};

const shown = () => screen.getByTestId("picker-value");

describe("MeasurementSystemScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetchProfile.mockResolvedValue(profile("metric"));
    jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
  });

  it("goes back to the saved system after Cancel, and the option can be picked again", async () => {
    await setup();

    await fireEvent.press(screen.getByTestId("option-us"));
    expect(shown()).toHaveTextContent("us");
    expect(screen.getByTestId("confirm-dialog")).toBeTruthy();

    await fireEvent.press(screen.getByText("Cancel"));
    expect(shown()).toHaveTextContent("metric");
    expect(screen.queryByTestId("confirm-dialog")).toBeNull();
    expect(mockConvert).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId("option-us"));
    expect(screen.getByTestId("confirm-dialog")).toBeTruthy();
  });

  it("does nothing when the saved system is picked", async () => {
    await setup();

    await fireEvent.press(screen.getByTestId("option-metric"));

    expect(screen.queryByTestId("confirm-dialog")).toBeNull();
    expect(shown()).toHaveTextContent("metric");
    expect(mockConvert).not.toHaveBeenCalled();
  });

  it("keeps the new system shown while switching and after it's saved", async () => {
    const convert = deferred();
    mockConvert.mockReturnValue(convert.promise);
    await setup();

    await fireEvent.press(screen.getByTestId("option-us"));
    await fireEvent.press(screen.getByText("Confirm"));

    expect(mockConvert).toHaveBeenCalledWith("us");
    expect(shown()).toHaveTextContent("us");
    expect(screen.getByTestId("picker")).toBeDisabled();

    mockFetchProfile.mockResolvedValue(profile("us"));
    await act(async () => {
      convert.resolve();
      await convert.promise;
    });

    await waitFor(() =>
      expect(screen.getByTestId("picker")).not.toBeDisabled()
    );
    expect(shown()).toHaveTextContent("us");
    expect(mockFetchProfile).toHaveBeenCalledTimes(2);
  });

  it("ignores picks while a switch is in flight", async () => {
    const convert = deferred();
    mockConvert.mockReturnValue(convert.promise);
    await setup();

    await fireEvent.press(screen.getByTestId("option-us"));
    await fireEvent.press(screen.getByText("Confirm"));
    await fireEvent.press(screen.getByTestId("option-uk"));

    expect(screen.queryByTestId("confirm-dialog")).toBeNull();
    expect(shown()).toHaveTextContent("us");

    await act(async () => {
      convert.resolve();
      await convert.promise;
    });
  });

  it("shows an error and the saved system when the switch fails", async () => {
    mockConvert.mockRejectedValue(new Error("numeric field overflow"));
    await setup();

    await fireEvent.press(screen.getByTestId("option-us"));
    await fireEvent.press(screen.getByText("Confirm"));

    await waitFor(() => expect(Alert.alert).toHaveBeenCalledTimes(1));
    const [title, message] = (Alert.alert as jest.Mock).mock.calls[0] as [
      string,
      string,
    ];
    expect(title).toBe("Couldn't Change Units");
    expect(message).not.toContain("numeric");
    await waitFor(() =>
      expect(screen.getByTestId("picker")).not.toBeDisabled()
    );
    expect(shown()).toHaveTextContent("metric");

    await fireEvent.press(screen.getByTestId("option-us"));
    expect(screen.getByTestId("confirm-dialog")).toBeTruthy();
  });
});
