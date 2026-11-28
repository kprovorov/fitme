import type { ToolCallMessagePart } from "@assistant-ui/react-native";
import { View } from "react-native";

import { ARNOLD_CARDS, arnoldCardFor } from "./lookup";

/**
 * A tool call that has succeeded: settled with its final result, not an
 * error and not a preliminary result still arriving.
 */
const isSucceeded = (part: ToolCallMessagePart) =>
  part.result !== undefined && !part.isError && !part.isPreliminary;

/**
 * The cards an assistant message's tool calls draw: one per successful call
 * of a registered show tool, each at full width and never inside another
 * card. A failed call, a result still arriving and a tool the build doesn't
 * register draw nothing.
 */
export const ArnoldToolCards = ({
  parts,
}: {
  parts: readonly ToolCallMessagePart[];
}) => {
  const cards = parts.flatMap((part) => {
    const entry = isSucceeded(part) ? arnoldCardFor(part.toolName) : undefined;

    return entry ? [{ entry, part }] : [];
  });

  if (!cards.length) {
    return null;
  }

  return (
    <View className="mb-2 w-full gap-2" testID={ARNOLD_CARDS}>
      {cards.map(({ entry: { Card }, part }) => (
        <View className="w-full" key={part.toolCallId}>
          <Card
            input={part.args}
            result={part.result}
            toolCallId={part.toolCallId}
          />
        </View>
      ))}
    </View>
  );
};
