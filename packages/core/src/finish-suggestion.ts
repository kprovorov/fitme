import type { WorkoutSessionExerciseSet } from "./models";
import {
  isWorkoutFullyTracked,
  type TrackableWorkoutSession,
} from "./workout-sessions";

type PersistedSet = Pick<WorkoutSessionExerciseSet, "id" | "reps_completed">;

/** A workout session whose sets can be matched against a just-saved set. */
export interface ReconcilableWorkoutSession extends TrackableWorkoutSession {
  exercises: Array<{ sets: PersistedSet[] }>;
}

/** Reported after a set mutation has been persisted successfully. */
export interface SetTrackedEvent {
  /**
   * `reps_completed` of the set before the save. `null`/`undefined` means the
   * set was untracked (including a set that did not exist yet); any number,
   * zero included, means the save was an edit of a tracked set.
   */
  previousRepsCompleted: number | null | undefined;
  sessionId: string;
  /** The set as returned by the successful mutation. */
  set: PersistedSet;
}

export interface FinishSuggestionControllerOptions {
  /**
   * Reads the session from the server. Must bypass any cache: the result
   * decides whether the save completed the workout.
   */
  loadSession: (sessionId: string) => Promise<ReconcilableWorkoutSession>;
  /**
   * Called when `loadSession` fails; that save then does not trigger, unless
   * another save arrived during the failed read.
   */
  onError?: (error: unknown) => void;
  /**
   * Remembers the sessions already suggested. Defaults to memory; pass a
   * persistent store to keep the once-per-session rule across app restarts.
   */
  suggestedSessionStore?: SuggestedSessionStore;
}

export interface SuggestedSessionStore {
  add: (sessionId: string) => void;
  has: (sessionId: string) => boolean;
}

/**
 * Decides when to suggest finishing a workout session (FIT-55).
 *
 * Integration:
 * - Call `reportSetTracked` from the `onSuccess` of a set create/update
 *   mutation, never on failure. Edits of tracked sets are ignored, and
 *   deletions, additions, loads and finishes are simply not reported.
 * - Every screen that can show the suggestion calls `watch(sessionId)` while
 *   mounted and the returned function on unmount. A session is only suggested
 *   while watched, and a suggestion is cleared once its last watcher leaves,
 *   so it never shows up later on a reopened screen.
 * - Read `getSuggestedSessionIds()` (subscribe with `subscribe`, e.g. through
 *   `useSyncExternalStore`) and show the suggestion while it contains the
 *   current session id.
 * - Call `dismiss(sessionId)` when the suggestion is closed, whichever action
 *   the user took.
 *
 * A session is suggested at most once: after it has been suggested, later
 * saves in that session (including sets of exercises added afterwards) never
 * suggest again. Other sessions are unaffected.
 */
export interface FinishSuggestionController {
  dismiss: (sessionId: string) => void;
  /** Sessions to suggest finishing now; a new set on every change. */
  getSuggestedSessionIds: () => ReadonlySet<string>;
  reportSetTracked: (event: SetTrackedEvent) => Promise<void>;
  subscribe: (listener: () => void) => () => void;
  watch: (sessionId: string) => () => void;
}

interface PendingCheck {
  dirty: boolean;
  /** Watch generation of the session when the latest save was reported. */
  generation: number;
  promise: Promise<void>;
  sets: Map<string, PersistedSet>;
}

const hasReps = (reps: number | null | undefined): reps is number =>
  reps !== null && reps !== undefined;

/**
 * Overlays the saved sets on the loaded session, so a read that raced the
 * write cannot hide the save. Only replaces sets the session already has:
 * a missing set may have been deleted since.
 */
const reconcile = (
  session: ReconcilableWorkoutSession,
  savedSets: Map<string, PersistedSet>
): ReconcilableWorkoutSession => ({
  ...session,
  exercises: session.exercises.map((exercise) => ({
    ...exercise,
    sets: exercise.sets.map((set) => {
      const saved = savedSets.get(set.id);
      return saved && hasReps(saved.reps_completed)
        ? { ...set, ...saved }
        : set;
    }),
  })),
});

