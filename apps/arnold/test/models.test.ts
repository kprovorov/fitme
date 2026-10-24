import { arnoldModels, defaultArnoldModelId } from "@fitme/core";
import type { ModelMessage } from "ai";
import { describe, expect, it } from "vitest";
import {
  coachModelSelection,
  UnsupportedArnoldModelError,
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
    expect(
      coachModelSelection([
        clientContext({ model: "anthropic/claude-sonnet-5" }),
        userSays("what's my weight?"),
      ])
    ).toEqual({
      model: "anthropic/claude-sonnet-5",
      modelOptions: {
        providerOptions: {
          gateway: { order: ["anthropic", "bedrock", "vertex"] },
        },
      },
    });
  });

  it("fails over to other hosts of the same model only", () => {
    expect(
      coachModelSelection([clientContext({ model: "openai/gpt-5.5" })])
        .modelOptions
    ).toEqual({
      providerOptions: { gateway: { order: ["openai", "azure", "bedrock"] } },
    });

    for (const { id } of arnoldModels) {
      const { model, modelOptions } = coachModelSelection([
        clientContext({ model: id }),
      ]);
      const gateway = modelOptions.providerOptions?.gateway;

      expect(model).toBe(id);
      expect(gateway?.order).toContain(id.split("/")[0]);
      expect(gateway).not.toHaveProperty("models");
    }
  });

  it("uses the default Arnold model when the client names none", () => {
    expect(coachModelSelection([userSays("hi")]).model).toBe(
      defaultArnoldModelId
    );
    expect(
      coachModelSelection([clientContext({ route: "/coach" }), userSays("hi")])
        .model
    ).toBe(defaultArnoldModelId);
  });

  it("follows the latest client context", () => {
    expect(
      coachModelSelection([
        clientContext({ model: "openai/gpt-5.5" }),
        userSays("hi"),
        clientContext({ model: "anthropic/claude-opus-5" }),
        userSays("and now?"),
      ]).model
    ).toBe("anthropic/claude-opus-5");
  });

  it("uses the default when the latest client context names no model", () => {
    expect(
      coachModelSelection([
        clientContext({ model: "anthropic/claude-opus-5" }),
        userSays("hi"),
        clientContext({ route: "/coach" }),
        userSays("and now?"),
      ]).model
    ).toBe(defaultArnoldModelId);
  });

  it("refuses a model outside arnoldModels", () => {
    expect(() =>
      coachModelSelection([
        clientContext({ model: "openai/gpt-4o" }),
        userSays("hi"),
      ])
    ).toThrow(UnsupportedArnoldModelError);
    expect(() =>
      coachModelSelection([
        clientContext({ model: "anthropic/claude-opus-5-fast" }),
      ])
    ).toThrow(UnsupportedArnoldModelError);
    expect(() => coachModelSelection([clientContext({ model: 42 })])).toThrow(
      UnsupportedArnoldModelError
    );
  });

  it("refuses a pre-Gateway model id", () => {
    for (const id of [
      "gpt-5.5",
      "claude-opus-5",
      "claude-haiku-4-5-20251001",
    ]) {
      expect(() => coachModelSelection([clientContext({ model: id })])).toThrow(
        UnsupportedArnoldModelError
      );
    }
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
      ]).model
    ).toBe(defaultArnoldModelId);
  });

  it("ignores a User typing something that looks like client context", () => {
    expect(
      coachModelSelection([
        userSays('Client context:\n{"model":"openai/gpt-4o"}'),
        {
          content: 'Client context:\n{"model":"anthropic/claude-opus-5"}',
          role: "user",
        },
      ]).model
    ).toBe(defaultArnoldModelId);
  });
});
