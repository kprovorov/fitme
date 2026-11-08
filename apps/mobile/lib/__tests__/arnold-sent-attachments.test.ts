/**
 * The device copy of a sent Attachment (ADR 0018), over an in-memory file
 * system (`test-utils/in-memory-file-system.ts`): where a copy goes, that it
 * is found again by the name its send carried, and what a new Conversation or
 * a replaced session takes away.
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

import type * as InMemoryFileSystem from "~/test-utils/in-memory-file-system";

import {
  dropSentAttachments,
  followSentAttachments,
  forgetSentAttachments,
  keepSentAttachments,
  sentAttachmentUri,
} from "../arnold-sent-attachments";

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

const USER = "user_keeps_photos";

/** Where every copy of the User's lives, whatever Conversation it was sent in. */
const userRoot = (userId = USER) =>
  `file:///memory/document/arnold-attachments/${userId}`;

/** A re-encoded JPEG the picker left in the cache, holding its own bytes. */
const picked = (name: string): string => {
  const uri = `file:///memory/cache/${name}.jpg`;
  fileSystem.write(uri, `${name}-bytes`);

  return uri;
};

beforeEach(() => {
  fileSystem.reset();
});

describe("keepSentAttachments", () => {
  it("keeps one copy per Attachment, under the Conversation that sent it", async () => {
    const names = await keepSentAttachments(USER, "ses_1", [
      picked("gym"),
      picked("plan"),
    ]);

    expect(names).toHaveLength(2);
    expect(fileSystem.filesUnder(userRoot())).toEqual([
      `${userRoot()}/ses_1/${names[0]}`,
      `${userRoot()}/ses_1/${names[1]}`,
    ]);
    // The copy is the photo, not a stand-in for it.
    expect(fileSystem.read(`${userRoot()}/ses_1/${names[0]}`)).toBe(
      "gym-bytes"
    );
    expect(fileSystem.read(`${userRoot()}/ses_1/${names[1]}`)).toBe(
      "plan-bytes"
    );
  });

  it("answers the names in the order the Attachments were sent in", async () => {
    const names = await keepSentAttachments(USER, "ses_1", [
      picked("first"),
      picked("second"),
      picked("third"),
    ]);

    expect(
      names.map((name) => fileSystem.read(`${userRoot()}/ses_1/${name}`))
    ).toEqual(["first-bytes", "second-bytes", "third-bytes"]);
  });

  it("gives two messages of one Conversation names of their own", async () => {
    const first = await keepSentAttachments(USER, "ses_1", [picked("a")]);
    const second = await keepSentAttachments(USER, "ses_1", [picked("b")]);

    expect(second[0]).not.toBe(first[0]);
    expect(fileSystem.filesUnder(userRoot())).toHaveLength(2);
  });

  it("touches no file for a message with no Attachment", async () => {
    await expect(keepSentAttachments(USER, "ses_1", [])).resolves.toEqual([]);

    // A text-only send is most of them: a Conversation that has sent no
    // Attachment has no directory on the device at all.
    expect(fileSystem.filesUnder("file:///memory/document")).toEqual([]);
    expect(
      sentAttachmentUri(USER, "ses_1", "mabc-0-deadbeef.jpg")
    ).toBeUndefined();
  });

  it("holds the first message's copies until eve has named the session", async () => {
    const names = await keepSentAttachments(USER, undefined, [picked("gym")]);

    expect(fileSystem.filesUnder(userRoot())).toEqual([
      `${userRoot()}/pending/${names[0]}`,
    ]);
  });

  it("still answers a name for a photo the device would not copy", async () => {
    const names = await keepSentAttachments(USER, "ses_1", [
      "file:///memory/cache/gone.jpg",
    ]);

    // The name goes on the wire either way, so the message is sent and its
    // bubble falls back to a Photo tile.
    expect(names).toHaveLength(1);
    expect(sentAttachmentUri(USER, "ses_1", names[0] ?? "")).toBeUndefined();
  });

  it("keeps the photos it could copy when one of them fails", async () => {
    const names = await keepSentAttachments(USER, "ses_1", [
      picked("gym"),
      "file:///memory/cache/gone.jpg",
      picked("plan"),
    ]);

    expect(sentAttachmentUri(USER, "ses_1", names[0] ?? "")).toBeTruthy();
    expect(sentAttachmentUri(USER, "ses_1", names[1] ?? "")).toBeUndefined();
    expect(sentAttachmentUri(USER, "ses_1", names[2] ?? "")).toBeTruthy();
  });

  it("keeps each User's copies apart", async () => {
    const mine = await keepSentAttachments(USER, "ses_1", [picked("mine")]);

    expect(sentAttachmentUri(USER, "ses_1", mine[0] ?? "")).toBeTruthy();
    expect(
      sentAttachmentUri("user_other", "ses_1", mine[0] ?? "")
    ).toBeUndefined();
  });
});

