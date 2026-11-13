import { appLanguages } from "@fitme/core/models";
import type { ModelMessage } from "ai";
import { describe, expect, it } from "vitest";

import {
  appLanguage,
  latestClientContext,
  libraryLanguage,
} from "../agent/lib/client-context";

type ClientContextFixture =
  | { language?: string | number; model?: string }
  | string[];

type EveUserMessage = ModelMessage & { kind: "context.instruction" | "user" };

// How eve hands a turn's `clientContext` object to the model and to tools: a
// user-role framework message holding "Client context:" and the JSON object.
const clientContext = (value: ClientContextFixture): EveUserMessage => ({
  content: `Client context:\n${JSON.stringify(value)}`,
  kind: "context.instruction",
  role: "user",
});

const userSays = (text: string): EveUserMessage => ({
  content: text,
  kind: "user",
  role: "user",
});

describe("latest client context", () => {
  it("reads the latest client context object", () => {
    expect(
      latestClientContext([
        clientContext({ language: "en" }),
        userSays("hi"),
        clientContext({ language: "uk", model: "openai/gpt-6.1-terra" }),
      ])
    ).toStrictEqual({ language: "uk", model: "openai/gpt-6.1-terra" });
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

describe("app language", () => {
  it("is the client context's App language", () => {
    expect(
      appLanguage([clientContext({ language: "uk" }), userSays("hi")])
    ).toBe("uk");
    expect(appLanguage([clientContext({ language: "en" })])).toBe("en");
    expect(appLanguage([clientContext({ language: "es" })])).toBe("es");
    expect(appLanguage([clientContext({ language: "ca" })])).toBe("ca");
  });

  it.each(appLanguages)("accepts %s from client context", (language) => {
    expect(appLanguage([clientContext({ language })])).toBe(language);
  });

  it("is English without a client context, without a language, or with one that isn't an App language", () => {
    expect(appLanguage([userSays("hi")])).toBe("en");
    expect(
      appLanguage([clientContext({ model: "openai/gpt-6.1-terra" })])
    ).toBe("en");
    expect(appLanguage([clientContext({ language: "ru" })])).toBe("en");
    expect(appLanguage([clientContext({ language: "uk-UA" })])).toBe("en");
    expect(appLanguage([clientContext({ language: 1 })])).toBe("en");
  });
});

describe("library language", () => {
  it.each(appLanguages.filter((language) => language !== "en"))(
    "passes %s to the Library",
    (language) => {
      expect(libraryLanguage([clientContext({ language })])).toBe(language);
    }
  );
});
