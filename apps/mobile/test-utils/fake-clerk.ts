/* oxlint-disable eslint/max-classes-per-file -- Clerk's two error kinds, each recognised by its own guard, as `@clerk/expo`'s are. */

/**
 * The fake Clerk User: a stand-in for `@clerk/expo` over one in-memory User,
 * for the screens that read and change the signed-in account (Profile, Edit
 * Profile, Account & Security, the delete flow).
 *
 * A test file stands the module in with it:
 *
 * ```ts
 * jest.mock("@clerk/expo", () =>
 *   jest.requireActual<typeof import("~/test-utils/fake-clerk")>(
 *     "~/test-utils/fake-clerk"
 *   ).clerkModule
 * );
 * ```
 *
 * `useUser`, `useAuth` and `useClerk` answer the fake User, and so does the
 * real `~/lib/clerk` (its `getClerk` reads `getClerkInstance`, which this
 * module answers), so `getCurrentUserId` and `getClerkErrorMessage` work as
 * they do in the app. The User is signed in while `signedInUserId()`
 * (`signed-in-user.ts`) is its id: `signOut` signs it out there, and
 * `signInAs` from a test moves both.
 *
 * `fakeClerk` is the account behind it: `setUser` configures it (name,
 * photo, `createdAt`, email addresses, the primary first, linked providers,
 * whether it has a password), `calls` lists every call a screen made, in
 * order and failed ones included, and each one is applied to the User, so a
 * mounted screen re-renders as it would over Clerk. `failNext(method,
 * failure)` fails the next such call with a Clerk API error (its `code`) or a
 * network failure (`"network"`), and `requireReverification()` makes the
 * next call wrapped in `useReverification` ask first, until the test (or the
 * screen's own `onNeedsReverification`) completes or cancels it.
 * `after-each.ts` resets it.
 *
 * Only the members the app uses are implemented: a new one is missing rather
 * than a silent no-op, so a new call site fails its test.
 */
import {
  createElement,
  Fragment,
  useCallback,
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
} from "react";
import type { ReactNode } from "react";

import { FAKE_SESSION_TOKEN, FAKE_USER_ID } from "~/test-utils/fake-public-api";
import {
  onSignedInUserChange,
  signedInUserId,
  signInAs,
} from "~/test-utils/signed-in-user";

/** The emailed code the fake accepts, as Clerk's test mode does. */
export const FAKE_VERIFICATION_CODE = "424242";

/** The User's password until a test or `updatePassword` changes it. */
export const FAKE_PASSWORD = "fake-password";

/** Clerk's default picture, served while the User has no photo of their own. */
export const DEFAULT_IMAGE_URL = "https://img.clerk.com/default.png";

/** Clerk's minimum password length on both instances. */
const PASSWORD_MIN_LENGTH = 8;

/** The providers a User can link (`oauth_<provider>`). */
export type FakeProvider = "apple" | "google";

/** Every Clerk call the fake records and can fail. */
export type ClerkMethod =
  | "attemptEmailVerification"
  | "createEmailAddress"
  | "createExternalAccount"
  | "delete"
  | "destroyEmailAddress"
  | "destroyExternalAccount"
  | "prepareEmailVerification"
  | "reload"
  | "setProfileImage"
  | "signOut"
  | "update"
  | "updatePassword";

/** One recorded call: the method and, when it took one, what it was given. */
export interface ClerkCall {
  readonly method: ClerkMethod;
  readonly params?: unknown;
}

/** A Clerk API error's code (and its message), or a network failure. */
export type ClerkFailure =
  | "network"
  | {
      readonly code: string;
      readonly longMessage?: string;
      readonly message?: string;
      readonly status?: number;
    };

/** The User a test configures; everything left out takes its default. */
export interface FakeUserConfig {
  /** When the Clerk account was made (Profile's "Member since"). */
  readonly createdAt?: Date;
  /** Every email address, the primary first; all verified. */
  readonly emailAddresses?: readonly string[];
  /** Linked, verified sign-in providers. */
  readonly externalAccounts?: readonly {
    readonly email: string;
    readonly provider: FakeProvider;
  }[];
  readonly firstName?: string | null;
  readonly id?: string;
  /** A photo of the User's own; left out, Clerk's default picture. */
  readonly imageUrl?: string;
  readonly lastName?: string | null;
  readonly passwordEnabled?: boolean;
}

