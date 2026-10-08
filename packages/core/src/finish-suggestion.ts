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
  /** Called when `loadSession` fails; the save then never triggers. */
  onError?: (error: unknown) => void;
}

/**
 * Decides when to suggest finishing a workout session (FIT-55).
 *
 * Integration:
 * - Call `reportSetTracked` from the `onSuccess` of a set create/update
 *   mutation, never on failure. Edits of tracked sets are ignored, and
 *   deletions, additions, loads and finishes are simply not reported.
 * - Read `getSuggestedSessionId()` (subscribe with `subscribe`, e.g. through
 *   `useSyncExternalStore`) and show the suggestion while it equals the
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
  getSuggestedSessionId: () => string | null;
  reportSetTracked: (event: SetTrackedEvent) => Promise<void>;
  subscribe: (listener: () => void) => () => void;
}

interface PendingCheck {
  dirty: boolean;
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
}: FinishSuggestionControllerOptions): FinishSuggestionController {
  const listeners = new Set<() => void>();
  const suggestedSessions = new Set<string>();
  const pendingChecks = new Map<string, PendingCheck>();
  let suggestedSessionId: string | null = null;

  const setSuggestedSessionId = (sessionId: string | null) => {
    if (suggestedSessionId === sessionId) {
      return;
    }
    suggestedSessionId = sessionId;
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
    if (!pending.dirty || suggestedSessions.has(sessionId)) {
      return;
    }
    pending.dirty = false;
    const session = reconcile(await loadSession(sessionId), pending.sets);
    if (isWorkoutFullyTracked(session) && !suggestedSessions.has(sessionId)) {
      suggestedSessions.add(sessionId);
      setSuggestedSessionId(sessionId);
      return;
    }
    return check(sessionId, pending);
  };

  const runChecks = async (sessionId: string, pending: PendingCheck) => {
    try {
      await check(sessionId, pending);
    } catch (error) {
      onError?.(error);
    } finally {
      pendingChecks.delete(sessionId);
    }
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
      return existing.promise;
    }

    const pending: PendingCheck = {
      dirty: true,
      promise: Promise.resolve(),
      sets: new Map([[set.id, set]]),
    };
    pendingChecks.set(sessionId, pending);
    pending.promise = runChecks(sessionId, pending);
    return pending.promise;
  };

  return {
    dismiss: (sessionId) => {
      if (suggestedSessionId === sessionId) {
        setSuggestedSessionId(null);
      }
    },
    getSuggestedSessionId: () => suggestedSessionId,
    reportSetTracked,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
