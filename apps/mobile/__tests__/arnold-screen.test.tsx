/**
 * The Arnold screen over the fake Arnold (`test-utils/fake-arnold.ts`): the
 * real screen, chat components and `@assistant-ui/eve` runtime, talking to a
 * stand-in for `apps/arnold` through the global `fetch`, so a test reads the
 * parts a send put on the wire and the answer the User sees, and makes a send
 * be refused or fail to see the screen's error states. Its own text is
 * checked in each device language. The header's options render as text through
 * the `Stack.Screen` stub.
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import {
  act,
  render,
  screen,
  userEvent,
  waitFor,
} from "@testing-library/react-native";
import type { ReactNode } from "react";
import ArnoldScreen from "~/app/(tabs)/arnold/index";
import { useAppLanguageSync } from "~/lib/i18n";
import { storage } from "~/lib/mmkv";
import { setDeviceLanguages } from "~/test-utils/device-locales";
import { FAKE_ARNOLD_REPLY, fakeArnold } from "~/test-utils/fake-arnold";

const mockPresentPaywall = jest.fn();

/** What the fake's refusals say: never shown to the User. */
const SERVER_MESSAGE = /Arnold says no/;

/** The composer's placeholder and Send button, in either device language. */
const COMPOSER = /Message Arnold|Повідомлення для Arnold/;
const SEND = /Send message|Надіслати повідомлення/;

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
    LegendList: <T,>({
      data,
      keyExtractor,
      ListFooterComponent,
      renderItem,
    }: {
      data: readonly T[];
      keyExtractor: (item: T) => string;
      ListFooterComponent: ReactNode;
      renderItem: (info: { item: T }) => ReactNode;
    }) => (
      <View>
        {data.map((item) => (
          <View key={keyExtractor(item)}>{renderItem({ item })}</View>
        ))}
        {ListFooterComponent}
      </View>
    ),
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

// The plan card has its own tests, its text in Ukrainian included.
jest.mock("@/components/chat/workout-plan-card", () => ({
  WorkoutPlanCard: () => null,
}));

// Markdown has its own tests; here an answer is read as the text it is.
jest.mock("@/components/markdown", () => {
  const { Text } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    ChatMarkdown: ({ children }: { children: string }) => (
      <Text>{children}</Text>
    ),
  };
});

jest.mock("@/components/symbol-image", () => ({ SymbolImage: () => null }));

jest.mock("@clerk/expo", () => ({
  useUser: () => ({ user: { id: "user_arnold_screen" } }),
}));

// The bearer every eve request carries, resolved per request in the app.
jest.mock("~/lib/clerk", () => ({
  getClerk: () => ({
    session: { getToken: () => Promise.resolve("fake-arnold-token") },
  }),
}));

let mockAttachmentsEnabled = false;

// Attachments are off, as they ship, unless a test turns them on. A getter
// defined in place (a spread would copy the flag's value once, when the
// factory runs).
jest.mock("~/lib/arnold-attachments", () =>
  Object.defineProperties(
    {},
    { ATTACHMENTS_ENABLED: { get: () => mockAttachmentsEnabled } }
  )
);

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

/** The screen under the root layout's language sync. */
function App() {
  useAppLanguageSync();
  return <ArnoldScreen />;
}

async function renderArnold() {
  await render(<App />);
}

/** Types `text` into the composer and presses Send, as the User does. */
async function send(text: string) {
  const user = userEvent.setup();
  await user.type(screen.getByPlaceholderText(COMPOSER), text);
  // Queried after the typing: the composer re-renders with the new text, and
  // the Send button of the render before it would send an empty message.
  await user.press(screen.getByLabelText(SEND));
}

