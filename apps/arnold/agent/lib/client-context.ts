/// <reference lib="es2023.array" />

import { isArnoldCardId } from "@fitme/core/arnold";
import type { ArnoldCardId } from "@fitme/core/arnold";
import { defaultAppLanguage, isAppLanguage } from "@fitme/core/models";
import type { AppLanguage } from "@fitme/core/models";
import { calendarOffsetMinutes } from "@fitme/core/weekly-goals";
import type { HistoryMessage } from "eve/context";
import { z } from "zod";

// eve hands a turn's `clientContext` object to the model as a user-role
// framework message of this kind: the prefix, then the object as JSON. A
// User's own messages have kind "user", so typing this text selects nothing.
// The model resolver reads it from `await ctx.messages()`, and a tool from
// `ctx.messages`: the conversation eve assembles for the model call, whose
// messages keep their `kind` at runtime although eve's `HistoryMessage` type
// doesn't declare it. eve is pinned exactly; check this format on every bump.
const CLIENT_CONTEXT_KIND = "context.instruction";
const CLIENT_CONTEXT_PREFIX = "Client context:\n";
const DEFAULT_TIME_ZONE = "UTC";
const clientContextSchema = z.record(z.string(), z.json());

type ClientContext = z.infer<typeof clientContextSchema>;

const clientContextTexts = (message: HistoryMessage): string[] => {
  if (
    message.role !== "user" ||
    !("kind" in message) ||
    message.kind !== CLIENT_CONTEXT_KIND
  ) {
    return [];
  }

  if (!Array.isArray(message.content)) {
    return [message.content];
  }

  return message.content.flatMap((part) =>
    part.type === "text" ? [part.text] : []
  );
};

const parseClientContext = (text: string): ClientContext | null => {
  if (!text.startsWith(CLIENT_CONTEXT_PREFIX)) {
    return null;
  }

  try {
    const context = clientContextSchema.safeParse(
      JSON.parse(text.slice(CLIENT_CONTEXT_PREFIX.length))
    );

    return context.success ? context.data : null;
  } catch {
    return null;
  }
};

/** The latest client context object in a step's messages, or `null` without one. */
export const latestClientContext = (
  messages: readonly HistoryMessage[]
): ClientContext | null => {
  for (const message of messages.toReversed()) {
    for (const text of clientContextTexts(message).toReversed()) {
      const context = parseClientContext(text);

      if (context) {
        return context;
      }
    }
  }

  return null;
};

/**
 * The App language the client sends as `clientContext: { language }`;
 * English without one, or for anything that isn't an App language.
 */
export const appLanguage = (
  messages: readonly HistoryMessage[]
): AppLanguage => {
  const language = latestClientContext(messages)?.language;

  return isAppLanguage(language) ? language : defaultAppLanguage;
};

/**
 * The cards the build can draw, from `clientContext: { cards }` (ADR 0027):
 * each id once, in the order sent, an id that isn't one of `arnoldCardIds`
 * left out. `null` when the client sent no list, or something that isn't a
 * list: an old build, which can draw none of the new cards.
 */
export const clientCards = (
  messages: readonly HistoryMessage[]
): readonly ArnoldCardId[] | null => {
  const cards = latestClientContext(messages)?.cards;

  if (!Array.isArray(cards)) {
    return null;
  }

  return [...new Set(cards.filter(isArnoldCardId))];
};

// The Public API's `time_zone` rule, so both read the same values: an Expo
// fixed-offset calendar id (`GMT+1`, `GMT-03:30`, which `Intl` refuses), or
// an IANA name `Intl` knows. An ISO offset such as `+05:00` isn't one, since
// Postgres reads it with the POSIX sign, the wrong way round.
const IANA_TIME_ZONE = /^[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+)*$/u;

const isTimeZone = (value: unknown): value is string => {
  if (typeof value !== "string") {
    return false;
  }

  if (calendarOffsetMinutes(value) !== null) {
    return true;
  }

  if (!IANA_TIME_ZONE.test(value)) {
    return false;
  }

  try {
    return (
      new Intl.DateTimeFormat("en", { timeZone: value }).resolvedOptions()
        .timeZone !== ""
    );
  } catch {
    return false;
  }
};

/**
 * The device's time zone, from `clientContext: { timeZone }`, as sent: an
 * IANA name or an Expo fixed-offset calendar id (`GMT+1`); UTC without one,
 * or for anything else.
 */
export const clientTimeZone = (messages: readonly HistoryMessage[]): string => {
  const timeZone = latestClientContext(messages)?.timeZone;

  return isTimeZone(timeZone) ? timeZone : DEFAULT_TIME_ZONE;
};
