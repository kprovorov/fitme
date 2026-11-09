import type { Equipment } from "@fitme/core";
import { View } from "react-native";

import { Badge } from "~/components/ui/badge";
import { Text } from "~/components/ui/text";
import { useChoiceLabels } from "~/lib/choices";

/**
 * The Equipment an Exercise needs, as badges that wrap: one per piece, in the
 * order the Library answers (`@fitme/core`'s), named in the App language.
 * `secondary`, as the muscle groups of a Workout Session Exercise are badged
 * over its clip (`components/workout-sessions/session-exercise-header.tsx`),
 * which is the same kind of fact about the same kind of row. Content the
 * Library hasn't tagged renders nothing, so the Screen keeps its own spacing
 * (a `null` child adds no gap).
 */
export const EquipmentBadges = ({
  equipment,
}: {
  equipment: readonly Equipment[];
}) => {
  const labels = useChoiceLabels();

  if (equipment.length === 0) {
    return null;
  }

  return (
    <View
      className="gap-xs flex-row flex-wrap items-center"
      testID="equipment-badges"
    >
      {equipment.map((item) => (
        <Badge key={item} variant="secondary">
          {/* An id this build doesn't know shows as itself (`useChoiceLabels`). */}
          <Text>{labels.equipment(item)}</Text>
        </Badge>
      ))}
    </View>
  );
};
