/**
 * What deleting the account and signing out leave on the phone (ADR 0018).
 *
 * A deletion takes the User's saved Conversation and every device copy of the
 * Attachments they sent Arnold off the device before the app signs out, a
 * deletion Clerk refused takes nothing, and a plain sign-out keeps both, as it
 * keeps the Conversation's text. Another User's copies are never touched.
 *
 * Driven at the mutations' own seam, with Clerk stood in and the file system
 * in memory: the Screens that call them are covered by
 * `__tests__/profile-and-settings-in-ukrainian.test.tsx`, and how a send
 * writes the copies by `__tests__/arnold-screen.test.tsx`.
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { Alert } from "react-native";

import {
  loadSavedArnoldConversation,
  saveArnoldSession,
} from "~/lib/arnold-chat";
import { keepSentAttachments } from "~/lib/arnold-sent-attachments";
import { storage } from "~/lib/mmkv";
import type * as InMemoryFileSystem from "~/test-utils/in-memory-file-system";
import { createTestQueryClient, settle } from "~/test-utils/query-client";

import { useDeleteUserMutation, useLogoutMutation } from "../auth";

/** The User deleting their account, and another one on the same phone. */
const THEIRS = "user_theirs";
const SOMEONE_ELSE = "user_someone_else";

// The device the Conversations keep their sent photos on, in memory:
// jest-expo's own stand-in stores nothing, so a test over it couldn't see
// the copies, nor that a deletion took them away.
jest.mock(
  "expo-file-system",
  () =>
    jest.requireActual<typeof InMemoryFileSystem>(
      "~/test-utils/in-memory-file-system"
    ).fileSystemModule
);

const { fileSystem } = jest.requireActual<typeof InMemoryFileSystem>(
  "~/test-utils/in-memory-file-system"
);

const mockDelete = jest.fn<() => Promise<void>>();
const mockSignOut = jest.fn<() => Promise<void>>();

jest.mock("@clerk/expo", () => ({
  getClerkInstance: () => ({}),
  isClerkAPIResponseError: () => false,
}));

// The signed-in Clerk User, whose own `delete` the mutation calls.
jest.mock("~/lib/clerk", () => ({
  ...jest.requireActual<typeof import("~/lib/clerk")>("~/lib/clerk"),
  getClerk: () => ({
    signOut: mockSignOut,
    user: { delete: mockDelete, id: THEIRS },
  }),
}));

jest.mock("expo-router", () => ({ router: { replace: jest.fn() } }));

jest.mock("~/lib/segment", () => ({
  segmentClient: { reset: jest.fn(), track: jest.fn() },
}));

/** Where one User's Conversations keep their copies. */
const attachmentsOf = (userId: string) =>
  `file:///memory/document/arnold-attachments/${encodeURIComponent(userId)}`;

/**
 * The copies on the phone for `userId`, as their contents, named; sorted, so
 * nothing rests on the order the copies were written under.
 */
const photosOf = (userId: string): string[] =>
  fileSystem
    .filesUnder(attachmentsOf(userId))
    .map((uri) => fileSystem.read(uri) ?? "")
    .toSorted((one, other) => one.localeCompare(other));

/**
 * Sends `names` as the first message of `userId`'s Conversation: the copies go
 * to `pending`, and the session eve then reports moves them under itself and
 * saves the Conversation, exactly as a send does.
 */
const sendPhotos = async (userId: string, names: readonly string[]) => {
  const uris = names.map((name) => `file:///memory/cache/${name}.jpg`);

  for (const [index, uri] of uris.entries()) {
    fileSystem.write(uri, `${names[index]}-bytes`);
  }

  await keepSentAttachments(userId, undefined, uris);
  saveArnoldSession(userId, {
    sessionId: `session-of-${userId}`,
    streamIndex: 0,
  });
};

/** A mutation's hook under a query client of its own, as a Screen holds it. */
const wrapper =
  (client: ReturnType<typeof createTestQueryClient>) =>
  ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );

/** Presses Delete Account, as Settings and Legal do. */
const deleteAccount = async () => {
  const client = createTestQueryClient();

  const { result } = await renderHook(() => useDeleteUserMutation(), {
    wrapper: wrapper(client),
  });

  await act(() => {
    result.current.mutate();
  });

  await settle(client);
};

/** Presses Log Out, as the Profile screen does. */
const logOut = async () => {
  const client = createTestQueryClient();

  const { result } = await renderHook(() => useLogoutMutation(), {
    wrapper: wrapper(client),
  });

  await act(() => {
    result.current.mutate();
  });

  await settle(client);
};

beforeEach(async () => {
  storage.clearAll();
  fileSystem.reset();
  mockDelete.mockReset();
  mockDelete.mockResolvedValue(undefined);
  mockSignOut.mockReset();
  mockSignOut.mockResolvedValue(undefined);

  await sendPhotos(THEIRS, ["gym", "machine"]);
  await sendPhotos(SOMEONE_ELSE, ["plan"]);
});

describe("deleting the account", () => {
  it("takes the Conversation and its photos off the phone before signing out", async () => {
    let photosWhenSignedOut: (string | undefined)[] = ["not signed out"];
    mockSignOut.mockImplementation(() => {
      photosWhenSignedOut = photosOf(THEIRS);

      return Promise.resolve();
    });

    await deleteAccount();

    expect(mockDelete).toHaveBeenCalledTimes(1);
    expect(photosOf(THEIRS)).toEqual([]);
    expect(loadSavedArnoldConversation(THEIRS)).toEqual({});
    // Nothing of theirs is on the device by the time the session ends.
    expect(photosWhenSignedOut).toEqual([]);
  });

  it("leaves another User's photos and Conversation alone", async () => {
    await deleteAccount();

    expect(photosOf(SOMEONE_ELSE)).toEqual(["plan-bytes"]);
    expect(loadSavedArnoldConversation(SOMEONE_ELSE).session).toEqual({
      sessionId: `session-of-${SOMEONE_ELSE}`,
      streamIndex: 0,
    });
  });

  it("removes nothing when Clerk refuses the deletion", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {
      // The native alert isn't shown under Jest.
    });

    mockDelete.mockRejectedValue(new Error("offline"));

    await deleteAccount();

    // The account is still there, so its Conversation and photos are too.
    expect(photosOf(THEIRS)).toEqual(["gym-bytes", "machine-bytes"]);
    expect(loadSavedArnoldConversation(THEIRS).session).toBeTruthy();
    expect(mockSignOut).not.toHaveBeenCalled();

    expect(alert).toHaveBeenCalledWith(
      "Couldn't delete your account",
      "Something went wrong. Please try again later."
    );
    alert.mockRestore();
  });
});

describe("signing out", () => {
  it("keeps the Conversation and its photos, as it keeps the text", async () => {
    await logOut();

    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(mockDelete).not.toHaveBeenCalled();
    expect(photosOf(THEIRS)).toEqual(["gym-bytes", "machine-bytes"]);
    expect(loadSavedArnoldConversation(THEIRS).session).toBeTruthy();
  });
});
