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
  act,
  render,
  screen,
  userEvent,
  waitFor,
} from "@testing-library/react-native";
import type { ReactNode } from "react";
import { Alert } from "react-native";
import type { AlertButton } from "react-native";

import ArnoldScreen from "~/app/(tabs)/arnold/index";
import { Toaster } from "~/components/ui/toast";
import {
  clearArnoldAttachments,
  setConversationAttachmentCount,
} from "~/hooks/arnold-attachments";
import {
  pickLibraryPhotos,
  readAttachmentDataUrl,
  takePhoto,
} from "~/lib/arnold-attachment-picker";
import type { PickedImage } from "~/lib/arnold-attachment-picker";
import { savedArnoldSessionId } from "~/lib/arnold-chat";
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
import { pushedRoutes, resetStubRouter } from "~/test-utils/router-stub";

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

// The toasts' root view only: the real module's native bindings fail
// against Reanimated mocked as plain values.
jest.mock("react-native-gesture-handler", () =>
  jest.requireActual("~/test-utils/gesture-handler-stub")
);

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
        <Toaster />
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
  clearArnoldAttachments();
  setConversationAttachmentCount(0);
  jest.mocked(pickLibraryPhotos).mockReset();
  jest.mocked(takePhoto).mockReset();
  jest
    .mocked(readAttachmentDataUrl)
    .mockReset()
    .mockResolvedValue("data:image/jpeg;base64,/9j/AA==");
  jest.spyOn(Alert, "alert").mockReturnValue(undefined).mockClear();
});

afterEach(() => {
  process.env.EXPO_PUBLIC_API_URL = EXPO_PUBLIC_API_URL;
  jest.mocked(Alert.alert).mockRestore();
});

/** Every alert the screen showed: its title, message and buttons. */
const alerts = () =>
  jest.mocked(Alert.alert).mock.calls as [string, string, AlertButton[]?][];

/** Presses the last alert's button named `label`, as the User would. */
const pressInAlert = async (label: string) => {
  const button = alerts()
    .at(-1)?.[2]
    ?.find(({ text }) => text === label);

  if (!button) {
    throw new Error(`no alert button named ${label}`);
  }

  await act(() => {
    button.onPress?.();
  });
};

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

describe.each([
  {
    cancel: "Cancel",
    composer: "Message Arnold",
    confirm: "Start New Conversation",
    device: "en-US",
    message: "This one will be gone for good.",
    name: "English",
    newConversation: "New conversation",
    send: "Send message",
    title: "Start a new conversation?",
  },
  {
    cancel: "Скасувати",
    composer: "Повідомлення для Arnold",
    confirm: "Почати нову розмову",
    device: "uk-UA",
    message: "Цю буде видалено назавжди.",
    name: "Ukrainian",
    newConversation: "Нова розмова",
    send: "Надіслати повідомлення",
    title: "Почати нову розмову?",
  },
])("New Conversation in $name", (copy) => {
  const USER_ID = "user_arnold_base_screen";

  beforeEach(() => {
    setDeviceLanguages([copy.device]);
  });

  const newConversationButton = () =>
    screen.getByRole("button", { name: copy.newConversation });

  /** Sends `text` and waits for Arnold's answer and the saved turn. */
  const send = async (text: string) => {
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText(copy.composer), text);
    await user.press(screen.getByLabelText(copy.send));
    await waitFor(() => {
      expect(screen.getByText(FAKE_ARNOLD_REPLY)).toBeTruthy();
    });
    await settle(queryClient);
  };

  it("asks first, with the Conversation's cost and a destructive confirm", async () => {
    await mount();
    await send("Hi");
    await userEvent.setup().press(newConversationButton());

    expect(alerts()).toEqual([
      [
        copy.title,
        copy.message,
        [
          expect.objectContaining({ style: "cancel", text: copy.cancel }),
          expect.objectContaining({
            style: "destructive",
            text: copy.confirm,
          }),
        ],
      ],
    ]);
  });

  it("keeps every message and the saved Conversation on Cancel", async () => {
    await mount();
    await send("Hi");
    const sessionId = savedArnoldSessionId(USER_ID);
    expect(sessionId).toBeTruthy();

    await userEvent.setup().press(newConversationButton());
    await pressInAlert(copy.cancel);
    await settle(queryClient);

    expect(screen.getByText("Hi")).toBeTruthy();
    expect(screen.getByText(FAKE_ARNOLD_REPLY)).toBeTruthy();
    expect(savedArnoldSessionId(USER_ID)).toBe(sessionId);
  });

  it("starts a new Conversation and forgets the saved one on confirm", async () => {
    await mount();
    await send("Hi");
    const firstSession = savedArnoldSessionId(USER_ID);

    await userEvent.setup().press(newConversationButton());
    await pressInAlert(copy.confirm);
    await settle(queryClient);

    expect(screen.queryByText("Hi")).toBeNull();
    expect(screen.queryByText(FAKE_ARNOLD_REPLY)).toBeNull();
    expect(savedArnoldSessionId(USER_ID)).toBeUndefined();

    await send("Again");

    expect(savedArnoldSessionId(USER_ID)).not.toBe(firstSession);
  });

  it("asks nothing on an empty Conversation", async () => {
    await mount();
    await userEvent.setup().press(newConversationButton());
    await settle(queryClient);

    expect(alerts()).toEqual([]);
    expect(newConversationButton()).toBeEnabled();
  });

  it("is disabled while a turn runs", async () => {
    const release = fakeArnold.holdNextToolCall({
      name: "get_plans",
      output: [],
    });

    await mount();
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText(copy.composer), "Hi");
    await user.press(screen.getByLabelText(copy.send));

    await waitFor(() => {
      expect(newConversationButton()).toBeDisabled();
    });

    release();
    await waitFor(() => {
      expect(screen.getByText(FAKE_ARNOLD_REPLY)).toBeTruthy();
    });
    await settle(queryClient);
    expect(newConversationButton()).toBeEnabled();
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

  it("resets at once, asking nothing, as today", async () => {
    setArnoldRedesignEnabled(false);
    await mount();
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText("Message Arnold"), "Hi");
    await user.press(screen.getByLabelText("Send message"));
    await waitFor(() => {
      expect(screen.getByText(FAKE_ARNOLD_REPLY)).toBeTruthy();
    });
    await settle(queryClient);

    await user.press(screen.getByRole("button", { name: "New conversation" }));
    await settle(queryClient);

    expect(alerts()).toEqual([]);
    expect(screen.queryByText(FAKE_ARNOLD_REPLY)).toBeNull();
  });
});

