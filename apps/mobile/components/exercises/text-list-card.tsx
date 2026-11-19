import { Fragment } from "react";
import { View } from "react-native";

import { keyedRows } from "~/components/exercises/keyed-rows";
import { Card } from "~/components/ui/card";
import { Separator } from "~/components/ui/separator";
import { Text } from "~/components/ui/text";
import { H4 } from "~/components/ui/typography";

interface TextListCardProps {
  /** The heading's gap to the card: `xs` on the detail screen, `sm` in the guide. */
  gap: "sm" | "xs";
  items: readonly string[];
  testID: string;
  title: string;
}

/**
 * A titled list of short lines in a Card, one line per row divided by
 * Separators: an Exercise's benefits on its detail screen, its common
 * mistakes in its guide (Figma's `ExerciseListItem` type=row, FIT-737).
 * Nothing to list renders nothing, heading included, so the Screen keeps its
 * own spacing.
 */
export const TextListCard = ({
  gap,
  items,
  testID,
  title,
}: TextListCardProps) => {
  if (items.length === 0) {
    return null;
  }

  return (
    <View className={gap === "sm" ? "gap-sm" : "gap-xs"} testID={testID}>
      <H4>{title}</H4>
      <Card>
        <View className="gap-sm">
          {keyedRows(items).map(({ key, number, text }) => (
            <Fragment key={key}>
              {number > 1 ? <Separator /> : null}
              <Text testID={`${testID}-row`}>{text}</Text>
            </Fragment>
          ))}
        </View>
      </Card>
    </View>
  );
};
