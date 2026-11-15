/**
 * The fake Clerk User through the hooks a screen calls (`useUser`,
 * `useClerk`, `useReverification`, as `@clerk/expo` answers them) and the real
 * `~/lib/clerk`, which reads it through `getClerkInstance`: every call is
 * recorded and applied, so a mounted component re-renders as it would over
 * Clerk, and a test fails any call or asks for reverification.
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
} from "@testing-library/react-native";
import { Pressable, Text } from "react-native";

import { getClerk, getClerkErrorMessage, getCurrentUserId } from "~/lib/clerk";
import {
  clerkModule,
  FAKE_PASSWORD,
  FAKE_VERIFICATION_CODE,
  fakeClerk,
  isReverificationCancelledError,
} from "~/test-utils/fake-clerk";
import { FAKE_USER_ID } from "~/test-utils/fake-public-api";
import { signedInUserId, signInAs } from "~/test-utils/signed-in-user";

jest.mock(
  "@clerk/expo",
  () =>
    jest.requireActual<typeof import("~/test-utils/fake-clerk")>(
      "~/test-utils/fake-clerk"
    ).clerkModule
);

// The hooks a screen imports from `@clerk/expo`, which the mock above answers.
const { useClerk, useReverification, useUser } = clerkModule;

const Header = () => {
  const { user } = useUser();

  if (!user) {
    return <Text>Signed out</Text>;
  }

  return (
    <>
      <Text>{user.fullName}</Text>
      <Text>{user.primaryEmailAddress?.emailAddress}</Text>
      <Text>{user.imageUrl}</Text>
    </>
  );
};

const SignOutButton = () => {
  const clerk = useClerk();

  const signOut = async () => {
    await clerk.signOut();
  };

  return (
    <Pressable onPress={signOut}>
      <Text>Log Out</Text>
    </Pressable>
  );
};

/** What a screen's handler gets from `useUser`, outside render. */
const currentUser = () => {
  const { user } = getClerk();

  if (!user) {
    throw new Error("Nobody is signed in");
  }

  return user;
};

/** What a call rejected with, or `null` when it resolved. */
const rejection = async (call: Promise<unknown>): Promise<unknown> => {
  try {
    await call;

    return null;
  } catch (error) {
    return error;
  }
};

beforeEach(() => {
  fakeClerk.setUser({
    emailAddresses: ["tony@example.com", "ironman@example.com"],
    externalAccounts: [{ email: "tony@gmail.com", provider: "google" }],
    firstName: "Tony",
    lastName: "Stark",
  });
});

