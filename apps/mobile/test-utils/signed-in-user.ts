import { FAKE_USER_ID } from "~/test-utils/fake-public-api";

/**
 * The signed-in Clerk User for a test standing in `~/lib/clerk`'s
 * `getCurrentUserId` with this one (`jest.mock("~/lib/clerk", …)` returning
 * `jest.requireActual("~/test-utils/signed-in-user").getCurrentUserId`):
 * the fake Public API's User until `signInAs` signs someone else in, or
 * nobody (`null`). `after-each.ts` signs `FAKE_USER_ID` back in.
 */
let signedInUserId: string | null = FAKE_USER_ID;

export const signInAs = (userId: string | null) => {
  signedInUserId = userId;
};

export const resetSignedInUser = () => {
  signedInUserId = FAKE_USER_ID;
};

/** `~/lib/clerk`'s: the signed-in User's id; throws when nobody is. */
export const getCurrentUserId = (): string => {
  if (!signedInUserId) {
    throw new Error("Not authenticated");
  }
  return signedInUserId;
};