type VerificationStatus = "unverified" | "verified";

interface EmailState {
  readonly emailAddress: string;
  readonly id: string;
  readonly prepared: boolean;
  readonly status: VerificationStatus;
}

interface ExternalAccountState {
  readonly emailAddress: string;
  readonly id: string;
  readonly provider: FakeProvider;
  readonly status: VerificationStatus;
}

interface UserState {
  readonly createdAt: Date;
  readonly emailAddresses: readonly EmailState[];
  readonly externalAccounts: readonly ExternalAccountState[];
  readonly firstName: string | null;
  readonly id: string;
  readonly imageUrl: string | null;
  readonly lastName: string | null;
  readonly primaryEmailAddressId: string | null;
}

/** A Clerk API error, as `isClerkAPIResponseError` recognises it. */
export class ClerkAPIResponseError extends Error {
  readonly clerkError = true;
  readonly errors: readonly {
    readonly code: string;
    readonly longMessage?: string;
    readonly message: string;
  }[];
  readonly status: number;

  constructor({
    code,
    longMessage,
    message = code,
    status = 422,
  }: Exclude<ClerkFailure, "network">) {
    super(longMessage ?? message);
    this.name = "ClerkAPIResponseError";
    this.errors = [{ code, longMessage, message }];
    this.status = status;
  }
}

/** A Clerk runtime error (a cancelled reverification), with its `code`. */
export class ClerkRuntimeError extends Error {
  readonly clerkRuntimeError = true;
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "ClerkRuntimeError";
    this.code = code;
  }
}

export const isClerkAPIResponseError = (
  error: unknown
): error is ClerkAPIResponseError => error instanceof ClerkAPIResponseError;

export const isClerkRuntimeError = (
  error: unknown
): error is ClerkRuntimeError => error instanceof ClerkRuntimeError;

/** `@clerk/shared`'s: the User cancelled a reverification. */
export const isReverificationCancelledError = (error: unknown): boolean =>
  isClerkRuntimeError(error) && error.code === "reverification_cancelled";

const failureError = (failure: ClerkFailure): Error =>
  failure === "network"
    ? new TypeError("Network request failed")
    : new ClerkAPIResponseError(failure);

/** A Clerk API error the fake answers itself (a wrong code, a taken email). */
const apiError = (code: string, longMessage: string) =>
  new ClerkAPIResponseError({ code, longMessage });

/** A pending reverification: the level asked for and its two answers. */
export interface PendingReverification {
  readonly cancel: () => void;
  readonly complete: () => void;
  readonly level: string;
}

let nextId = 0;

const newId = (prefix: string) => {
  nextId += 1;

  return `${prefix}_fake${nextId}`;
};

const emailState = (emailAddress: string): EmailState => ({
  emailAddress,
  id: newId("idn"),
  prepared: false,
  status: "verified",
});

const userState = (config: FakeUserConfig = {}): UserState => {
  const emailAddresses = (config.emailAddresses ?? ["tony@example.com"]).map(
    emailState
  );

  return {
    createdAt: config.createdAt ?? new Date("2025-03-14T12:00:00.000Z"),
    emailAddresses,
    externalAccounts: (config.externalAccounts ?? []).map(
      ({ email, provider }) => ({
        emailAddress: email,
        id: newId("eac"),
        provider,
        status: "verified",
      })
    ),
    firstName: config.firstName === undefined ? "Tony" : config.firstName,
    id: config.id ?? FAKE_USER_ID,
    imageUrl: config.imageUrl ?? null,
    lastName: config.lastName === undefined ? "Stark" : config.lastName,
    primaryEmailAddressId: emailAddresses[0]?.id ?? null,
  };
};

let user = userState();
let password: string | null = FAKE_PASSWORD;
let deleted = false;
let calls: ClerkCall[] = [];
let failures = new Map<ClerkMethod, ClerkFailure[]>();
let holds = new Map<ClerkMethod, Promise<void>[]>();

