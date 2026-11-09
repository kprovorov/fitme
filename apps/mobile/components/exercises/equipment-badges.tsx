import type { Equipment } from "@fitme/core";
import { View } from "react-native";

import { Badge } from "~/components/ui/badge";
import { Text } from "~/components/ui/text";
import { useChoiceLabels } from "~/lib/choices";

/**
 * The Equipment an Exercise needs, as badges that wrap: one per piece, in the
 * order the Library answers (`@fitme/core`'s), named in the App language.
 * `secondary`, like the muscle groups over a Workout Session Exercise's clip:
 * lime is for a choice the User made, not for what an Exercise is. Content
 * the Library hasn't tagged renders nothing, so the Screen keeps its own
 * spacing (a `null` child adds no gap).
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
      className="gap-xs w-full flex-row flex-wrap items-center"
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
