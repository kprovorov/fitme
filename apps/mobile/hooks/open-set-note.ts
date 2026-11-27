import { useCallback, useEffect, useId, useSyncExternalStore } from "react";

/**
 * The row whose set note is being written, in memory only: one at a time
 * across the Workout Session's screens, so leaving asks about one draft only
 * and opening another closes the first. Kept by the row, not the set: the
 * Workout Session screen's card stays mounted under the Exercise screen with
 * its own row for the same set, which never opens with it.
 */
let openRow: string | null = null;
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
};

const setOpenRow = (row: string | null) => {
  if (openRow === row) {
    return;
  }

  openRow = row;

  for (const listener of listeners) {
    listener();
  }
};

/** Closes whichever set note is open: a test's reset. */
export const closeOpenSetNote = () => setOpenRow(null);

/**
 * Whether this row's set note editor is open, and what opens or closes it.
 * A row that goes away (its Screen closed, the set gone) closes its own.
 */
export const useOpenSetNote = () => {
  const row = useId();

  const shown = useSyncExternalStore(
    subscribe,
    () => openRow,
    () => openRow
  );

  const open = useCallback(() => setOpenRow(row), [row]);

  const close = useCallback(() => {
    if (openRow === row) {
      setOpenRow(null);
    }
  }, [row]);

  useEffect(() => close, [close]);

  return { close, isOpen: shown === row, open };
};
