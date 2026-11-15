/**
 * The Profile Photo sheet over Edit Profile, on the mounted-screen seam: the
 * real screens, with Clerk for the fake Clerk User, the Public API's `fetch`
 * for the fake one, and the picker module (the camera and its permission
 * included) stood in, in English and Ukrainian. What a test asserts is what
 * the User sees and the calls that reached Clerk.
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import * as Sentry from "@sentry/react-native";
import { QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Alert, Linking } from "react-native";
import type { AlertButton } from "react-native";

import ProfilePhotoSheet from "~/app/profile-photo";
import EditProfileScreen from "~/app/settings/edit-profile";
import type { CameraPhoto, PickedImage } from "~/lib/arnold-attachment-picker";
import { setDeviceLanguages } from "~/test-utils/device-locales";
import { DEFAULT_IMAGE_URL, fakeClerk } from "~/test-utils/fake-clerk";
import { backend, FAKE_USER_ID } from "~/test-utils/fake-public-api";
import { InAppLanguage } from "~/test-utils/in-app-language";
import { createTestQueryClient, settle } from "~/test-utils/query-client";
import {
  pushedRoutes,
  PushedRoutes,
  resetStubRouter,
} from "~/test-utils/router-stub";

jest.mock("expo-router", () => {
  const stub = jest.requireActual<typeof import("~/test-utils/router-stub")>(
    "~/test-utils/router-stub"
  );

  return {
    router: stub.stubRouter,
    Stack: { Screen: stub.StackScreenStub },
    useRouter: () => stub.stubRouter,
  };
});

jest.mock("expo-router/react-navigation", () => ({ useHeaderHeight: () => 0 }));

jest.mock("@sentry/react-native", () => ({ captureException: jest.fn() }));

jest.mock("~/lib/segment", () => ({
  segmentClient: { track: jest.fn() },
}));

jest.mock(
  "@clerk/expo",
  () =>
    jest.requireActual<typeof import("~/test-utils/fake-clerk")>(
      "~/test-utils/fake-clerk"
    ).clerkModule
);

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
}));

// Reanimated's worklets need a native module; the form only needs a View.
jest.mock("react-native-reanimated", () => {
  const { View } =
    jest.requireActual<typeof import("react-native")>("react-native");

  return {
    __esModule: true,
    default: { View },
    useAnimatedStyle: () => ({}),
    useSharedValue: (value: number) => ({ value }),
    withTiming: (value: number) => value,
  };
});

jest.mock("~/components/ui/button", () =>
  jest.requireActual("~/test-utils/button-stub")
);

jest.mock("~/components/ui/picker", () => ({ Picker: () => null }));

const mockPickSquareLibraryPhoto = jest.fn<() => Promise<PickedImage | null>>();
const mockTakeSquarePhoto = jest.fn<() => Promise<CameraPhoto>>();

// The camera, the photo picker and the re-encoding are native: the stand-in
// answers what the User picked or took, already square, and its bytes are
// the uri encoded.
jest.mock("~/lib/arnold-attachment-picker", () => ({
  pickSquareLibraryPhoto: () => mockPickSquareLibraryPhoto(),
  readAttachmentDataUrl: (uri: string) =>
    Promise.resolve(`data:image/jpeg;base64,${btoa(uri)}`),
  takeSquarePhoto: () => mockTakeSquarePhoto(),
}));

const openSettings = jest.spyOn(Linking, "openSettings");

const MY_PHOTO = "https://img.clerk.com/tony.jpg";

/** A square photo the stood-in picker or camera answers. */
const square = (uri: string): PickedImage => ({
  height: 1024,
  uri,
  width: 1024,
});

/** The data URL a picked photo goes up to Clerk as. */
const dataUrlOf = (uri: string) => `data:image/jpeg;base64,${btoa(uri)}`;

/** Every `setProfileImage` call that reached Clerk, failed ones included. */
const photoCalls = () =>
  fakeClerk.calls
    .filter(({ method }) => method === "setProfileImage")
    .map(({ params }) => params);

/** The photo Edit Profile shows. */
const shownPhoto = () =>
  screen.getByTestId("edit-profile-photo").props.source as { uri: string };

const isSheetOpen = () =>
  pushedRoutes().some(({ pathname }) => pathname === "/profile-photo");

const alertCalls = () =>
  jest.mocked(Alert.alert).mock.calls as [string, string, AlertButton[]?][];

