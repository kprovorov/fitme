/**
 * The Arnold screen's own text in the App language: the real screen and chat
 * components, with eve's runtime stood in for (no Arnold to talk to), so a
 * test sets the error eve reports and reads what the User sees. The header's
 * options render as text through the `Stack.Screen` stub.
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { act, render, screen } from "@testing-library/react-native";
import type { ReactNode } from "react";
import ArnoldScreen from "~/app/(tabs)/arnold/index";
import { useAppLanguageSync } from "~/lib/i18n";
import { setDeviceLanguages } from "~/test-utils/device-locales";

const mockEve = {
  error: undefined as Error | undefined,
  reset: jest.fn(),
};
const mockPresentPaywall = jest.fn();

// What the stand-in server errors say: never shown to the User.
const SERVER_MESSAGE = /Arnold says no/;

jest.mock("@assistant-ui/eve", () => ({
  useEveAgentRuntime: () => ({}),
  useEveError: () => mockEve.error,
  useEveReset: () => mockEve.reset,
}));

jest.mock("@assistant-ui/react-native", () => ({
  AssistantRuntimeProvider: ({ children }: { children: ReactNode }) => children,
  useAui: () => ({ thread: () => ({ append: jest.fn() }) }),
  useAuiState: (
    select: (state: {
      thread: { isLoading: boolean; isRunning: boolean; messages: [] };
    }) => unknown
  ) => select({ thread: { isLoading: false, isRunning: false, messages: [] } }),
}));

jest.mock("react-native-keyboard-controller", () =>
  jest.requireActual("react-native-keyboard-controller/jest")
);

// Animations as plain views and values: the screen's layout isn't under test.
jest.mock("react-native-reanimated", () => {
  const { View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  const transition = { duration: () => transition };
  return {
    __esModule: true,
    default: {
      createAnimatedComponent: <T,>(component: T) => component,
      View,
    },
    FadeIn: transition,
    FadeOut: transition,
    runOnJS: <T,>(fn: T) => fn,
    useAnimatedProps: () => ({}),
    useAnimatedStyle: () => ({}),
    useDerivedValue: (fn: () => unknown) => ({ value: fn() }),
    useSharedValue: <T,>(value: T) => ({ value }),
    withTiming: <T,>(value: T) => value,
  };
});

// The list renders its rows and footer (the empty state) without layout.
jest.mock("@legendapp/list/react-native", () => {
  const { View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    LegendList: ({
      ListFooterComponent,
    }: {
      ListFooterComponent: ReactNode;
    }) => <View>{ListFooterComponent}</View>,
  };
});

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
}));

jest.mock("@/components/touchable-glass", () => {
  const { Pressable } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return { TouchableGlass: Pressable };
});

// The plan card has its own tests (and its own ticket for its text).
jest.mock("@/components/chat/workout-plan-card", () => ({
  WorkoutPlanCard: () => null,
}));
jest.mock("@/components/markdown", () => ({ ChatMarkdown: () => null }));

jest.mock("@/components/symbol-image", () => ({ SymbolImage: () => null }));

jest.mock("@clerk/expo", () => ({
  useUser: () => ({ user: { id: "user_arnold_screen" } }),
}));

jest.mock("~/hooks/revenueCat", () => ({
  useIsProQuery: () => ({ data: true, isPending: false }),
}));

jest.mock("~/hooks/arnold-model", () => ({
  useSelectedArnoldModel: () => ({ model: undefined }),
}));

jest.mock("react-native-purchases-ui", () => ({
  __esModule: true,
  default: { presentPaywall: () => mockPresentPaywall() },
}));

jest.mock("expo-haptics", () => ({
  ImpactFeedbackStyle: { Light: "light" },
  impactAsync: jest.fn(),
}));

interface HeaderItem {
  accessibilityLabel?: string;
  label: string;
}

jest.mock("expo-router", () => {
  const { Text: RNText, View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    Link: ({ children }: { children: ReactNode }) => children,
    Stack: {
      Screen: ({
        options,
      }: {
        options: {
          title: string;
          unstable_headerRightItems: () => HeaderItem[];
        };
      }) => (
        <View>
          <RNText>{options.title}</RNText>
          {options.unstable_headerRightItems().map((item) => (
            <RNText key={item.label}>{item.label}</RNText>
          ))}
        </View>
      ),
    },
    useLocalSearchParams: () => ({}),
    useRouter: () => ({ push: jest.fn(), setParams: jest.fn() }),
  };
});

/** eve's `ClientError` for a request Arnold refused. */
function clientError(status: number, code?: string) {
  return Object.assign(new Error(`Arnold says no (${code ?? status})`), {
    body: JSON.stringify({ code, ok: false }),
    code,
    status,
  });
}