describe.each([
  {
    addToChat: "Add to chat",
    cameraDenied: "Camera Access Needed",
    chooseFromLibrary: "Choose from Library",
    composer: "Message Arnold",
    conversationFull:
      "A conversation can hold 10 photos. Start a new conversation to add more.",
    device: "en-US",
    name: "English",
    openSettings: "Open Settings",
    perMessageLimit: "You can add up to 4 photos to a message.",
    pickFailed: "Couldn't add that photo. Try another one.",
    pickedPhoto: (position: number, total: number) =>
      `Photo ${position} of ${total}`,
    send: "Send message",
    takePhoto: "Take Photo",
  },
  {
    addToChat: "Додати до чату",
    cameraDenied: "Потрібен доступ до камери",
    chooseFromLibrary: "Вибрати з бібліотеки",
    composer: "Повідомлення для Arnold",
    conversationFull:
      "У розмові може бути до 10 фото. Почніть нову розмову, щоб додати ще.",
    device: "uk-UA",
    name: "Ukrainian",
    openSettings: "Відкрити Параметри",
    perMessageLimit: "В одне повідомлення можна додати не більше 4 фото.",
    pickFailed: "Не вдалося додати це фото. Спробуйте інше.",
    pickedPhoto: (position: number, total: number) =>
      `Фото ${position} з ${total}`,
    send: "Надіслати повідомлення",
    takePhoto: "Зробити фото",
  },
])('the composer\'s "+" menu in $name', (copy) => {
  beforeEach(() => {
    setDeviceLanguages([copy.device]);
  });

  /** A re-encoded JPEG on this device, as the picker answers one. */
  const photo = (name: string): PickedImage => {
    const uri = `file:///photos/${name}.jpg`;
    fileSystem.write(uri, `${name}-bytes`);

    return { height: 1200, uri, width: 1600 };
  };

  const photos = (prefix: string, count: number) =>
    Array.from({ length: count }, (_, index) => photo(`${prefix}-${index}`));

  /** Opens the "+" menu, as the User does. */
  const openMenu = async () => {
    await userEvent
      .setup()
      .press(screen.getByRole("button", { name: copy.addToChat }));
  };

  const item = (name: string) => screen.getByRole("menuitem", { name });

  /** Opens the menu and presses the item named `name`. */
  const choose = async (name: string) => {
    await openMenu();
    await userEvent.setup().press(item(name));
    await settle(queryClient);
  };

  /** The thumbnails picked for the next message, by their spoken names. */
  const pickedPhotos = () =>
    screen
      .queryAllByLabelText(/^(Photo|Фото) \d+ (of|з) \d+$/u)
      .map((thumbnail) => thumbnail.props.accessibilityLabel);

  /** Sends what's in the composer and waits for Arnold's answer. */
  const send = async (text: string) => {
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText(copy.composer), text);
    await user.press(screen.getByLabelText(copy.send));
    const turns = fakeArnold.sent.length;
    await waitFor(() => {
      expect(screen.getAllByText(FAKE_ARNOLD_REPLY)).toHaveLength(turns);
    });
    await settle(queryClient);
  };

  /** Picks `count` photos from the library and sends them. */
  const sendPhotos = async (prefix: string, count: number) => {
    jest
      .mocked(pickLibraryPhotos)
      .mockResolvedValueOnce({ failed: 0, images: photos(prefix, count) });
    await choose(copy.chooseFromLibrary);
    await send(prefix);
  };

  it("holds Take Photo and Choose from Library, and opens no sheet", async () => {
    await mount();
    await openMenu();

    expect(
      screen
        .getAllByRole("menuitem")
        .map((menuItem) => menuItem.props.accessibilityLabel)
    ).toEqual([copy.takePhoto, copy.chooseFromLibrary]);
    expect(pushedRoutes()).toEqual([]);
  });

  it("adds a photo taken with Take Photo to the composer", async () => {
    jest
      .mocked(takePhoto)
      .mockResolvedValue({ image: photo("gym"), status: "taken" });
    await mount();
    await choose(copy.takePhoto);

    expect(takePhoto).toHaveBeenCalledTimes(1);
    expect(pickedPhotos()).toEqual([copy.pickedPhoto(1, 1)]);
    expect(pushedRoutes()).toEqual([]);
  });

  it("adds photos chosen from the library, asking for the slots left", async () => {
    jest
      .mocked(pickLibraryPhotos)
      .mockResolvedValueOnce({ failed: 0, images: photos("a", 1) })
      .mockResolvedValueOnce({ failed: 0, images: photos("b", 2) });
    await mount();
    await choose(copy.chooseFromLibrary);
    await choose(copy.chooseFromLibrary);

    expect(jest.mocked(pickLibraryPhotos).mock.calls).toEqual([[4], [3]]);
    expect(pickedPhotos()).toEqual([
      copy.pickedPhoto(1, 3),
      copy.pickedPhoto(2, 3),
      copy.pickedPhoto(3, 3),
    ]);
  });

  it("disables both items at the message limit, saying why", async () => {
    jest
      .mocked(pickLibraryPhotos)
      .mockResolvedValue({ failed: 0, images: photos("a", 4) });
    await mount();
    await choose(copy.chooseFromLibrary);
    await openMenu();

    for (const name of [copy.takePhoto, copy.chooseFromLibrary]) {
      expect(item(name)).toBeDisabled();
    }

    expect(screen.getAllByText(copy.perMessageLimit)).toHaveLength(2);

    await userEvent.setup().press(item(copy.takePhoto));
    expect(takePhoto).not.toHaveBeenCalled();
  });

  it("disables both items at the Conversation limit, naming it, and keeps the notice", async () => {
    await mount();

    // 4 + 4 + 2 over three turns, one after another: each send waits for
    // the turn before it.
    await sendPhotos("first", 4);
    await sendPhotos("second", 4);
    await sendPhotos("third", 2);

    // The notice above the composer stays as it is.
    expect(screen.getByText(copy.conversationFull)).toBeTruthy();

    await openMenu();

    for (const name of [copy.takePhoto, copy.chooseFromLibrary]) {
      expect(item(name)).toBeDisabled();
    }

    expect(screen.getAllByText(copy.conversationFull)).toHaveLength(3);
    expect(screen.queryByText(copy.perMessageLimit)).toBeNull();
  });

  it("offers Settings when camera access is off for good", async () => {
    jest.mocked(takePhoto).mockResolvedValue({ status: "denied" });
    await mount();
    await choose(copy.takePhoto);

    expect(alerts()).toEqual([
      [
        copy.cameraDenied,
        expect.any(String),
        [
          expect.objectContaining({ style: "cancel" }),
          expect.objectContaining({ text: copy.openSettings }),
        ],
      ],
    ]);
    expect(pickedPhotos()).toEqual([]);
  });

  it("says so in a toast when no photo could be read", async () => {
    jest.mocked(pickLibraryPhotos).mockResolvedValue({ failed: 1, images: [] });
    jest.mocked(takePhoto).mockRejectedValue(new Error("No camera"));
    await mount();
    await choose(copy.chooseFromLibrary);

    expect(screen.getAllByText(copy.pickFailed)).toHaveLength(1);

    await choose(copy.takePhoto);

    expect(screen.getAllByText(copy.pickFailed)).toHaveLength(2);
    expect(pickedPhotos()).toEqual([]);
  });

  it("changes nothing when the picker or the camera is cancelled", async () => {
    jest.mocked(pickLibraryPhotos).mockResolvedValue(null);
    jest.mocked(takePhoto).mockResolvedValue({ status: "cancelled" });
    await mount();
    await choose(copy.chooseFromLibrary);
    await choose(copy.takePhoto);

    expect(pickedPhotos()).toEqual([]);
    expect(alerts()).toEqual([]);
    expect(screen.queryByText(copy.pickFailed)).toBeNull();
    expect(pushedRoutes()).toEqual([]);
  });
});

