import { arnoldCardIds } from "@fitme/core/arnold";
import type { ModelMessage } from "ai";
import { defineTool } from "eve/tools";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { canDrawCard, toolForCard } from "../agent/lib/tool-offer";

type EveUserMessage = ModelMessage & { kind: "context.instruction" | "user" };

interface ClientContextFixture {
  cards?: string[];
  language?: string;
}

const clientContext = (value: ClientContextFixture): EveUserMessage => ({
  content: `Client context:\n${JSON.stringify(value)}`,
  kind: "context.instruction",
  role: "user",
});

const tool = defineTool({
  description: "A tool offered for the Workout card",
  execute: () => ({ ok: true }),
  inputSchema: z.object({}),
});

describe("which cards a build can draw", () => {
  it.each(arnoldCardIds)(
    "an old build, which sent no list, can't draw %s",
    (card) => {
      expect(
        canDrawCard([clientContext({ language: "en" })], card)
      ).toBeFalsy();
      expect(canDrawCard([], card)).toBeFalsy();
    }
  );

  it.each(arnoldCardIds)("an empty list can't draw %s", (card) => {
    expect(canDrawCard([clientContext({ cards: [] })], card)).toBeFalsy();
  });

  it("a build with a list can draw exactly the cards in it", () => {
    const messages = [clientContext({ cards: ["workout", "profile"] })];

    for (const card of arnoldCardIds) {
      expect(canDrawCard(messages, card)).toBe(
        card === "workout" || card === "profile"
      );
    }
  });

  it("offers a card's tool only to a build that can draw the card", () => {
    expect(
      toolForCard([clientContext({ cards: ["workout"] })], "workout", tool)
    ).toBe(tool);
    expect(
      toolForCard([clientContext({ cards: ["plan"] })], "workout", tool)
    ).toBeNull();
    expect(
      toolForCard([clientContext({ language: "en" })], "workout", tool)
    ).toBeNull();
  });
});