describe("fake Clerk User", () => {
  it("answers the configured User through useUser and getClerk", async () => {
    await render(<Header />);

    expect(screen.getByText("Tony Stark")).toBeOnTheScreen();
    expect(screen.getByText("tony@example.com")).toBeOnTheScreen();
    expect(getCurrentUserId()).toBe(FAKE_USER_ID);

    const user = currentUser();
    expect(user.hasImage).toBe(false);
    expect(user.passwordEnabled).toBe(true);
    expect(user.emailAddresses.map(({ emailAddress }) => emailAddress)).toEqual(
      ["tony@example.com", "ironman@example.com"]
    );
    expect(user.externalAccounts).toEqual([
      expect.objectContaining({
        emailAddress: "tony@gmail.com",
        provider: "google",
      }),
    ]);
  });

  it("records each call and re-renders with what it changed", async () => {
    await render(<Header />);

    await act(() => currentUser().update({ firstName: "Pepper" }));
    expect(screen.getByText("Pepper Stark")).toBeOnTheScreen();

    // `null` clears a name, as Clerk takes it.
    await act(() => currentUser().update({ lastName: null }));
    expect(screen.getByText("Pepper")).toBeOnTheScreen();

    await act(() => currentUser().setProfileImage({ file: "data:image/jpeg" }));
    expect(currentUser().hasImage).toBe(true);
    expect(screen.getByText(currentUser().imageUrl)).toBeOnTheScreen();

    await act(() => currentUser().setProfileImage({ file: null }));
    expect(currentUser().hasImage).toBe(false);

    expect(fakeClerk.calls).toEqual([
      { method: "update", params: { firstName: "Pepper" } },
      { method: "update", params: { lastName: null } },
      { method: "setProfileImage", params: { file: "data:image/jpeg" } },
      { method: "setProfileImage", params: { file: null } },
    ]);
  });

  it("changes the primary email the way Account & Security will", async () => {
    await render(<Header />);

    const created = await act(() =>
      currentUser().createEmailAddress({ email: "stark@example.com" })
    );

    await act(() => created.prepareVerification({ strategy: "email_code" }));

    // A wrong code changes nothing, so it needs no act().
    await expect(
      rejection(created.attemptVerification({ code: "000000" }))
    ).resolves.toMatchObject({ errors: [{ code: "form_code_incorrect" }] });

    await act(() =>
      created.attemptVerification({ code: FAKE_VERIFICATION_CODE })
    );
    await act(() =>
      currentUser().update({ primaryEmailAddressId: created.id })
    );
    expect(screen.getByText("stark@example.com")).toBeOnTheScreen();

    const old = currentUser().emailAddresses.find(
      ({ emailAddress }) => emailAddress === "tony@example.com"
    );

    await act(() => old?.destroy() ?? Promise.resolve());

    expect(
      currentUser().emailAddresses.map(({ emailAddress, verification }) => [
        emailAddress,
        verification.status,
      ])
    ).toEqual([
      ["ironman@example.com", "verified"],
      ["stark@example.com", "verified"],
    ]);
    expect(fakeClerk.calls.map(({ method }) => method)).toEqual([
      "createEmailAddress",
      "prepareEmailVerification",
      "attemptEmailVerification",
      "attemptEmailVerification",
      "update",
      "destroyEmailAddress",
    ]);
  });

  it("changes the password, links and unlinks a provider", async () => {
    await expect(
      currentUser().updatePassword({
        currentPassword: "wrong",
        newPassword: "new-password",
      })
    ).rejects.toMatchObject({
      errors: [
        {
          code: "form_password_validation_failed",
          meta: { paramName: "current_password" },
        },
      ],
    });

    await currentUser().updatePassword({
      currentPassword: FAKE_PASSWORD,
      newPassword: "new-password",
      signOutOfOtherSessions: true,
    });
    expect(fakeClerk.password).toBe("new-password");

    const apple = await currentUser().createExternalAccount({
      redirectUrl: "fitme://account",
      strategy: "oauth_apple",
    });

    expect(apple.verification?.status).toBe("unverified");
    // Clerk lists the pending link, its redirect URL included.
    expect(
      currentUser().externalAccounts.map(({ provider }) => provider)
    ).toEqual(["google", "apple"]);
    expect(apple.verification?.externalVerificationRedirectURL).toBeInstanceOf(
      URL
    );

    // The in-app browser's round trip, then the screen reloads the User.
    fakeClerk.completeExternalAccount("apple");
    await currentUser().reload();
    expect(
      currentUser().externalAccounts.map(({ provider, verification }) => [
        provider,
        verification?.status,
      ])
    ).toEqual([
      ["google", "verified"],
      ["apple", "verified"],
    ]);

    await currentUser().externalAccounts[0]?.destroy();
    expect(
      currentUser().externalAccounts.map(({ provider }) => provider)
    ).toEqual(["apple"]);
    expect(fakeClerk.calls.map(({ method }) => method)).toEqual([
      "updatePassword",
      "updatePassword",
      "createExternalAccount",
      "reload",
      "destroyExternalAccount",
    ]);
  });

  it("keeps a refused provider link unverified, with the refusal's code", async () => {
    fakeClerk.setUser({ passwordEnabled: true });
    await currentUser().createExternalAccount({
      redirectUrl: "fitme://account-security",
      strategy: "oauth_google",
    });

    fakeClerk.refuseExternalAccount("google", "external_account_exists");
    await currentUser().reload();

    expect(
      currentUser().externalAccounts.map(({ provider, verification }) => [
        provider,
        verification?.status,
        verification?.error?.code,
      ])
    ).toEqual([["google", "unverified", "external_account_exists"]]);
  });

  it("follows an account change from signInAs", async () => {
    await render(<Header />);

    await act(() => {
      signInAs(null);
    });
    expect(screen.getByText("Signed out")).toBeOnTheScreen();

    await act(() => {
      signInAs(FAKE_USER_ID);
    });
    expect(screen.getByText("Tony Stark")).toBeOnTheScreen();
  });

  it("answers no User while Clerk is loading, then the User once it has", async () => {
    fakeClerk.setLoaded(false);

    const { result } = await renderHook(() => ({
      auth: clerkModule.useAuth(),
      user: useUser(),
    }));

    expect(result.current.user).toEqual({
      isLoaded: false,
      isSignedIn: undefined,
      user: undefined,
    });
    expect(result.current.auth.isLoaded).toBe(false);
    expect(result.current.auth.userId).toBeUndefined();
    // Only the hooks: the instance stays loaded for the Public API's token.
    expect(getClerk().loaded).toBe(true);

    await act(() => {
      fakeClerk.setLoaded(true);
    });
    expect(result.current.user.isLoaded).toBe(true);
    expect(result.current.user.user?.fullName).toBe("Tony Stark");
    expect(result.current.auth.userId).toBe(FAKE_USER_ID);
  });

  it("deletes the User and signs out", async () => {
    await render(
      <>
        <Header />
        <SignOutButton />
      </>
    );

    await act(() => currentUser().delete());
    expect(fakeClerk.deleted).toBe(true);

    await act(() => fireEvent.press(screen.getByText("Log Out")));
    expect(screen.getByText("Signed out")).toBeOnTheScreen();
    expect(signedInUserId()).toBeNull();
    expect(getClerk().user).toBeNull();
    expect(fakeClerk.calls.map(({ method }) => method)).toEqual([
      "delete",
      "signOut",
    ]);
  });

  it("fails the next call as a Clerk API error or a network failure", async () => {
    fakeClerk.failNext("update", {
      code: "form_param_format_invalid",
      longMessage: "First name is invalid.",
    });
    fakeClerk.failNext("signOut", "network");

    const failure = await rejection(currentUser().update({ firstName: "" }));

    expect(getClerkErrorMessage(failure)).toBe("First name is invalid.");
    expect(currentUser().firstName).toBe("Tony");

    await expect(getClerk().signOut()).rejects.toBeInstanceOf(TypeError);
    expect(signedInUserId()).toBe(FAKE_USER_ID);

    // A failure is used up by the call it failed.
    await currentUser().update({ firstName: "Pepper" });
    expect(currentUser().firstName).toBe("Pepper");
  });

  it("holds a call's answer until the test releases it", async () => {
    const release = fakeClerk.holdNext("update");
    let settled = false;

    const updating = (async () => {
      await currentUser().update({ firstName: "Pepper" });
      settled = true;
    })();

    await act(async () => {
      await Promise.resolve();
    });

    // Recorded at once, applied only once Clerk answers.
    expect(fakeClerk.calls).toEqual([
      { method: "update", params: { firstName: "Pepper" } },
    ]);
    expect(settled).toBe(false);
    expect(currentUser().firstName).toBe("Tony");

    release();
    await updating;

    expect(currentUser().firstName).toBe("Pepper");
  });

  it("passes a reverified call straight through until Clerk asks", async () => {
    const { result } = await renderHook(() =>
      useReverification(() => currentUser().delete())
    );

    await result.current();

    expect(fakeClerk.deleted).toBe(true);
    expect(fakeClerk.reverification).toBeNull();
  });

  it("asks for reverification, then runs the call once it's completed", async () => {
    fakeClerk.requireReverification();
    const onNeedsReverification = jest.fn();

    const { result } = await renderHook(() =>
      useReverification(() => currentUser().delete(), {
        onNeedsReverification,
      })
    );

    const pending = result.current();
    await act(async () => {
      // The request first reaches Clerk, which answers with the hint.
    });
    expect(onNeedsReverification).toHaveBeenCalledWith(
      expect.objectContaining({ level: "first_factor" })
    );
    expect(fakeClerk.deleted).toBe(false);

    await act(() => fakeClerk.completeReverification());
    await pending;

    expect(fakeClerk.deleted).toBe(true);
    expect(fakeClerk.reverification).toBeNull();

    // A fresh session doesn't ask again.
    await result.current();
    expect(onNeedsReverification).toHaveBeenCalledTimes(1);
  });

  it("answers every reverified call waiting when it's completed", async () => {
    fakeClerk.requireReverification();

    const { result } = await renderHook(() =>
      useReverification((firstName: string) =>
        currentUser().update({ firstName })
      )
    );

    const first = result.current("Pepper");
    const second = result.current("Happy");
    await act(async () => {
      // Clerk asks for both.
    });
    await act(() => fakeClerk.completeReverification());
    await Promise.all([first, second]);

    expect(fakeClerk.calls).toEqual([
      { method: "update", params: { firstName: "Pepper" } },
      { method: "update", params: { firstName: "Happy" } },
    ]);
  });

  it("rejects a reverified call the User cancels, running nothing", async () => {
    fakeClerk.requireReverification();

    const { result } = await renderHook(() =>
      useReverification(() => currentUser().delete())
    );

    const pending = rejection(result.current());
    await act(async () => {
      // Clerk asks.
    });
    await act(() => fakeClerk.cancelReverification());

    expect(isReverificationCancelledError(await pending)).toBe(true);
    expect(fakeClerk.deleted).toBe(false);
    expect(fakeClerk.calls).toEqual([]);
  });

  it("verifies the session with the password or an emailed code", async () => {
    const session = () => {
      const { session: current } = getClerk();

      if (!current) {
        throw new Error("Nobody is signed in");
      }

      return current;
    };

    const started = await session().startVerification({
      level: "first_factor",
    });

    expect(started.status).toBe("needs_first_factor");
    expect(started.supportedFirstFactors).toEqual([
      { strategy: "password" },
      {
        emailAddressId: currentUser().primaryEmailAddressId,
        primary: true,
        safeIdentifier: "tony@example.com",
        strategy: "email_code",
      },
    ]);

    const wrong = await rejection(
      session().attemptFirstFactorVerification({
        password: "wrong",
        strategy: "password",
      })
    );

    expect(getClerkErrorMessage(wrong)).toBe(
      "Password is incorrect. Try again, or use another method."
    );

    const verified = await session().attemptFirstFactorVerification({
      password: FAKE_PASSWORD,
      strategy: "password",
    });

    expect(verified.status).toBe("complete");

    await session().startVerification({ level: "first_factor" });

    const unsent = await rejection(
      session().attemptFirstFactorVerification({
        code: FAKE_VERIFICATION_CODE,
        strategy: "email_code",
      })
    );

    expect(getClerkErrorMessage(unsent)).toBe(
      "Send a verification code first."
    );

    await session().prepareFirstFactorVerification({
      emailAddressId: currentUser().primaryEmailAddressId ?? "",
      strategy: "email_code",
    });

    const byCode = await session().attemptFirstFactorVerification({
      code: FAKE_VERIFICATION_CODE,
      strategy: "email_code",
    });

    expect(byCode.status).toBe("complete");
    expect(fakeClerk.calls.map(({ method }) => method)).toEqual([
      "startVerification",
      "attemptFirstFactorVerification",
      "attemptFirstFactorVerification",
      "startVerification",
      "attemptFirstFactorVerification",
      "prepareFirstFactorVerification",
      "attemptFirstFactorVerification",
    ]);
  });

  it("offers only the emailed code to a User without a password", async () => {
    fakeClerk.setUser({ passwordEnabled: false });
    const { session } = getClerk();

    const started = await session?.startVerification({ level: "first_factor" });

    expect(
      started?.supportedFirstFactors?.map(({ strategy }) => strategy)
    ).toEqual(["email_code"]);
  });
});