/** Releases every held call, so a test that leaves one held hangs nothing. */
let releaseHolds: (() => void)[] = [];
let needsReverification: string | null = null;
let reverifications: readonly PendingReverification[] = [];
let uploads = 0;

/** Whether Clerk has loaded, as `useUser` and `useAuth` answer it. */
let loaded = true;

let version = 0;
const listeners = new Set<() => void>();

const changed = () => {
  version += 1;

  for (const listener of listeners) {
    listener();
  }
};

// `signInAs` from a test moves the fake's User too: mounted hooks re-render.
onSignedInUserChange(changed);

const subscribe = (listener: () => void) => {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
};

/**
 * Records the call, then throws the failure a test queued for it, if any:
 * a failed call reaches Clerk and changes nothing.
 */
const reach = async (method: ClerkMethod, params?: unknown) => {
  calls.push(params === undefined ? { method } : { method, params });
  // The request goes out before Clerk answers.
  await Promise.resolve();
  // A held call waits for the test to let Clerk answer.
  await holds.get(method)?.shift();
  const failure = failures.get(method)?.shift();

  if (failure !== undefined) {
    throw failureError(failure);
  }
};

const setUserState = (next: UserState) => {
  user = next;
  changed();
};

const findEmail = (id: string) => {
  const email = user.emailAddresses.find((item) => item.id === id);

  if (!email) {
    throw apiError("resource_not_found", "Email address not found.");
  }

  return email;
};

const replaceEmail = (id: string, change: Partial<EmailState>) => {
  setUserState({
    ...user,
    emailAddresses: user.emailAddresses.map((item) =>
      item.id === id ? { ...item, ...change } : item
    ),
  });
};

/** One email address as Clerk's `EmailAddressResource` shows it. */
const emailResource = ({ emailAddress, id, status }: EmailState) => ({
  destroy: async () => {
    await reach("destroyEmailAddress", { emailAddressId: id });
    findEmail(id);

    if (user.primaryEmailAddressId === id) {
      throw apiError(
        "form_param_value_invalid",
        "The primary email address can't be deleted."
      );
    }

    setUserState({
      ...user,
      emailAddresses: user.emailAddresses.filter((item) => item.id !== id),
    });
  },
  emailAddress,
  id,
  linkedTo: [],
  attemptVerification: async ({ code }: { code: string }) => {
    await reach("attemptEmailVerification", { code, emailAddressId: id });

    if (!findEmail(id).prepared) {
      throw apiError("verification_missing", "Send a verification code first.");
    }

    if (code !== FAKE_VERIFICATION_CODE) {
      throw apiError("form_code_incorrect", "Incorrect code");
    }

    replaceEmail(id, { status: "verified" });

    return emailResource(findEmail(id));
  },
  prepareVerification: async (params: { strategy: string }) => {
    await reach("prepareEmailVerification", { ...params, emailAddressId: id });
    findEmail(id);
    replaceEmail(id, { prepared: true });

    return emailResource(findEmail(id));
  },
  toString: () => emailAddress,
  verification: { status, strategy: "email_code" },
});

const findExternalAccount = (id: string) => {
  const account = user.externalAccounts.find((item) => item.id === id);

  if (!account) {
    throw apiError("resource_not_found", "External account not found.");
  }

  return account;
};

/** One linked provider as Clerk's `ExternalAccountResource` shows it. */
const externalAccountResource = ({
  emailAddress,
  id,
  provider,
  status,
}: ExternalAccountState) => ({
  destroy: async () => {
    await reach("destroyExternalAccount", { externalAccountId: id, provider });
    findExternalAccount(id);
    setUserState({
      ...user,
      externalAccounts: user.externalAccounts.filter((item) => item.id !== id),
    });
  },
  emailAddress,
  id,
  provider,
  verification: {
    externalVerificationRedirectURL:
      status === "verified"
        ? null
        : new URL(`https://accounts.example.com/oauth/${provider}?id=${id}`),
    status,
    strategy: `oauth_${provider}`,
  },
});

const isProvider = (value: string): value is FakeProvider =>
  value === "apple" || value === "google";

