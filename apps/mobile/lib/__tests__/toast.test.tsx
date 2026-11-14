import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { useTranslation } from "react-i18next";
import { AccessibilityInfo, Platform, Pressable, Text } from "react-native";

import { Toaster } from "~/components/ui/toast";
import { showToast, toastDuration } from "~/lib/toast";

// A Screen that shows a toast from the catalog, with the app's Toaster beside
// it as the root layout renders it.
const ShowsToast = () => {
  const { t } = useTranslation();

  return (
    <>
      <Pressable onPress={() => showToast(t("common.genericError"))}>
        <Text>{t("common.tryAgain")}</Text>
      </Pressable>
      <Toaster />
    </>
  );
};

const MESSAGE = "Something went wrong. Please try again later.";

describe("showToast", () => {
  const os = Platform.OS;
  let announce: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    announce = jest
      .spyOn(AccessibilityInfo, "announceForAccessibilityWithOptions")
      .mockReturnValue(undefined);
  });

  afterEach(() => {
    Platform.OS = os;
    announce.mockRestore();
  });

  it("shows the catalog text in the Toaster", async () => {
    await render(<ShowsToast />);
    expect(screen.queryByText(MESSAGE)).toBeNull();

    await fireEvent.press(screen.getByText("Try Again"));

    expect(screen.getByText(MESSAGE)).toBeTruthy();
  });

  it("shows each toast it is asked for", async () => {
    await render(<Toaster />);

    await act(() => {
      showToast("First");
      showToast("Second");
    });

    expect(screen.getByText("First")).toBeTruthy();
    expect(screen.getByText("Second")).toBeTruthy();
  });

  it("has VoiceOver read the message on iOS", async () => {
    Platform.OS = "ios";
    await render(<ShowsToast />);

    await fireEvent.press(screen.getByText("Try Again"));

    expect(announce).toHaveBeenCalledWith(MESSAGE, { queue: true });
  });

  it("leaves Android to the toast's own live region", async () => {
    Platform.OS = "android";
    await render(<ShowsToast />);

    await fireEvent.press(screen.getByText("Try Again"));

    expect(announce).not.toHaveBeenCalled();
    expect(screen.getByText(MESSAGE)).toBeTruthy();
  });

  // The two run in order: the first leaves a toast, which the stand-in never
  // hides, and the second finds it gone (`resetToasts` in after-each.ts).
  it("leaves a toast behind", async () => {
    await render(<Toaster />);
    await act(() => {
      showToast("Left over");
    });

    expect(screen.getByText("Left over")).toBeTruthy();
  });

  it("starts the next test with no toast on screen", async () => {
    await render(<Toaster />);

    expect(screen.queryByText("Left over")).toBeNull();
  });
});

describe("toastDuration", () => {
  it("keeps a short message up for sonner-native's 4 s", () => {
    expect(toastDuration("")).toBe(4000);
  });

  it("keeps a longer message up longer, to read it", () => {
    expect(toastDuration(MESSAGE)).toBe(4000 + MESSAGE.length * 60);
  });

  it("never keeps one up for more than 10 s", () => {
    expect(toastDuration("x".repeat(500))).toBe(10_000);
  });
});
