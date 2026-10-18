import { describe, expect, it } from "vitest";
import { formatElapsed } from "../formatters";
import {
  bestSet,
  countLoggedSets,
  exerciseProgress,
  formatRepRange,
  formatSetResult,
  previousSetsByOrder,
  sessionVolume,
} from "../workout-sessions";

const set = (
  order: number,
  reps_completed: number | null,
  weight_completed: number | null = null
) => ({ order, reps_completed, weight_completed });

describe("exerciseProgress", () => {
  it("is done when every set is logged", () => {
    expect(exerciseProgress([set(1, 10), set(2, 0)])).toEqual({
      logged: 2,
      state: "done",
      total: 2,
    });
  });

  it("is in progress when some sets are logged", () => {
    expect(exerciseProgress([set(1, 10), set(2, null)]).state).toBe(
      "in-progress"
    );
  });

  it("is todo when nothing is logged, or there are no sets", () => {
    expect(exerciseProgress([set(1, null)]).state).toBe("todo");
    expect(exerciseProgress([]).state).toBe("todo");
  });
});

describe("countLoggedSets", () => {
  it("counts logged sets across exercises, zero reps included", () => {
    expect(
      countLoggedSets({
        exercises: [{ sets: [set(1, 0), set(2, null)] }, { sets: [set(1, 8)] }],
      })
    ).toBe(2);
  });
});

describe("sessionVolume", () => {
  it("sums weight × reps of logged sets", () => {
    expect(
      sessionVolume([
        { sets: [set(1, 10, 60), set(2, 8, 62.5)] },
        { sets: [set(1, 12, 17.5), set(2, null, 20)] },
      ])
    ).toBe(1310);
  });

  it("counts sets without a weight as zero", () => {
    expect(sessionVolume([{ sets: [set(1, 15, null)] }])).toBe(0);
  });
});

describe("previousSetsByOrder", () => {
  it("takes the newest other entry with logged sets", () => {
    const previous = previousSetsByOrder(
      [
        { id: "current", sets: [set(1, 10, 60)] },
        { id: "empty", sets: [set(1, null, 60)] },
        { id: "last", sets: [set(1, 9, 57.5), set(2, 0, null)] },
        { id: "older", sets: [set(1, 5, 50)] },
      ],
      "current"
    );
    expect([...previous.entries()]).toEqual([
      [1, { reps: 9, weight: 57.5 }],
      [2, { reps: 0, weight: null }],
    ]);
  });

  it("is empty without history", () => {
    expect(previousSetsByOrder([], "current").size).toBe(0);
  });
});

describe("bestSet", () => {
  it("picks the heaviest set, then the most reps", () => {
    expect(
      bestSet([set(1, 12, 17.5), set(2, 15, 17.5), set(3, 20, 15)])
    ).toEqual({ reps: 15, weight: 17.5 });
  });

  it("picks the most reps when no set has a weight", () => {
    expect(bestSet([set(1, 12), set(2, 15)])).toEqual({
      reps: 15,
      weight: null,
    });
  });

  it("is null when nothing is logged", () => {
    expect(bestSet([set(1, null, 20)])).toBeNull();
  });
});

describe("formatSetResult", () => {
  it("shows weight × reps, or reps alone without a weight", () => {
    expect(formatSetResult({ reps: 12, weight: 17.5 })).toBe("17.5 × 12");
    expect(formatSetResult({ reps: 12, weight: null })).toBe("12 reps");
    expect(formatSetResult({ reps: 12, weight: 0 })).toBe("12 reps");
  });
});

describe("formatRepRange", () => {
  it("formats a range, a single value, or nothing", () => {
    expect(
      formatRepRange([
        { reps_recommended: 12 },
        { reps_recommended: 15 },
        { reps_recommended: null },
      ])
    ).toBe("12–15");
    expect(formatRepRange([{ reps_recommended: 10 }])).toBe("10");
    expect(formatRepRange([{ reps_recommended: null }])).toBeNull();
  });
});

describe("formatElapsed", () => {
  it("formats minutes and seconds, adding hours past an hour", () => {
    expect(formatElapsed(42 * 60_000 + 17_000)).toBe("42:17");
    expect(formatElapsed(65_000)).toBe("1:05");
    expect(formatElapsed(3_852_000)).toBe("1:04:12");
  });

  it("reads negative durations as zero", () => {
    expect(formatElapsed(-5000)).toBe("0:00");
  });
});