/** The fake User as Clerk's `UserResource` shows it. */
const userResource = () => {
  const primary =
    user.emailAddresses.find(({ id }) => id === user.primaryEmailAddressId) ??
    null;

  const fullName =
    [user.firstName, user.lastName].filter(Boolean).join(" ") || null;

  return {
    createEmailAddress: async ({ email }: { email: string }) => {
      await reach("createEmailAddress", { email });

      if (
        user.emailAddresses.some(({ emailAddress }) => emailAddress === email)
      ) {
        throw apiError(
          "form_identifier_exists",
          "That email address is taken. Please try another."
        );
      }

      const created: EmailState = {
        ...emailState(email),
        status: "unverified",
      };

      setUserState({
        ...user,
        emailAddresses: [...user.emailAddresses, created],
      });

      return emailResource(created);
    },
    createExternalAccount: async (params: {
      redirectUrl?: string;
      strategy: string;
    }) => {
      await reach("createExternalAccount", params);
      const provider = params.strategy.replace(/^oauth_/u, "");

      if (!isProvider(provider)) {
        throw apiError("form_param_value_invalid", "Unknown strategy.");
      }

      const created: ExternalAccountState = {
        emailAddress: "",
        id: newId("eac"),
        provider,
        status: "unverified",
      };

      setUserState({
        ...user,
        externalAccounts: [...user.externalAccounts, created],
      });

      return externalAccountResource(created);
    },
    createdAt: user.createdAt,
    delete: async () => {
      await reach("delete");
      deleted = true;
      changed();
    },
    emailAddresses: user.emailAddresses.map(emailResource),
    externalAccounts: user.externalAccounts.map(externalAccountResource),
    firstName: user.firstName,
    fullName,
    hasImage: user.imageUrl !== null,
    id: user.id,
    imageUrl: user.imageUrl ?? DEFAULT_IMAGE_URL,
    lastName: user.lastName,
    passwordEnabled: password !== null,
    primaryEmailAddress: primary ? emailResource(primary) : null,
    primaryEmailAddressId: user.primaryEmailAddressId,
    reload: async () => {
      await reach("reload");

      return currentUser();
    },
    setProfileImage: async ({
      file,
    }: {
      file: Blob | File | string | null;
    }) => {
      await reach("setProfileImage", { file });

      if (file === null) {
        setUserState({ ...user, imageUrl: null });

        return { id: null, name: null, publicUrl: null };
      }

      uploads += 1;
      const imageUrl = `https://img.clerk.com/fake-upload-${uploads}.jpg`;
      setUserState({ ...user, imageUrl });

      return {
        id: `img_fake${uploads}`,
        name: "photo.jpg",
        publicUrl: imageUrl,
      };
    },
    update: async (params: {
      firstName?: string | null;
      lastName?: string | null;
      primaryEmailAddressId?: string;
    }) => {
      await reach("update", params);
      const { primaryEmailAddressId } = params;

      if (
        primaryEmailAddressId !== undefined &&
        findEmail(primaryEmailAddressId).status !== "verified"
      ) {
        throw apiError(
          "form_param_value_invalid",
          "Verify the email address first."
        );
      }

      setUserState({
        ...user,
        // `null` clears a name, as Clerk takes it; left out keeps it.
        firstName:
          params.firstName === undefined ? user.firstName : params.firstName,
        lastName:
          params.lastName === undefined ? user.lastName : params.lastName,
        primaryEmailAddressId:
          primaryEmailAddressId ?? user.primaryEmailAddressId,
      });

      return currentUser();
    },
    updatePassword: async (params: {
      currentPassword?: string;
      newPassword: string;
      signOutOfOtherSessions?: boolean;
    }) => {
      await reach("updatePassword", params);

      if (password !== null && params.currentPassword !== password) {
        throw apiError(
          "form_password_incorrect",
          "Password is incorrect. Try again, or use another method."
        );
      }

      if (params.newPassword.length < PASSWORD_MIN_LENGTH) {
        throw apiError(
          "form_password_length_too_short",
          `Passwords must be ${PASSWORD_MIN_LENGTH} characters or more.`
        );
      }

      password = params.newPassword;
      changed();

      return currentUser();
    },
  };
};

type FakeUserResource = ReturnType<typeof userResource>;

/** The User object for this version, the same object until it changes. */
let cached: {
  readonly user: FakeUserResource;
  readonly version: number;
} | null = null;

