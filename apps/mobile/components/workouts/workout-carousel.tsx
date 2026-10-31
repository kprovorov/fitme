import type { Plan } from "@fitme/core";
import { useState } from "react";
import {
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  ScrollView,
  useWindowDimensions,
  View,
} from "react-native";
import { cn } from "~/lib/utils";
import WorkoutCarouselCard from "./workout-carousel-card";

/** The `sm` spacing token: each card's inset from the screen's edges. */
const CARD_INSET = 16;
/** The `xs` spacing token: the gap between cards, where the next one peeks. */
const CARD_GAP = 8;

interface WorkoutCarouselProps {
  plan: Plan;
}

/**
 * The Plan's Workouts as cards paged one at a time (Figma `Routines`), the
 * Next Workout first, then the rest in rotation order. It runs edge to edge,
 * out of the Workout tab's gutters, each card `sm` from the screen's edges
 * with the next one peeking, and dots under it mark the page.
 */
export default function WorkoutCarousel({ plan }: WorkoutCarouselProps) {
  const { width } = useWindowDimensions();
  const [page, setPage] = useState(0);
  // A copy: plan.workouts is the query cache's array, never sorted in place.
  // The rotation's first Workout is the Next one.
  const workouts = [...plan.workouts].sort((a, b) => a.order - b.order);
  // The page scrolled to, kept in range when the Plan's Workouts change.
  const shownPage = Math.min(page, workouts.length - 1);
  const cardWidth = width - 2 * CARD_INSET;
  const pageWidth = cardWidth + CARD_GAP;

  const onScroll = ({
    nativeEvent,
  }: NativeSyntheticEvent<NativeScrollEvent>) => {
    setPage(Math.round(nativeEvent.contentOffset.x / pageWidth));
  };

  return (
    <View className="-mx-md gap-sm">
      <ScrollView
        contentContainerClassName="gap-xs px-sm"
        decelerationRate="fast"
        disableIntervalMomentum
        horizontal
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsHorizontalScrollIndicator={false}
        snapToInterval={pageWidth}
        testID="workout-carousel"
      >
        {workouts.map((workout) => (
          <View key={workout.id} style={{ width: cardWidth }}>
            <WorkoutCarouselCard
              durationMinutes={plan.workout_duration}
              workout={workout}
            />
          </View>
        ))}
      </ScrollView>
      {workouts.length > 1 ? (
        <View
          accessibilityElementsHidden
          className="flex-row justify-center gap-2"
          importantForAccessibility="no-hide-descendants"
        >
          {workouts.map((workout, index) => (
            <View
              className={cn(
                "size-2 rounded-full",
                index === shownPage ? "bg-foreground" : "bg-muted-foreground/40"
              )}
              key={workout.id}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}
