/**
 * The Arnold screen's base, behind the Arnold redesign flag (project "Arnold
 * redesign: cards and Plan Proposals"): the real screen over the fake Arnold
 * and the fake Public API, which serves the model list, in English and
 * Ukrainian. The header's title is drawn from its `headerTitle`, and its
 * menu through the dropdown menu's stand-in. Each ticket of the redesign's
 * base screen adds its part here; with the flag off, the screen's own tests
 * (`arnold-screen.test.tsx`, `model-picker-screen.test.tsx`) hold today's.
 */
import { arnoldModels, defaultArnoldModelId } from "@fitme/core";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { QueryClientProvider } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import {
  render,
  screen,
  userEvent,
  waitFor,
} from "@testing-library/react-native";
import type { ReactNode } from "react";

import ArnoldScreen from "~/app/(tabs)/arnold/index";
import { SELECTED_MODEL_KEY } from "~/lib/arnold-model";
import { setArnoldRedesignEnabled } from "~/lib/feature-flags";
import { storage } from "~/lib/mmkv";
import { setDeviceLanguages } from "~/test-utils/device-locales";
import { FAKE_ARNOLD_REPLY, fakeArnold } from "~/test-utils/fake-arnold";
import {
  FAKE_PUBLIC_API_URL,
  fakePublicApi,
} from "~/test-utils/fake-public-api";
import { InAppLanguage } from "~/test-utils/in-app-language";
import type * as InMemoryFileSystem from "~/test-utils/in-memory-file-system";
import { createTestQueryClient, settle } from "~/test-utils/query-client";
import { resetStubRouter } from "~/test-utils/router-stub";

jest.mock("react-native-keyboard-controller", () =>
  jest.requireActual("react-native-keyboard-controller/jest")
);

