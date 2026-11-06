import { arnoldModels, defaultArnoldModelId } from "@fitme/core";
import type { ModelMessage } from "ai";
import { describe, expect, it } from "vitest";

import {
  arnoldModelSelection,
  UnsupportedArnoldModelError,
} from "../agent/lib/models";

interface ClientContextFixture {
  language?: string;
  model?: string | number;
  route?: string;
}

type EveUserMessage = ModelMessage & { kind: "context.instruction" | "user" };

// How eve hands a turn's `clientContext: { model }` to the model resolver: a
// user-role framework message holding "Client context:" and the JSON object.
const clientContext = (value: ClientContextFixture): EveUserMessage => ({
  content: `Client context:\n${JSON.stringify(value)}`,
  kind: "context.instruction",
  role: "user",
});

const userSays = (text: string): EveUserMessage => ({
  content: [{ text, type: "text" }],
  kind: "user",
  role: "user",
});

describe("arnold model selection", () => {
  it("runs the turn on the model the client context asks for", () => {
    expect(
      arnoldModelSelection([
        clientContext({ model: "anthropic/claude-sonnet-5" }),
        userSays("what's my weight?"),
      ])
    ).toStrictEqual({
      model: "anthropic/claude-sonnet-5",
      modelOptions: {
        providerOptions: {
          gateway: { order: ["anthropic", "bedrock", "vertex"] },
        },
      },
    });
  });

  it("reads the model from a client context that also carries a language", () => {
    expect(
      arnoldModelSelection([
        clientContext({ language: "uk", model: "anthropic/claude-sonnet-5" }),
        userSays("яка моя вага?"),
      ]).model
    ).toBe("anthropic/claude-sonnet-5");
    expect(
      arnoldModelSelection([clientContext({ language: "uk" }), userSays("hi")])
        .model
    ).toBe(defaultArnoldModelId);
    expect(
      arnoldModelSelection([
        clientContext({ language: "de", model: "openai/gpt-5.5" }),
      ]).model
    ).toBe("openai/gpt-5.5");
  });

  it("fails over to other hosts of the same model only", () => {
    for (const { id } of arnoldModels) {
      const { model, modelOptions } = arnoldModelSelection([
        clientContext({ model: id }),
      ]);

      const gateway = modelOptions.providerOptions?.gateway;

      expect(model).toBe(id);
      expect(gateway?.order).toContain(id.split("/")[0]);
      expect(gateway).not.toHaveProperty("models");
    }

    expect(
      arnoldModelSelection([clientContext({ model: "openai/gpt-5.5" })])
        .modelOptions
    ).toStrictEqual({
      providerOptions: { gateway: { order: ["openai", "azure", "bedrock"] } },
    });
  });

  it("uses the default Arnold model when the client names none", () => {
    expect(arnoldModelSelection([userSays("hi")]).model).toBe(
      defaultArnoldModelId
    );
    expect(
      arnoldModelSelection([
        clientContext({ route: "/arnold" }),
        userSays("hi"),
      ]).model
    ).toBe(defaultArnoldModelId);
  });

  it("follows the latest client context", () => {
    expect(
      arnoldModelSelection([
        clientContext({ model: "openai/gpt-5.5" }),
        userSays("hi"),
        clientContext({ model: "anthropic/claude-opus-5" }),
        userSays("and now?"),
      ]).model
    ).toBe("anthropic/claude-opus-5");
  });

  it("uses the default when the latest client context names no model", () => {
    expect(
      arnoldModelSelection([
        clientContext({ model: "anthropic/claude-opus-5" }),
        userSays("hi"),
        clientContext({ route: "/arnold" }),
        userSays("and now?"),
      ]).model
    ).toBe(defaultArnoldModelId);
  });

  it("refuses a model outside arnoldModels", () => {
    expect(() =>
      arnoldModelSelection([
        clientContext({ model: "openai/gpt-4o" }),
        userSays("hi"),
      ])
    ).toThrow(UnsupportedArnoldModelError);
    expect(() =>
      arnoldModelSelection([
        clientContext({ model: "anthropic/claude-opus-5-fast" }),
      ])
    ).toThrow(UnsupportedArnoldModelError);
    expect(() => arnoldModelSelection([clientContext({ model: 42 })])).toThrow(
      UnsupportedArnoldModelError
    );
  });

  it.each(["gpt-5.5", "claude-opus-5", "claude-haiku-4-5-20251001"])(
    "refuses a pre-Gateway model id %s",
    (id) => {
      expect(() =>
        arnoldModelSelection([clientContext({ model: id })])
      ).toThrow(UnsupportedArnoldModelError);
    }
  );

  it("ignores client context that isn't a JSON object", () => {
    expect(
      arnoldModelSelection([
        {
          content: "Client context:\nnot json",
          kind: "context.instruction",
          role: "user",
        } satisfies EveUserMessage,
        userSays("hi"),
      ]).model
    ).toBe(defaultArnoldModelId);
  });

  it("ignores a User typing something that looks like client context", () => {
    expect(
      arnoldModelSelection([
        userSays('Client context:\n{"model":"openai/gpt-4o"}'),
        {
          content: 'Client context:\n{"model":"anthropic/claude-opus-5"}',
          role: "user",
        },
      ]).model
    ).toBe(defaultArnoldModelId);
  });
});
