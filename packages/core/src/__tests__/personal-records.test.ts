import { describe, expect, it } from "vitest";
import { personalRecordFor, recordResult } from "../personal-records";

const set = (weight: number | null, reps: number | null) => ({
  reps_completed: reps,
  weight_completed: weight,
});

describe("personalRecordFor", () => {
  it("earns none for the first Workout Session with usable results: it's the baseline", () => {
    expect(personalRecordFor(null, [set(100, 5), set(110, 3)])).toBeNull();
  });

  it("earns a weight record for a higher weight than any earlier one", () => {
    expect(
      personalRecordFor({ reps: 5, weight: 100 }, [set(100, 5), set(102.5, 1)])
    ).toEqual({ kind: "weight", reps: 1, weight: 102.5 });
  });

  it("earns a reps record for more reps at the earlier highest weight", () => {
    expect(
      personalRecordFor({ reps: 5, weight: 100 }, [set(100, 6), set(90, 12)])
    ).toEqual({ kind: "reps", reps: 6, weight: 100 });
  });

  it("names the session's best set when several beat the record", () => {
    expect(
      personalRecordFor({ reps: 5, weight: 100 }, [
        set(105, 3),
        set(105, 4),
        set(100, 8),
      ])
    ).toEqual({ kind: "weight", reps: 4, weight: 105 });
  });

  it("earns none for more reps at a lower weight", () => {
    expect(
      personalRecordFor({ reps: 5, weight: 100 }, [set(80, 20)])
    ).toBeNull();
  });

  it("earns none for an exact tie", () => {
    expect(personalRecordFor({ reps: 5, weight: 100 }, [set(100, 5)])).toBe(
      null
    );
  });

  it("earns rep records at an explicit zero weight while the highest weight is zero", () => {
    expect(personalRecordFor({ reps: 10, weight: 0 }, [set(0, 12)])).toEqual({
      kind: "reps",
      reps: 12,
      weight: 0,
    });
  });

  it("earns a weight record for the first weight over a bodyweight record", () => {
    expect(personalRecordFor({ reps: 30, weight: 0 }, [set(5, 1)])).toEqual({
      kind: "weight",
      reps: 1,
      weight: 5,
    });
  });

  it("never lets bodyweight reps beat a weighted record", () => {
    expect(personalRecordFor({ reps: 5, weight: 10 }, [set(0, 50)])).toBeNull();
  });

  it("ignores sets without a weight or without positive reps", () => {
    expect(
      personalRecordFor({ reps: 5, weight: 100 }, [
        set(null, 50),
        set(200, 0),
        set(200, null),
      ])
    ).toBeNull();
  });
});

describe("recordResult", () => {
  it("is the highest usable weight with the most reps at it", () => {
    expect(
      recordResult([set(100, 5), set(100, 7), set(90, 20), set(null, 30)])
    ).toEqual({ reps: 7, weight: 100 });
  });

  it("is null without a usable set", () => {
    expect(recordResult([set(null, 10), set(50, 0)])).toBeNull();
  });
});
