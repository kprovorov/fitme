import { describe, expect, it, vi } from "vitest";
import {
  createFinishSuggestionController,
  type ReconcilableWorkoutSession,
  type SetTrackedEvent,
} from "../finish-suggestion";

const SESSION_ID = "session-1";

type Reps = number | null;

/** Builds a session from per-exercise reps; set ids are `s<exercise>-<set>`. */
const session = (
  exercises: Reps[][],
  finished_at: string | null = null
): ReconcilableWorkoutSession => ({
  exercises: exercises.map((sets, exerciseIndex) => ({
    sets: sets.map((reps_completed, setIndex) => ({
      id: `s${exerciseIndex}-${setIndex}`,
      reps_completed,
    })),
  })),
  finished_at,
});

const tracked = (
  setId: string,
  overrides: Partial<SetTrackedEvent> = {}
): SetTrackedEvent => ({
  previousRepsCompleted: null,
  sessionId: SESSION_ID,
  set: { id: setId, reps_completed: 10 },
  ...overrides,
});

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, reject, resolve };
};

const setup = (
  loadSession: (sessionId: string) => Promise<ReconcilableWorkoutSession>
) => {
  const load = vi.fn(loadSession);
  const onError = vi.fn();
  const controller = createFinishSuggestionController({
    loadSession: load,
    onError,
  });
  const listener = vi.fn();
  controller.subscribe(listener);
  // A mounted screen of each session.
  const unwatch = controller.watch(SESSION_ID);
  controller.watch("session-2");
  return { controller, listener, load, onError, unwatch };
};

