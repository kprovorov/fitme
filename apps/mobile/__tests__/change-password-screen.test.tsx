/**
 * Change Password, opened from Account & Security: the real Screen over the
 * fake Clerk User, with "Confirm it's you" pushed over it when Clerk asks,
 * in English and Ukrainian. Assertions read what the User sees and the
 * calls that reached the fake Clerk.
 */
import "~/test-utils/auth-ui";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";

import ChangePasswordScreen from "~/app/change-password";
import ConfirmIdentityScreen from "~/app/confirm-identity";
import { Toaster } from "~/components/ui/toast";
import { setDeviceLanguages } from "~/test-utils/device-locales";
import { FAKE_PASSWORD, fakeClerk } from "~/test-utils/fake-clerk";
import { InAppLanguage } from "~/test-utils/in-app-language";
import {
  pushedRoutes,
  PushedRoutes,
  resetStubRouter,
  stubRouter,
} from "~/test-utils/router-stub";

jest.mock(
  "@clerk/expo",
  () =>
    jest.requireActual<typeof import("~/test-utils/fake-clerk")>(
      "~/test-utils/fake-clerk"
    ).clerkModule
);

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

jest.mock("~/components/ui/button", () =>
  jest.requireActual("~/test-utils/button-stub")
);

const NEW_PASSWORD = "new-password-123";

const STRINGS = {
  en: {
    breach: "Password has been found in an online data breach.",
    cancel: "Cancel",
    confirm: "Confirm new password",
    confirmTitle: "Confirm it's you",
    current: "Current password",
    mismatch: "Passwords don't match",
    new: "New password",
    submit: "Change Password",
    success: "Password changed",
    tooShort: "Password must be at least 8 characters.",
    wrongCurrent: "Current password is incorrect.",
  },
  uk: {
    breach: "Password has been found in an online data breach.",
    cancel: "Скасувати",
    confirm: "Підтверди новий пароль",
    confirmTitle: "Підтверди, що це ти",
    current: "Поточний пароль",
    mismatch: "Паролі не збігаються",
    new: "Новий пароль",
    submit: "Змінити пароль",
    success: "Пароль змінено",
    tooShort: "Мінімальна довжина пароля: 8.",
    wrongCurrent: "Поточний пароль неправильний.",
  },
} as const;

const passwordUpdates = () =>
  fakeClerk.calls.filter(({ method }) => method === "updatePassword");

describe.each(["en", "uk"] as const)("Change Password (%s)", (language) => {
  const text = STRINGS[language];

  const fill = async ({
    confirm = NEW_PASSWORD,
    current = FAKE_PASSWORD,
    next = NEW_PASSWORD,
  }: {
    confirm?: string;
    current?: string;
    next?: string;
  } = {}) => {
    await fireEvent.changeText(screen.getByLabelText(text.current), current);
    await fireEvent.changeText(screen.getByLabelText(text.new), next);
    await fireEvent.changeText(screen.getByLabelText(text.confirm), confirm);
  };

  const submit = () =>
    fireEvent.press(screen.getByRole("button", { name: text.submit }));

  beforeEach(async () => {
    resetStubRouter();
    setDeviceLanguages([language === "uk" ? "uk-UA" : "en-US"]);
    // Pushed from Account & Security, so going back pops it.
    stubRouter.push("/change-password");

    await render(
      <InAppLanguage>
        <ChangePasswordScreen />
        <PushedRoutes
          screens={{ "/confirm-identity": ConfirmIdentityScreen }}
        />
        <Toaster />
      </InAppLanguage>
    );
  });

  it("keeps Save off until every field has something in it", async () => {
    expect(screen.getByRole("button", { name: text.submit })).toBeDisabled();

    await fill({ confirm: "" });

    expect(screen.getByRole("button", { name: text.submit })).toBeDisabled();
  });

  it("changes the password, signs the other sessions out and goes back", async () => {
    await fill();
    await submit();

    await expect(screen.findByText(text.success)).resolves.toBeOnTheScreen();
    expect(passwordUpdates()).toEqual([
      {
        method: "updatePassword",
        params: {
          currentPassword: FAKE_PASSWORD,
          newPassword: NEW_PASSWORD,
          signOutOfOtherSessions: true,
        },
      },
    ]);
    expect(fakeClerk.password).toBe(NEW_PASSWORD);
    expect(pushedRoutes()).toEqual([]);
  });

  it('asks "Confirm it\'s you" when Clerk wants it, then changes it', async () => {
    fakeClerk.requireReverification();
    await fill();
    await submit();

    await expect(
      screen.findByText(text.confirmTitle)
    ).resolves.toBeOnTheScreen();
    expect(passwordUpdates()).toEqual([]);

    fakeClerk.completeReverification();

    await expect(screen.findByText(text.success)).resolves.toBeOnTheScreen();
    expect(passwordUpdates()).toHaveLength(1);
    expect(fakeClerk.password).toBe(NEW_PASSWORD);
  });

  it("names the minimum length for a new password that's too short", async () => {
    await fill({ confirm: "short", next: "short" });
    await submit();

    await expect(screen.findByText(text.tooShort)).resolves.toBeOnTheScreen();
    expect(passwordUpdates()).toEqual([]);
  });

  it("says when the confirmation doesn't match", async () => {
    await fill({ confirm: `${NEW_PASSWORD}-typo` });
    await submit();

    await expect(screen.findByText(text.mismatch)).resolves.toBeOnTheScreen();
    expect(passwordUpdates()).toEqual([]);
  });

  it("shows a wrong current password on its field and stays", async () => {
    await fill({ current: "not-my-password" });
    await submit();

    await expect(
      screen.findByText(text.wrongCurrent)
    ).resolves.toBeOnTheScreen();
    expect(passwordUpdates()).toHaveLength(1);
    expect(fakeClerk.password).toBe(FAKE_PASSWORD);
    expect(pushedRoutes()).toHaveLength(1);
    expect(screen.queryByText(text.success)).toBeNull();
  });

  it("shows any other Clerk error as Clerk sends it", async () => {
    fakeClerk.failNext("updatePassword", {
      code: "form_password_pwned",
      longMessage: text.breach,
    });
    await fill();
    await submit();

    await expect(screen.findByText(text.breach)).resolves.toBeOnTheScreen();
    expect(fakeClerk.password).toBe(FAKE_PASSWORD);
    expect(pushedRoutes()).toHaveLength(1);
  });

  it('changes nothing when the User cancels "Confirm it\'s you"', async () => {
    fakeClerk.requireReverification();
    await fill();
    await submit();

    await expect(
      screen.findByText(text.confirmTitle)
    ).resolves.toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: text.cancel }));

    await waitFor(() =>
      expect(screen.queryByText(text.confirmTitle)).toBeNull()
    );
    expect(passwordUpdates()).toEqual([]);
    expect(fakeClerk.password).toBe(FAKE_PASSWORD);
    expect(screen.queryByText(text.success)).toBeNull();
    // Still on Change Password, with what the User typed.
    expect(pushedRoutes().map(({ pathname }) => pathname)).toEqual([
      "/change-password",
    ]);
    expect(screen.getByRole("button", { name: text.submit })).toBeEnabled();
  });
});
