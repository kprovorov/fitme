import React from "react";
import { View } from "react-native";
import { Text } from "~/components/ui/text";
import { Button } from "~/components/ui/button";
import { Message, AgentAction } from "~/lib/models";
import { Link } from "expo-router";
import { SquareArrowOutUpRight } from "~/lib/icons/SquareArrowOutUpRight";

type Props = {
  message: Message;
  action?: AgentAction;
};

export default function AgentMessageView({ message, action }: Props) {
  const isUser = message.role === "user";

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

      {!isUser && action?.type === "plan_created" && (
        <Link href={`/plans/${action.plan_id}` as `/plans/${string}`} asChild>
          <Button
            variant="outline"
            size="sm"
            className="mt-2 flex-row items-center gap-1.5"
          >
            <Text className="text-sm">View Plan</Text>
            <SquareArrowOutUpRight className="w-4 h-4 text-foreground" />
          </Button>
        </Link>
      )}
    </View>
  );
}
