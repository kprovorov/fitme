import type { MuscleGroup } from "@fitme/core";
import { useTranslation } from "react-i18next";
import { View } from "react-native";

import { Badge } from "~/components/ui/badge";
import { Card } from "~/components/ui/card";
import { Separator } from "~/components/ui/separator";
import { Text } from "~/components/ui/text";
import { H4, Muted } from "~/components/ui/typography";
import { useChoiceLabels } from "~/lib/choices";

interface MuscleGroupsCardProps {
  primary: readonly MuscleGroup[];
  secondary: readonly MuscleGroup[];
}

interface GroupRowProps {
  /** VoiceOver's reading of the row: its kind and every group in it. */
  spoken: string;
  testID: string;
  title: string;
  values: readonly string[];
}

/** One kind of muscle group: its muted label over its badges, which wrap. */
const GroupRow = ({ spoken, testID, title, values }: GroupRowProps) => (
  <View
    accessibilityLabel={spoken}
    accessible
    className="gap-xs"
    testID={testID}
  >
    <Muted>{title}</Muted>
    <View className="gap-xs flex-row flex-wrap">
      {values.map((value) => (
        <Badge key={value} variant="secondary">
          <Text>{value}</Text>
        </Badge>
      ))}
    </View>
  </View>
);

/**
 * An Exercise's muscle groups on its detail screen: a Card with the primary
 * ones, then, divided by a Separator, the secondary ones, each named in the
 * App language (an id the catalogs lack shows as itself). An Exercise with no
 * secondary group shows no Separator and no Secondary row; with no group at
 * all, nothing (heading included).
 */
export const MuscleGroupsCard = ({
  primary,
  secondary,
}: MuscleGroupsCardProps) => {
  const { t } = useTranslation();
  const labels = useChoiceLabels();

  if (primary.length === 0 && secondary.length === 0) {
    return null;
  }

  const primaryNames = primary.map((group) => labels.muscleGroup(group));
  const secondaryNames = secondary.map((group) => labels.muscleGroup(group));

  return (
    <View className="gap-xs" testID="muscle-groups">
      <H4>{t("exercise.muscleGroups")}</H4>
      <Card>
        <View className="gap-sm">
          {primaryNames.length > 0 ? (
            <GroupRow
              spoken={t("exercise.spoken.primaryMuscleGroups", {
                muscleGroups: primaryNames.join(", "),
              })}
              testID="primary-muscle-groups"
              title={t("exercise.primaryMuscleGroups")}
              values={primaryNames}
            />
          ) : null}
          {primaryNames.length > 0 && secondaryNames.length > 0 ? (
            <Separator />
          ) : null}
          {secondaryNames.length > 0 ? (
            <GroupRow
              spoken={t("exercise.spoken.secondaryMuscleGroups", {
                muscleGroups: secondaryNames.join(", "),
              })}
              testID="secondary-muscle-groups"
              title={t("exercise.secondaryMuscleGroups")}
              values={secondaryNames}
            />
          ) : null}
        </View>
      </Card>
    </View>
  );
};
