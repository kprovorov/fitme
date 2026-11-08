/**
 * Arnold's "+" sheet: the two things it offers, in the App language. The
 * mockup's Files button, Research and Web search toggles and Add to project,
 * Style and Tool access rows are gone, so a User never meets a dead control.
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { render, screen } from "@testing-library/react-native";

import AddToChatSheet from "~/app/(tabs)/arnold/attachments";
import {
  clearArnoldAttachments,
  MAX_ATTACHMENTS_PER_CONVERSATION,
  setConversationAttachmentCount,
  useArnoldAttachmentsOwner,
} from "~/hooks/arnold-attachments";
import { setDeviceLanguages } from "~/test-utils/device-locales";
import { InAppLanguage } from "~/test-utils/in-app-language";

jest.mock("~/components/symbol-image", () => ({ SymbolImage: () => null }));

jest.mock("expo-router/react-navigation", () => ({ useHeaderHeight: () => 0 }));

// expo-router's own module can't load under Jest (an ESM dependency), and
// the sheet only needs the pop that follows a pick.
jest.mock("expo-router", () => {
  const stub = jest.requireActual<typeof import("~/test-utils/router-stub")>(
    "~/test-utils/router-stub"
  );

  return { useRouter: () => stub.stubRouter };
});

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
}));

/** The mockup's controls, as it worded them before the catalogs dropped them. */
const DROPPED = {
  en: [
    "Files",
    "Research",
    "Web search",
    "Add to project",
    "Choose style",
    "Tool access",
  ],
  uk: [
    "Файли",
    "Дослідження",
    "Пошук в інтернеті",
    "Додати до проєкту",
    "Вибрати стиль",
    "Доступ до інструментів",
  ],
} as const;

const renderSheet = async () => {
  await render(
    <InAppLanguage>
      <AddToChatSheet />
    </InAppLanguage>
  );
};

beforeEach(() => {
  clearArnoldAttachments();
  setConversationAttachmentCount(0);
  useArnoldAttachmentsOwner("user_sheet");
});

describe("arnold's attachments sheet", () => {
  it("offers only Camera and Photos on an English device", async () => {
    await renderSheet();

    // Buttons, not labelled slabs: VoiceOver has to offer them as actions.
    expect(screen.getByRole("button", { name: "Camera" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Photos" })).toBeTruthy();

    for (const dropped of DROPPED.en) {
      expect(screen.queryByText(dropped)).toBeNull();
    }
  });

  it("offers only Camera and Photos in Ukrainian on a Ukrainian device", async () => {
    setDeviceLanguages(["uk-UA"]);
    await renderSheet();

    expect(screen.getByRole("button", { name: "Камера" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Фото" })).toBeTruthy();
    expect(screen.queryByText("Camera")).toBeNull();

    for (const dropped of DROPPED.uk) {
      expect(screen.queryByText(dropped)).toBeNull();
    }
  });

  it("names the Conversation's cap, not the message's, when that's what's full", async () => {
    // Reached from the composer before "+" went disabled: the message would
    // hold four more, so the message's cap would be the wrong thing to say.
    setConversationAttachmentCount(MAX_ATTACHMENTS_PER_CONVERSATION);
    await renderSheet();

    expect(
      screen.getByText(
        "A conversation can hold 10 photos. Start a new conversation to add more."
      )
    ).toBeTruthy();
    expect(
      screen.queryByText("You can add up to 4 photos to a message.")
    ).toBeNull();
    expect(screen.getByRole("button", { name: "Photos" })).toBeDisabled();
  });
});
