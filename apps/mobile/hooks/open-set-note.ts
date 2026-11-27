import { useCallback, useEffect, useId, useSyncExternalStore } from "react";

import { useAskToDiscardNote } from "~/hooks/note-editing";

/**
 * The row whose set note is being written, in memory only: one at a time
 * across the Workout Session's screens, so leaving asks about one draft only
 * and opening another closes the first. Kept by the row, not the set: the
 * Workout Session screen's card stays mounted under the Exercise screen with
 * its own row for the same set, which never opens with it.
 */
let openRow: string | null = null;

/** Whether the open row's editor holds text not saved yet. */
let openRowChanged = false;
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
  openRowChanged = false;

  for (const listener of listeners) {
    listener();
  }
};

/** Closes whichever set note is open: a test's reset. */
export const closeOpenSetNote = () => setOpenRow(null);

/**
 * Whether this row's set note editor is open, and what opens or closes it.
 * A row that goes away (its Screen closed, the set gone) closes its own.
 * Opening it while another row's editor holds unsaved text asks "Discard
 * your note?" first; its editor says so through `setChanged`.
 */
export const useOpenSetNote = () => {
  const row = useId();

  const shown = useSyncExternalStore(
    subscribe,
    () => openRow,
    () => openRow
  );

  const askToDiscard = useAskToDiscardNote();

  const open = useCallback(() => {
    if (openRow !== null && openRow !== row && openRowChanged) {
      askToDiscard(() => setOpenRow(row));
    } else {
      setOpenRow(row);
    }
  }, [askToDiscard, row]);

  const setChanged = useCallback(
    (changed: boolean) => {
      if (openRow === row) {
        openRowChanged = changed;
      }
    },
    [row]
  );

  const close = useCallback(() => {
    if (openRow === row) {
      setOpenRow(null);
    }
  }, [row]);

  useEffect(() => close, [close]);

  return { close, isOpen: shown === row, open, setChanged };
};
