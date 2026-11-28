import { describe, expect, expectTypeOf, it } from "vitest";

import {
  arnoldCardIds,
  arnoldCards,
  arnoldToolNames,
  isArnoldCardId,
  isArnoldToolName,
} from "../arnold";
import type {
  ArnoldCardId,
  ArnoldClientContext,
  ArnoldToolName,
} from "../arnold";

describe("Arnold's cards", () => {
  it("lists the nine cards in order, each with its tool", () => {
    expect(arnoldCards).toStrictEqual([
      { id: "exercises", tool: "show_exercises" },
      { id: "workout", tool: "show_workout" },
      { id: "plan", tool: "show_plan" },
      { id: "workout_session", tool: "show_workout_session" },
      { id: "profile", tool: "show_profile" },
      { id: "exercise_history", tool: "show_exercise_history" },
      { id: "weekly_goal", tool: "show_weekly_goal" },
      { id: "lifetime_totals", tool: "show_lifetime_totals" },
      { id: "plan_proposal", tool: "propose_plan" },
    ]);
    expect(arnoldCardIds).toStrictEqual(arnoldCards.map((card) => card.id));
  });

  it("has unique card ids and unique tools", () => {
    expect(new Set(arnoldCardIds).size).toBe(arnoldCardIds.length);
    expect(new Set(arnoldCards.map((card) => card.tool)).size).toBe(
      arnoldCards.length
    );
  });

  it("names every card's tool in the tool list", () => {
    for (const card of arnoldCards) {
      expect(arnoldToolNames).toContain(card.tool);
    }
  });

  it("tells a card id from anything else", () => {
    expect(isArnoldCardId("plan_proposal")).toBeTruthy();
    expect(isArnoldCardId("plan_card")).toBeFalsy();
    expect(isArnoldCardId(3)).toBeFalsy();
  });
});

describe("Arnold's tool names", () => {
  it("lists every tool once: today's 20, the nine card tools and four reads", () => {
    expect(arnoldToolNames).toHaveLength(33);
    expect(new Set(arnoldToolNames).size).toBe(arnoldToolNames.length);

    for (const read of [
      "get_plan",
      "get_exercise_history",
      "get_weekly_goal",
      "get_lifetime_totals",
    ]) {
      expect(arnoldToolNames).toContain(read);
    }
  });

  it("tells a tool name from anything else", () => {
    expect(isArnoldToolName("display_workout_plan")).toBeTruthy();
    expect(isArnoldToolName("log_set")).toBeFalsy();
    expect(isArnoldToolName(null)).toBeFalsy();
  });
});

describe("Arnold's client context", () => {
  it("types the names and the context's fields", () => {
    expectTypeOf<"plan">().toExtend<ArnoldCardId>();
    expectTypeOf<"propose_plan">().toExtend<ArnoldToolName>();

    // @ts-expect-error -- not a card id
    const card: ArnoldCardId = "plan_card";
    // @ts-expect-error -- not one of Arnold's tools
    const tool: ArnoldToolName = "log_set";
    expect([card, tool]).toHaveLength(2);

    const oldBuild: ArnoldClientContext = { language: "en" };

    const newBuild: ArnoldClientContext = {
      cards: ["exercises", "plan_proposal"],
      language: "uk",
      model: "openai/gpt-6.1-terra",
      timeZone: "Europe/Kyiv",
    };

    // @ts-expect-error -- cards outside the list
    const wrongCard: ArnoldClientContext = { cards: ["chart"], language: "en" };
    expect([oldBuild, newBuild, wrongCard]).toHaveLength(3);
  });
});
