import { formatCount } from "@fitme/i18n";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";

import { SymbolImage } from "~/components/symbol-image";
import { Badge } from "~/components/ui/badge";
import { Card } from "~/components/ui/card";
import { Text } from "~/components/ui/text";
import type { PlanSummary } from "~/hooks/queries/plans";
import { useI18n } from "~/lib/i18n";

import { PlanMeta, usePlanMetaItems } from "./plan-meta";

/**
 * The active Plan at the top of My Plans (Figma's Plans Redesign · Content):
 * the lime Active badge, the name (two lines at most) with a chevron, the
 * description (two lines at most, left out when empty), its details, its
 * Workout count and a wrapping chip per Workout. The whole card is one
 * button opening the Plan, read by VoiceOver as one sentence.
 */
export const ActivePlanCard = ({
  onPress,
  plan,
}: {
  onPress: () => void;
  plan: PlanSummary;
}) => {
  const { t } = useTranslation();
  const i18n = useI18n();
  const meta = usePlanMetaItems(plan);

  const description = plan.description?.trim() ?? "";
  const workoutCount = formatCount(i18n, "workouts", plan.workouts.length);

  const spoken = [
    plan.name,
    t("plans.activePlan"),
    description,
    ...meta.map((item) => item.label),
    workoutCount,
    ...plan.workouts.map((workout) => workout.name),
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <Pressable
      accessibilityLabel={spoken}
      accessibilityRole="button"
      className="active:opacity-80"
      onPress={onPress}
      testID="active-plan-card"
    >
      <Card padding="none">
        <View className="gap-4 p-6">
          <View className="items-start gap-2">
            <Badge icon="checkmark.circle.fill">
              <Text>{t("plans.active")}</Text>
            </Badge>
            <View className="flex-row items-center gap-2 self-stretch">
              <Text
                className="text-title-2-emphasized text-foreground flex-1"
                numberOfLines={2}
              >
                {plan.name}
              </Text>
              <SymbolImage
                className="text-body text-muted-foreground shrink-0"
                name="chevron.right"
              />
            </View>
          </View>
          {description ? (
            <Text className="text-body text-muted-foreground" numberOfLines={2}>
              {description}
            </Text>
          ) : null}
          <PlanMeta className="gap-x-2 gap-y-1" items={meta} />
          <View className="gap-2">
            <Text className="text-footnote text-muted-foreground">
              {workoutCount}
            </Text>
            {plan.workouts.length > 0 ? (
              <View className="flex-row flex-wrap gap-2">
                {plan.workouts.map((workout) => (
                  <Badge
                    className="max-w-full"
                    key={workout.id}
                    variant="secondary"
                  >
                    <Text className="shrink" numberOfLines={1}>
                      {workout.name}
                    </Text>
                  </Badge>
                ))}
              </View>
            ) : null}
          </View>
        </View>
      </Card>
    </Pressable>
  );
};