/** Presses the button named `label` in the last alert shown. */
const pressInAlert = async (label: string) => {
  const buttons = alertCalls().at(-1)?.[2] ?? [];

  await act(() => buttons.find(({ text }) => text === label)?.onPress?.());
};

let queryClient = createTestQueryClient();

/** Edit Profile, then the sheet opened from its photo. */
const openSheet = async () => {
  queryClient = createTestQueryClient();
  await render(
    <QueryClientProvider client={queryClient}>
      <InAppLanguage>
        <EditProfileScreen />
        <PushedRoutes screens={{ "/profile-photo": ProfilePhotoSheet }} />
      </InAppLanguage>
    </QueryClientProvider>
  );
  await settle(queryClient);
  await fireEvent.press(screen.getByTestId("edit-profile-photo-button"));
};

const press = async (testID: string) => {
  await fireEvent.press(screen.getByTestId(testID));
  await settle(queryClient);
};

describe("Profile Photo sheet", () => {
  beforeEach(() => {
    setDeviceLanguages(["en-GB"]);
    jest.clearAllMocks();
    jest.spyOn(Alert, "alert").mockReturnValue(undefined);
    openSettings.mockResolvedValue(undefined);
    resetStubRouter();
    backend.reset();
    backend.seedProfile(FAKE_USER_ID);
    fakeClerk.setUser({
      firstName: "Tony",
      imageUrl: MY_PHOTO,
      lastName: "Stark",
    });
    mockPickSquareLibraryPhoto.mockResolvedValue(square("file:///me.jpg"));
    mockTakeSquarePhoto.mockResolvedValue({
      image: square("file:///selfie.jpg"),
      status: "taken",
    });
  });

  it("opens from the photo, with every option for a photo of the User's own", async () => {
    await openSheet();

    expect(
      screen.getByRole("button", { name: "Change profile photo" })
    ).toBeTruthy();
    expect(screen.getByText("Change Photo")).toBeTruthy();
    expect(screen.getByText("Profile Photo")).toBeTruthy();

    for (const label of [
      "Choose from Library",
      "Take Photo",
      "Remove Photo",
      "Cancel",
    ]) {
      expect(screen.getByRole("button", { name: label })).toBeTruthy();
    }
  });

  it("offers no Remove Photo while the User has Clerk's default picture", async () => {
    fakeClerk.setUser({ firstName: "Tony" });
    await openSheet();

    expect(screen.getByRole("button", { name: "Take Photo" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Remove Photo" })).toBeNull();
  });

  it("uploads a photo chosen from the library at once, and Edit Profile shows it", async () => {
    await openSheet();
    await press("profile-photo-library");

    expect(photoCalls()).toEqual([{ file: dataUrlOf("file:///me.jpg") }]);
    expect(isSheetOpen()).toBe(false);
    expect(shownPhoto().uri).not.toBe(MY_PHOTO);
    expect(shownPhoto().uri).toMatch(/fake-upload-1/u);
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it("uploads a photo taken with the camera at once", async () => {
    await openSheet();
    await press("profile-photo-camera");

    expect(photoCalls()).toEqual([{ file: dataUrlOf("file:///selfie.jpg") }]);
    expect(isSheetOpen()).toBe(false);
    expect(shownPhoto().uri).toMatch(/fake-upload-1/u);
  });

  it("removes the photo, after which Clerk's default picture shows", async () => {
    await openSheet();
    await press("profile-photo-remove");

    expect(photoCalls()).toEqual([{ file: null }]);
    expect(isSheetOpen()).toBe(false);
    expect(shownPhoto().uri).toBe(DEFAULT_IMAGE_URL);
  });

  it("changes nothing when the User cancels the picker or the camera", async () => {
    mockPickSquareLibraryPhoto.mockResolvedValue(null);
    mockTakeSquarePhoto.mockResolvedValue({ status: "cancelled" });
    await openSheet();
    await press("profile-photo-library");
    await press("profile-photo-camera");

    expect(photoCalls()).toEqual([]);
    expect(isSheetOpen()).toBe(true);
    expect(shownPhoto().uri).toBe(MY_PHOTO);
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it("closes on Cancel with nothing changed", async () => {
    await openSheet();
    await press("profile-photo-cancel");

    expect(isSheetOpen()).toBe(false);
    expect(photoCalls()).toEqual([]);
  });

  it("keeps the old photo when the upload fails, says so and reports it", async () => {
    fakeClerk.failNext("setProfileImage", "network");
    await openSheet();
    await press("profile-photo-library");

    expect(photoCalls()).toHaveLength(1);
    expect(shownPhoto().uri).toBe(MY_PHOTO);
    expect(isSheetOpen()).toBe(true);
    expect(alertCalls()).toEqual([
      [
        "Couldn't Change Photo",
        "Your photo wasn't changed. Check your connection and try again.",
      ],
    ]);
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  });

  it("says so, and uploads nothing, when the photo can't be read", async () => {
    mockTakeSquarePhoto.mockRejectedValue(new Error("No camera"));
    await openSheet();
    await press("profile-photo-camera");

    expect(photoCalls()).toEqual([]);
    expect(alertCalls().at(-1)?.[0]).toBe("Couldn't Change Photo");
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  });

  it("keeps the photo when the removal fails, says so and reports it", async () => {
    fakeClerk.failNext("setProfileImage", "network");
    await openSheet();
    await press("profile-photo-remove");

    expect(shownPhoto().uri).toBe(MY_PHOTO);
    expect(alertCalls()).toEqual([
      [
        "Couldn't Remove Photo",
        "Your photo wasn't removed. Check your connection and try again.",
      ],
    ]);
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  });

  it("offers Settings when camera access is off for good", async () => {
    mockTakeSquarePhoto.mockResolvedValue({ status: "denied" });
    await openSheet();
    await press("profile-photo-camera");

    expect(photoCalls()).toEqual([]);
    expect(alertCalls()).toEqual([
      [
        "Camera Access Needed",
        "Fitme needs access to your camera to take your profile photo. You can turn it on in Settings.",
        [
          expect.objectContaining({ style: "cancel", text: "Cancel" }),
          expect.objectContaining({ text: "Open Settings" }),
        ],
      ],
    ]);

    await pressInAlert("Open Settings");

    expect(openSettings).toHaveBeenCalledTimes(1);
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  describe("in Ukrainian", () => {
    beforeEach(() => {
      setDeviceLanguages(["uk-UA"]);
    });

    it("shows the sheet in the App language", async () => {
      await openSheet();

      expect(
        screen.getByRole("button", { name: "Змінити фото профілю" })
      ).toBeTruthy();

      for (const label of [
        "Вибрати з медіатеки",
        "Зробити фото",
        "Видалити фото",
        "Скасувати",
      ]) {
        expect(screen.getByRole("button", { name: label })).toBeTruthy();
      }
    });

    it("chooses, takes and removes a photo", async () => {
      await openSheet();
      await press("profile-photo-library");
      await fireEvent.press(screen.getByTestId("edit-profile-photo-button"));
      await press("profile-photo-camera");
      await fireEvent.press(screen.getByTestId("edit-profile-photo-button"));
      await press("profile-photo-remove");

      expect(photoCalls()).toEqual([
        { file: dataUrlOf("file:///me.jpg") },
        { file: dataUrlOf("file:///selfie.jpg") },
        { file: null },
      ]);
      expect(shownPhoto().uri).toBe(DEFAULT_IMAGE_URL);
    });

    it("cancels with nothing changed", async () => {
      mockPickSquareLibraryPhoto.mockResolvedValue(null);
      await openSheet();
      await press("profile-photo-library");
      await press("profile-photo-cancel");

      expect(photoCalls()).toEqual([]);
      expect(isSheetOpen()).toBe(false);
    });

    it("says a failed upload failed", async () => {
      fakeClerk.failNext("setProfileImage", "network");
      await openSheet();
      await press("profile-photo-camera");

      expect(alertCalls()).toEqual([
        [
          "Не вдалося змінити фото",
          "Фото не змінено. Перевірте з’єднання й спробуйте ще раз.",
        ],
      ]);
      expect(shownPhoto().uri).toBe(MY_PHOTO);
    });

    it("offers Settings when camera access is off for good", async () => {
      mockTakeSquarePhoto.mockResolvedValue({ status: "denied" });
      await openSheet();
      await press("profile-photo-camera");

      expect(alertCalls().at(-1)?.[0]).toBe("Потрібен доступ до камери");

      await pressInAlert("Відкрити Параметри");

      expect(openSettings).toHaveBeenCalledTimes(1);
    });

    it("offers no Remove Photo without a photo of the User's own", async () => {
      fakeClerk.setUser({ firstName: "Tony" });
      await openSheet();

      expect(
        screen.queryByRole("button", { name: "Видалити фото" })
      ).toBeNull();
    });
  });
});
