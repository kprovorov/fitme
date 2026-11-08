/**
 * The Arnold screen over the fake Arnold (`test-utils/fake-arnold.ts`): the
 * real screen, chat components and `@assistant-ui/eve` runtime, talking to a
 * stand-in for `apps/arnold` through the global `fetch`, so a test reads the
 * parts a send put on the wire and the answer the User sees, and makes a send
 * be refused or fail to see the screen's error states. Its own text is
 * checked in each device language. The header's options render as text through
 * the `Stack.Screen` stub, and the "+" sheet is mounted over the screen when
 * the composer pushes it, as the stack presents it, with the photo picker and
 * the re-encoder behind it stood in at their module.
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { captureException } from "@sentry/react-native";
import {
  act,
  render,
  screen,
  userEvent,
  waitFor,
  within,
} from "@testing-library/react-native";
import type { ReactNode } from "react";

import { ATTACHMENT_TRAY } from "@/components/chat";
import AddToChatSheet from "~/app/(tabs)/arnold/attachments";
import ArnoldScreen from "~/app/(tabs)/arnold/index";
import {
  arnoldAttachmentsOwner,
  clearArnoldAttachments,
} from "~/hooks/arnold-attachments";
import type { PickedImage, PickedPhotos } from "~/lib/arnold-attachment-picker";
import {
  loadSavedArnoldConversation,
  savedArnoldSessionId,
} from "~/lib/arnold-chat";
import { sentAttachmentUri } from "~/lib/arnold-sent-attachments";
import { useAppLanguageSync } from "~/lib/i18n";
import { storage } from "~/lib/mmkv";
import { segmentClient } from "~/lib/segment";
import { setDeviceLanguages } from "~/test-utils/device-locales";
import { FAKE_ARNOLD_REPLY, fakeArnold } from "~/test-utils/fake-arnold";
import type * as InMemoryFileSystem from "~/test-utils/in-memory-file-system";
import { PushedRoutes, resetStubRouter } from "~/test-utils/router-stub";

const mockPresentPaywall = jest.fn();

/** What the fake's refusals say: never shown to the User. */
const SERVER_MESSAGE = /Arnold says no/u;

/** The composer's placeholder and Send button, in either device language. */
const COMPOSER = /Message Arnold|Повідомлення для Arnold/u;
const SEND = /Send message|Надіслати повідомлення/u;

/** The Attachments controls, in either device language. */
const ADD_TO_CHAT = /Add to chat|Додати до чату/u;

/** The header's New conversation button, in either device language. */
const NEW_CONVERSATION = /^(New conversation|Нова розмова)$/u;
const PHOTOS = /^(Photos|Фото)$/u;
const REMOVE_PHOTO = /^(Remove photo|Видалити фото) \d+ (of|з) \d+$/u;
const THUMBNAIL = /^(Photo \d+ of \d+|Фото \d+ з \d+)$/u;

/** A sent Attachment's tile in the User's bubble, in either language. */
const SENT_PHOTO = /^(Photo \d+ of \d+|Фото \d+ з \d+)$/u;

