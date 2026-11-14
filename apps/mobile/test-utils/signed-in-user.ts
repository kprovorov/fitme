import { FAKE_USER_ID } from "~/test-utils/fake-public-api";

/**
 * The signed-in Clerk User for a test standing in `~/lib/clerk`'s
 * `getCurrentUserId` with this one (`jest.mock("~/lib/clerk", …)` returning
 * `jest.requireActual("~/test-utils/signed-in-user").getCurrentUserId`):
 * the fake Public API's User until `signInAs` signs someone else in, or
 * nobody (`null`). A stand-in's `getClerk().user` follows `signedInUserId()`
 * too, so both see the same account change, and `fake-clerk.ts` follows
 * it (`onSignedInUserChange`), re-rendering its mounted hooks. `after-each.ts`
 * signs `FAKE_USER_ID` back in.
 */
let currentUserId: string | null = FAKE_USER_ID;

const listeners = new Set<() => void>();

const setSignedInUser = (userId: string | null) => {
  currentUserId = userId;

  for (const listener of listeners) {
    listener();
  }
};

export const signInAs = (userId: string | null) => {
  setSignedInUser(userId);
};

export const resetSignedInUser = () => {
  setSignedInUser(FAKE_USER_ID);
};

/** Calls `listener` on every account change; for a stand-in's hooks. */
export const onSignedInUserChange = (listener: () => void) => {
  listeners.add(listener);
};

/** The signed-in User's id, or `null`: for a stand-in's `getClerk().user`. */
export const signedInUserId = (): string | null => currentUserId;

/** `~/lib/clerk`'s: the signed-in User's id; throws when nobody is. */
export const getCurrentUserId = (): string => {
  if (!currentUserId) {
    throw new Error("Not authenticated");
  }

  return currentUserId;
};
