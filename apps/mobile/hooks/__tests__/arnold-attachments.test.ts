/**
 * The Attachments picked for Arnold's next message: the per-message cap, and
 * that they are the signed-in User's alone — another User on the same phone
 * never inherits a draft's photos (ADR 0018).
 */
import { beforeEach, describe, expect, it } from "@jest/globals";

import {
  addArnoldAttachments,
  arnoldAttachmentsOwner,
  clearArnoldAttachments,
  MAX_ATTACHMENTS_PER_MESSAGE,
  pickedArnoldAttachments,
  remainingAttachmentSlots,
  removeArnoldAttachment,
  useArnoldAttachmentsOwner,
} from "~/hooks/arnold-attachments";
import type { PickedImage } from "~/lib/arnold-attachment-picker";

const photo = (name: string): PickedImage => ({
  height: 1200,
  uri: `file:///photos/${name}.jpg`,
  width: 1600,
});

/** The file behind each pick, in order. */
const uris = () => pickedArnoldAttachments().map((picked) => picked.uri);

beforeEach(() => {
  clearArnoldAttachments();
  useArnoldAttachmentsOwner("user_one");
});

describe("the picked Attachments", () => {
  it("keeps them in the order they were picked", () => {
    addArnoldAttachments([photo("a"), photo("b")], "user_one");
    addArnoldAttachments([photo("c")], "user_one");

    expect(uris()).toEqual([
      "file:///photos/a.jpg",
      "file:///photos/b.jpg",
      "file:///photos/c.jpg",
    ]);
    expect(remainingAttachmentSlots()).toBe(1);
  });

  it("gives each its own id, so two of the same file are told apart", () => {
    addArnoldAttachments([photo("same"), photo("same")], "user_one");

    const [first, second] = pickedArnoldAttachments();
    expect(first?.id).not.toBe(second?.id);

    removeArnoldAttachment(first?.id ?? "");

    expect(pickedArnoldAttachments()).toHaveLength(1);
    expect(pickedArnoldAttachments()[0]?.id).toBe(second?.id);
  });

  it("takes no more than a message holds, however many it is handed", () => {
    addArnoldAttachments([photo("a"), photo("b"), photo("c")], "user_one");
    addArnoldAttachments([photo("d"), photo("e"), photo("f")], "user_one");

    expect(pickedArnoldAttachments()).toHaveLength(MAX_ATTACHMENTS_PER_MESSAGE);
    expect(uris().at(-1)).toBe("file:///photos/d.jpg");
    expect(remainingAttachmentSlots()).toBe(0);
  });

  it("ignores a remove for an id it doesn't have", () => {
    addArnoldAttachments([photo("a")], "user_one");

    removeArnoldAttachment("attachment-nobody");

    expect(pickedArnoldAttachments()).toHaveLength(1);
  });

  it("drops a pick that comes back after its User signed out", () => {
    // The picker and the re-encoding outlive a sign-out: the sheet read the
    // owner before awaiting, and by now someone else is signed in.
    const startedFor = arnoldAttachmentsOwner();
    useArnoldAttachmentsOwner("user_two");

    addArnoldAttachments([photo("theirs")], startedFor);

    expect(pickedArnoldAttachments()).toEqual([]);
  });

  it("drops another User's picks when they sign in on the same phone", () => {
    addArnoldAttachments([photo("theirs")], "user_one");

    useArnoldAttachmentsOwner("user_two");

    expect(pickedArnoldAttachments()).toEqual([]);
    expect(remainingAttachmentSlots()).toBe(MAX_ATTACHMENTS_PER_MESSAGE);
  });

  it("keeps the picks of the User who is still signed in", () => {
    addArnoldAttachments([photo("mine")], "user_one");

    useArnoldAttachmentsOwner("user_one");

    expect(uris()).toEqual(["file:///photos/mine.jpg"]);
  });
});
