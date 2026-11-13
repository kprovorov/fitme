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
        clientContext({ model: "anthropic/claude-sonnet-5.5" }),
        userSays("what's my weight?"),
      ])
    ).toStrictEqual({
      model: "anthropic/claude-sonnet-5.5",
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
        clientContext({ language: "uk", model: "anthropic/claude-sonnet-5.5" }),
        userSays("яка моя вага?"),
      ]).model
    ).toBe("anthropic/claude-sonnet-5.5");
    expect(
      arnoldModelSelection([clientContext({ language: "uk" }), userSays("hi")])
        .model
    ).toBe(defaultArnoldModelId);
    expect(
      arnoldModelSelection([
        clientContext({ language: "de", model: "google/gemini-4-hydrogen" }),
      ]).model
    ).toBe("google/gemini-4-hydrogen");
  });

  it.each([
    ["openai/gpt-6.1-terra", ["openai", "azure", "bedrock"]],
    ["anthropic/claude-sonnet-5.5", ["anthropic", "bedrock", "vertex"]],
    ["google/gemini-4-hydrogen", ["google", "vertex"]],
    ["spacexai/grok-4.7", ["xai", "bedrock", "vertex"]],
  ])("fails %s over to other hosts of the same model only", (id, order) => {
    expect(arnoldModelSelection([clientContext({ model: id })])).toStrictEqual({
      model: id,
      modelOptions: { providerOptions: { gateway: { order } } },
    });
  });

  it("names a host order for every Arnold model", () => {
    for (const { id } of arnoldModels) {
      const gateway = arnoldModelSelection([clientContext({ model: id })])
        .modelOptions.providerOptions?.gateway;

      expect(gateway?.order?.length).toBeGreaterThan(0);
      expect(gateway).not.toHaveProperty("models");
    }
  });

  it.each([
    ["openai/gpt-5.5", "openai/gpt-6.1-terra"],
    ["openai/gpt-5.6-luna", "openai/gpt-6.1-terra"],
    ["openai/gpt-5.6-sol", "openai/gpt-6.1-terra"],
    ["openai/gpt-5.6-terra", "openai/gpt-6.1-terra"],
    ["anthropic/claude-haiku-4.5", "anthropic/claude-sonnet-5.5"],
    ["anthropic/claude-opus-5", "anthropic/claude-sonnet-5.5"],
    ["anthropic/claude-sonnet-5", "anthropic/claude-sonnet-5.5"],
  ])("runs the retired model %s on %s", (retired, successor) => {
    expect(
      arnoldModelSelection([clientContext({ model: retired })]).model
    ).toBe(successor);
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
        clientContext({ model: "openai/gpt-6.1-terra" }),
        userSays("hi"),
        clientContext({ model: "spacexai/grok-4.7" }),
        userSays("and now?"),
      ]).model
    ).toBe("spacexai/grok-4.7");
  });

  it("uses the default when the latest client context names no model", () => {
    expect(
      arnoldModelSelection([
        clientContext({ model: "spacexai/grok-4.7" }),
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
    expect(() =>
      arnoldModelSelection([clientContext({ model: "xai/grok-4.7" })])
    ).toThrow(UnsupportedArnoldModelError);
    expect(() =>
      arnoldModelSelection([clientContext({ model: "constructor" })])
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
          content: 'Client context:\n{"model":"spacexai/grok-4.7"}',
          role: "user",
        },
      ]).model
    ).toBe(defaultArnoldModelId);
  });
});
