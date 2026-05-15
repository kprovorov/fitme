export interface ChatMessage {
  content: string;
  id: string;
  role: "user" | "assistant";
}
