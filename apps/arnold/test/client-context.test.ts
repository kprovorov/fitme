import { appLanguages } from "@fitme/core/models";
import type { ModelMessage } from "ai";
import { describe, expect, it } from "vitest";

import {
  appLanguage,
  clientCards,
  clientTimeZone,
  latestClientContext,
} from "../agent/lib/client-context";

type ClientContextFixture =
  | {
      cards?: unknown;
      language?: string | number;
      model?: string;
      timeZone?: unknown;
    }
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

describe("client cards", () => {
  it("is the list of cards the build can draw", () => {
    expect(
      clientCards([
        clientContext({ cards: ["workout", "plan_proposal"], language: "en" }),
      ])
    ).toStrictEqual(["workout", "plan_proposal"]);
    expect(
      clientCards([clientContext({ cards: [], language: "en" })])
    ).toStrictEqual([]);
  });

  it("is no list without a client context or without cards", () => {
    expect(clientCards([userSays("hi")])).toBeNull();
    expect(clientCards([clientContext({ language: "en" })])).toBeNull();
  });

  it("is no list when cards isn't a list", () => {
    expect(clientCards([clientContext({ cards: "workout" })])).toBeNull();
    expect(
      clientCards([clientContext({ cards: { workout: true } })])
    ).toBeNull();
    expect(clientCards([clientContext({ cards: null })])).toBeNull();
  });

  it("ignores a card id that isn't one of core's, and a repeat", () => {
    expect(
      clientCards([
        clientContext({
          cards: ["workout", "hologram", 3, null, "WORKOUT", "workout", "plan"],
        }),
      ])
    ).toStrictEqual(["workout", "plan"]);
  });

  it("reads the latest client context's list", () => {
    expect(
      clientCards([
        clientContext({ cards: ["workout"] }),
        userSays("hi"),
        clientContext({ language: "en" }),
      ])
    ).toBeNull();
  });
});

describe("client time zone", () => {
  it("is the device's IANA time zone", () => {
    expect(clientTimeZone([clientContext({ timeZone: "Europe/Kyiv" })])).toBe(
      "Europe/Kyiv"
    );
    expect(
      clientTimeZone([clientContext({ timeZone: "America/New_York" })])
    ).toBe("America/New_York");
  });

  it("is an Expo fixed-offset calendar id as sent", () => {
    expect(clientTimeZone([clientContext({ timeZone: "GMT+1" })])).toBe(
      "GMT+1"
    );
    expect(clientTimeZone([clientContext({ timeZone: "GMT-03:30" })])).toBe(
      "GMT-03:30"
    );
  });

  it("is UTC without a client context or a time zone", () => {
    expect(clientTimeZone([userSays("hi")])).toBe("UTC");
    expect(clientTimeZone([clientContext({ language: "en" })])).toBe("UTC");
  });

  it("is UTC for a time zone Intl doesn't know, or one that isn't a string", () => {
    expect(clientTimeZone([clientContext({ timeZone: "Mars/Olympus" })])).toBe(
      "UTC"
    );
    expect(clientTimeZone([clientContext({ timeZone: "" })])).toBe("UTC");
    expect(clientTimeZone([clientContext({ timeZone: 2 })])).toBe("UTC");
    expect(clientTimeZone([clientContext({ timeZone: null })])).toBe("UTC");
  });

  it("is UTC for an ISO offset, or a calendar offset out of range", () => {
    expect(clientTimeZone([clientContext({ timeZone: "+05:00" })])).toBe("UTC");
    expect(clientTimeZone([clientContext({ timeZone: "GMT+25" })])).toBe("UTC");
  });
});
