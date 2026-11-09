import { useSyncExternalStore } from "react";

import type { PickedImage } from "~/lib/arnold-attachment-picker";

/**
 * At most 4 Attachments per message (ADR 0018): four shrunk JPEGs are about
 * 2 MB of base64 (see `MAX_ATTACHMENT_EDGE` and the JPEG quality in
 * `lib/arnold-attachment-picker.ts`), inside Vercel's 4.5 MB request body.
 */
export const MAX_ATTACHMENTS_PER_MESSAGE = 4;

/**
 * At most 10 Attachments per Conversation (ADR 0018): eve resends every
 * earlier image on every model call, so a photo-heavy Conversation would run
 * into Arnold's $1 turn budget and have a turn cancelled for no visible
 * reason. Only the app counts; the turn budget is the server's backstop.
 */
export const MAX_ATTACHMENTS_PER_CONVERSATION = 10;

/** An Attachment picked for the next message, not sent yet. */
export interface ArnoldAttachment extends PickedImage {
  /** Its own id, so × removes the thumbnail the User pressed it on. */
  id: string;
}

const NONE: readonly ArnoldAttachment[] = [];

/**
 * The Attachments picked for Arnold's next message, in memory only (never
 * MMKV): the "+" sheet picks them and the composer, a screen away, shows
 * them, so they live outside both. They are a draft, like the composer's
 * text: a sent message empties them, and a refused or failed one is given
 * them back (`app/(tabs)/arnold/index.tsx`).
 */
let picked = NONE;
let owner: string | null = null;
let nextId = 0;

/**
 * How many Attachments the Conversation on screen already carries. The "+"
 * sheet is a screen of its own, outside the Arnold runtime, so the Arnold
 * screen counts them (off the Conversation it renders) and leaves the count
 * here for the sheet to read.
 */
let sent = 0;

/**
 * The Attachments of a send whose files are being read: the composer has let
 * go of them and the Conversation hasn't got them yet, so without this they
 * would be counted by neither and the cap could be walked past while one send
 * is on its way.
 */
let sending = 0;
const listeners = new Set<() => void>();

const emit = () => {
  for (const listener of listeners) {
    listener();
  }
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
};

/** The Attachments picked so far, oldest first. */
export const pickedArnoldAttachments = (): readonly ArnoldAttachment[] =>
  picked;

/**
 * Slots left in the Conversation: its cap, less what it carries, what a send
 * is reading off the device and what's picked.
 */
const conversationSlotsLeft = (): number =>
  MAX_ATTACHMENTS_PER_CONVERSATION - sent - sending - picked.length;

/**
 * Whether the Conversation can still take `count` more Attachments, not
 * counting what's picked: the send about to go out is what's picked, so this
 * is how a send asks whether it still fits.
 */
export const conversationHasRoomFor = (count: number): boolean =>
  MAX_ATTACHMENTS_PER_CONVERSATION - sent - sending >= count;

/**
 * Holds a send's slots while its files are read: it has left the composer
 * and hasn't reached the Conversation, and in between nothing else may take
 * the slots it is about to fill.
 *
 * `startedFor` is the owner when the send began, as `addArnoldAttachments`
 * takes it: a hold belongs to one User's Conversation and to no other.
 */
export const markAttachmentsSending = (
  count: number,
  startedFor: string | null
): void => {
  if (count <= 0 || startedFor !== owner) {
    return;
  }

  sending += count;
  emit();
};

/**
 * Gives those slots back: that send never reached the Conversation.
 *
 * Only to the User who held them. A send outlives a sign-out, and the User
 * who signed in meanwhile has a Conversation of their own: their switch
 * already dropped this hold, so taking it off their count again would hand
 * out slots their own sends are reading files for.
 */
export const releaseSendingAttachments = (
  count: number,
  startedFor: string | null
): void => {
  if (count <= 0 || sending === 0 || startedFor !== owner) {
    return;
  }

  sending = Math.max(0, sending - count);
  emit();
};

/**
 * How many more a pick can add: whichever of the two caps binds first, the
 * message's or the Conversation's, so the picker is never opened for a slot
 * a send couldn't use.
 */
