import { MessagePrimitive } from "@assistant-ui/react-native";
import { View } from "react-native";
import { Text } from "../ui/text";

export function UserMessage() {
  return (
    <MessagePrimitive.Root className="flex justify-end">
      <View
        style={{
          alignSelf: "flex-end",
          backgroundColor: "#C0FF38",
          borderRadius: 16,
          padding: 12,
          marginVertical: 4,
          marginHorizontal: 16,
          maxWidth: "80%",
        }}
      >
        <MessagePrimitive.Parts>
          {({ part }) => {
            if (part.type === "text") {
              return <Text style={{ color: "#000" }}>{part.text}</Text>;
            }
            return null;
          }}
        </MessagePrimitive.Parts>
      </View>
    </MessagePrimitive.Root>
  );
}

export function AssistantMessage() {
  return (
    <MessagePrimitive.Root className="flex justify-start gap-3">
      <View
        style={{
          alignSelf: "flex-start",
          backgroundColor: "#f0f0f0",
          borderRadius: 16,
          padding: 12,
          marginVertical: 4,
          marginHorizontal: 16,
          maxWidth: "80%",
        }}
      >
        <MessagePrimitive.Parts>
          {({ part }) => {
            if (part.type === "text") {
              return <Text style={{ color: "#000" }}>{part.text}</Text>;
            }
            return part.toolUI ?? null;
          }}
        </MessagePrimitive.Parts>
      </View>
    </MessagePrimitive.Root>
  );
}