export function createFinishSuggestionController({
  loadSession,
  onError,
  suggestedSessionStore,
}: FinishSuggestionControllerOptions): FinishSuggestionController {
  const listeners = new Set<() => void>();
  const suggestedSessions = suggestedSessionStore ?? new Set<string>();
  const pendingChecks = new Map<string, PendingCheck>();
  const watchers = new Map<string, number>();
  // Bumped each time a session goes from unwatched to watched, so a save made
  // before its screens were closed never suggests on a reopened one.
  const watchGenerations = new Map<string, number>();
  let suggestedSessionIds: ReadonlySet<string> = new Set();

  const generationOf = (sessionId: string) =>
    watchGenerations.get(sessionId) ?? 0;

  const setSuggested = (sessionId: string, suggested: boolean) => {
    if (suggestedSessionIds.has(sessionId) === suggested) {
      return;
    }
    const next = new Set(suggestedSessionIds);
    if (suggested) {
      next.add(sessionId);
    } else {
      next.delete(sessionId);
    }
    suggestedSessionIds = next;
    for (const listener of listeners) {
      listener();
    }
  };

  // Saves arriving while a check runs are coalesced into one follow-up check,
  // so quick repeated saves never overlap reads and suggest at most once.
  const check = async (
    sessionId: string,
    pending: PendingCheck
  ): Promise<void> => {
    // Stop synchronously, so a save reported from now on starts a new check
    // instead of joining one that is about to end.
    if (!pending.dirty || suggestedSessions.has(sessionId)) {
      pendingChecks.delete(sessionId);
      return;
    }
    pending.dirty = false;
    try {
      const session = reconcile(await loadSession(sessionId), pending.sets);
      if (
        isWorkoutFullyTracked(session) &&
        watchers.has(sessionId) &&
        generationOf(sessionId) === pending.generation &&
        !suggestedSessions.has(sessionId)
      ) {
        suggestedSessions.add(sessionId);
        setSuggested(sessionId, true);
      }
    } catch (error) {
      // A save that arrived during the failed read still gets its own check.
      onError?.(error);
    }
    return check(sessionId, pending);
  };

  const reportSetTracked = ({
    previousRepsCompleted,
    sessionId,
    set,
  }: SetTrackedEvent): Promise<void> => {
    const isNewlyTracked =
      !hasReps(previousRepsCompleted) && hasReps(set.reps_completed);
    if (!isNewlyTracked || suggestedSessions.has(sessionId)) {
      return Promise.resolve();
    }

    const existing = pendingChecks.get(sessionId);
    if (existing) {
      existing.sets.set(set.id, set);
      existing.dirty = true;
      existing.generation = generationOf(sessionId);
      return existing.promise;
    }

    const pending: PendingCheck = {
      dirty: true,
      generation: generationOf(sessionId),
      promise: Promise.resolve(),
      sets: new Map([[set.id, set]]),
    };
    pendingChecks.set(sessionId, pending);
    pending.promise = check(sessionId, pending);
    return pending.promise;
  };

  const dismiss = (sessionId: string) => setSuggested(sessionId, false);

  const watch = (sessionId: string) => {
    const count = watchers.get(sessionId) ?? 0;
    if (count === 0) {
      watchGenerations.set(sessionId, generationOf(sessionId) + 1);
    }
    watchers.set(sessionId, count + 1);
    let watching = true;
    return () => {
      if (!watching) {
        return;
      }
      watching = false;
      const remaining = (watchers.get(sessionId) ?? 1) - 1;
      if (remaining > 0) {
        watchers.set(sessionId, remaining);
        return;
      }
      watchers.delete(sessionId);
      dismiss(sessionId);
    };
  };

  return {
    dismiss,
    getSuggestedSessionIds: () => suggestedSessionIds,
    reportSetTracked,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    watch,
  };
}
