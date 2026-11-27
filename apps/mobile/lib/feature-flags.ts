/**
 * The app's feature flags, each off by default. A build turns one on through
 * its `EXPO_PUBLIC_` variable (a local toggle, never in Infisical); a test
 * switches it with its setter, and `after-each.ts` puts every flag back.
 */

const notesFromEnv = () => process.env.EXPO_PUBLIC_NOTES === "true";

let notes = notesFromEnv();

/**
 * Notes (project "Notes on Exercises and sets"): the User's notes on an
 * Exercise and on a logged set. Off, the app asks for no notes and shows none.
 * Removed by the project's "Turn on notes" ticket.
 */
export const isNotesEnabled = (): boolean => notes;

/** Switches notes on or off, for a test. */
export const setNotesEnabled = (enabled: boolean): void => {
  notes = enabled;
};

/** Puts every flag back to the build's own value. */
export const resetFeatureFlags = (): void => {
  notes = notesFromEnv();
};
