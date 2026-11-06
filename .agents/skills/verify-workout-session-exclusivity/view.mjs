export const title = "A User has at most one open Workout Session";

/** @param {{ rows: Record<string, string> }} v Model state. */
export const state = (v) => {
  /** @type {Record<string, string>} */
  const names = {
    0: "existing orphan",
    1: "first writer",
    2: "second writer",
    3: "third writer",
  };

  /** @param {string} status Row status to describe. */
  const describe = (status) => {
    const matches = [];

    for (const s of Object.keys(v.rows)) {
      if (v.rows[s] === status) {
        matches.push(names[s]);
      }
    }

    return matches.join(", ") || "none";
  };

  return `Open: ${describe("open")}; uncommitted: ${describe("pending")}`;
};

/** @param {string} action Model action label. */
export const step = (action) => {
  /** @type {Record<string, string>} */
  const labels = {
    ReadOpen: "a caller checks for an open Workout Session",
    Insert: "a writer inserts an uncommitted Workout Session",
    Conflict: "the index refuses a conflicting insert",
    Commit: "an insertion commits",
    Rollback: "an insertion rolls back",
    Finish: "a finish commits",
    Delete: "a deletion commits",
    RemoveWorkout: "a Workout is deleted, leaving its Workout Session",
    Done: "all writers have returned",
  };

  return labels[action.replace(/\(.*/u, "")] ?? action;
};
