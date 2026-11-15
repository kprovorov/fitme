/**
 * Change Email, from Account & Security: the real Screens (the form, the
 * shared code screen with `purpose=change-email` and "Confirm it's you")
 * pushed over Account & Security, over the fake Clerk User, in English and
 * Ukrainian. Assertions read what the User sees and the calls that reached
 * the fake Clerk.
 */
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";

import "~/test-utils/auth-ui";
import AccountSecurityScreen from "~/app/account-security";
import ChangeEmailScreen from "~/app/change-email";
import ChangeEmailCodeScreen from "~/app/change-email/verify-code";
import ConfirmIdentityScreen from "~/app/confirm-identity";
import { Toaster } from "~/components/ui/toast";
import { getClerk } from "~/lib/clerk";
import { setDeviceLanguages } from "~/test-utils/device-locales";
import {
  FAKE_PASSWORD,
  FAKE_VERIFICATION_CODE,
  fakeClerk,
} from "~/test-utils/fake-clerk";
import { InAppLanguage } from "~/test-utils/in-app-language";
import {
  dismissedToRoute,
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

jest.mock("@clerk/expo/token-cache", () => ({ tokenCache: {} }));

jest.mock("expo-router", () => {
  const stub = jest.requireActual<typeof import("~/test-utils/router-stub")>(
    "~/test-utils/router-stub"
  );

  return {
    Redirect: () => null,
    router: stub.stubRouter,
    Stack: { Screen: stub.StackScreenStub },
    useLocalSearchParams: () => stub.useStubParams({}),
    useRouter: () => stub.stubRouter,
  };
});

jest.mock("~/lib/segment", () => ({
  segmentClient: { track: jest.fn() },
}));

jest.mock("~/components/ui/button", () =>
  jest.requireActual("~/test-utils/button-stub")
);

const STRINGS = {
  en: {
    cancel: "Cancel",
    changeIt: "Change it",
    continue: "Continue",
    code: "Code",
    email: "Email",
    emailInUse: "Email in use",
    heading: "Change your email",
    newEmail: "New email",
    password: "Password",
    resend: "Resend code",
    resent: "We sent you a new code.",
    sendCode: "Send Code",
    success: "Email changed to pepper@example.com",
    title: "Check your email",
    verify: "Verify",
    wrongCode: "That code isn't right. Try again.",
  },
  uk: {
    cancel: "Скасувати",
    changeIt: "Змінити",
    continue: "Продовжити",
    code: "Код",
    email: "Ел. пошта",
    emailInUse: "Ця адреса вже використовується",
    heading: "Зміни ел. пошту",
    newEmail: "Нова ел. пошта",
    password: "Пароль",
    resend: "Надіслати код ще раз",
    resent: "Ми надіслали вам новий код.",
    sendCode: "Надіслати код",
    success: "Ел. пошту змінено на pepper@example.com",
    title: "Перевірте пошту",
    verify: "Підтвердити",
    wrongCode: "Код неправильний. Спробуй ще раз.",
  },
} as const;

const OLD_EMAIL = "tony@example.com";
const NEW_EMAIL = "pepper@example.com";

const renderAccount = () =>
  render(
    <InAppLanguage>
      <AccountSecurityScreen />
      <PushedRoutes
        screens={{
          "/change-email": ChangeEmailScreen,
          "/change-email/verify-code": ChangeEmailCodeScreen,
          "/confirm-identity": ConfirmIdentityScreen,
        }}
      />
      <Toaster />
    </InAppLanguage>
  );

const methods = () => fakeClerk.calls.map(({ method }) => method);

/** The User's addresses as Clerk has them, the primary first. */
const addresses = () => {
  const { user } = getClerk();

  const all = (user?.emailAddresses ?? []).map(({ emailAddress, id }) => ({
    emailAddress,
    primary: id === user?.primaryEmailAddressId,
  }));

  return all.toSorted((a, b) => Number(b.primary) - Number(a.primary));
};

/** Waits for the deferred clean-up a Screen leaving schedules. */
const flushTimers = () =>
  act(async () => {
    await jest.runOnlyPendingTimersAsync();
  });

describe.each(["en", "uk"] as const)("Change Email (%s)", (language) => {
  const text = STRINGS[language];

  const openForm = async () => {
    await renderAccount();
    await fireEvent.press(screen.getByRole("button", { name: text.email }));
    await expect(screen.findByText(text.heading)).resolves.toBeOnTheScreen();
  };

  const sendCodeTo = async (email: string) => {
    await fireEvent.changeText(screen.getByLabelText(text.newEmail), email);
    await fireEvent.press(screen.getByRole("button", { name: text.sendCode }));
  };

  const reachCodeScreen = async () => {
    await openForm();
    await sendCodeTo(NEW_EMAIL);
    await expect(screen.findByText(text.title)).resolves.toBeOnTheScreen();
  };

  const enterCode = async (code: string) => {
    await fireEvent.changeText(screen.getByLabelText(text.code), code);
    await fireEvent.press(screen.getByRole("button", { name: text.verify }));
  };

  beforeEach(() => {
    jest.useFakeTimers();
    resetStubRouter();
    setDeviceLanguages([language === "uk" ? "uk-UA" : "en-US"]);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("changes the email: a code to the new address, then it replaces the old one", async () => {
    await reachCodeScreen();

    expect(methods()).toEqual([
      "createEmailAddress",
      "prepareEmailVerification",
    ]);
    expect(fakeClerk.calls[0]?.params).toEqual({ email: NEW_EMAIL });
    expect(screen.getByText(new RegExp(NEW_EMAIL, "u"))).toBeOnTheScreen();

    // Resend works once the minute is up.
    await act(() => {
      jest.advanceTimersByTime(60_000);
    });
    await fireEvent.press(screen.getByRole("button", { name: text.resend }));
    await expect(screen.findByText(text.resent)).resolves.toBeOnTheScreen();

    await enterCode(FAKE_VERIFICATION_CODE);

    await waitFor(() => expect(dismissedToRoute()).toBe("/account-security"));
    expect(methods()).toEqual([
      "createEmailAddress",
      "prepareEmailVerification",
      "prepareEmailVerification",
      "attemptEmailVerification",
      "update",
      "destroyEmailAddress",
    ]);
    expect(addresses()).toEqual([{ emailAddress: NEW_EMAIL, primary: true }]);
    expect(screen.getByText(text.success)).toBeOnTheScreen();
    // Account & Security shows the new address.
    expect(
      screen.getByRole("button", { name: text.email })
    ).toHaveAccessibilityValue({ text: NEW_EMAIL });

    // Leaving the code screen after the change takes nothing off.
    await flushTimers();
    expect(methods().filter((m) => m === "destroyEmailAddress")).toHaveLength(
      1
    );
  });

  it("shows Email in use on the form for a taken address", async () => {
    fakeClerk.failNext("createEmailAddress", {
      code: "form_identifier_exists",
    });
    await openForm();

    await sendCodeTo(NEW_EMAIL);

    await expect(screen.findByText(text.emailInUse)).resolves.toBeOnTheScreen();
    expect(pushedRoutes().map(({ pathname }) => pathname)).toEqual([
      "/change-email",
    ]);
    expect(addresses()).toEqual([{ emailAddress: OLD_EMAIL, primary: true }]);
  });

  it("shows a wrong code on the code screen and changes nothing", async () => {
    await reachCodeScreen();

    await enterCode("000000");

    await expect(screen.findByText(text.wrongCode)).resolves.toBeOnTheScreen();
    expect(methods()).not.toContain("update");
    expect(addresses()[0]).toEqual({ emailAddress: OLD_EMAIL, primary: true });

    // The right code still goes through.
    await enterCode(FAKE_VERIFICATION_CODE);
    await waitFor(() => expect(dismissedToRoute()).toBe("/account-security"));
    expect(addresses()).toEqual([{ emailAddress: NEW_EMAIL, primary: true }]);
  });

  it("takes the new address off when the User leaves before verifying", async () => {
    await reachCodeScreen();
    expect(addresses()).toHaveLength(2);

    await act(() => {
      stubRouter.back();
    });
    await flushTimers();

    await waitFor(() =>
      expect(addresses()).toEqual([{ emailAddress: OLD_EMAIL, primary: true }])
    );
    expect(methods()).toContain("destroyEmailAddress");
    expect(methods()).not.toContain("update");
  });

  it("takes the new address off on Change it, back on the form", async () => {
    await reachCodeScreen();

    await fireEvent.press(screen.getByRole("link", { name: text.changeIt }));

    await waitFor(() =>
      expect(addresses()).toEqual([{ emailAddress: OLD_EMAIL, primary: true }])
    );
    expect(pushedRoutes().map(({ pathname }) => pathname)).toEqual([
      "/change-email",
    ]);
    await flushTimers();
    expect(methods().filter((m) => m === "destroyEmailAddress")).toHaveLength(
      1
    );
  });

  it("asks Confirm it's you before Change it takes a stale session's address off", async () => {
    await reachCodeScreen();
    fakeClerk.requireReverification();

    await fireEvent.press(screen.getByRole("link", { name: text.changeIt }));
    await expect(
      screen.findByRole("button", { name: text.cancel })
    ).resolves.toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: text.cancel }));

    // Cancelled: still on the code screen, the address still there.
    await waitFor(() =>
      expect(pushedRoutes().map(({ pathname }) => pathname)).toEqual([
        "/change-email",
        "/change-email/verify-code",
      ])
    );
    expect(addresses()).toHaveLength(2);
    expect(methods()).not.toContain("destroyEmailAddress");

    // Confirmed: taken off, back on the form.
    fakeClerk.requireReverification();
    await fireEvent.press(screen.getByRole("link", { name: text.changeIt }));
    await fireEvent.changeText(
      await screen.findByLabelText(text.password),
      FAKE_PASSWORD
    );
    await fireEvent.press(screen.getByRole("button", { name: text.continue }));

    await waitFor(() =>
      expect(addresses()).toEqual([{ emailAddress: OLD_EMAIL, primary: true }])
    );
    expect(pushedRoutes().map(({ pathname }) => pathname)).toEqual([
      "/change-email",
    ]);
  });

  it("opens nothing, and keeps nothing, for a form left while its code was on the way", async () => {
    const release = fakeClerk.holdNext("prepareEmailVerification");
    await openForm();
    await sendCodeTo(NEW_EMAIL);

    await act(() => {
      stubRouter.back();
    });
    await act(() => {
      release();
    });
    await flushTimers();

    await waitFor(() =>
      expect(addresses()).toEqual([{ emailAddress: OLD_EMAIL, primary: true }])
    );
    expect(pushedRoutes()).toEqual([]);
  });

  it("adds nothing when the User cancels Confirm it's you", async () => {
    fakeClerk.requireReverification();
    await openForm();

    await sendCodeTo(NEW_EMAIL);
    await expect(
      screen.findByRole("button", { name: text.cancel })
    ).resolves.toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: text.cancel }));

    await waitFor(() =>
      expect(pushedRoutes().map(({ pathname }) => pathname)).toEqual([
        "/change-email",
      ])
    );
    expect(methods()).not.toContain("createEmailAddress");
    expect(addresses()).toEqual([{ emailAddress: OLD_EMAIL, primary: true }]);
    expect(screen.getByText(text.heading)).toBeOnTheScreen();
    expect(screen.queryByText(text.emailInUse)).toBeNull();
  });
});