const currentUser = (): FakeUserResource => {
  if (cached?.version !== version) {
    cached = { user: userResource(), version };
  }

  return cached.user;
};

const isSignedIn = () => signedInUserId() === user.id;

const signOut = async () => {
  await reach("signOut");
  signInAs(null);
};

/** What `getClerkInstance()` (so `~/lib/clerk`'s `getClerk()`) answers. */
const clerkInstance = {
  get loaded() {
    return true;
  },
  get session() {
    return isSignedIn()
      ? { getToken: () => Promise.resolve(FAKE_SESSION_TOKEN), id: "sess_fake" }
      : null;
  },
  signOut,
  get user() {
    return isSignedIn() ? currentUser() : null;
  },
};

/** A snapshot of the signed-in state, rebuilt whenever it changes. */
let authSnapshot: {
  readonly signedIn: boolean;
  readonly user: FakeUserResource | null;
  readonly version: number;
} | null = null;

const getAuthSnapshot = () => {
  const signedIn = isSignedIn();

  if (authSnapshot?.version !== version || authSnapshot.signedIn !== signedIn) {
    authSnapshot = {
      signedIn,
      user: signedIn ? currentUser() : null,
      version,
    };
  }

  return authSnapshot;
};

const useAuthSnapshot = () =>
  useSyncExternalStore(subscribe, getAuthSnapshot, getAuthSnapshot);

const useUser = () => {
  const { signedIn, user: shown } = useAuthSnapshot();

  // Clerk's own answer while it loads: neither signed in nor out, no User.
  if (!loaded) {
    return { isLoaded: false, isSignedIn: undefined, user: undefined };
  }

  return { isLoaded: true, isSignedIn: signedIn, user: shown };
};

/** `useAuth`'s `getToken`, the same function every render, as Clerk's is. */
const getToken = () =>
  Promise.resolve(isSignedIn() ? FAKE_SESSION_TOKEN : null);

const useAuth = () => {
  const { signedIn } = useAuthSnapshot();

  if (!loaded) {
    return {
      getToken,
      isLoaded: false,
      isSignedIn: undefined,
      signOut,
      userId: undefined,
    };
  }

  return {
    getToken,
    isLoaded: true,
    isSignedIn: signedIn,
    signOut,
    userId: signedIn ? user.id : null,
  };
};

const useClerk = () => {
  useAuthSnapshot();

  return clerkInstance;
};

/** Asks for reverification: settles once the test or the screen answers. */
const askForReverification = async (
  level: string,
  onNeedsReverification?: (properties: PendingReverification) => void
) => {
  // Clerk answers the request with the hint before anything is asked.
  await Promise.resolve();
  await new Promise<void>((resolve, reject) => {
    const pending: PendingReverification = {
      cancel: () => {
        reverifications = reverifications.filter((item) => item !== pending);
        reject(
          new ClerkRuntimeError(
            "User cancelled attempted verification",
            "reverification_cancelled"
          )
        );
      },
      complete: () => {
        reverifications = reverifications.filter((item) => item !== pending);
        needsReverification = null;
        resolve();
      },
      level,
    };

    reverifications = [...reverifications, pending];
    onNeedsReverification?.(pending);
  });
};

/**
 * `@clerk/expo`'s `useReverification`: runs `fetcher` at once while the
 * session is fresh. After `requireReverification()` it asks first, through
 * the screen's `onNeedsReverification` (or, without one, only through
 * `fakeClerk`), and runs `fetcher` once completed; a cancel rejects with
 * Clerk's `reverification_cancelled` runtime error, running nothing. Like
 * Clerk's, it answers the same function every render, calling the latest
 * `fetcher` and options.
 */
const useReverification = <Args extends unknown[], Result>(
  fetcher: (...args: Args) => Promise<Result>,
  options?: {
    readonly onNeedsReverification?: (
      properties: PendingReverification
    ) => void;
  }
) => {
  const latest = useRef({ fetcher, options });
  // As Clerk does, the latest `fetcher` and options take over after render.
  useLayoutEffect(() => {
    latest.current = { fetcher, options };
  });

  return useCallback(async (...args: Args): Promise<Result> => {
    if (needsReverification !== null) {
      await askForReverification(
        needsReverification,
        latest.current.options?.onNeedsReverification
      );
    }

    return await latest.current.fetcher(...args);
  }, []);
};

