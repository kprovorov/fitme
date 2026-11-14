import { isClerkRuntimeError, useReverification } from "@clerk/expo";
import { useRouter } from "expo-router";
import { useCallback, useSyncExternalStore } from "react";

/** The route showing "Confirm it's you" (`app/confirm-identity.tsx`). */
export const CONFIRM_IDENTITY_ROUTE = "/confirm-identity";

/** What Clerk hands `onNeedsReverification`: the level and its two answers. */
interface NeedsReverification {
  readonly cancel: () => void;
  readonly complete: () => void;
  readonly level: string | undefined;
}

/**
 * The reverification Clerk is asking for, waiting on "Confirm it's you".
 * Clerk's answers are functions, which a route can't take as params, so the
 * sheet reads them from here.
 */
export interface PendingReverification {
  readonly cancel: () => void;
  readonly complete: () => void;
  readonly id: number;
  /** The level Clerk asks for; the first factor when it doesn't say. */
  readonly level: "first_factor" | "multi_factor" | "second_factor";
}

let pending: PendingReverification | null = null;
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

const getSnapshot = () => pending;

const levelOf = (level: string | undefined): PendingReverification["level"] =>
  level === "second_factor" || level === "multi_factor"
    ? level
    : "first_factor";

/**
 * Holds Clerk's ask until the sheet answers it. A newer ask replaces one
 * still waiting, which is cancelled: its call never runs.
 */
const askToReverify = ({ cancel, complete, level }: NeedsReverification) => {
  pending?.cancel();
  nextId += 1;
  pending = { cancel, complete, id: nextId, level: levelOf(level) };
  emit();
};

/**
 * Answers the ask `id` once: `complete` runs the call that asked, `cancel`
 * drops it. An ask already answered or replaced is left alone.
 */
export const settleReverification = (
  id: number,
  answer: "cancel" | "complete"
): void => {
  if (pending?.id !== id) {
    return;
  }

  const settled = pending;
  pending = null;
  emit();
  settled[answer]();
};

/** The reverification waiting on "Confirm it's you", or `null`. */
export const usePendingReverification = (): PendingReverification | null =>
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

/** What a reverified call ended in: its result, or the User cancelling. */
export type ReverifiedResult<Result> =
  | { readonly status: "cancelled" }
  | { readonly status: "done"; readonly value: Result };

const isCancelled = (error: unknown) =>
  isClerkRuntimeError(error) && error.code === "reverification_cancelled";

/**
 * Runs a Clerk call that may need reverification (change email or
 * password, connect, disconnect, delete). When Clerk says the session is
 * too old, it shows "Confirm it's you" and runs the call once the User has
 * confirmed; otherwise the call runs at once. Clerk decides: the app never
 * asks on its own.
 *
 * It answers `cancelled` when the User cancels (nothing ran), the call's
 * result otherwise; any other failure, the call's own included, rejects.
 */
export const useReverifiedCall = <Args extends unknown[], Result>(
  fetcher: (...args: Args) => Promise<Result>
): ((...args: Args) => Promise<ReverifiedResult<Result>>) => {
  const router = useRouter();

  const onNeedsReverification = useCallback(
    (properties: NeedsReverification) => {
      askToReverify(properties);
      router.push(CONFIRM_IDENTITY_ROUTE);
    },
    [router]
  );

  const reverified = useReverification(fetcher, { onNeedsReverification });

  return useCallback(
    async (...args: Args): Promise<ReverifiedResult<Result>> => {
      try {
        const value = await reverified(...args);

        return { status: "done", value };
      } catch (error) {
        if (isCancelled(error)) {
          return { status: "cancelled" };
        }

        throw error;
      }
    },
    [reverified]
  );
};
