/// <reference lib="es2023.array" />

import { defaultAppLanguage, isAppLanguage } from "@fitme/core/models";
import type { AppLanguage } from "@fitme/core/models";
import type { ModelMessage } from "ai";
import { z } from "zod";

// eve hands a turn's `clientContext` object to the model as a user-role
// framework message of this kind: the prefix, then the object as JSON. A
// User's own messages have kind "user", so typing this text selects nothing.
// The model resolver reads it from the step's messages, and a tool from
// `ctx.messages`, the same model input (the AI SDK keeps the `kind`).
// eve is pinned exactly; check this format on every bump.
const CLIENT_CONTEXT_KIND = "context.instruction";
const CLIENT_CONTEXT_PREFIX = "Client context:\n";
const clientContextSchema = z.record(z.string(), z.json());

type ClientContext = z.infer<typeof clientContextSchema>;

const clientContextTexts = (message: ModelMessage): string[] => {
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
  messages: readonly ModelMessage[]
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
export const appLanguage = (messages: readonly ModelMessage[]): AppLanguage => {
  const language = latestClientContext(messages)?.language;

  return isAppLanguage(language) ? language : defaultAppLanguage;
};

/**
 * The `language` to ask the Library in: the App language, left out for
 * English, the Library API's default, so an English turn asks as before.
 */
export const libraryLanguage = (
  messages: readonly ModelMessage[]
): AppLanguage | undefined => {
  const language = appLanguage(messages);

  return language === defaultAppLanguage ? undefined : language;
};