beforeEach(() => {
  mockAttachmentsEnabled = false;
  mockPresentPaywall.mockClear();
  storage.clearAll();
  fakeArnold.install();
  process.env.EXPO_PUBLIC_ARNOLD_URL = fakeArnold.baseUrl;
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

  describe("sending a message", () => {
    it("puts the text on the wire and shows Arnold's answer", async () => {
      await renderArnold();
      await send("How heavy should I squat?");

      await waitFor(() =>
        expect(screen.getByText(FAKE_ARNOLD_REPLY)).toBeTruthy()
      );
      expect(fakeArnold.sent).toHaveLength(1);
      const [sent] = fakeArnold.sent;
      expect(sent?.parts).toEqual([
        { text: "How heavy should I squat?", type: "text" },
      ]);
      // No model list on the device, so Arnold picks its own default model.
      expect(sent?.clientContext).toEqual({ language: "en" });
      expect(screen.getByText("How heavy should I squat?")).toBeTruthy();
      expect(screen.queryByText("Ask Arnold")).toBeNull();
    });

    it("sends a second message in the same Conversation", async () => {
      await renderArnold();
      await send("First");
      await waitFor(() => expect(fakeArnold.sent).toHaveLength(1));
      await send("Second");

      await waitFor(() => expect(fakeArnold.sent).toHaveLength(2));
      expect(fakeArnold.sent.map((message) => message.text)).toEqual([
        "First",
        "Second",
      ]);
      expect(new Set(fakeArnold.sent.map((m) => m.sessionId)).size).toBe(1);
    });
  });

  describe("on a Ukrainian device", () => {
    beforeEach(() => {
      setDeviceLanguages(["uk-UA"]);
    });

    it("says in Ukrainian that the Pro check is unavailable", async () => {
      fakeArnold.failNextSend("pro-check-unavailable");
      await renderArnold();
      await send("Привіт");

      await waitFor(() =>
        expect(
          screen.getByText(
            "Не вдалося перевірити підписку Fitme Pro. Спробуйте трохи згодом."
          )
        ).toBeTruthy()
      );
      expect(screen.queryByText(SERVER_MESSAGE)).toBeNull();
      expect(mockPresentPaywall).not.toHaveBeenCalled();
    });

    it("says in Ukrainian that a send failed to reach Arnold", async () => {
      fakeArnold.failNextSend("network");
      await renderArnold();
      await send("Привіт");

      await waitFor(() =>
        expect(
          screen.getByText(
            "Не вдалося зв’язатися з Arnold. Перевірте з’єднання й спробуйте ще раз."
          )
        ).toBeTruthy()
      );
      expect(screen.queryByText("Network request failed")).toBeNull();
    });

    it("shows the generic error in Ukrainian, never the server's message", async () => {
      fakeArnold.failNextSend({ status: 500 });
      await renderArnold();
      await send("Привіт");

      await waitFor(() =>
        expect(
          screen.getByText("Щось пішло не так. Спробуйте ще раз.")
        ).toBeTruthy()
      );
      expect(screen.queryByText(SERVER_MESSAGE)).toBeNull();
    });

    it("opens the paywall for the Pro refusal, with no error text", async () => {
      fakeArnold.failNextSend("pro-required");
      await renderArnold();
      await send("Привіт");

      await waitFor(() => expect(mockPresentPaywall).toHaveBeenCalledTimes(1));
      expect(screen.queryByText(SERVER_MESSAGE)).toBeNull();
      expect(
        screen.queryByText("Щось пішло не так. Спробуйте ще раз.")
      ).toBeNull();
      expect(screen.getByText("Запитайте Arnold")).toBeTruthy();
    });

    it("starts a new Conversation when the session has ended, with no error text", async () => {
      await renderArnold();
      await send("Перше");
      await waitFor(() => expect(fakeArnold.sent).toHaveLength(1));
      fakeArnold.failNextSend({ code: "session_not_active", status: 409 });
      await send("Друге");

      await waitFor(() =>
        expect(screen.getByText("Запитайте Arnold")).toBeTruthy()
      );
      expect(screen.queryByText(SERVER_MESSAGE)).toBeNull();
      expect(
        screen.queryByText("Щось пішло не так. Спробуйте ще раз.")
      ).toBeNull();
    });

    it("switches the error text when the device's language changes", async () => {
      fakeArnold.failNextSend({ status: 500 });
      await renderArnold();
      await send("Привіт");
      await waitFor(() =>
        expect(
          screen.getByText("Щось пішло не так. Спробуйте ще раз.")
        ).toBeTruthy()
      );

      await act(() => {
        setDeviceLanguages(["en-US"]);
      });
      expect(screen.getByText("Something went wrong. Try again.")).toBeTruthy();
      expect(screen.getByText("Ask Arnold")).toBeTruthy();
    });
  });

  describe("Attachments", () => {
    it("offers no way to add one while they are off", async () => {
      await renderArnold();

      expect(screen.queryByLabelText("Add to chat")).toBeNull();
      expect(screen.getByPlaceholderText("Message Arnold")).toBeTruthy();
    });

    it('offers the composer\'s "+" once they are on', async () => {
      mockAttachmentsEnabled = true;
      await renderArnold();

      expect(screen.getByLabelText("Add to chat")).toBeTruthy();
    });

    it('names the composer\'s "+" in Ukrainian on a Ukrainian device', async () => {
      mockAttachmentsEnabled = true;
      setDeviceLanguages(["uk-UA"]);
      await renderArnold();

      expect(screen.getByLabelText("Додати до чату")).toBeTruthy();
      expect(screen.queryByLabelText("Add to chat")).toBeNull();
    });
  });
});
