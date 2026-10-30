import { describe, expect, it } from "vitest";
import { type CoverOption, type CoverWorkout, pickCovers } from "../covers";
import type { MuscleGroup } from "../models";

/** A Workout whose Exercises train these muscle groups, in Exercise order. */
const workout = (...exercises: MuscleGroup[][]): CoverWorkout => ({
  exercises: exercises.map((muscleGroups) => ({ muscleGroups })),
});

const cover = (id: string, ...muscleGroups: MuscleGroup[]): CoverOption => ({
  id,
  muscleGroups,
});

/** Always picks the first candidate. */
const first = () => 0;
/** Always picks the last candidate. */
const last = () => 0.999_999;

describe("pickCovers", () => {
  it("answers none for every Workout when the Library has no Covers", () => {
    expect(
      pickCovers({
        covers: [],
        random: first,
        workouts: [workout(["chest"]), workout()],
      })
    ).toEqual([null, null]);
  });

  it("picks a Cover tagged with the muscle group most Exercises train", () => {
    const covers = [cover("chest-1", "chest"), cover("legs-1", "quadriceps")];
    const legDay = workout(
      ["chest"],
      ["quadriceps"],
      ["quadriceps", "chest"],
      ["quadriceps"]
    );

    expect(pickCovers({ covers, random: first, workouts: [legDay] })).toEqual([
      "legs-1",
    ]);
  });

  it("counts a muscle group once per Exercise", () => {
    const covers = [cover("chest-1", "chest"), cover("back-1", "back")];
    const day = workout(["chest", "chest"], ["back"], ["back"]);

    expect(pickCovers({ covers, random: first, workouts: [day] })).toEqual([
      "back-1",
    ]);
  });

  it("breaks a tie for the muscle group met first", () => {
    const covers = [cover("back-1", "back"), cover("chest-1", "chest")];
    const day = workout(["chest"], ["back"], ["back", "chest"]);

    expect(pickCovers({ covers, random: last, workouts: [day] })).toEqual([
      "chest-1",
    ]);
  });

  it("picks at random among the best candidates", () => {
    const covers = [
      cover("chest-1", "chest"),
      cover("back-1", "back"),
      cover("chest-2", "chest"),
      cover("chest-3", "chest"),
    ];
    const pick = (random: () => number) =>
      pickCovers({ covers, random, workouts: [workout(["chest"])] });

    expect(pick(first)).toEqual(["chest-1"]);
    expect(pick(() => 0.5)).toEqual(["chest-2"]);
    expect(pick(last)).toEqual(["chest-3"]);
  });

  it("falls back to the next muscle group when no Cover suits the top one", () => {
    const covers = [cover("back-1", "back"), cover("calves-1", "calves")];
    const day = workout(["glutes"], ["glutes"], ["calves"]);

    expect(pickCovers({ covers, random: last, workouts: [day] })).toEqual([
      "calves-1",
    ]);
  });

  it("falls back to any Cover when none suits the Workout's muscle groups", () => {
    const covers = [cover("back-1", "back"), cover("chest-1", "chest")];
    const pick = (random: () => number) =>
      pickCovers({ covers, random, workouts: [workout(["glutes"])] });

    expect(pick(first)).toEqual(["back-1"]);
    expect(pick(last)).toEqual(["chest-1"]);
  });

  it("gives a Workout with no Exercises any Cover", () => {
    const covers = [cover("back-1", "back"), cover("chest-1", "chest")];

    expect(pickCovers({ covers, random: last, workouts: [workout()] })).toEqual(
      ["chest-1"]
    );
  });

  it("keeps the Workouts of one call on different Covers", () => {
    const covers = [
      cover("chest-1", "chest"),
      cover("chest-2", "chest"),
      cover("back-1", "back"),
    ];
    const pushDay = workout(["chest"], ["chest"]);

    expect(
      pickCovers({
        covers,
        random: first,
        workouts: [pushDay, pushDay, pushDay],
      })
    ).toEqual(["chest-1", "chest-2", "back-1"]);
  });

  it("prefers a free Cover for the next muscle group over a used one for the top", () => {
    const covers = [cover("chest-1", "chest"), cover("triceps-1", "triceps")];
    const pushDay = workout(
      ["chest"],
      ["chest", "triceps"],
      ["triceps"],
      ["chest"]
    );

    expect(
      pickCovers({ covers, random: first, workouts: [pushDay, pushDay] })
    ).toEqual(["chest-1", "triceps-1"]);
  });

  it("avoids Covers the Plan's other Workouts already use", () => {
    const covers = [
      cover("chest-1", "chest"),
      cover("chest-2", "chest"),
      cover("chest-3", "chest"),
    ];

    expect(
      pickCovers({
        covers,
        random: first,
        usedCoverIds: ["chest-1", "chest-3"],
        workouts: [workout(["chest"])],
      })
    ).toEqual(["chest-2"]);
  });

  it("reuses the least-used Cover once every Cover is used", () => {
    const covers = [
      cover("chest-1", "chest"),
      cover("chest-2", "chest"),
      cover("back-1", "back"),
    ];

    expect(
      pickCovers({
        covers,
        random: first,
        usedCoverIds: ["chest-1", "chest-1", "chest-2", "back-1", "back-1"],
        workouts: [workout(["chest"]), workout(["chest"]), workout(["back"])],
      })
    ).toEqual(["chest-2", "chest-1", "back-1"]);
  });

  it("ignores used Cover ids the Library doesn't have", () => {
    const covers = [cover("chest-1", "chest")];

    expect(
      pickCovers({
        covers,
        random: first,
        usedCoverIds: ["gone"],
        workouts: [workout(["chest"]), workout(["chest"])],
      })
    ).toEqual(["chest-1", "chest-1"]);
  });

  it("keeps a random source outside [0, 1) on a candidate", () => {
    const covers = [cover("chest-1", "chest"), cover("chest-2", "chest")];
    const pick = (random: () => number) =>
      pickCovers({ covers, random, workouts: [workout(["chest"])] });

    expect(pick(() => 1)).toEqual(["chest-2"]);
    expect(pick(() => -1)).toEqual(["chest-1"]);
    expect(pick(() => Number.NaN)).toEqual(["chest-1"]);
  });

  it("counts a Cover listed twice as one", () => {
    const covers = [
      cover("chest-1", "chest"),
      cover("chest-1", "chest"),
      cover("chest-2", "chest"),
    ];

    expect(
      pickCovers({ covers, random: () => 0.6, workouts: [workout(["chest"])] })
    ).toEqual(["chest-2"]);
  });
});
