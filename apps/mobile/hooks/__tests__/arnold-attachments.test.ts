/**
 * The Attachments picked for Arnold's next message: the per-message and
 * per-Conversation caps, and that they are the signed-in User's alone —
 * another User on the same phone never inherits a draft's photos (ADR 0018).
 */
import { beforeEach, describe, expect, it } from "@jest/globals";

import {
  addArnoldAttachments,
  arnoldAttachmentsOwner,
  clearArnoldAttachments,
  conversationHasRoomFor,
  isConversationFull,
  markAttachmentsSending,
  MAX_ATTACHMENTS_PER_CONVERSATION,
  MAX_ATTACHMENTS_PER_MESSAGE,
  pickedArnoldAttachments,
  releaseSendingAttachments,
  remainingAttachmentSlots,
  removeArnoldAttachment,
  setConversationAttachmentCount,
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
  setConversationAttachmentCount(0);
  // A fresh store for each test: the count setter clears any hold too.
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

describe("the Conversation's own cap", () => {
  /** Photos enough to fill whatever is asked for. */
  const photos = (count: number) =>
    Array.from({ length: count }, (_, index) => photo(`p${index}`));

  it("offers only the slots the Conversation has left", () => {
    setConversationAttachmentCount(MAX_ATTACHMENTS_PER_CONVERSATION - 2);

    // A whole message wouldn't fit: eve resends every earlier image, so the
    // Conversation's cap binds before the message's.
    expect(remainingAttachmentSlots()).toBe(2);
    expect(isConversationFull()).toBe(false);
  });

  it("offers a whole message while the Conversation has room to spare", () => {
    setConversationAttachmentCount(2);

    expect(remainingAttachmentSlots()).toBe(MAX_ATTACHMENTS_PER_MESSAGE);
  });

  it("counts what's picked towards it, so the next pick stays inside it", () => {
    setConversationAttachmentCount(MAX_ATTACHMENTS_PER_CONVERSATION - 3);
    addArnoldAttachments(photos(2), "user_one");

    expect(remainingAttachmentSlots()).toBe(1);
    expect(isConversationFull()).toBe(false);
  });

  it("is full once what it carries and what's picked reach the cap", () => {
    setConversationAttachmentCount(MAX_ATTACHMENTS_PER_CONVERSATION - 2);
    addArnoldAttachments(photos(2), "user_one");

    expect(isConversationFull()).toBe(true);
    expect(remainingAttachmentSlots()).toBe(0);
  });

  it("has room again once a picked photo is dropped", () => {
    setConversationAttachmentCount(MAX_ATTACHMENTS_PER_CONVERSATION - 1);
    addArnoldAttachments(photos(1), "user_one");
    expect(isConversationFull()).toBe(true);

    removeArnoldAttachment(pickedArnoldAttachments()[0]?.id ?? "");

    expect(isConversationFull()).toBe(false);
    expect(remainingAttachmentSlots()).toBe(1);
  });

  it("takes no more than it has left, however many it is handed", () => {
    setConversationAttachmentCount(MAX_ATTACHMENTS_PER_CONVERSATION - 1);

    addArnoldAttachments(photos(MAX_ATTACHMENTS_PER_MESSAGE), "user_one");

    expect(pickedArnoldAttachments()).toHaveLength(1);
    expect(isConversationFull()).toBe(true);
  });

  it("adds nothing once it is full", () => {
    setConversationAttachmentCount(MAX_ATTACHMENTS_PER_CONVERSATION);

    addArnoldAttachments(photos(2), "user_one");

    expect(pickedArnoldAttachments()).toEqual([]);
    expect(isConversationFull()).toBe(true);
  });

  it("holds the slots of a send whose photos are still being read", () => {
    setConversationAttachmentCount(MAX_ATTACHMENTS_PER_CONVERSATION - 4);
    // The composer has let go of two: they are neither picked nor in the
    // Conversation yet, and without the hold both counts would miss them.
    markAttachmentsSending(2);

    expect(remainingAttachmentSlots()).toBe(2);
    expect(conversationHasRoomFor(2)).toBe(true);
    expect(conversationHasRoomFor(3)).toBe(false);
  });

  it("is full while a send holds the last of them", () => {
    setConversationAttachmentCount(MAX_ATTACHMENTS_PER_CONVERSATION - 2);
    markAttachmentsSending(2);

    expect(isConversationFull()).toBe(true);
    expect(remainingAttachmentSlots()).toBe(0);
    expect(conversationHasRoomFor(1)).toBe(false);
  });

  it("gives the slots back when that send never reaches the Conversation", () => {
    setConversationAttachmentCount(MAX_ATTACHMENTS_PER_CONVERSATION - 2);
    markAttachmentsSending(2);

    releaseSendingAttachments(2);

    // The photos go back into the composer, so there has to be room for
    // them: a failed read must not cost the User the message.
    expect(isConversationFull()).toBe(false);
    expect(remainingAttachmentSlots()).toBe(2);
  });

  it("keeps the other send's hold when one of two overlapping ones lands", () => {
    // Nothing is busy while a send reads its files, so a second can start
    // during the first and both hold their slots at once.
    setConversationAttachmentCount(2);
    markAttachmentsSending(4);
    markAttachmentsSending(4);
    expect(conversationHasRoomFor(1)).toBe(false);

    // The first lands: the Conversation grew by its four, and only those
    // stop being held. Giving up the second's hold here would offer its
    // slots a second time and let the Conversation past its cap.
    setConversationAttachmentCount(6);

    expect(remainingAttachmentSlots()).toBe(0);
    expect(conversationHasRoomFor(1)).toBe(false);

    setConversationAttachmentCount(10);

    expect(isConversationFull()).toBe(true);
  });

  it("takes the hold over once the Conversation's own count has them", () => {
    setConversationAttachmentCount(MAX_ATTACHMENTS_PER_CONVERSATION - 2);
    markAttachmentsSending(2);

    // The screen counts the Conversation again, and the message it just
    // sent is in it: counting the hold as well would count them twice.
    setConversationAttachmentCount(MAX_ATTACHMENTS_PER_CONVERSATION);

    expect(isConversationFull()).toBe(true);
    expect(conversationHasRoomFor(0)).toBe(true);
    releaseSendingAttachments(2);
    expect(isConversationFull()).toBe(true);
  });

  it("forgets another User's full Conversation when they sign in", () => {
    setConversationAttachmentCount(MAX_ATTACHMENTS_PER_CONVERSATION);

    useArnoldAttachmentsOwner("user_two");

    // Their own Conversation is empty until the screen counts it for them,
    // so nobody inherits a Conversation full of someone else's photos.
    expect(isConversationFull()).toBe(false);
    expect(remainingAttachmentSlots()).toBe(MAX_ATTACHMENTS_PER_MESSAGE);
  });
});