describe("createFinishSuggestionController", () => {
  it("suggests when tracking the last untracked set completes the session", async () => {
    const { controller, listener } = setup(async () =>
      session([[10, 8], [12]])
    );

    await controller.reportSetTracked(tracked("s1-0"));

    expect([...controller.getSuggestedSessionIds()]).toEqual([SESSION_ID]);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("does not suggest while other sets are still untracked", async () => {
    const { controller } = setup(async () => session([[10, null], [12]]));

    await controller.reportSetTracked(tracked("s1-0"));

    expect([...controller.getSuggestedSessionIds()]).toEqual([]);
  });

  it("counts zero reps as tracked", async () => {
    const { controller } = setup(async () => session([[0], [0]]));

    await controller.reportSetTracked(
      tracked("s1-0", { set: { id: "s1-0", reps_completed: 0 } })
    );

    expect([...controller.getSuggestedSessionIds()]).toEqual([SESSION_ID]);
  });

  it("suggests when the last set is tracked out of exercise order", async () => {
    const { controller } = setup(async () => session([[10], [12], [8]]));

    // The first exercise is the last one completed.
    await controller.reportSetTracked(tracked("s0-0"));

    expect([...controller.getSuggestedSessionIds()]).toEqual([SESSION_ID]);
  });

  it("reconciles a read that raced the save with the saved set", async () => {
    // The server read still shows the just-saved set as untracked.
    const { controller } = setup(async () => session([[10], [null]]));

    await controller.reportSetTracked(tracked("s1-0"));

    expect([...controller.getSuggestedSessionIds()]).toEqual([SESSION_ID]);
  });

  it("does not resurrect a saved set that is gone from the session", async () => {
    // The saved set was deleted; another set is still untracked.
    const { controller } = setup(async () => session([[10], [null]]));

    await controller.reportSetTracked(tracked("deleted"));

    expect([...controller.getSuggestedSessionIds()]).toEqual([]);
  });

  it("ignores edits of already tracked sets", async () => {
    const { controller, load } = setup(async () => session([[10], [12]]));

    await controller.reportSetTracked(
      tracked("s1-0", { previousRepsCompleted: 8 })
    );
    await controller.reportSetTracked(
      tracked("s1-0", { previousRepsCompleted: 0 })
    );

    expect(load).not.toHaveBeenCalled();
    expect([...controller.getSuggestedSessionIds()]).toEqual([]);
  });

  it("ignores saves that leave the set untracked", async () => {
    const { controller, load } = setup(async () => session([[10]]));

    await controller.reportSetTracked(
      tracked("s0-0", { set: { id: "s0-0", reps_completed: null } })
    );

    expect(load).not.toHaveBeenCalled();
  });

  it("treats a newly created set as previously untracked", async () => {
    // An exercise added without sets gets its first set created and tracked.
    const { controller } = setup(async () => session([[10], [12]]));

    await controller.reportSetTracked(
      tracked("s1-0", { previousRepsCompleted: undefined })
    );

    expect([...controller.getSuggestedSessionIds()]).toEqual([SESSION_ID]);
  });

  it("does not suggest for a finished session", async () => {
    const { controller } = setup(async () =>
      session([[10], [12]], "2026-10-08T10:00:00Z")
    );

    await controller.reportSetTracked(tracked("s1-0"));

    expect([...controller.getSuggestedSessionIds()]).toEqual([]);
  });

  it("does not suggest when the session cannot be loaded, and recovers on the next save", async () => {
    const error = new Error("network");
    const { controller, load, onError } = setup(() => Promise.reject(error));

    await controller.reportSetTracked(tracked("s1-0"));

    expect([...controller.getSuggestedSessionIds()]).toEqual([]);
    expect(onError).toHaveBeenCalledWith(error);

    load.mockImplementation(async () => session([[10], [12]]));
    await controller.reportSetTracked(tracked("s1-0"));

    expect([...controller.getSuggestedSessionIds()]).toEqual([SESSION_ID]);
  });

  it("coalesces quick repeated saves into a single suggestion", async () => {
    const first = deferred<ReconcilableWorkoutSession>();
    const { controller, listener, load } = setup(() => first.promise);

    const saves = [
      controller.reportSetTracked(tracked("s1-0")),
      controller.reportSetTracked(tracked("s1-0")),
      controller.reportSetTracked(tracked("s1-0")),
    ];
    load.mockImplementation(async () => session([[10], [12]]));
    first.resolve(session([[10], [12]]));
    await Promise.all(saves);

    // The first load suggests; the queued re-check is skipped.
    expect(load).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledTimes(1);
    expect([...controller.getSuggestedSessionIds()]).toEqual([SESSION_ID]);
  });

  it("re-checks with fresh data when a save lands during a check", async () => {
    const first = deferred<ReconcilableWorkoutSession>();
    const { controller, load } = setup(() => first.promise);

    const firstSave = controller.reportSetTracked(tracked("s0-0"));
    const secondSave = controller.reportSetTracked(tracked("s1-0"));
    load.mockImplementation(async () => session([[10], [12]]));
    // The first read predates the second save.
    first.resolve(session([[10], [null], [null]]));
    await Promise.all([firstSave, secondSave]);

    expect(load).toHaveBeenCalledTimes(2);
    expect([...controller.getSuggestedSessionIds()]).toEqual([SESSION_ID]);
  });

  it("checks a save that lands just as the previous check ends", async () => {
    const { controller, load } = setup(async () => session([[10], [null]]));

    const firstSave = controller.reportSetTracked(tracked("s0-0"));
    load.mockImplementation(async () => session([[10], [12]]));
    // Let the first check read and decide to stop, but not settle.
    await Promise.resolve();
    await Promise.resolve();
    const secondSave = controller.reportSetTracked(tracked("s1-0"));
    await Promise.all([firstSave, secondSave]);

    expect(load).toHaveBeenCalledTimes(2);
    expect([...controller.getSuggestedSessionIds()]).toEqual([SESSION_ID]);
  });

  it("re-checks a save that arrived while a failing read was in flight", async () => {
    const first = deferred<ReconcilableWorkoutSession>();
    const { controller, load, onError } = setup(() => first.promise);

    const firstSave = controller.reportSetTracked(tracked("s0-0"));
    const secondSave = controller.reportSetTracked(tracked("s1-0"));
    load.mockImplementation(async () => session([[10], [12]]));
    first.reject(new Error("network"));
    await Promise.all([firstSave, secondSave]);

    expect(onError).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledTimes(2);
    expect([...controller.getSuggestedSessionIds()]).toEqual([SESSION_ID]);
  });

  it("keeps suppression in the given store across controllers", async () => {
    const store = new Set<string>();
    const loadSession = async () => session([[10], [12]]);
    const first = createFinishSuggestionController({
      loadSession,
      suggestedSessionStore: store,
    });
    first.watch(SESSION_ID);

    await first.reportSetTracked(tracked("s1-0"));
    expect(store.has(SESSION_ID)).toBe(true);

    // e.g. after an app restart
    const second = createFinishSuggestionController({
      loadSession,
      suggestedSessionStore: store,
    });
    second.watch(SESSION_ID);
    await second.reportSetTracked(tracked("s1-0"));

    expect([...second.getSuggestedSessionIds()]).toEqual([]);
  });

  it("suggests only once per session, even after exercises are added", async () => {
    const { controller, listener, load } = setup(async () =>
      session([[10], [12]])
    );

    await controller.reportSetTracked(tracked("s1-0"));
    controller.dismiss(SESSION_ID);

    expect([...controller.getSuggestedSessionIds()]).toEqual([]);

    // A new exercise is added and fully tracked after the dismissal.
    load.mockImplementation(async () => session([[10], [12], [8]]));
    await controller.reportSetTracked(tracked("s2-0"));

    expect([...controller.getSuggestedSessionIds()]).toEqual([]);
    expect(load).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("does not suggest again while the suggestion is shown", async () => {
    const { controller, listener } = setup(async () => session([[10], [12]]));

    await controller.reportSetTracked(tracked("s1-0"));
    await controller.reportSetTracked(tracked("s0-0"));

    expect(listener).toHaveBeenCalledTimes(1);
    expect([...controller.getSuggestedSessionIds()]).toEqual([SESSION_ID]);
  });

  it("suggests again for a different workout session", async () => {
    const { controller } = setup(async () => session([[10], [12]]));

    await controller.reportSetTracked(tracked("s1-0"));
    controller.dismiss(SESSION_ID);
    await controller.reportSetTracked(
      tracked("s1-0", { sessionId: "session-2" })
    );

    expect([...controller.getSuggestedSessionIds()]).toEqual(["session-2"]);
  });

  it("ignores dismissals of a session that is not suggested", async () => {
    const { controller, listener } = setup(async () => session([[10], [12]]));

    await controller.reportSetTracked(tracked("s1-0"));
    controller.dismiss("session-2");

    expect([...controller.getSuggestedSessionIds()]).toEqual([SESSION_ID]);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("does not suggest when the session's screens are gone before the check ends", async () => {
    const read = deferred<ReconcilableWorkoutSession>();
    const { controller, load, unwatch } = setup(() => read.promise);

    const save = controller.reportSetTracked(tracked("s1-0"));
    unwatch();
    read.resolve(session([[10], [12]]));
    await save;

    expect([...controller.getSuggestedSessionIds()]).toEqual([]);

    // Reopening the screen does not bring it back; a later save can suggest.
    controller.watch(SESSION_ID);
    expect([...controller.getSuggestedSessionIds()]).toEqual([]);
    load.mockImplementation(async () => session([[10], [12]]));
    await controller.reportSetTracked(tracked("s0-0"));
    expect([...controller.getSuggestedSessionIds()]).toEqual([SESSION_ID]);
  });

  it("clears the suggestion once the last screen of the session is gone", async () => {
    const { controller, unwatch } = setup(async () => session([[10], [12]]));
    const unwatchSecond = controller.watch(SESSION_ID);

    await controller.reportSetTracked(tracked("s1-0"));
    unwatchSecond();

    expect([...controller.getSuggestedSessionIds()]).toEqual([SESSION_ID]);

    unwatch();
    unwatch();

    expect([...controller.getSuggestedSessionIds()]).toEqual([]);

    // Suppressed for good once shown.
    controller.watch(SESSION_ID);
    await controller.reportSetTracked(tracked("s0-0"));
    expect([...controller.getSuggestedSessionIds()]).toEqual([]);
  });

  it("does not suggest on a screen reopened while a check was in flight", async () => {
    const read = deferred<ReconcilableWorkoutSession>();
    const { controller, unwatch } = setup(() => read.promise);

    const save = controller.reportSetTracked(tracked("s1-0"));
    unwatch();
    controller.watch(SESSION_ID);
    read.resolve(session([[10], [12]]));
    await save;

    expect([...controller.getSuggestedSessionIds()]).toEqual([]);
  });

  it("does not suggest from a save reported while no screen was open", async () => {
    const read = deferred<ReconcilableWorkoutSession>();
    const { controller, unwatch } = setup(() => read.promise);

    unwatch();
    const save = controller.reportSetTracked(tracked("s1-0"));
    controller.watch(SESSION_ID);
    read.resolve(session([[10], [12]]));
    await save;

    expect([...controller.getSuggestedSessionIds()]).toEqual([]);
  });

  it("keeps the suggestions of sessions completed at the same time", async () => {
    const { controller } = setup(async () => session([[10], [12]]));

    await Promise.all([
      controller.reportSetTracked(tracked("s1-0")),
      controller.reportSetTracked(tracked("s1-0", { sessionId: "session-2" })),
    ]);

    expect([...controller.getSuggestedSessionIds()].sort()).toEqual([
      SESSION_ID,
      "session-2",
    ]);

    controller.dismiss(SESSION_ID);

    expect([...controller.getSuggestedSessionIds()]).toEqual(["session-2"]);
  });

  it("stops notifying unsubscribed listeners", async () => {
    const { controller } = setup(async () => session([[10], [12]]));
    const listener = vi.fn();
    const unsubscribe = controller.subscribe(listener);

    unsubscribe();
    await controller.reportSetTracked(tracked("s1-0"));

    expect(listener).not.toHaveBeenCalled();
  });
});
