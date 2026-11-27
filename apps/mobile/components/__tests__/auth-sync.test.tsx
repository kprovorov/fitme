/**
 * AuthSync keys Sentry and analytics on the signed-in Clerk User and resets
 * them on sign-out, however the session ended. Driven over the fake Clerk
 * User and the fake Public API (the Profile's measurement system), reading
 * what reached analytics from the shared fake.
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import * as Sentry from "@sentry/react-native";
import { QueryClientProvider } from "@tanstack/react-query";
import { act, render } from "@testing-library/react-native";
import { useEffect } from "react";

import {
  useDeleteUserMutation,
  useLogoutMutation,
} from "~/hooks/mutations/auth";
import { analytics } from "~/lib/analytics";
import { sentAnalytics } from "~/test-utils/fake-analytics";
import { fakeClerk } from "~/test-utils/fake-clerk";
import {
  backend,
  FAKE_USER_ID,
  fakePublicApi,
} from "~/test-utils/fake-public-api";
import { createTestQueryClient, settle } from "~/test-utils/query-client";
import { signInAs } from "~/test-utils/signed-in-user";

import AuthSync from "../auth-sync";

jest.mock(
  "@clerk/expo",
  () =>
    jest.requireActual<typeof import("~/test-utils/fake-clerk")>(
      "~/test-utils/fake-clerk"
    ).clerkModule
);

jest.mock("expo-router", () => ({ router: { replace: jest.fn() } }));

jest.mock(
  "react-native-purchases",
  () =>
    jest.requireActual<typeof import("~/test-utils/fake-revenuecat")>(
      "~/test-utils/fake-revenuecat"
    ).purchasesModule
);

const ADA = {
  emailAddresses: ["ada@example.com"],
  firstName: "Ada",
  lastName: "Lovelace",
};

/** The account actions, as the Profile screen and the Delete sheet hold them. */
const actions: {
  deleteAccount?: ReturnType<typeof useDeleteUserMutation>;
  logOut?: ReturnType<typeof useLogoutMutation>;
} = {};

const AccountActions = () => {
  const logOut = useLogoutMutation();
  const deleteAccount = useDeleteUserMutation();

  useEffect(() => {
    actions.logOut = logOut;
    actions.deleteAccount = deleteAccount;
  }, [deleteAccount, logOut]);

  return null;
};

const renderAuthSync = async () => {
  const client = createTestQueryClient();

  await render(
    <QueryClientProvider client={client}>
      <AuthSync />
      <AccountActions />
    </QueryClientProvider>
  );
  await settle(client);

  /** Runs `change` (an account or Profile change), then lets the app catch up. */
  const after = async (change: () => unknown) => {
    await act(async () => {
      await change();
    });
    await settle(client);
  };

  return { after, client };
};

