import { rateLimitedFor } from "@fitme/api-client";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, ScrollView, View } from "react-native";

import { ExerciseBadges } from "~/components/exercises/exercise-badges";
import { ExerciseUnavailable } from "~/components/exercises/exercise-unavailable";
import ExerciseVideo from "~/components/exercises/exercise-video";
import { MuscleGroupsCard } from "~/components/exercises/muscle-groups-card";
import { TextListCard } from "~/components/exercises/text-list-card";
import { ExerciseNote } from "~/components/notes/exercise-note";
import { Button } from "~/components/ui/button";
import { H3, Large, P } from "~/components/ui/typography";
import { useExercise, useExerciseDetailQuery } from "~/hooks/queries/library";
import { CLIP_SCROLL_EDGE_EFFECTS } from "~/lib/constants";
import type { Exercise } from "~/lib/exercises";
import { isNotesEnabled } from "~/lib/feature-flags";

/** The Exercise in full, top to bottom as Figma's Exercise Detail · Content. */
const ExerciseContent = ({ exercise }: { exercise: Exercise }) => {
  const { t } = useTranslation();
  const router = useRouter();

  // Its own slug, so an old one opens its replacement's guide.
  const openGuide = useCallback(() => {
    router.push(`/exercises/${exercise.slug}/guide`);
  }, [exercise.slug, router]);

  return (
    <>
      {exercise.video_url ? (
        <View
          accessibilityLabel={t("exercise.spoken.clip", {
            name: exercise.name,
          })}
          accessibilityRole="image"
          accessible
          testID="exercise-clip"
        >
          <ExerciseVideo url={exercise.video_url} />
        </View>
      ) : null}
      <View className="gap-md px-sm py-md">
        <View className="gap-sm">
          <H3>{exercise.name}</H3>
          <ExerciseBadges
            difficulty={exercise.difficulty}
            equipment={exercise.equipment}
            movementPatterns={exercise.movement_patterns}
          />
        </View>
        {exercise.short_description.trim() ? (
          <Large testID="exercise-short-description">
            {exercise.short_description}
          </Large>
        ) : null}
        <Button
          accessibilityHint={t("exercise.spoken.guideHint")}
          label={t("exercise.howToDoIt")}
          onPress={openGuide}
          size="lg"
        />
        {isNotesEnabled() ? (
          <ExerciseNote
            exerciseName={exercise.name}
            exerciseSlug={exercise.slug}
          />
        ) : null}
        <MuscleGroupsCard
          primary={exercise.muscle_groups}
          secondary={exercise.secondary_muscle_groups}
        />
        {exercise.long_description.trim() ? (
          <P testID="exercise-long-description">{exercise.long_description}</P>
        ) : null}
        <TextListCard
          gap="xs"
          items={exercise.benefits}
          testID="exercise-benefits"
          title={t("exercise.benefits")}
        />
      </View>
    </>
  );
};

const ExerciseScreen = () => {
  const { t } = useTranslation();
  const router = useRouter();
  const { exerciseSlug } = useLocalSearchParams<{ exerciseSlug: string }>();

  const {
    data: exercise,
    error,
    isError,
    refetch,
  } = useExerciseDetailQuery(exerciseSlug);

  // The name rows already show, while the Exercise in full loads.
  const { name } = useExercise(exerciseSlug);

  const retry = useCallback(() => {
    void refetch();
  }, [refetch]);

  const backToLibrary = useCallback(() => {
    router.dismissTo("/library");
  }, [router]);

  const renderContent = () => {
    if (exercise) {
      return <ExerciseContent exercise={exercise} />;
    }

    if (exercise === null) {
      return (
        <ExerciseUnavailable
          action={{
            label: t("exercise.backToLibrary"),
            onPress: backToLibrary,
          }}
          message={t("exercise.gone")}
          symbol="magnifyingglass"
          title={t("exercise.notFoundTitle")}
        />
      );
    }

    if (isError) {
      const waitSeconds = rateLimitedFor(error);

      return (
        <ExerciseUnavailable
          action={{ label: t("common.tryAgain"), onPress: retry }}
          message={
            waitSeconds === null
              ? t("exercise.checkConnection")
              : t("common.rateLimited", { seconds: waitSeconds })
          }
          symbol="exclamationmark.triangle"
          title={t("exercise.loadErrorTitle")}
        />
      );
    }

    return (
      <View className="pt-lg items-center">
        <ActivityIndicator
          accessibilityLabel={t("exercise.spoken.loading")}
          colorClassName="accent-foreground"
        />
      </View>
    );
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerBackButtonDisplayMode: "minimal",
          headerShown: true,
          headerTitleStyle: {
            fontFamily: "NunitoSans-Bold",
            fontWeight: "bold",
          },
          headerTransparent: true,
          scrollEdgeEffects: CLIP_SCROLL_EDGE_EFFECTS,
          // The content names a loaded Exercise itself, and a missing one has
          // no name, so the header names it only while it loads or failed to.
          title: exercise === undefined ? name : "",
        }}
      />
      <ScrollView
        className="flex-1"
        contentContainerClassName="grow"
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
      >
        {renderContent()}
      </ScrollView>
    </>
  );
};

export default ExerciseScreen;
