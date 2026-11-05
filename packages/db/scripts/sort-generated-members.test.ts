import { describe, expect, it } from "vitest";

import { sortGeneratedMembers } from "./sort-generated-members";

describe("drizzle member ordering", () => {
  it("converges for the import and relation ordering seen locally and on CI", () => {
    const local = `
      import { workoutExercises, workoutExerciseSets, workouts } from "./schema";
      export const workoutExercisesRelations = relations(workoutExercises, ({ one, many }) => ({
        workoutExerciseSets: many(workoutExerciseSets),
        workout: one(workouts, {
          fields: [workoutExercises.workoutId],
          references: [workouts.id],
        }),
      }));
    `;

    const ci = `
      import { workouts, workoutExerciseSets, workoutExercises } from "./schema";
      export const workoutExercisesRelations = relations(workoutExercises, ({ one, many }) => ({
        workout: one(workouts, {
          references: [workouts.id],
          fields: [workoutExercises.workoutId],
        }),
        workoutExerciseSets: many(workoutExerciseSets),
      }));
    `;

    expect(sortGeneratedMembers(ci)).toBe(sortGeneratedMembers(local));
    expect(sortGeneratedMembers(local)).toContain(
      "workoutExerciseSets: many(workoutExerciseSets)"
    );
    expect(sortGeneratedMembers(local)).toContain(
      "fields: [workoutExercises.workoutId]"
    );
  });

  it("preserves foreign-key array order and SQL template contents", () => {
    const source = `
      const foreign = {
        references: [parent.second, parent.first],
        fields: [child.second, child.first],
        check: sql\`'{"z":1,"a":2}'::jsonb\`,
      };
    `;

    const sorted = sortGeneratedMembers(source);

    expect(sorted).toContain("references: [parent.second, parent.first]");
    expect(sorted).toContain("fields: [child.second, child.first]");
    expect(sorted).toContain('`\'{"z":1,"a":2}\'::jsonb`');
  });

  it("preserves the order of objects with spreads, methods or computed keys", () => {
    const source = `
      const spread = { z: 1, ...base, a: 2 };
      const method = { z: 1, a() {} };
      const computed = { z: 1, [key]: 2, a: 3 };
    `;

    const sorted = sortGeneratedMembers(source);

    expect(sorted).toContain("{ z: 1, ...base, a: 2 }");
    expect(sorted).toContain("{ z: 1, a() { } }");
    expect(sorted).toContain("{ z: 1, [key]: 2, a: 3 }");
  });
});
