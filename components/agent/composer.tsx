import { ComposerPrimitive } from "@assistant-ui/react-native";
import { Text } from "react-native";

export function Composer() {
  return (
    <ComposerPrimitive.Root
      style={{
        flexDirection: "row",
        padding: 12,
        alignItems: "flex-end",
        paddingBottom: 100,
      }}
    >
      <ComposerPrimitive.Input
        multiline
        placeholder="Ask anything..."
        style={{
          flex: 1,
          borderWidth: 1,
          borderColor: "#ddd",
          borderRadius: 20,
          paddingHorizontal: 16,
          paddingVertical: 10,
          maxHeight: 120,
        }}
      />
      <ComposerPrimitive.Send
        style={{
          marginLeft: 8,
          backgroundColor: "#C0FF38",
          borderRadius: 20,
          width: 36,
          height: 36,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <Text style={{ color: "#000", fontWeight: "bold" }}>↑</Text>
      </ComposerPrimitive.Send>
    </ComposerPrimitive.Root>
  );
}
