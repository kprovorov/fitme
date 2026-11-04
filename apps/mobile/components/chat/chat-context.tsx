import type { ThreadMessage } from "@assistant-ui/react-native";
import { createContext, use } from "react";
import type { StreamingStore } from "./streaming-store";

/** An Attachment picked for the next message, as the composer shows it. */
export interface ChatAttachment {
  id: string;
  /** A file on this device: the re-encoded JPEG (ADR 0018). */
  uri: string;
}

export interface ChatContextValue {
  /** The Attachments picked for the next message; none by default. */
  attachments?: readonly ChatAttachment[];
  /** The error state's text, in the App language; none while there's no error. */
  errorMessage?: string | null;
  input: string;
  isGenerating: boolean;
  /** A saved Conversation is replaying; sends wait for it. */
  isLoading?: boolean;
  messages: readonly ThreadMessage[];
  /** Removes one picked Attachment, by its id (a thumbnail's ×). */
  onRemoveAttachment?: (id: string) => void;
  onSend: () => void;
  setInput: (value: string) => void;
  streamingStore: StreamingStore;
}

const ChatContext = createContext<ChatContextValue | null>(null);

export const ChatProvider = ChatContext.Provider;

export function useChatContext() {
  const ctx = use(ChatContext);
  if (!ctx) {
    throw new Error("useChatContext must be used within <Chat>");
  }
  return ctx;
}