/** eve's own placeholder for a file it can't show: never on screen. */
const FILE_PLACEHOLDER = /\[file/u;

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

jest.mock("~/components/touchable-glass", () => {
  const { Pressable } =
    jest.requireActual<typeof import("react-native")>("react-native");

  return { TouchableGlass: Pressable };
});

// The plan card has its own tests, its text in Ukrainian included.
jest.mock("~/components/chat/workout-plan-card", () => ({
  WorkoutPlanCard: () => null,
}));

// Markdown has its own tests; here an answer is read as the text it is.
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

/** The signed-in Clerk User; a test changes it and renders again. */
let mockUserId = "user_arnold_screen";

jest.mock("@clerk/expo", () => ({
  useUser: () => ({ user: { id: mockUserId } }),
}));

// The bearer every eve request carries, resolved per request in the app.
jest.mock("~/lib/clerk", () => ({
  getClerk: () => ({
    session: { getToken: () => Promise.resolve("fake-arnold-token") },
  }),
}));

/** What the system picker answers; `null` is the User cancelling it. */
const mockPickLibraryPhotos =
  jest.fn<(limit: number) => Promise<PickedPhotos | null>>();

/**
 * The bytes a picked photo is sent as: its file read as a `data:` URL. The
 * stand-in encodes the file's own uri, so a test names the photo a part
 * carries without holding an image.
 */
const dataUrlFor = (uri: string) =>
  `data:image/jpeg;base64,${Buffer.from(uri).toString("base64")}`;

const mockReadAttachmentDataUrl = jest.fn<(uri: string) => Promise<string>>();

// The one module importing `expo-image-picker` and `expo-image-manipulator`
// (its own test covers what they are asked for), so no native picker and no
// re-encoding under Jest: a picked photo is a file uri the composer shows.
jest.mock("~/lib/arnold-attachment-picker", () => ({
  pickLibraryPhotos: (limit: number) => mockPickLibraryPhotos(limit),
  readAttachmentDataUrl: (uri: string) => mockReadAttachmentDataUrl(uri),
}));

// The device this Conversation keeps its sent photos on (ADR 0018), in
// memory: jest-expo's own stand-in stores nothing, so a test over it
// couldn't see the copies, nor that a reset took them away.
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

jest.mock("~/lib/segment", () => ({ segmentClient: { track: jest.fn() } }));

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
          title: string;
          unstable_headerRightItems: () => HeaderItem[];
        };
      }) => (
        <View>
          <RNText>{options.title}</RNText>
          {options.unstable_headerRightItems().map((item) => (
            <Pressable
              accessibilityLabel={item.accessibilityLabel ?? item.label}
              accessibilityRole="button"
              disabled={item.disabled}
              key={item.label}
              onPress={item.onPress}
            >
              <RNText>{item.label}</RNText>
            </Pressable>
          ))}
        </View>
      ),
    },
    useLocalSearchParams: () => ({}),
    useRouter: () => ({ ...stub.stubRouter, setParams: jest.fn() }),
  };
});

/** The routes the Arnold screen pushes that a test follows. */
const ARNOLD_ROUTES = { "/arnold/attachments": AddToChatSheet };

/** The screen under the root layout's language sync, with its stack. */
function App() {
  useAppLanguageSync();

  return (
    <>
      <ArnoldScreen />
      <PushedRoutes screens={ARNOLD_ROUTES} />
    </>
  );
}

async function renderArnold() {
  return await render(<App />);
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
  mockUserId = "user_arnold_screen";
  mockPickLibraryPhotos.mockReset();
  mockReadAttachmentDataUrl.mockReset();
  mockReadAttachmentDataUrl.mockImplementation((uri) =>
    Promise.resolve(dataUrlFor(uri))
  );
  jest.mocked(captureException).mockClear();
  clearArnoldAttachments();
  resetStubRouter();
  mockPresentPaywall.mockClear();
  jest.mocked(segmentClient.track).mockClear();
  storage.clearAll();
  fileSystem.reset();
  fakeArnold.install();
  process.env.EXPO_PUBLIC_ARNOLD_URL = fakeArnold.baseUrl;
});