describe("AuthSync", () => {
  beforeEach(() => {
    jest.mocked(Sentry.setUser).mockClear();
    backend.reset();
    fakeClerk.setUser(ADA);
  });

  it("identifies the signed-in User to Sentry by their Clerk id only", async () => {
    await renderAuthSync();

    expect(Sentry.setUser).toHaveBeenCalledWith({ id: FAKE_USER_ID });

    for (const [user] of jest.mocked(Sentry.setUser).mock.calls) {
      expect(user).not.toHaveProperty("email");
      expect(user).not.toHaveProperty("username");
    }
  });

  it("clears the Sentry user on sign-out", async () => {
    const { after } = await renderAuthSync();

    await after(() => signInAs(null));

    expect(Sentry.setUser).toHaveBeenLastCalledWith(null);
  });

  describe("identify", () => {
    it("carries the User id, email, name and the Profile's measurement system", async () => {
      backend.seedProfile(FAKE_USER_ID, {
        measurement_system: "us",
      });

      await renderAuthSync();

      expect(sentAnalytics.identifies()).toEqual([
        {
          traits: {
            email: "ada@example.com",
            measurement_system: "us",
            name: "Ada Lovelace",
          },
          userId: FAKE_USER_ID,
        },
      ]);
    });

    it("identifies a User without a Profile without a measurement system, and again once they have one", async () => {
      const { after, client } = await renderAuthSync();

      expect(sentAnalytics.identifies()).toEqual([
        {
          traits: { email: "ada@example.com", name: "Ada Lovelace" },
          userId: FAKE_USER_ID,
        },
      ]);

      // Onboarding saves the Profile, and the app reads it again.
      await after(async () => {
        backend.seedProfile(FAKE_USER_ID, {
          measurement_system: "uk",
        });
        await client.invalidateQueries({ queryKey: ["profile"] });
      });

      expect(sentAnalytics.identifies()).toEqual([
        {
          traits: { email: "ada@example.com", name: "Ada Lovelace" },
          userId: FAKE_USER_ID,
        },
        {
          traits: {
            email: "ada@example.com",
            measurement_system: "uk",
            name: "Ada Lovelace",
          },
          userId: FAKE_USER_ID,
        },
      ]);
    });

    it("identifies again when the email, the name or the measurement system changes, and not otherwise", async () => {
      backend.seedProfile(FAKE_USER_ID);
      const { after, client } = await renderAuthSync();

      // A read of the Profile that finds nothing changed.
      await after(() => client.invalidateQueries({ queryKey: ["profile"] }));

      expect(sentAnalytics.identifies()).toHaveLength(1);

      await after(() =>
        fakeClerk.setUser({ ...ADA, emailAddresses: ["ada@lovelace.dev"] })
      );
      await after(() =>
        fakeClerk.setUser({
          ...ADA,
          emailAddresses: ["ada@lovelace.dev"],
          lastName: "King",
        })
      );
      // Switched from elsewhere (Arnold, MCP, another device): seen at the
      // next read of the Profile.
      await after(async () => {
        const [row] = backend.profiles;

        if (row) {
          row.measurement_system = "us";
        }

        await client.invalidateQueries({ queryKey: ["profile"] });
      });

      expect(sentAnalytics.identifies().map(({ traits }) => traits)).toEqual([
        {
          email: "ada@example.com",
          measurement_system: "metric",
          name: "Ada Lovelace",
        },
        {
          email: "ada@lovelace.dev",
          measurement_system: "metric",
          name: "Ada Lovelace",
        },
        {
          email: "ada@lovelace.dev",
          measurement_system: "metric",
          name: "Ada King",
        },
        {
          email: "ada@lovelace.dev",
          measurement_system: "us",
          name: "Ada King",
        },
      ]);
    });

    it("still identifies the User when the Profile can't be read", async () => {
      fakePublicApi.failNext("GET /v1/profile", { status: 500 });

      await renderAuthSync();

      expect(sentAnalytics.identifies()).toEqual([
        {
          traits: { email: "ada@example.com", name: "Ada Lovelace" },
          userId: FAKE_USER_ID,
        },
      ]);
    });
  });

  describe("reset", () => {
    it("resets once when the User logs out, after the log-out event went out as them", async () => {
      const { after } = await renderAuthSync();

      await after(() => actions.logOut?.mutateAsync());

      expect(sentAnalytics.resets()).toBe(1);
      expect(sentAnalytics.events()).toEqual([
        { name: "User Logged Out", properties: undefined },
      ]);
      expect(sentAnalytics.anonymousEvents()).toEqual([]);
    });

    it("resets once when the account is deleted, and sends the deletion anonymous", async () => {
      const { after } = await renderAuthSync();

      await after(() =>
        actions.deleteAccount?.mutateAsync({
          remove: () =>
            Promise.resolve({ status: "done", value: undefined } as const),
        })
      );

      expect(sentAnalytics.resets()).toBe(1);
      expect(sentAnalytics.events()).toEqual([
        { name: "User Deleted Account", properties: undefined },
      ]);
      expect(sentAnalytics.anonymousEvents()).toEqual(["User Deleted Account"]);
    });

    it("resets once when the session ends on its own", async () => {
      const { after } = await renderAuthSync();

      await after(() => signInAs(null));
      // Clerk re-renders while still signed out: nothing more.
      await after(() => fakeClerk.setLoaded(true));

      expect(sentAnalytics.resets()).toBe(1);
    });

    it("resets at launch a session that ended while the app was closed, once", async () => {
      // Identified in an earlier run of the app.
      await analytics.identify(FAKE_USER_ID, { email: "ada@example.com" });
      signInAs(null);

      const { after } = await renderAuthSync();
      await after(() => fakeClerk.setLoaded(true));

      expect(sentAnalytics.resets()).toBe(1);
    });

    it("resets nothing at a launch with nobody signed in and nobody identified", async () => {
      signInAs(null);

      await renderAuthSync();

      expect(sentAnalytics.resets()).toBe(0);
    });

    it("identifies the next User as a different person", async () => {
      const { after } = await renderAuthSync();

      await after(() => signInAs(null));
      await after(() => {
        fakeClerk.setUser({
          emailAddresses: ["bo@example.com"],
          id: "user_bo",
        });
        signInAs("user_bo");
      });

      expect(sentAnalytics.identifies().map(({ userId }) => userId)).toEqual([
        FAKE_USER_ID,
        "user_bo",
      ]);
      expect(sentAnalytics.resets()).toBe(1);
    });
  });
});
