/**
 * "Confirm it's you" on the mounted-screen seam: a Clerk call run through
 * `useReverifiedCall` from a small stand-in Screen (no Screen of the app
 * uses it yet), with the real sheet pushed over it, over the fake Clerk
 * User, in English and Ukrainian. Assertions read what the User sees and
 * the calls that reached the fake Clerk.
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import { useCallback, useState } from "react";
import { Pressable, Text } from "react-native";

import ConfirmIdentityScreen from "~/app/confirm-identity";
import { useReverifiedCall } from "~/hooks/reverification";
import { setDeviceLanguages } from "~/test-utils/device-locales";
import {
  clerkModule,
  FAKE_PASSWORD,
  FAKE_VERIFICATION_CODE,
  fakeClerk,
} from "~/test-utils/fake-clerk";
import { InAppLanguage } from "~/test-utils/in-app-language";
import {
  pushedRoutes,
  PushedRoutes,
  resetStubRouter,
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
    Stack: { Screen: stub.StackScreenStub },
    useRouter: () => stub.stubRouter,
  };
});

jest.mock("~/components/ui/button", () =>
  jest.requireActual("~/test-utils/button-stub")
);

const STRINGS = {
  en: {
    cancel: "Cancel",
    code: "Code",
    codeDescription: "Enter the code we sent to tony@example.com to continue.",
    continue: "Continue",
    forgot: "Forgot password?",
    password: "Password",
    passwordDescription: "Enter your password to continue.",
    passwordIncorrect: "Password is incorrect. Try again.",
    title: "Confirm it's you",
    wrongCode: "That code isn't right. Try again.",
  },
  uk: {
    cancel: "Скасувати",
    code: "Код",
    codeDescription:
      "Введи код, який ми надіслали на tony@example.com, щоб продовжити.",
    continue: "Продовжити",
    forgot: "Забули пароль?",
    password: "Пароль",
    passwordDescription: "Введи пароль, щоб продовжити.",
    passwordIncorrect: "Неправильний пароль. Спробуй ще раз.",
    title: "Підтверди, що це ти",
    wrongCode: "Код неправильний. Спробуй ще раз.",
  },
} as const;

// The hook a Screen imports from `@clerk/expo`, which the mock above answers.
const { useUser } = clerkModule;

/** A Screen saving the User's first name through a reverified call. */
const SaveName = () => {
  const { user } = useUser();
  const [result, setResult] = useState("");

  const save = useReverifiedCall(
    async (firstName: string) => await user?.update({ firstName })
  );

  const handlePress = useCallback(async () => {
    try {
      const { status } = await save("Pepper");
      setResult(status);
    } catch {
      setResult("failed");
    }
  }, [save]);

  return (
    <>
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          void handlePress();
        }}
      >
        <Text>Save name</Text>
      </Pressable>
      <Text testID="result">{result}</Text>
    </>
  );
};

const renderScreen = () =>
  render(
    <InAppLanguage>
      <SaveName />
      <PushedRoutes screens={{ "/confirm-identity": ConfirmIdentityScreen }} />
    </InAppLanguage>
  );

const updates = () =>
  fakeClerk.calls.filter(({ method }) => method === "update");

const methods = () => fakeClerk.calls.map(({ method }) => method);

const saveName = () => fireEvent.press(screen.getByText("Save name"));

const result = () => screen.getByTestId("result");