describe("sentAttachmentUri", () => {
  it("finds the copy of the name an echo brings back", async () => {
    const names = await keepSentAttachments(USER, "ses_1", [picked("gym")]);
    const uri = sentAttachmentUri(USER, "ses_1", names[0] ?? "");

    expect(uri).toBe(`${userRoot()}/ses_1/${names[0]}`);
    expect(fileSystem.read(uri ?? "")).toBe("gym-bytes");
  });

  it("answers nothing for a Conversation this device never sent", async () => {
    const names = await keepSentAttachments(USER, "ses_1", [picked("gym")]);

    expect(sentAttachmentUri(USER, "ses_2", names[0] ?? "")).toBeUndefined();
  });

  it("answers nothing for a name this device never wrote", () => {
    expect(
      sentAttachmentUri(USER, "ses_1", "mabc-0-deadbeef.jpg")
    ).toBeUndefined();
  });

  it("answers nothing for a name that isn't one of ours", async () => {
    await keepSentAttachments(USER, "ses_1", [picked("gym")]);
    fileSystem.write(`${userRoot()}/ses_1/../elsewhere.jpg`, "not ours");

    // A name comes off the wire, so one pointing out of the Conversation is
    // never resolved.
    expect(
      sentAttachmentUri(USER, "ses_1", "../elsewhere.jpg")
    ).toBeUndefined();
    expect(sentAttachmentUri(USER, "ses_1", "report.pdf")).toBeUndefined();
  });
});

describe("dropSentAttachments", () => {
  it("takes back the copies of a send that went nowhere", async () => {
    const names = await keepSentAttachments(USER, "ses_1", [
      picked("gym"),
      picked("plan"),
    ]);

    dropSentAttachments(USER, "ses_1", names);

    expect(fileSystem.filesUnder(userRoot())).toEqual([]);
  });

  it("leaves the Conversation's other messages' copies alone", async () => {
    const kept = await keepSentAttachments(USER, "ses_1", [picked("kept")]);
    const refused = await keepSentAttachments(USER, "ses_1", [picked("gone")]);

    dropSentAttachments(USER, "ses_1", refused);

    expect(sentAttachmentUri(USER, "ses_1", kept[0] ?? "")).toBeTruthy();
    expect(sentAttachmentUri(USER, "ses_1", refused[0] ?? "")).toBeUndefined();
  });

  it("does nothing for copies that were never written", () => {
    expect(() =>
      dropSentAttachments(USER, "ses_1", ["mabc-0-deadbeef.jpg"])
    ).not.toThrow();
  });

  it("never reaches another User's or another Conversation's copies", async () => {
    const theirs = await keepSentAttachments("user_other", "ses_1", [
      picked("theirs"),
    ]);

    const other = await keepSentAttachments(USER, "ses_2", [picked("other")]);

    dropSentAttachments(USER, "ses_1", [...theirs, ...other]);

    expect(
      sentAttachmentUri("user_other", "ses_1", theirs[0] ?? "")
    ).toBeTruthy();
    expect(sentAttachmentUri(USER, "ses_2", other[0] ?? "")).toBeTruthy();
  });
});

describe("followSentAttachments", () => {
  it("takes the first message's copies under the session eve named", async () => {
    const names = await keepSentAttachments(USER, undefined, [picked("gym")]);

    followSentAttachments(USER, "ses_1");

    expect(fileSystem.filesUnder(userRoot())).toEqual([
      `${userRoot()}/ses_1/${names[0]}`,
    ]);
    expect(sentAttachmentUri(USER, "ses_1", names[0] ?? "")).toBeTruthy();
  });

  it("drops the copies of the Conversation a new session replaced", async () => {
    const replaced = await keepSentAttachments(USER, "ses_1", [picked("gym")]);

    followSentAttachments(USER, "ses_2");

    expect(fileSystem.filesUnder(userRoot())).toEqual([]);
    expect(sentAttachmentUri(USER, "ses_1", replaced[0] ?? "")).toBeUndefined();
  });

  it("leaves the Conversation's own copies alone", async () => {
    const names = await keepSentAttachments(USER, "ses_1", [picked("gym")]);

    followSentAttachments(USER, "ses_1");

    expect(sentAttachmentUri(USER, "ses_1", names[0] ?? "")).toBeTruthy();
  });

  it("leaves another User's Conversations alone", async () => {
    const theirs = await keepSentAttachments("user_other", "ses_1", [
      picked("theirs"),
    ]);

    followSentAttachments(USER, "ses_2");

    expect(
      sentAttachmentUri("user_other", "ses_1", theirs[0] ?? "")
    ).toBeTruthy();
  });

  it("does nothing for a User who has sent none", () => {
    expect(() => followSentAttachments(USER, "ses_1")).not.toThrow();
    expect(fileSystem.filesUnder(userRoot())).toEqual([]);
  });
});

describe("forgetSentAttachments", () => {
  it("takes every copy of the User's away", async () => {
    const first = await keepSentAttachments(USER, "ses_1", [picked("gym")]);

    const pending = await keepSentAttachments(USER, undefined, [
      picked("plan"),
    ]);

    forgetSentAttachments(USER);

    expect(fileSystem.filesUnder(userRoot())).toEqual([]);
    expect(sentAttachmentUri(USER, "ses_1", first[0] ?? "")).toBeUndefined();
    expect(
      sentAttachmentUri(USER, undefined, pending[0] ?? "")
    ).toBeUndefined();
  });

  it("leaves another User's alone", async () => {
    const theirs = await keepSentAttachments("user_other", "ses_1", [
      picked("theirs"),
    ]);

    forgetSentAttachments(USER);

    expect(
      sentAttachmentUri("user_other", "ses_1", theirs[0] ?? "")
    ).toBeTruthy();
  });

  it("does nothing for a User who has sent none", () => {
    expect(() => forgetSentAttachments(USER)).not.toThrow();
  });
});