/** The screen under the root layout's language sync. */
function App() {
  useAppLanguageSync();
  return <ArnoldScreen />;
}

async function renderArnold() {
  await render(<App />);
}

beforeEach(() => {
  mockEve.error = undefined;
  mockEve.reset.mockClear();
  mockPresentPaywall.mockClear();
});

describe("Arnold screen", () => {
  it("is in English on an English device", async () => {
    await renderArnold();

    expect(screen.getByText("Arnold")).toBeTruthy();
    expect(screen.getByText("Model")).toBeTruthy();
    expect(screen.getByText("New conversation")).toBeTruthy();
    expect(screen.getByText("Ask Arnold")).toBeTruthy();
    expect(screen.getByPlaceholderText("Message Arnold")).toBeTruthy();
    expect(screen.getByLabelText("Send message")).toBeTruthy();
  });

  it("shows the empty state in Ukrainian on a Ukrainian device", async () => {
    setDeviceLanguages(["uk-UA"]);
    await renderArnold();

    expect(screen.getByText("Arnold")).toBeTruthy();
    expect(screen.getByText("Модель")).toBeTruthy();
    expect(screen.getByText("Нова розмова")).toBeTruthy();
    expect(screen.getByText("Запитайте Arnold")).toBeTruthy();
    expect(
      screen.getByText("Про ваші тренування, плани й заняття")
    ).toBeTruthy();
    expect(screen.getByPlaceholderText("Повідомлення для Arnold")).toBeTruthy();
    expect(screen.getByLabelText("Надіслати повідомлення")).toBeTruthy();
    expect(screen.queryByText("Ask Arnold")).toBeNull();
  });

  describe("on a Ukrainian device", () => {
    beforeEach(() => {
      setDeviceLanguages(["uk-UA"]);
    });

    it("says in Ukrainian that the Pro check is unavailable", async () => {
      mockEve.error = clientError(503, "arnold_pro_check_unavailable");
      await renderArnold();

      expect(
        screen.getByText(
          "Не вдалося перевірити підписку Fitme Pro. Спробуйте ще раз за хвилину."
        )
      ).toBeTruthy();
      expect(screen.queryByText(SERVER_MESSAGE)).toBeNull();
      expect(mockPresentPaywall).not.toHaveBeenCalled();
    });

    it("says in Ukrainian that a send failed to reach Arnold", async () => {
      mockEve.error = new TypeError("Network request failed");
      await renderArnold();

      expect(
        screen.getByText(
          "Не вдалося зв’язатися з Arnold. Перевірте з’єднання й спробуйте ще раз."
        )
      ).toBeTruthy();
      expect(screen.queryByText("Network request failed")).toBeNull();
    });

    it("shows the generic error in Ukrainian, never the server's message", async () => {
      mockEve.error = clientError(500);
      await renderArnold();

      expect(
        screen.getByText("Щось пішло не так. Спробуйте ще раз.")
      ).toBeTruthy();
      expect(screen.queryByText(SERVER_MESSAGE)).toBeNull();
    });

    it("opens the paywall for the Pro refusal, with no error text", async () => {
      mockEve.error = clientError(403, "arnold_pro_required");
      await renderArnold();

      expect(mockPresentPaywall).toHaveBeenCalledTimes(1);
      expect(screen.queryByText(SERVER_MESSAGE)).toBeNull();
      expect(
        screen.queryByText("Щось пішло не так. Спробуйте ще раз.")
      ).toBeNull();
      expect(screen.getByText("Запитайте Arnold")).toBeTruthy();
    });

    it("starts a new Conversation when the session has ended, with no error text", async () => {
      mockEve.error = clientError(409, "session_not_active");
      await renderArnold();

      expect(mockEve.reset).toHaveBeenCalledTimes(1);
      expect(screen.queryByText(SERVER_MESSAGE)).toBeNull();
      expect(
        screen.queryByText("Щось пішло не так. Спробуйте ще раз.")
      ).toBeNull();
      expect(screen.getByText("Запитайте Arnold")).toBeTruthy();
    });

    it("switches the error text when the device's language changes", async () => {
      mockEve.error = clientError(500);
      await renderArnold();
      expect(
        screen.getByText("Щось пішло не так. Спробуйте ще раз.")
      ).toBeTruthy();

      await act(() => {
        setDeviceLanguages(["en-US"]);
      });
      expect(screen.getByText("Something went wrong. Try again.")).toBeTruthy();
      expect(screen.getByText("Ask Arnold")).toBeTruthy();
    });
  });
});