/** Clerk's provider: the fake needs no context, so it renders its children. */
const ClerkProvider = ({ children }: { readonly children?: ReactNode }) =>
  createElement(Fragment, null, children);

/** The module a test file hands `jest.mock("@clerk/expo", …)`. */
export const clerkModule = {
  ClerkProvider,
  getClerkInstance: () => clerkInstance,
  isClerkAPIResponseError,
  isClerkRuntimeError,
  useAuth,
  useClerk,
  useReverification,
  useUser,
};

/** Every reverification Clerk is asking for, oldest first. */
const pendingReverifications = () => {
  if (reverifications.length === 0) {
    throw new Error("Clerk isn't asking for reverification.");
  }

  return reverifications;
};

export const fakeClerk = {
  /** Every Clerk call a screen made, in order, failed ones included. */
  get calls(): readonly ClerkCall[] {
    return calls;
  },
  /** Cancels every reverification Clerk is asking for. */
  cancelReverification: () => {
    for (const pending of pendingReverifications()) {
      pending.cancel();
    }
  },
  /** Finishes a provider's in-app browser round trip: it becomes linked. */
  completeExternalAccount: (provider: FakeProvider) => {
    const account = user.externalAccounts.find(
      (item) => item.provider === provider && item.status === "unverified"
    );

    if (!account) {
      throw new Error(`No ${provider} account is waiting to be linked.`);
    }

    setUserState({
      ...user,
      externalAccounts: user.externalAccounts.map((item) =>
        item.id === account.id
          ? {
              ...item,
              emailAddress: `tony@${provider}.example`,
              status: "verified",
            }
          : item
      ),
    });
  },
  /** Completes every reverification Clerk is asking for; the calls then run. */
  completeReverification: () => {
    for (const pending of pendingReverifications()) {
      pending.complete();
    }
  },
  /** Whether `user.delete()` went through. */
  get deleted() {
    return deleted;
  },
  /** Fails the next `method` call; queued failures fail calls in order. */
  failNext: (method: ClerkMethod, failure: ClerkFailure) => {
    failures.set(method, [...(failures.get(method) ?? []), failure]);
  },
  /**
   * Holds Clerk's answer to the next `method` call until the function it
   * returns is called: the call is recorded at once, and changes the User
   * (or fails) only once released.
   */
  holdNext: (method: ClerkMethod) => {
    let release: () => void = () => {
      // Replaced as the promise is made.
    };

    const held = new Promise<void>((resolve) => {
      release = resolve;
    });

    holds.set(method, [...(holds.get(method) ?? []), held]);
    releaseHolds = [...releaseHolds, release];

    return release;
  },
  /** The User's password, `null` without one. */
  get password() {
    return password;
  },
  /** Makes the next reverified call ask first, until it's completed. */
  requireReverification: (level = "first_factor") => {
    needsReverification = level;
  },
  reset: () => {
    user = userState();
    password = FAKE_PASSWORD;
    deleted = false;
    calls = [];
    failures = new Map();
    holds = new Map();

    for (const release of releaseHolds) {
      release();
    }

    releaseHolds = [];
    needsReverification = null;
    reverifications = [];
    uploads = 0;
    loaded = true;
    changed();
  },
  /** The reverification Clerk is asking for (the oldest), or `null`. */
  get reverification(): PendingReverification | null {
    return reverifications[0] ?? null;
  },
  /**
   * Holds Clerk loading (`false`) or finishes it (`true`, the default): while
   * it loads, `useUser` and `useAuth` answer `isLoaded: false` and no User, as
   * Clerk's hooks do. Only the hooks: `getClerk()` stays loaded, so the Public
   * API's token getter never waits on it.
   */
  setLoaded: (value: boolean) => {
    loaded = value;
    changed();
  },
  /** Replaces the User; whatever the config leaves out takes its default. */
  setUser: (config: FakeUserConfig) => {
    password = config.passwordEnabled === false ? null : FAKE_PASSWORD;
    setUserState(userState(config));
  },
};
