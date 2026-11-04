import { useSyncExternalStore } from "react";
import type { PickedImage } from "~/lib/arnold-attachment-picker";

/**
 * At most 4 Attachments per message (ADR 0018): four shrunk JPEGs are about
 * 3.3 MB of base64, which still fits Vercel's 4.5 MB request body.
 */
export const MAX_ATTACHMENTS_PER_MESSAGE = 4;

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
 * text: a sent or refused message is the next ticket's.
 */
let picked = NONE;
let owner: string | null = null;
let nextId = 0;
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

/** How many more the next message takes. */
export const remainingAttachmentSlots = (): number =>
  MAX_ATTACHMENTS_PER_MESSAGE - picked.length;

/**
 * Adds the picked images, as many as the message still takes: the picker is
 * asked for no more than that, and this holds the cap even if it answers
 * more.
 */
export function addArnoldAttachments(images: readonly PickedImage[]): void {
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
}

/** Removes one, by its id (the thumbnail's ×). */
export function removeArnoldAttachment(id: string): void {
  const left = picked.filter((attachment) => attachment.id !== id);
  if (left.length === picked.length) {
    return;
  }
  picked = left;
  emit();
}

/** Drops every one of them: a sign-out, and tests. */
export function clearArnoldAttachments(): void {
  if (picked.length === 0) {
    return;
  }
  picked = NONE;
  emit();
}

/**
 * Keeps the picks of the User the Arnold screen is showing and drops anyone
 * else's: another User signing in on the same phone never inherits photos.
 * Dropped as the screen renders, before anything reads them, so no thumbnail
 * of theirs is ever on screen.
 */
export function useArnoldAttachmentsOwner(userId: string): void {
  if (owner !== userId) {
    owner = userId;
    picked = NONE;
  }
}

/** The Attachments picked so far, re-rendering when they change. */
export function useArnoldAttachments(): readonly ArnoldAttachment[] {
  return useSyncExternalStore(
    subscribe,
    pickedArnoldAttachments,
    pickedArnoldAttachments
  );
}

/** How many more the next message takes, re-rendering when that changes. */
export function useRemainingAttachmentSlots(): number {
  return useSyncExternalStore(
    subscribe,
    remainingAttachmentSlots,
    remainingAttachmentSlots
  );
}
