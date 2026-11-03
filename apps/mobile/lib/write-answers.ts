import { getCurrentUserId } from "~/lib/clerk";

/**
 * Who started a write: what a seeding mutation's own `onMutate` answers, and
 * its `onSuccess` (or the caller's `onSettled`) gets back as its third
 * argument. A hook-level `onMutate` would replace it, so none is passed.
 */
export interface WriteStarter {
  /** The Clerk User signed in when the write started, `null` for nobody. */
  userId: string | null;
}

/** The signed-in User's Clerk id, or `null` when nobody is. */
const signedInUserId = (): string | null => {
  try {
    return getCurrentUserId();
  } catch {
    return null;
  }
};

/** A seeding mutation's `onMutate`: remembers who started the write. */
export const rememberWriteStarter = (): WriteStarter => ({
  userId: signedInUserId(),
});

/**
 * Whether the User who started the write is still the one signed in: only
 * then may its answer, or anything done after it, touch the cache.
 */
export const isStillWriteStarter = (
  starter: WriteStarter | undefined
): boolean => !!starter?.userId && signedInUserId() === starter.userId;

/**
 * Puts a write's answer into the cache (`seed`: cancelling the reads it
 * replaces, setting it, invalidating what it changed), but only while the
 * User who started the write is still the one signed in. Signing out clears
 * the cache, not a write still waiting for its answer: seeding then would
 * show the previous User's data to whoever signs in next, and cancel that
 * User's own reads. Answers whether it seeded.
 */
export const seedWriteAnswer = async (
  starter: WriteStarter | undefined,
  seed: () => Promise<void>
): Promise<boolean> => {
  if (!isStillWriteStarter(starter)) {
    return false;
  }
  await seed();
  return true;
};
