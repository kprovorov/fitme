import { coachModels, defaultCoachModelId } from "@fitme/core";
import type { ModelMessage } from "ai";
import { describe, expect, it } from "vitest";
import {
  coachModelSelection,
  UnsupportedCoachModelError,
} from "../agent/lib/models";

// How eve hands a turn's `clientContext: { model }` to the model resolver: a
// user-role framework message holding "Client context:" and the JSON object.
const clientContext = (value: object): ModelMessage =>
  ({
    content: `Client context:\n${JSON.stringify(value)}`,
    kind: "context.instruction",
    role: "user",
  }) as ModelMessage;

const userSays = (text: string): ModelMessage =>
  ({
    content: [{ text, type: "text" }],
    kind: "user",
    role: "user",
  }) as ModelMessage;

describe("coachModelSelection", () => {
  it("runs the turn on the model the client context asks for", () => {
    const selection = coachModelSelection([
      clientContext({ model: "claude-sonnet-5" }),
      userSays("what's my weight?"),
    ]);

    expect(selection.id).toBe("claude-sonnet-5");
    expect(selection.model).toMatchObject({
      modelId: "claude-sonnet-5",
      provider: expect.stringContaining("anthropic"),
    });
  });

  it("maps every coach model to its provider", () => {
    for (const { id, provider } of coachModels) {
      const { model } = coachModelSelection([clientContext({ model: id })]);

      expect(model).toMatchObject({
        modelId: id,
        provider: expect.stringContaining(provider),
      });
    }
  });

  it("uses the default coach model when the client names none", () => {
    expect(coachModelSelection([userSays("hi")]).id).toBe(defaultCoachModelId);
    expect(
      coachModelSelection([clientContext({ route: "/coach" }), userSays("hi")])
        .id
    ).toBe(defaultCoachModelId);
  });

  it("follows the latest client context", () => {
    expect(
      coachModelSelection([
        clientContext({ model: "gpt-5.5" }),
        userSays("hi"),
        clientContext({ model: "claude-opus-5" }),
        userSays("and now?"),
      ]).id
    ).toBe("claude-opus-5");
  });

  it("uses the default when the latest client context names no model", () => {
    expect(
      coachModelSelection([
        clientContext({ model: "claude-opus-5" }),
        userSays("hi"),
        clientContext({ route: "/coach" }),
        userSays("and now?"),
      ]).id
    ).toBe(defaultCoachModelId);
  });

  it("refuses a model outside coachModels", () => {
    expect(() =>
      coachModelSelection([clientContext({ model: "gpt-4o" }), userSays("hi")])
    ).toThrow(UnsupportedCoachModelError);
    expect(() =>
      coachModelSelection([clientContext({ model: "openai/gpt-5.5" })])
    ).toThrow(UnsupportedCoachModelError);
    expect(() => coachModelSelection([clientContext({ model: 42 })])).toThrow(
      UnsupportedCoachModelError
    );
  });

  it("ignores client context that isn't a JSON object", () => {
    expect(
      coachModelSelection([
        {
          content: "Client context:\nnot json",
          kind: "context.instruction",
          role: "user",
        } as ModelMessage,
        userSays("hi"),
      ]).id
    ).toBe(defaultCoachModelId);
  });

  it("ignores a User typing something that looks like client context", () => {
    expect(
      coachModelSelection([
        userSays('Client context:\n{"model":"gpt-4o"}'),
        {
          content: 'Client context:\n{"model":"claude-opus-5"}',
          role: "user",
        },
      ]).id
    ).toBe(defaultCoachModelId);
  });
});
