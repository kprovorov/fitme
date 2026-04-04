import React from "react";
import { View } from "react-native";
import { Text } from "~/components/ui/text";
import { Message } from "~/lib/models";
import PlanAttachmentView from "./plan-attachment-view";

type Props = {
  message: Message;
};

export default function AgentMessageView({ message }: Props) {
  const isUser = message.role === "user";
  const attachment = message.metadata?.attachment;

  return (
    <View className={`mb-3 ${isUser ? "items-end" : "items-start"}`}>
      <View
        className={`max-w-[85%] rounded-2xl px-4 py-3 ${
          isUser
            ? "bg-primary rounded-tr-sm"
            : "bg-card border border-white/10 rounded-tl-sm"
        }`}
      >
        <Text
          className={`text-sm leading-relaxed ${
            isUser ? "text-primary-foreground" : "text-foreground"
          }`}
        >
          {message.content}
        </Text>
      </View>

      {!isUser && attachment?.type === "plan_preview" && (
        <PlanAttachmentView attachment={attachment} />
      )}
    </View>
  );
}
