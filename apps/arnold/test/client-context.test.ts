import type { ModelMessage } from "ai";
import { describe, expect, it } from "vitest";
import { appLanguage, latestClientContext } from "../agent/lib/client-context";

// How eve hands a turn's `clientContext` object to the model and to tools: a
// user-role framework message holding "Client context:" and the JSON object.
const clientContext = (value: unknown): ModelMessage =>
  ({
    content: `Client context:\n${JSON.stringify(value)}`,
    kind: "context.instruction",
    role: "user",
  }) as ModelMessage;

const userSays = (text: string): ModelMessage =>
  ({ content: text, kind: "user", role: "user" }) as ModelMessage;

describe("latestClientContext", () => {
  it("reads the latest client context object", () => {
    expect(
      latestClientContext([
        clientContext({ language: "en" }),
        userSays("hi"),
        clientContext({ language: "uk", model: "openai/gpt-5.5" }),
      ])
    ).toEqual({ language: "uk", model: "openai/gpt-5.5" });
  });

  it("ignores a User typing a client context, and one that isn't an object", () => {
    expect(
      latestClientContext([
        userSays('Client context:\n{"language":"uk"}'),
        clientContext(["uk"]),
      ])
    ).toBeNull();
  });
});

describe("appLanguage", () => {
  it("is the client context's App language", () => {
    expect(
      appLanguage([clientContext({ language: "uk" }), userSays("hi")])
    ).toBe("uk");
    expect(appLanguage([clientContext({ language: "en" })])).toBe("en");
  });

  it("is English without a client context, without a language, or with one that isn't an App language", () => {
    expect(appLanguage([userSays("hi")])).toBe("en");
    expect(appLanguage([clientContext({ model: "openai/gpt-5.5" })])).toBe(
      "en"
    );
    expect(appLanguage([clientContext({ language: "de" })])).toBe("en");
    expect(appLanguage([clientContext({ language: "uk-UA" })])).toBe("en");
    expect(appLanguage([clientContext({ language: 1 })])).toBe("en");
  });
});