describe("arnold screen", () => {
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

  describe("attachments", () => {
    /**
     * A re-encoded JPEG on this device, as the picker answers one, with its
     * own bytes on the stand-in device, so a copy of it is told from a copy
     * of another photo.
     */
    const photo = (name: string): PickedImage => {
      const uri = `file:///photos/${name}.jpg`;
      fileSystem.write(uri, `${name}-bytes`);

      return { height: 1200, uri, width: 1600 };
    };

    /** The name every device copy is given, and sent as a part's `filename`. */
    const COPY_NAME = /^[0-9a-z]+-\d+-[0-9a-z]+\.jpg$/u;

    /**
     * What this device kept for the photos the saved Conversation's own echo
     * names, in the order they were sent: each copy's bytes, or `undefined`
     * for one this device hasn't got. Read from MMKV and the file system
     * alone, which is all a restarted app has (ADR 0018).
     */
    const keptPhotos = (userId: string): (string | undefined)[] => {
      const { events = [] } = loadSavedArnoldConversation(userId);
      const sessionId = savedArnoldSessionId(userId);

      return events
        .flatMap((event) =>
          event.type === "message.received" ? (event.data.parts ?? []) : []
        )
        .flatMap((part) => (part.type === "file" ? [part.filename ?? ""] : []))
        .map((filename) => {
          const uri = sentAttachmentUri(userId, sessionId, filename);

          return uri === undefined ? undefined : fileSystem.read(uri);
        });
    };

    /** Opens the "+" sheet, as the User does. */
    const openSheet = async () => {
      await userEvent.setup().press(screen.getByLabelText(ADD_TO_CHAT));
    };

    /** Opens the sheet and presses Photos. */
    const pickPhotos = async () => {
      await openSheet();
      await userEvent
        .setup()
        .press(screen.getByRole("button", { name: PHOTOS }));
    };

    /**
     * The file behind each thumbnail in the composer, in the order it was
     * picked (expo-image normalises `source` to a list). Read inside the
     * composer's own tray: a sent Attachment's tile is named the same way,
     * in its own place in the Conversation.
     */
    const thumbnails = () => {
      const tray = screen.queryByTestId(ATTACHMENT_TRAY);

      return tray
        ? within(tray)
            .queryAllByLabelText(THUMBNAIL)
            .map(
              (image) =>
                (image.props as { source: { uri: string }[] }).source[0]?.uri
            )
        : [];
    };

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

    it("shows the picked photos above the text field, named for VoiceOver", async () => {
      mockAttachmentsEnabled = true;
      mockPickLibraryPhotos.mockResolvedValue({
        failed: 0,
        images: [photo("gym"), photo("plan")],
      });
      await renderArnold();
      await pickPhotos();

      expect(screen.getByLabelText("Photo 1 of 2")).toBeTruthy();
      expect(screen.getByLabelText("Photo 2 of 2")).toBeTruthy();

      // Each thumbnail is a stop of its own for VoiceOver: expo-image is
      // not one without `accessible`, label or no label.
      for (const thumbnail of screen.getAllByLabelText(THUMBNAIL)) {
        expect((thumbnail.props as { accessible?: boolean }).accessible).toBe(
          true
        );
      }

      expect(thumbnails()).toEqual([
        "file:///photos/gym.jpg",
        "file:///photos/plan.jpg",
      ]);
      // A whole message's worth of slots, and the sheet is gone once there
      // is something to look at.
      expect(mockPickLibraryPhotos).toHaveBeenCalledWith(4);
      expect(screen.queryByRole("button", { name: PHOTOS })).toBeNull();
    });

    it("drops the photo whose × the User presses", async () => {
      mockAttachmentsEnabled = true;
      mockPickLibraryPhotos.mockResolvedValue({
        failed: 0,
        images: [photo("gym"), photo("plan")],
      });
      await renderArnold();
      await pickPhotos();

      expect(screen.getByLabelText("Remove photo 2 of 2")).toBeTruthy();
      const [first] = screen.getAllByLabelText(REMOVE_PHOTO);
      await userEvent.setup().press(first);

      expect(thumbnails()).toEqual(["file:///photos/plan.jpg"]);
      expect(screen.getByLabelText("Photo 1 of 1")).toBeTruthy();
    });

    it("asks only for the slots left, then says when the message is full", async () => {
      mockAttachmentsEnabled = true;
      mockPickLibraryPhotos.mockResolvedValue({
        failed: 0,
        images: [photo("a"), photo("b")],
      });
      await renderArnold();
      await pickPhotos();
      mockPickLibraryPhotos.mockResolvedValue({
        failed: 0,
        images: [photo("c"), photo("d")],
      });
      await pickPhotos();

      expect(mockPickLibraryPhotos).toHaveBeenLastCalledWith(2);
      expect(thumbnails()).toHaveLength(4);

      // A fifth wouldn't fit the request body Arnold takes, so the sheet
      // says so and Photos opens no picker that could take nothing.
      await openSheet();

      expect(
        screen.getByText("You can add up to 4 photos to a message.")
      ).toBeTruthy();
      await userEvent
        .setup()
        .press(screen.getByRole("button", { name: PHOTOS }));
      expect(mockPickLibraryPhotos).toHaveBeenCalledTimes(2);
      expect(thumbnails()).toHaveLength(4);
    });

    it("says so, and keeps the sheet open, when no photo could be read", async () => {
      mockAttachmentsEnabled = true;
      // A RAW or a broken file: the picker gave it, the re-encoder couldn't.
      mockPickLibraryPhotos.mockResolvedValue({ failed: 1, images: [] });
      await renderArnold();
      await pickPhotos();

      expect(
        screen.getByText("Couldn't add that photo. Try another one.")
      ).toBeTruthy();
      expect(thumbnails()).toEqual([]);
      expect(screen.getByRole("button", { name: PHOTOS })).toBeTruthy();
    });

    it("changes nothing when the User cancels the picker", async () => {
      mockAttachmentsEnabled = true;
      mockPickLibraryPhotos.mockResolvedValue(null);
      await renderArnold();
      await pickPhotos();

      expect(thumbnails()).toEqual([]);
      // Still the sheet: nothing was picked, so nothing closed it.
      expect(screen.getByRole("button", { name: PHOTOS })).toBeTruthy();
    });

    it("sends them as JPEG data URLs after the text, in pick order", async () => {
      mockAttachmentsEnabled = true;
      mockPickLibraryPhotos.mockResolvedValue({
        failed: 0,
        images: [photo("gym"), photo("plan")],
      });
      await renderArnold();
      await pickPhotos();
      await send("What is this machine?");

      await waitFor(() => expect(fakeArnold.sent).toHaveLength(1));
      expect(fakeArnold.sent[0]?.parts).toEqual([
        { text: "What is this machine?", type: "text" },
        {
          data: dataUrlFor("file:///photos/gym.jpg"),
          // The name this device kept its copy under, which eve's echo
          // brings back (ADR 0018).
          filename: expect.stringMatching(COPY_NAME),
          mediaType: "image/jpeg",
          type: "file",
        },
        {
          data: dataUrlFor("file:///photos/plan.jpg"),
          filename: expect.stringMatching(COPY_NAME),
          mediaType: "image/jpeg",
          type: "file",
        },
      ]);
    });

    it("sends a photo with no text at all", async () => {
      mockAttachmentsEnabled = true;
      mockPickLibraryPhotos.mockResolvedValue({
        failed: 0,
        images: [photo("gym")],
      });
      await renderArnold();
      await pickPhotos();
      await userEvent.setup().press(screen.getByLabelText(SEND));

      await waitFor(() => expect(fakeArnold.sent).toHaveLength(1));
      expect(fakeArnold.sent[0]?.parts).toEqual([
        {
          data: dataUrlFor("file:///photos/gym.jpg"),
          filename: expect.stringMatching(COPY_NAME),
          mediaType: "image/jpeg",
          type: "file",
        },
      ]);
      // Sent, so the composer is empty again, text and thumbnails alike.
      expect(thumbnails()).toEqual([]);
      await waitFor(() =>
        expect(screen.getByText(FAKE_ARNOLD_REPLY)).toBeTruthy()
      );
    });

    it("shows a Photo tile per Attachment, before and after the echo", async () => {
      mockAttachmentsEnabled = true;
      mockPickLibraryPhotos.mockResolvedValue({
        failed: 0,
        images: [photo("gym"), photo("plan")],
      });
      await renderArnold();
      await pickPhotos();
      // Held, so the bubble on screen is eve's own optimistic message, the
      // one whose summary carries the `[file: …]` placeholders.
      const release = fakeArnold.holdNextSend();
      await send("What is this machine?");

      expect(screen.getByText("What is this machine?")).toBeTruthy();
      expect(screen.getAllByLabelText(SENT_PHOTO)).toHaveLength(2);
      expect(screen.queryByText(FILE_PLACEHOLDER)).toBeNull();

      release();
      await waitFor(() =>
        expect(screen.getByText(FAKE_ARNOLD_REPLY)).toBeTruthy()
      );

      // Arnold's echo replaces that message, and carries the files as
      // metadata only, so the tiles stand for them there too.
      expect(screen.getByText("What is this machine?")).toBeTruthy();
      expect(screen.getAllByLabelText(SENT_PHOTO)).toHaveLength(2);
      expect(screen.queryByText(FILE_PLACEHOLDER)).toBeNull();
    });

    it("shows no tile on a message sent without one", async () => {
      mockAttachmentsEnabled = true;
      await renderArnold();
      await send("How heavy should I squat?");

      await waitFor(() =>
        expect(screen.getByText(FAKE_ARNOLD_REPLY)).toBeTruthy()
      );
      expect(screen.queryAllByLabelText(SENT_PHOTO)).toEqual([]);
    });

    it("tells Segment how many went, and nothing about them", async () => {
      mockAttachmentsEnabled = true;
      mockPickLibraryPhotos.mockResolvedValue({
        failed: 0,
        images: [photo("gym"), photo("plan")],
      });
      await renderArnold();
      await pickPhotos();
      await send("What is this machine?");

      await waitFor(() => expect(fakeArnold.sent).toHaveLength(1));
      expect(jest.mocked(segmentClient.track).mock.calls).toEqual([
        ["Arnold Attachment Sent", { count: 2 }],
      ]);
    });

    it("tells Segment nothing about a message sent without one", async () => {
      mockAttachmentsEnabled = true;
      await renderArnold();
      await send("How heavy should I squat?");

      await waitFor(() => expect(fakeArnold.sent).toHaveLength(1));
      expect(segmentClient.track).not.toHaveBeenCalled();
    });

    it("gives a failed send's text and photos back to the composer", async () => {
      mockAttachmentsEnabled = true;
      mockPickLibraryPhotos.mockResolvedValue({
        failed: 0,
        images: [photo("gym"), photo("plan")],
      });
      fakeArnold.failNextSend({ status: 500 });
      await renderArnold();
      await pickPhotos();
      await send("What is this machine?");

      await waitFor(() =>
        expect(
          screen.getByText("Something went wrong. Try again.")
        ).toBeTruthy()
      );
      // Back in the composer, text and thumbnails alike, so the User sends
      // again without re-picking either.
      expect(screen.getByDisplayValue("What is this machine?")).toBeTruthy();
      expect(thumbnails()).toEqual([
        "file:///photos/gym.jpg",
        "file:///photos/plan.jpg",
      ]);
      // And the bubble of the send that never went through stays hidden:
      // every Photo label on screen is one of the composer's own.
      expect(screen.queryByText("What is this machine?")).toBeNull();
      expect(screen.getAllByLabelText(THUMBNAIL)).toHaveLength(2);
      expect(screen.queryByText(FILE_PLACEHOLDER)).toBeNull();
    });

    it("gives them back when Arnold refuses the send, before the paywall", async () => {
      mockAttachmentsEnabled = true;
      mockPickLibraryPhotos.mockResolvedValue({
        failed: 0,
        images: [photo("gym"), photo("plan")],
      });
      // Not Pro: the same rules as a text-only send, so the paywall opens
      // and the message waits in the composer behind it.
      fakeArnold.failNextSend("pro-required");
      await renderArnold();
      await pickPhotos();
      await send("What is this machine?");

      await waitFor(() => expect(mockPresentPaywall).toHaveBeenCalledTimes(1));
      expect(screen.getByDisplayValue("What is this machine?")).toBeTruthy();
      expect(thumbnails()).toEqual([
        "file:///photos/gym.jpg",
        "file:///photos/plan.jpg",
      ]);
      expect(screen.queryByText("What is this machine?")).toBeNull();
      expect(screen.getAllByLabelText(THUMBNAIL)).toHaveLength(2);
      expect(screen.queryByText(SERVER_MESSAGE)).toBeNull();
    });

    it("gives back a failed send that was a photo and nothing else", async () => {
      mockAttachmentsEnabled = true;
      mockPickLibraryPhotos.mockResolvedValue({
        failed: 0,
        images: [photo("gym")],
      });
      fakeArnold.failNextSend({ status: 500 });
      await renderArnold();
      await pickPhotos();
      await userEvent.setup().press(screen.getByLabelText(SEND));

      await waitFor(() =>
        expect(
          screen.getByText("Something went wrong. Try again.")
        ).toBeTruthy()
      );
      // The photo was the whole message, so it is the whole draft back.
      expect(thumbnails()).toEqual(["file:///photos/gym.jpg"]);
      expect(screen.getByDisplayValue("")).toBeTruthy();
    });

    it("sends the same photos again when the User retries", async () => {
      mockAttachmentsEnabled = true;
      mockPickLibraryPhotos.mockResolvedValue({
        failed: 0,
        images: [photo("gym"), photo("plan")],
      });
      fakeArnold.failNextSend({ status: 500 });
      await renderArnold();
      await pickPhotos();
      await send("What is this machine?");
      await waitFor(() =>
        expect(
          screen.getByText("Something went wrong. Try again.")
        ).toBeTruthy()
      );

      // Nothing to re-pick or retype: Send carries what came back.
      await userEvent.setup().press(screen.getByLabelText(SEND));

      await waitFor(() => expect(fakeArnold.sent).toHaveLength(1));
      expect(fakeArnold.sent[0]?.parts).toEqual([
        { text: "What is this machine?", type: "text" },
        {
          data: dataUrlFor("file:///photos/gym.jpg"),
          // The retry writes its own device copies, so its own names.
          filename: expect.stringMatching(COPY_NAME),
          mediaType: "image/jpeg",
          type: "file",
        },
        {
          data: dataUrlFor("file:///photos/plan.jpg"),
          filename: expect.stringMatching(COPY_NAME),
          mediaType: "image/jpeg",
          type: "file",
        },
      ]);
      // Gone from the composer, now that they have gone out.
      expect(thumbnails()).toEqual([]);
      await waitFor(() =>
        expect(screen.getByText(FAKE_ARNOLD_REPLY)).toBeTruthy()
      );
    });

    it("gives a message back when a photo can't be read off the device", async () => {
      mockAttachmentsEnabled = true;
      mockPickLibraryPhotos.mockResolvedValue({
        failed: 0,
        images: [photo("gym"), photo("plan")],
      });
      // The cache the re-encoder wrote to can be purged under memory
      // pressure, so the file a send reads may be gone by then.
      mockReadAttachmentDataUrl.mockRejectedValue(new Error("No such file"));
      await renderArnold();
      await pickPhotos();
      await send("What is this machine?");

      await waitFor(() => expect(captureException).toHaveBeenCalled());
      // Nothing went out, and the message is in the composer to send again,
      // photos and all, rather than quietly lost.
      expect(fakeArnold.sent).toEqual([]);
      expect(screen.getByDisplayValue("What is this machine?")).toBeTruthy();
      expect(thumbnails()).toEqual([
        "file:///photos/gym.jpg",
        "file:///photos/plan.jpg",
      ]);
    });

    it("gives a message back to nobody once another User has signed in", async () => {
      mockAttachmentsEnabled = true;
      mockPickLibraryPhotos.mockResolvedValue({
        failed: 0,
        images: [photo("gym")],
      });
      let readStarted!: () => void;

      const reading = new Promise<void>((resolve) => {
        readStarted = resolve;
      });

      let letTheReadFail!: () => void;

      const readFails = new Promise<void>((resolve) => {
        letTheReadFail = resolve;
      });

      // Held mid-read, so the User is gone by the time it fails.
      mockReadAttachmentDataUrl.mockImplementation(async () => {
        readStarted();
        await readFails;
        throw new Error("No such file");
      });
      const { rerender } = await renderArnold();
      await pickPhotos();
      await send("What is this machine?");
      await reading;

      // Another User signs in: the screen is rebuilt for them (a new `key`,
      // since the screen reads the User from Clerk, not from a prop).
      mockUserId = "user_someone_else";
      await act(async () => {
        await rerender(<App key={mockUserId} />);
      });
      // The next User's screen is up, with their own empty composer, before
      // the read fails: that is when the photos must go to nobody.
      await waitFor(() =>
        expect(arnoldAttachmentsOwner()).toBe("user_someone_else")
      );
      await act(async () => {
        letTheReadFail();
        await Promise.resolve();
      });

      await waitFor(() => expect(captureException).toHaveBeenCalled());
      // Let the composer render whatever it was given back.
      await act(async () => {
        await Promise.resolve();
      });
      expect(thumbnails()).toEqual([]);
    });

    it("sends nothing into a Conversation started while a photo was read", async () => {
      mockAttachmentsEnabled = true;
      mockPickLibraryPhotos.mockResolvedValue({
        failed: 0,
        images: [photo("gym")],
      });

      let readStarted!: () => void;

      const reading = new Promise<void>((resolve) => {
        readStarted = resolve;
      });

      let finishTheRead!: () => void;

      const read = new Promise<void>((resolve) => {
        finishTheRead = resolve;
      });

      // Held mid-read: the send has no turn yet, so nothing is busy and the
      // header's New conversation button is live.
      mockReadAttachmentDataUrl.mockImplementation(async (uri) => {
        readStarted();
        await read;

        return dataUrlFor(uri);
      });
      await renderArnold();
      await pickPhotos();
      await send("What is this machine?");
      await reading;

      await userEvent.setup().press(screen.getByLabelText(NEW_CONVERSATION));
      await act(async () => {
        finishTheRead();
        await Promise.resolve();
      });

      // The message was for the Conversation the User left, so it never
      // reaches Arnold and never shows in the new one.
      await waitFor(() => expect(screen.getByText("Ask Arnold")).toBeTruthy());
      expect(fakeArnold.sent).toEqual([]);
      expect(screen.queryByText("What is this machine?")).toBeNull();
    });

    it("picks photos and says the message is full in Ukrainian", async () => {
      mockAttachmentsEnabled = true;
      setDeviceLanguages(["uk-UA"]);
      mockPickLibraryPhotos.mockResolvedValue({
        failed: 0,
        images: [photo("a"), photo("b"), photo("c"), photo("d")],
      });
      await renderArnold();
      await pickPhotos();

      expect(screen.getByLabelText("Фото 1 з 4")).toBeTruthy();
      expect(screen.getByLabelText("Видалити фото 1 з 4")).toBeTruthy();
      expect(screen.getAllByLabelText(REMOVE_PHOTO)).toHaveLength(4);
      expect(screen.queryByLabelText("Photo 1 of 4")).toBeNull();

      await openSheet();

      expect(
        screen.getByText("В одне повідомлення можна додати не більше 4 фото.")
      ).toBeTruthy();
    });

    it("names a sent photo's tile in Ukrainian", async () => {
      mockAttachmentsEnabled = true;
      setDeviceLanguages(["uk-UA"]);
      mockPickLibraryPhotos.mockResolvedValue({
        failed: 0,
        images: [photo("gym"), photo("plan")],
      });
      await renderArnold();
      await pickPhotos();
      await send("Що це за тренажер?");

      await waitFor(() =>
        expect(screen.getByText(FAKE_ARNOLD_REPLY)).toBeTruthy()
      );
      expect(screen.getByLabelText("Фото 1 з 2")).toBeTruthy();
      expect(screen.getByLabelText("Фото 2 з 2")).toBeTruthy();
      expect(screen.getAllByText("Фото")).toHaveLength(2);
      expect(screen.queryByLabelText("Photo 1 of 2")).toBeNull();
    });

    /**
     * The device copy of a sent Attachment (ADR 0018): eve's echo carries an
     * Attachment's metadata and never its bytes, so what a bubble shows comes
     * from the phone. Nothing on screen changes yet; these read the copies the
     * way a reopened or restarted app does, through the saved Conversation.
     */
    describe("the device copy", () => {
      /** Sends two photos and waits for Arnold's answer and the saved turn. */
      const sendTwoPhotos = async (text = "What is this machine?") => {
        mockPickLibraryPhotos.mockResolvedValue({
          failed: 0,
          images: [photo("gym"), photo("plan")],
        });
        await renderArnold();
        await pickPhotos();
        await send(text);

        await waitFor(() =>
          expect(screen.getByText(FAKE_ARNOLD_REPLY)).toBeTruthy()
        );
        await waitFor(() =>
          expect(
            loadSavedArnoldConversation("user_arnold_screen").events
          ).toBeTruthy()
        );
      };

      it("keeps one photo per Attachment, found again by the echo's name", async () => {
        mockAttachmentsEnabled = true;
        await sendTwoPhotos();

        // Found from MMKV and the file system alone, which is all the app
        // has after a restart, and in the order they were sent.
        expect(keptPhotos("user_arnold_screen")).toEqual([
          "gym-bytes",
          "plan-bytes",
        ]);
      });

      it("keeps them under the Conversation, not loose on the device", async () => {
        mockAttachmentsEnabled = true;
        await sendTwoPhotos();

        const [sessionId] = fakeArnold.sessionIds;

        expect(
          fileSystem.filesUnder(
            `file:///memory/document/arnold-attachments/user_arnold_screen/${sessionId}`
          )
        ).toHaveLength(2);
      });

      it("keeps them through a reopened screen", async () => {
        mockAttachmentsEnabled = true;
        const { unmount } = await renderArnold();
        mockPickLibraryPhotos.mockResolvedValue({
          failed: 0,
          images: [photo("gym")],
        });
        await pickPhotos();
        await send("What is this machine?");
        await waitFor(() =>
          expect(screen.getByText(FAKE_ARNOLD_REPLY)).toBeTruthy()
        );
        await waitFor(() =>
          expect(
            loadSavedArnoldConversation("user_arnold_screen").events
          ).toBeTruthy()
        );
        await unmount();

        // Resuming the saved Conversation reports its session again, which
        // must not be read as a session replacing it.
        await renderArnold();
        await waitFor(() =>
          expect(screen.getByText(FAKE_ARNOLD_REPLY)).toBeTruthy()
        );

        expect(keptPhotos("user_arnold_screen")).toEqual(["gym-bytes"]);
      });

      it("takes them away with the Conversation the '+' resets", async () => {
        mockAttachmentsEnabled = true;
        await sendTwoPhotos();

        await userEvent.setup().press(screen.getByLabelText(NEW_CONVERSATION));

        await waitFor(() =>
          expect(screen.getByText("Ask Arnold")).toBeTruthy()
        );
        expect(
          fileSystem.filesUnder(
            "file:///memory/document/arnold-attachments/user_arnold_screen"
          )
        ).toEqual([]);
      });

      it("keeps them through a sign-out, and never shows another User's", async () => {
        mockAttachmentsEnabled = true;
        await sendTwoPhotos();

        const theirs = keptPhotos("user_arnold_screen");

        // Another User signs in on the same phone: the first User's photos
        // are still on it, and this one's Conversation lists none of them.
        mockUserId = "user_someone_else";
        await renderArnold();

        expect(keptPhotos("user_someone_else")).toEqual([]);
        expect(theirs).toEqual(["gym-bytes", "plan-bytes"]);
        expect(keptPhotos("user_arnold_screen")).toEqual([
          "gym-bytes",
          "plan-bytes",
        ]);
      });

      it("takes back the copies of a send Arnold refused", async () => {
        mockAttachmentsEnabled = true;
        mockPickLibraryPhotos.mockResolvedValue({
          failed: 0,
          images: [photo("gym"), photo("plan")],
        });
        fakeArnold.failNextSend({ status: 500 });
        await renderArnold();
        await pickPhotos();
        await send("What is this machine?");

        await waitFor(() =>
          expect(
            screen.getByText("Something went wrong. Try again.")
          ).toBeTruthy()
        );

        // The photos are in the composer again (FIT-586), so no message
        // names those copies and a retry writes its own: leaving them would
        // pile up a photo on the device per failed try.
        expect(thumbnails()).toHaveLength(2);
        expect(
          fileSystem.filesUnder(
            "file:///memory/document/arnold-attachments/user_arnold_screen"
          )
        ).toEqual([]);
      });

      it("keeps only the retry's copies when a failed send is sent again", async () => {
        mockAttachmentsEnabled = true;
        mockPickLibraryPhotos.mockResolvedValue({
          failed: 0,
          images: [photo("gym")],
        });
        fakeArnold.failNextSend({ status: 500 });
        await renderArnold();
        await pickPhotos();
        await send("What is this machine?");
        await waitFor(() =>
          expect(
            screen.getByText("Something went wrong. Try again.")
          ).toBeTruthy()
        );

        // Sent again with the photo the composer gave back.
        await userEvent.setup().press(screen.getByLabelText(SEND));
        await waitFor(() =>
          expect(screen.getByText(FAKE_ARNOLD_REPLY)).toBeTruthy()
        );
        await waitFor(() =>
          expect(
            loadSavedArnoldConversation("user_arnold_screen").events
          ).toBeTruthy()
        );

        expect(keptPhotos("user_arnold_screen")).toEqual(["gym-bytes"]);
        expect(
          fileSystem.filesUnder(
            "file:///memory/document/arnold-attachments/user_arnold_screen"
          )
        ).toHaveLength(1);
      });

      it("drops a send whose Conversation was replaced mid-copy", async () => {
        mockAttachmentsEnabled = true;
        mockPickLibraryPhotos.mockResolvedValue({
          failed: 0,
          images: [photo("gym")],
        });
        // Held mid-copy: the send has no turn yet, so nothing is busy and
        // the header's New conversation button is live.
        const copy = fileSystem.holdNextCopy();
        await renderArnold();
        await pickPhotos();
        await send("What is this machine?");
        await copy.started;

        await userEvent.setup().press(screen.getByLabelText(NEW_CONVERSATION));
        await act(async () => {
          copy.release();
          await Promise.resolve();
        });

        // The message was for the Conversation the User left, so it never
        // reaches Arnold and never shows in the new one.
        await waitFor(() =>
          expect(screen.getByText("Ask Arnold")).toBeTruthy()
        );
        expect(fakeArnold.sent).toEqual([]);
        expect(screen.queryByText("What is this machine?")).toBeNull();
        // And its copy comes back off the device with it.
        expect(
          fileSystem.filesUnder(
            "file:///memory/document/arnold-attachments/user_arnold_screen"
          )
        ).toEqual([]);
      });

      it("sends a photo it could not copy, and keeps nothing for it", async () => {
        mockAttachmentsEnabled = true;
        mockPickLibraryPhotos.mockResolvedValue({
          failed: 0,
          // Never written to the stand-in device: the cache the re-encoder
          // wrote to was purged before the send.
          images: [
            { height: 1200, uri: "file:///photos/gone.jpg", width: 1600 },
          ],
        });
        await renderArnold();
        await pickPhotos();
        await send("What is this machine?");

        // The message still goes, so a disk that refuses the copy costs the
        // User a thumbnail, never the message.
        await waitFor(() => expect(fakeArnold.sent).toHaveLength(1));
        await waitFor(() =>
          expect(screen.getByText(FAKE_ARNOLD_REPLY)).toBeTruthy()
        );
        await waitFor(() =>
          expect(
            loadSavedArnoldConversation("user_arnold_screen").events
          ).toBeTruthy()
        );

        expect(keptPhotos("user_arnold_screen")).toEqual([undefined]);
      });
    });
  });
});