describe.each(["en", "uk"] as const)("Confirm it's you (%s)", (language) => {
  const text = STRINGS[language];

  beforeEach(() => {
    resetStubRouter();
    setDeviceLanguages([language === "uk" ? "uk-UA" : "en-US"]);
  });

  it("runs a call that needs no reverification straight away", async () => {
    await renderScreen();

    await saveName();

    await waitFor(() => expect(result()).toHaveTextContent("done"));
    expect(methods()).toEqual(["update"]);
    expect(pushedRoutes()).toEqual([]);
    expect(screen.queryByText(text.title)).toBeNull();
  });

  it("asks for the password, then runs the call", async () => {
    fakeClerk.requireReverification();
    await renderScreen();

    await saveName();

    await expect(screen.findByText(text.title)).resolves.toBeOnTheScreen();
    await expect(
      screen.findByText(text.passwordDescription)
    ).resolves.toBeOnTheScreen();
    expect(updates()).toEqual([]);
    expect(screen.getByRole("button", { name: text.continue })).toBeDisabled();

    await fireEvent.changeText(
      screen.getByLabelText(text.password),
      FAKE_PASSWORD
    );
    await fireEvent.press(screen.getByRole("button", { name: text.continue }));

    await waitFor(() => expect(result()).toHaveTextContent("done"));
    expect(methods()).toEqual([
      "startVerification",
      "attemptFirstFactorVerification",
      "update",
    ]);
    expect(fakeClerk.calls[1]?.params).toEqual({
      password: FAKE_PASSWORD,
      strategy: "password",
    });
    expect(updates()).toHaveLength(1);
    expect(pushedRoutes()).toEqual([]);
  });

  it("emails a code to a User without a password, then runs the call", async () => {
    fakeClerk.setUser({ passwordEnabled: false });
    fakeClerk.requireReverification();
    await renderScreen();

    await saveName();

    await expect(
      screen.findByText(text.codeDescription)
    ).resolves.toBeOnTheScreen();
    expect(screen.queryByLabelText(text.password)).toBeNull();
    expect(methods()).toEqual([
      "startVerification",
      "prepareFirstFactorVerification",
    ]);

    await fireEvent.changeText(
      screen.getByLabelText(text.code),
      FAKE_VERIFICATION_CODE
    );
    await fireEvent.press(screen.getByRole("button", { name: text.continue }));

    await waitFor(() => expect(result()).toHaveTextContent("done"));
    expect(fakeClerk.calls[2]).toEqual({
      method: "attemptFirstFactorVerification",
      params: { code: FAKE_VERIFICATION_CODE, strategy: "email_code" },
    });
    expect(updates()).toHaveLength(1);
  });

  it("switches to an emailed code from Forgot password?", async () => {
    fakeClerk.requireReverification();
    await renderScreen();

    await saveName();
    await fireEvent.press(
      await screen.findByRole("button", { name: text.forgot })
    );

    await expect(
      screen.findByText(text.codeDescription)
    ).resolves.toBeOnTheScreen();
    await fireEvent.changeText(
      screen.getByLabelText(text.code),
      FAKE_VERIFICATION_CODE
    );
    await fireEvent.press(screen.getByRole("button", { name: text.continue }));

    await waitFor(() => expect(result()).toHaveTextContent("done"));
    expect(updates()).toHaveLength(1);
  });

  it("shows a wrong password's error and lets the User try again", async () => {
    fakeClerk.requireReverification();
    await renderScreen();

    await saveName();
    await fireEvent.changeText(
      await screen.findByLabelText(text.password),
      "wrong-password"
    );
    await fireEvent.press(screen.getByRole("button", { name: text.continue }));

    await expect(
      screen.findByText(text.passwordIncorrect)
    ).resolves.toBeOnTheScreen();
    expect(updates()).toEqual([]);
    expect(screen.getByText(text.title)).toBeOnTheScreen();

    await fireEvent.changeText(
      screen.getByLabelText(text.password),
      FAKE_PASSWORD
    );

    expect(screen.queryByText(text.passwordIncorrect)).toBeNull();

    await fireEvent.press(screen.getByRole("button", { name: text.continue }));

    await waitFor(() => expect(result()).toHaveTextContent("done"));
    expect(updates()).toHaveLength(1);
  });

  it("shows a wrong code's error and lets the User try again", async () => {
    fakeClerk.setUser({ passwordEnabled: false });
    fakeClerk.requireReverification();
    await renderScreen();

    await saveName();
    await fireEvent.changeText(
      await screen.findByLabelText(text.code),
      "111111"
    );
    await fireEvent.press(screen.getByRole("button", { name: text.continue }));

    await expect(screen.findByText(text.wrongCode)).resolves.toBeOnTheScreen();
    expect(updates()).toEqual([]);

    await fireEvent.changeText(
      screen.getByLabelText(text.code),
      FAKE_VERIFICATION_CODE
    );
    await fireEvent.press(screen.getByRole("button", { name: text.continue }));

    await waitFor(() => expect(result()).toHaveTextContent("done"));
    expect(updates()).toHaveLength(1);
  });

  it("cancels the call and changes nothing", async () => {
    fakeClerk.requireReverification();
    await renderScreen();

    await saveName();
    await fireEvent.press(
      await screen.findByRole("button", { name: text.cancel })
    );

    await waitFor(() => expect(result()).toHaveTextContent("cancelled"));
    expect(updates()).toEqual([]);
    expect(pushedRoutes()).toEqual([]);
    expect(screen.queryByText(text.title)).toBeNull();
  });

  it("cancels the call when the sheet is swiped away", async () => {
    fakeClerk.requireReverification();
    await renderScreen();

    await saveName();
    await screen.findByText(text.title);
    // The swipe: the sheet leaves the stack without an answer.
    await act(() => {
      resetStubRouter();
    });

    await waitFor(() => expect(result()).toHaveTextContent("cancelled"));
    expect(updates()).toEqual([]);
  });
});