export const remainingAttachmentSlots = (): number =>
  Math.max(
    0,
    Math.min(
      MAX_ATTACHMENTS_PER_MESSAGE - picked.length,
      conversationSlotsLeft()
    )
  );

/**
 * Whether the Conversation can take no more Attachments: what it carries plus
 * what's picked has reached `MAX_ATTACHMENTS_PER_CONVERSATION`. Then "+" is
 * disabled and the only way on is a new Conversation.
 */
export const isConversationFull = (): boolean => conversationSlotsLeft() <= 0;

/**
 * Records how many Attachments the Conversation on screen carries, for the
 * "+" sheet to read: the Arnold screen counts them off the Conversation it
 * renders and syncs the count here.
 */
export const setConversationAttachmentCount = (count: number): void => {
  if (count === sent) {
    return;
  }

  // Only the send that just landed gives up its hold: the Conversation grew
  // by what it carried, and any other send still reading its files keeps
  // holding the slots it is about to fill. Clearing every hold here would
  // offer those slots twice, and two overlapping sends could walk the
  // Conversation past its cap (nothing is busy while files are read, so a
  // second send can start during the first).
  sending = Math.max(0, sending - Math.max(0, count - sent));
  sent = count;
  emit();
};

/**
 * Who the picks belong to: read before awaiting a picker, and handed back to
 * `addArnoldAttachments` so a pick that outlives its User is dropped.
 */
export const arnoldAttachmentsOwner = (): string | null => owner;

/**
 * Adds the picked images, as many as the message and the Conversation still
 * take: the picker is asked for no more than that, and this holds both caps
 * even if it answers more.
 *
 * `startedFor` is the owner when the pick began: picking takes a while, and
 * a User who signs out meanwhile must not hand their photos to whoever
 * signs in next, so a pick that comes back for anyone else is dropped.
 */
export const addArnoldAttachments = (
  images: readonly PickedImage[],
  startedFor: string | null
): void => {
  if (startedFor !== owner) {
    return;
  }

  const room = images.slice(0, remainingAttachmentSlots());

  if (room.length === 0) {
    return;
  }

  picked = [
    ...picked,
    ...room.map((image) => {
      nextId += 1;

      return { ...image, id: `attachment-${nextId}` };
    }),
  ];
  emit();
};

/** Removes one, by its id (the thumbnail's ×). */
export const removeArnoldAttachment = (id: string): void => {
  const left = picked.filter((attachment) => attachment.id !== id);

  if (left.length === picked.length) {
    return;
  }

  picked = left;
  emit();
};

/** Drops every one of them: a sign-out (`components/auth-sync.tsx`), and tests. */
export const clearArnoldAttachments = (): void => {
  if (picked.length === 0) {
    return;
  }

  picked = NONE;
  emit();
};

/**
 * Keeps the picks of the User the Arnold screen is showing and drops anyone
 * else's: another User signing in on the same phone never inherits photos.
 * Dropped as the screen renders, before anything reads them, so no thumbnail
 * of theirs is ever on screen.
 */
export const useArnoldAttachmentsOwner = (userId: string): void => {
  if (owner !== userId) {
    owner = userId;
    picked = NONE;
    // Their Conversation is their own: the screen syncs its count right
    // after this render, so nobody inherits someone else's full one either.
    sent = 0;
    sending = 0;
  }
};

/** The Attachments picked so far, re-rendering when they change. */
export const useArnoldAttachments = (): readonly ArnoldAttachment[] =>
  useSyncExternalStore(
    subscribe,
    pickedArnoldAttachments,
    pickedArnoldAttachments
  );

/** How many more the next message takes, re-rendering when that changes. */
export const useRemainingAttachmentSlots = (): number =>
  useSyncExternalStore(
    subscribe,
    remainingAttachmentSlots,
    remainingAttachmentSlots
  );

/** Whether the Conversation is full of photos, re-rendering when that changes. */
export const useIsConversationFull = (): boolean =>
  useSyncExternalStore(subscribe, isConversationFull, isConversationFull);
