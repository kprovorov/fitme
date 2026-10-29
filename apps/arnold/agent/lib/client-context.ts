import {
  type AppLanguage,
  defaultAppLanguage,
  isAppLanguage,
} from "@fitme/core/models";
import type { ModelMessage } from "ai";

// eve hands a turn's `clientContext` object to the model as a user-role
// framework message of this kind: the prefix, then the object as JSON. A
// User's own messages have kind "user", so typing this text selects nothing.
// The model resolver reads it from the step's messages, and a tool from
// `ctx.messages`, the same model input (the AI SDK keeps the `kind`).
// eve is pinned exactly; check this format on every bump.
const CLIENT_CONTEXT_KIND = "context.instruction";
const CLIENT_CONTEXT_PREFIX = "Client context:\n";

const clientContextTexts = (message: ModelMessage): string[] => {
  const { kind } = message as { kind?: unknown };
  if (message.role !== "user" || kind !== CLIENT_CONTEXT_KIND) {
    return [];
  }
  if (typeof message.content === "string") {
    return [message.content];
  }
  return message.content.flatMap((part) =>
    part.type === "text" ? [part.text] : []
  );
};

const parseClientContext = (text: string): Record<string, unknown> | null => {
  if (!text.startsWith(CLIENT_CONTEXT_PREFIX)) {
    return null;
  }
  try {
    const value: unknown = JSON.parse(text.slice(CLIENT_CONTEXT_PREFIX.length));
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
};

/** The latest client context object in a step's messages, or `null` without one. */
export const latestClientContext = (
  messages: readonly ModelMessage[]
): Record<string, unknown> | null => {
  for (const message of [...messages].reverse()) {
    for (const text of clientContextTexts(message).reverse()) {
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