jest.mock("react-native-worklets", () =>
  jest.requireActual("react-native-worklets/lib/module/mock")
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
    createAnimatedComponent: <T,>(component: T) => component,
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

// The list renders its rows without layout.
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

jest.mock("~/components/touchable-glass", () => {
  const { Pressable } =
    jest.requireActual<typeof import("react-native")>("react-native");

  return { TouchableGlass: Pressable };
});

jest.mock("~/components/chat/workout-plan-card", () => ({
  WorkoutPlanCard: () => null,
}));

jest.mock("~/components/markdown", () => {
  const { Text } =
    jest.requireActual<typeof import("react-native")>("react-native");

  return {
    ChatMarkdown: ({ children }: { children: string }) => (
      <Text>{children}</Text>
    ),
  };
});

jest.mock("~/components/symbol-image", () => ({ SymbolImage: () => null }));

jest.mock("~/components/ui/button", () =>
  jest.requireActual("~/test-utils/button-stub")
);

// The title's model menu is a SwiftUI `Menu`, which can't mount under Jest.
jest.mock("~/components/ui/dropdown-menu", () =>
  jest.requireActual("~/test-utils/dropdown-menu-stub")
);

jest.mock("@clerk/expo", () => ({
  useUser: () => ({ user: { id: "user_arnold_base_screen" } }),
}));

jest.mock("~/lib/clerk", () => ({
  getClerk: () => ({
    session: { getToken: () => Promise.resolve("fake-arnold-token") },
  }),
}));

jest.mock("~/lib/arnold-attachment-picker", () => ({
  pickLibraryPhotos: jest.fn(),
  readAttachmentDataUrl: jest.fn(),
  takePhoto: jest.fn(),
}));

jest.mock(
  "expo-file-system",
  () =>
    jest.requireActual<typeof InMemoryFileSystem>(
      "~/test-utils/in-memory-file-system"
    ).fileSystemModule
);

const { fileSystem } = jest.requireActual<typeof InMemoryFileSystem>(
  "~/test-utils/in-memory-file-system"
);

jest.mock("expo-router/react-navigation", () => ({ useHeaderHeight: () => 0 }));

jest.mock("~/hooks/revenueCat", () => ({
  useIsProQuery: () => ({ data: true, isPending: false }),
}));

jest.mock("react-native-purchases-ui", () => ({
  __esModule: true,
  default: { presentPaywall: jest.fn() },
}));

jest.mock("expo-haptics", () => ({
  ImpactFeedbackStyle: { Light: "light" },
  impactAsync: jest.fn(),
}));

interface HeaderItem {
  accessibilityLabel?: string;
  disabled?: boolean;
  label: string;
  onPress?: () => void;
}

/**
 * The native header as the screen sets it: its `headerTitle` when it has
 * one, else its plain title, and every header item as a button named by its
 * spoken label (testID `header-items` holding them).
 */
jest.mock("expo-router", () => {
  const {
    Pressable,
    Text: RNText,
    View,
  } = jest.requireActual<typeof import("react-native")>("react-native");

  const stub = jest.requireActual<typeof import("~/test-utils/router-stub")>(
    "~/test-utils/router-stub"
  );

  return {
    Link: stub.LinkStub,
    Stack: {
      Screen: ({
        options,
      }: {
        options: {
          headerTitle?: () => ReactNode;
          title: string;
          unstable_headerLeftItems?: () => HeaderItem[];
          unstable_headerRightItems?: () => HeaderItem[];
        };
      }) => (
        <View>
          {/* Called as the native header calls it: a plain function. */}
          {options.headerTitle ? (
            options.headerTitle()
          ) : (
            <RNText>{options.title}</RNText>
          )}
          <View testID="header-items">
            {[
              ...(options.unstable_headerLeftItems?.() ?? []),
              ...(options.unstable_headerRightItems?.() ?? []),
            ].map((item) => (
              <Pressable
                accessibilityLabel={item.accessibilityLabel ?? item.label}
                accessibilityRole="button"
                disabled={item.disabled}
                key={item.label}
                onPress={item.onPress}
              />
            ))}
          </View>
        </View>
      ),
    },
    usePreventRemove: () => undefined,
    useLocalSearchParams: () => stub.useStubParams({}),
    useRouter: () => ({ ...stub.stubRouter, setParams: jest.fn() }),
  };
});

// Each test that sends runs a whole turn through the real eve runtime.
jest.setTimeout(30_000);

const MODELS_ROUTE = "GET /v1/arnold/models";

const defaultModel = arnoldModels.find(({ id }) => id === defaultArnoldModelId);
const otherModel = arnoldModels.find(({ id }) => id !== defaultArnoldModelId);

if (!(defaultModel && otherModel)) {
  throw new Error("the served list needs its default and another model");
}

const { EXPO_PUBLIC_API_URL } = process.env;

let queryClient: QueryClient;

const mount = async () => {
  queryClient = createTestQueryClient();
  await render(
    <QueryClientProvider client={queryClient}>
      <InAppLanguage>
        <ArnoldScreen />
      </InAppLanguage>
    </QueryClientProvider>
  );
  await settle(queryClient);
};

beforeEach(() => {
  storage.clearAll();
  fileSystem.reset();
  resetStubRouter();
  fakeArnold.install();
  process.env.EXPO_PUBLIC_ARNOLD_URL = fakeArnold.baseUrl;
  process.env.EXPO_PUBLIC_API_URL = FAKE_PUBLIC_API_URL;
  setArnoldRedesignEnabled(true);
});

afterEach(() => {
  process.env.EXPO_PUBLIC_API_URL = EXPO_PUBLIC_API_URL;
});

describe.each([
  {
    chooseModel: "Choose a model",
    composer: "Message Arnold",
    device: "en-US",
    language: "en",
    name: "English",
    newConversation: "New conversation",
    send: "Send message",
  },
  {
    chooseModel: "Вибрати модель",
    composer: "Повідомлення для Arnold",
    device: "uk-UA",
    language: "uk",
    name: "Ukrainian",
    newConversation: "Нова розмова",
    send: "Надіслати повідомлення",
  },
])("the header in $name", (copy) => {
  beforeEach(() => {
    setDeviceLanguages([copy.device]);
  });

  /** The title's menu button, named by the title and the model. */
  const title = (label: string) =>
    screen.getByRole("button", { name: `Arnold, ${label}` });

  /** The open menu's items, each as its label and whether it's checked. */
  const menuItems = () =>
    screen.getAllByRole("menuitem").map((item) => ({
      checked: item.props.accessibilityState?.selected,
      label: item.props.accessibilityLabel,
    }));

  /** Sends `text` and waits for Arnold's answer. */
  const send = async (text: string) => {
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText(copy.composer), text);
    await user.press(screen.getByLabelText(copy.send));
    await waitFor(() => {
      expect(screen.getByText(FAKE_ARNOLD_REPLY)).toBeTruthy();
    });
    await settle(queryClient);
  };

  it("shows the current model under the title, which says it opens a menu", async () => {
    await mount();

    // Drawn, but hidden from VoiceOver: the menu button reads both as one.
    expect(
      screen.getByText("Arnold", { includeHiddenElements: true })
    ).toBeTruthy();
    expect(
      screen.getByText(defaultModel.label, { includeHiddenElements: true })
    ).toBeTruthy();
    expect(screen.queryByText(defaultModel.label)).toBeNull();
    expect(title(defaultModel.label).props.accessibilityHint).toBe(
      copy.chooseModel
    );
  });

  it("holds only New Conversation on the right", async () => {
    await mount();

    const items = screen.getByTestId("header-items");

    expect(
      screen
        .getAllByRole("button")
        .filter((button) => items.children.includes(button))
        .map((button) => button.props.accessibilityLabel)
    ).toEqual([copy.newConversation]);
  });

  it("opens a menu of the served models, the current one checked", async () => {
    await mount();
    await userEvent.setup().press(title(defaultModel.label));

    expect(menuItems()).toEqual(
      arnoldModels.map(({ id, label }) => ({
        checked: id === defaultArnoldModelId,
        label,
      }))
    );
  });

  it("saves a pick as the model picker does, and the next send carries it", async () => {
    await mount();
    const user = userEvent.setup();
    await user.press(title(defaultModel.label));
    await user.press(screen.getByRole("menuitem", { name: otherModel.label }));

    expect(storage.getString(SELECTED_MODEL_KEY)).toBe(otherModel.id);
    expect(title(otherModel.label)).toBeTruthy();
    expect(screen.queryByRole("menuitem")).toBeNull();

    await user.press(title(otherModel.label));
    expect(
      menuItems()
        .filter(({ checked }) => checked)
        .map(({ label }) => label)
    ).toEqual([otherModel.label]);

    await send("Hi");

    expect(fakeArnold.sent.at(-1)?.clientContext).toMatchObject({
      language: copy.language,
      model: otherModel.id,
    });
  });

  it("reads Arnold alone and opens nothing without a served list, and chat still works", async () => {
    fakePublicApi.failNext(MODELS_ROUTE, "network");
    await mount();

    expect(screen.getByRole("header", { name: "Arnold" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Arnold, /u })).toBeNull();
    expect(screen.queryByText(defaultModel.label)).toBeNull();

    await send("Hi");

    expect(fakeArnold.sent.at(-1)?.clientContext).not.toHaveProperty("model");
  });
});

describe("the header with the Arnold redesign off", () => {
  it("is today's: the plain title and the model picker's button", async () => {
    setArnoldRedesignEnabled(false);
    await mount();

    expect(screen.queryByRole("button", { name: /^Arnold, /u })).toBeNull();
    expect(
      screen.getByRole("button", { name: defaultModel.label })
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "New conversation" })
    ).toBeTruthy();
  });
});