describe('the composer\'s "+" with the Arnold redesign off', () => {
  it("opens the Attachments sheet, as today", async () => {
    setArnoldRedesignEnabled(false);
    await mount();
    await userEvent
      .setup()
      .press(screen.getByRole("button", { name: "Add to chat" }));

    expect(screen.queryByRole("menuitem")).toBeNull();
    expect(pushedRoutes()).toEqual([
      expect.objectContaining({ pathname: "/arnold/attachments" }),
    ]);
  });
});

describe.each([
  {
    composer: "Message Arnold",
    confirm: "Start New Conversation",
    description: "About your training, plans and workouts",
    device: "en-US",
    name: "English",
    newConversation: "New conversation",
    send: "Send message",
    starters: [
      "Build me a plan",
      "Review my active plan",
      "How did my last week go?",
      "How do I do an exercise?",
    ],
    title: "Ask Arnold",
  },
  {
    composer: "Повідомлення для Arnold",
    confirm: "Почати нову розмову",
    description: "Про ваші тренування, плани й заняття",
    device: "uk-UA",
    name: "Ukrainian",
    newConversation: "Нова розмова",
    send: "Надіслати повідомлення",
    starters: [
      "Склади мені план",
      "Переглянь мій активний план",
      "Як пройшов мій минулий тиждень?",
      "Як правильно виконувати вправу?",
    ],
    title: "Запитайте Arnold",
  },
])("the empty state in $name", (copy) => {
  beforeEach(() => {
    setDeviceLanguages([copy.device]);
  });

  /** The starter prompts on screen, by their spoken names. */
  const starters = () =>
    copy.starters.filter(
      (starter) => screen.queryByRole("button", { name: starter }) !== null
    );

  /** Taps the starter `text` and waits for Arnold's answer. */
  const start = async (text: string) => {
    await userEvent.setup().press(screen.getByRole("button", { name: text }));
    await waitFor(() => {
      expect(screen.getByText(FAKE_ARNOLD_REPLY)).toBeTruthy();
    });
    await settle(queryClient);
  };

  it("greets the User and offers the four starter prompts as buttons", async () => {
    await mount();

    expect(screen.getByRole("heading", { name: copy.title })).toBeTruthy();
    expect(screen.getByText(copy.description)).toBeTruthy();
    expect(starters()).toEqual(copy.starters);
  });

  it.each([0, 1, 2, 3])(
    "sends starter %i's exact text as the User's own message",
    async (index) => {
      const text = copy.starters[index] ?? "";
      await mount();
      await start(text);

      expect(fakeArnold.sent).toEqual([
        expect.objectContaining({
          parts: [{ text, type: "text" }],
          text,
        }),
      ]);
      expect(screen.getByText(text)).toBeTruthy();
    }
  );

  it("is gone once a message exists, and back after New Conversation", async () => {
    await mount();
    const [first] = copy.starters;
    await start(first ?? "");

    expect(starters()).toEqual([]);
    expect(screen.queryByText(copy.description)).toBeNull();

    await userEvent
      .setup()
      .press(screen.getByRole("button", { name: copy.newConversation }));
    await pressInAlert(copy.confirm);
    await settle(queryClient);

    expect(starters()).toEqual(copy.starters);
  });

  it("is gone once a typed message is sent, as with a starter", async () => {
    await mount();
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText(copy.composer), "Hi");
    await user.press(screen.getByLabelText(copy.send));
    await waitFor(() => {
      expect(screen.getByText(FAKE_ARNOLD_REPLY)).toBeTruthy();
    });
    await settle(queryClient);

    expect(starters()).toEqual([]);
  });

  it("leaves a typed draft in the composer", async () => {
    await mount();
    const [first] = copy.starters;
    await userEvent
      .setup()
      .type(screen.getByPlaceholderText(copy.composer), "Draft");
    await start(first ?? "");

    expect(screen.getByPlaceholderText(copy.composer).props.value).toBe(
      "Draft"
    );
    expect(fakeArnold.sent.map(({ text }) => text)).toEqual([first]);
  });
});

describe("the empty state with the Arnold redesign off", () => {
  it("is today's, with no starter prompts", async () => {
    setArnoldRedesignEnabled(false);
    await mount();

    expect(screen.getByText("Ask Arnold")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Build me a plan" })
    ).toBeNull();
  });
});
