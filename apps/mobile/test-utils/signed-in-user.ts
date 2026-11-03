import { FAKE_USER_ID } from "~/test-utils/fake-public-api";

/**
 * The signed-in Clerk User for a test standing in `~/lib/clerk`'s
 * `getCurrentUserId` with this one (`jest.mock("~/lib/clerk", …)` returning
 * `jest.requireActual("~/test-utils/signed-in-user").getCurrentUserId`):
 * the fake Public API's User until `signInAs` signs someone else in, or
 * nobody (`null`). A stand-in's `getClerk().user` follows `signedInUserId()`
 * too, so both see the same account change. `after-each.ts` signs
 * `FAKE_USER_ID` back in.
 */
let currentUserId: string | null = FAKE_USER_ID;

export const signInAs = (userId: string | null) => {
  currentUserId = userId;
};

export const resetSignedInUser = () => {
  currentUserId = FAKE_USER_ID;
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
