import { useCallback, useSyncExternalStore } from "react";

/**
 * The set whose note is being written, in memory only: one at a time across
 * the Workout Session's screens, so leaving asks about one draft only, and
 * opening another set's note closes the first.
 */
let openSetId: string | null = null;
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
};

const setOpenSetId = (setId: string | null) => {
  if (openSetId === setId) {
    return;
  }

  openSetId = setId;

  for (const listener of listeners) {
    listener();
  }
};

/** Closes whichever set note is open: signing out, or a test's reset. */
export const closeOpenSetNote = () => setOpenSetId(null);

/**
 * Whether this set's note editor is open, and what opens or closes it. `null`
 * for a set that takes no note, whose editor is never open.
 */
export const useOpenSetNote = (setId: string | null) => {
  const shown = useSyncExternalStore(
    subscribe,
    () => openSetId,
    () => openSetId
  );

  const open = useCallback(() => setOpenSetId(setId), [setId]);

  const close = useCallback(() => {
    if (openSetId === setId) {
      setOpenSetId(null);
    }
  }, [setId]);

  return { close, isOpen: setId !== null && shown === setId, open };
};
