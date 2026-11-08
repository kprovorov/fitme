import { useEffect, useEffectEvent, useSyncExternalStore } from "react";

/**
 * One screen's choice out of a fixed list (the Muscle groups or the
 * Equipment a Library screen filters by), in memory only, never MMKV: the
 * shared choice sheet reads the opener's choice and hands the confirmed one
 * back to that screen alone.
 *
 * Each list gets its own store (`hooks/muscle-choice.ts`,
 * `hooks/equipment-choice.ts`), so a screen's two choices never share a key.
 */
export interface ChoiceStore<T extends string> {
  /** Forgets a screen's choice (the Exercise picker, once closed). */
  forget: (key: string) => void;
  /** A screen's confirmed choice, in the list's order (none by default). */
  get: (key: string) => readonly T[];
  /** The values among `chosen`, in the list's order, each once. */
  inOrder: (chosen: readonly T[]) => readonly T[];
  /**
   * A fresh key for one opening of a screen whose choice starts over each
   * time (the Exercise picker): hold it with `useOpening`.
   */
  newKey: () => string;
  /** Forgets every choice: the app's start, for tests. */
  resetAll: () => void;
  set: (key: string, chosen: readonly T[]) => void;
  /** The screen's confirmed choice, re-rendering when it changes. */
  use: (key: string) => readonly T[];
  /**
   * Starts `key` on `initial` while the screen is mounted and forgets it once
   * it closes. An effect torn down and set up again (Fast Refresh) seeds it
   * anew rather than losing it.
   */
  useOpening: (key: string, initial: readonly T[]) => void;
  /** The choosable values, in the list's order. */
  values: readonly T[];
}

/** A store over `values`, which are the choosable ones in their own order. */
export const createChoiceStore = <T extends string>(
  values: readonly T[]
): ChoiceStore<T> => {
  const none: readonly T[] = [];
  const choices = new Map<string, readonly T[]>();
  const listeners = new Set<() => void>();

  let openings = 0;

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

  const inOrder = (chosen: readonly T[]): readonly T[] => {
    const picked = new Set(chosen);

    return values.filter((value) => picked.has(value));
  };

  const get = (key: string): readonly T[] => choices.get(key) ?? none;

  const set = (key: string, chosen: readonly T[]): void => {
    choices.set(key, inOrder(chosen));
    emit();
  };

  const forget = (key: string): void => {
    choices.delete(key);
    emit();
  };

  const useOpening = (key: string, initial: readonly T[]): void => {
    if (!choices.has(key)) {
      // Before the first render reads it, so the first search is the seeded one.
      choices.set(key, inOrder(initial));
    }

    const seedOpening = useEffectEvent((openingKey: string) => {
      if (!choices.has(openingKey)) {
        set(openingKey, initial);
      }
    });

    useEffect(() => {
      seedOpening(key);

      return () => forget(key);
    }, [key]);
  };

  return {
    forget,
    get,
    inOrder,
    newKey: () => {
      openings += 1;

      return `picker-${openings}`;
    },
    resetAll: () => {
      choices.clear();
      emit();
    },
    set,
    use: (key: string) =>
      useSyncExternalStore(
        subscribe,
        () => get(key),
        () => get(key)
      ),
    useOpening,
    values,
  };
};
