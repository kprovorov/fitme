import { createContext, use } from "react";
import type { StreamingStore } from "./streaming-store";
import type { ChatMessage } from "./types";

export interface ChatContextValue {
  error?: Error | null;
  input: string;
  isGenerating: boolean;
  messages: ChatMessage[];
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
