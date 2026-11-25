import type * as Db from "@fitme/db";
import type * as SessionServices from "@fitme/services/workout-sessions";
import type { RemoveSetFromWorkoutSessionResult } from "@fitme/services/workout-sessions";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { contextFor, inputSchemaOf, userIdFields } from "./tool-context";

const tx = { fake: "transaction" };

const db = vi.hoisted(() => ({
  asUser:
    vi.fn<
      (
        userId: string,
        edit: (
          transaction: typeof tx
        ) => Promise<RemoveSetFromWorkoutSessionResult>
      ) => Promise<RemoveSetFromWorkoutSessionResult>
    >(),
}));

const sessions = vi.hoisted(() => ({
  removeSetFromWorkoutSession:
    vi.fn<
      (
        transaction: typeof tx,
        userId: string,
        setId: string
      ) => Promise<RemoveSetFromWorkoutSessionResult>
    >(),
}));

vi.mock<typeof Db | typeof db>(import("@fitme/db"), () => db);

vi.mock<typeof SessionServices | typeof sessions>(
  import("@fitme/services/workout-sessions"),
  () => sessions
);

const { default: removeSetFromWorkoutSession } =
  await import("../agent/tools/remove_set_from_workout_session");

const setId = "d0000000-0000-4000-8000-000000000001";
const input = { set_id: setId };
const alice = contextFor("user_alice");

describe("remove_set_from_workout_session", () => {
  beforeEach(() => {
    db.asUser.mockImplementation(async (_userId, fn) => await fn(tx));
    sessions.removeSetFromWorkoutSession.mockResolvedValue({
      status: "removed",
    });
  });

  it("removes the set as the Conversation's owner, in one asUser transaction", async () => {
    await expect(
      removeSetFromWorkoutSession.execute(input, alice)
    ).resolves.toStrictEqual({ set_id: setId, success: true });
    expect(db.asUser).toHaveBeenCalledExactlyOnceWith(
      "user_alice",
      expect.any(Function)
    );
    expect(
      sessions.removeSetFromWorkoutSession
    ).toHaveBeenCalledExactlyOnceWith(tx, "user_alice", setId);
  });

  it("acts as the owner, never the turn's caller", async () => {
    await removeSetFromWorkoutSession.execute(
      input,
      contextFor("user_alice", "user_mallory")
    );

    expect(db.asUser).toHaveBeenCalledWith("user_alice", expect.any(Function));
    expect(sessions.removeSetFromWorkoutSession).toHaveBeenCalledWith(
      tx,
      "user_alice",
      setId
    );
  });

  it("refuses to run without a Clerk User owning the Conversation", async () => {
    await expect(
      removeSetFromWorkoutSession.execute(input, contextFor(null))
    ).rejects.toThrow("This Conversation has no signed-in owner");
    expect(db.asUser).not.toHaveBeenCalled();
  });

  it("takes a set's uuid and nothing else", () => {
    const schema = inputSchemaOf(removeSetFromWorkoutSession);

    expect(schema.parse({ ...input, ...userIdFields })).toStrictEqual(input);
    expect(schema.safeParse({ set_id: "latest" }).success).toBeFalsy();
  });

  it("tells the model when the Workout Session is finished", async () => {
    sessions.removeSetFromWorkoutSession.mockResolvedValue({
      finishedAt: "2026-10-14T19:00:00+00:00",
      sessionId: "session_finished",
      status: "session_finished",
    });

    await expect(
      removeSetFromWorkoutSession.execute(input, alice)
    ).resolves.toStrictEqual({
      error: "The workout session is already finished; nothing was removed",
    });
  });

  it("tells the model the set is gone, even when a re-run removed it", async () => {
    sessions.removeSetFromWorkoutSession.mockResolvedValue({
      status: "not_found",
    });

    await expect(
      removeSetFromWorkoutSession.execute(input, alice)
    ).resolves.toStrictEqual({
      error: "Set not found: it doesn't exist or was already removed",
    });
  });
});
